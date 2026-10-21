import postgres from "postgres";
import { sql as drizzleSql } from "drizzle-orm";
import { db } from "../db/client.js";
import { env } from "../env.js";
import { getPublishedCard, getStats } from "../queries/articles.js";
import type { ArticleCard, ArticleStats, PressMeetSignal, RealtimeEventMap, RealtimeEventName } from "../shared/contracts.js";
import { EVENTS_CHANNEL, parseBusEvent, type BusEvent } from "./events.js";

export { publishEvent } from "./events.js";

/** A fully expanded event as delivered to SSE clients. */
/** Live Analytics: at most one `behaviour.changed` this often. */
const BEHAVIOUR_EVERY_MS = 2_000;

export type RealtimeEvent = { [K in RealtimeEventName]: { name: K; data: RealtimeEventMap[K] } }[RealtimeEventName];
export type RealtimeListener = (event: RealtimeEvent) => void;

export type RealtimeBusOptions = {
  databaseUrl: string;
  fetchCard?: (id: string) => Promise<ArticleCard | null>;
  fetchStats?: (id: string) => Promise<ArticleStats | null>;
  /** Minimum gap between two `article.stats` events for the same article. */
  statsIntervalMs?: number;
  cardCacheMs?: number;
};

type StatsState = { lastSent: number; timer: NodeJS.Timeout | null };

/**
 * Per-process realtime fan-out: ONE dedicated postgres.js connection LISTENs on `webnews_events`
 * (so every backend instance hears every commit) and expands the tiny NOTIFY payloads for all SSE clients:
 * - `article.published`: the card is fetched once per process (short cache), viewer flags false;
 * - `article.stats`: coalesced to ≤ 1 event / second / article, counts read fresh from the DB;
 * - `article.deleted`: forwarded as is;
 * - `notify`: `notifications.changed` for one user (the stream route passes it to that user's connections only);
 * - `comments`: `comments.changed` for a story (open comment lists refetch);
 * - `chat`: `messages.changed` for one user (the stream route passes it to that user's connections only);
 * - `meet` / `meetc` / `meetq`: `meet.signal` / `meet.changed` / `meet.chat` for one user (press meet rooms; only to that user's connections).
 */
export class RealtimeBus {
  private readonly listeners = new Set<RealtimeListener>();
  private readonly closers = new Set<() => void>();
  private readonly cardCache = new Map<string, { expires: number; card: Promise<ArticleCard | null> }>();
  private readonly statsState = new Map<string, StatsState>();
  /** Behaviour activity merged into one `behaviour.changed` per BEHAVIOUR_EVERY_MS (Desk → Analytics, live). */
  private behaviourPeople = new Set<string>();
  private behaviourTimer: ReturnType<typeof setTimeout> | null = null;
  private behaviourLast = 0;
  private readonly fetchCard: (id: string) => Promise<ArticleCard | null>;
  private readonly fetchStats: (id: string) => Promise<ArticleStats | null>;
  private readonly statsIntervalMs: number;
  private readonly cardCacheMs: number;
  private listenClient: postgres.Sql | null = null;
  private starting: Promise<void> | null = null;

  constructor(private readonly options: RealtimeBusOptions) {
    this.fetchCard = options.fetchCard ?? ((id) => getPublishedCard(id, null));
    this.fetchStats = options.fetchStats ?? ((id) => getStats(id));
    this.statsIntervalMs = options.statsIntervalMs ?? 1_000;
    this.cardCacheMs = options.cardCacheMs ?? 30_000;
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  get started(): boolean {
    return this.listenClient !== null;
  }

  /** Opens the LISTEN connection (idempotent). postgres.js re-LISTENs automatically after reconnects. */
  start(): Promise<void> {
    this.starting ??= (async () => {
      const client = postgres(this.options.databaseUrl, { max: 1, onnotice: () => {}, idle_timeout: 0 });
      await client.listen(EVENTS_CHANNEL, (payload) => {
        const event = parseBusEvent(payload);
        if (event) void this.handle(event);
      });
      this.listenClient = client;
    })().catch((error: unknown) => {
      this.starting = null;
      throw error;
    });
    return this.starting;
  }

  async stop(): Promise<void> {
    for (const state of this.statsState.values()) if (state.timer) clearTimeout(state.timer);
    if (this.behaviourTimer) clearTimeout(this.behaviourTimer);
    this.statsState.clear();
    this.cardCache.clear();
    const client = this.listenClient;
    this.listenClient = null;
    this.starting = null;
    // Let open SSE streams finish before the listeners go away.
    for (const close of [...this.closers]) close();
    this.closers.clear();
    this.listeners.clear();
    if (client) await client.end({ timeout: 5 });
  }

  /** Adds a listener; `onClose` runs when the bus stops (graceful shutdown). Returns the unsubscribe function. */
  subscribe(listener: RealtimeListener, onClose?: () => void): () => void {
    this.listeners.add(listener);
    if (onClose) this.closers.add(onClose);
    return () => {
      this.listeners.delete(listener);
      if (onClose) this.closers.delete(onClose);
    };
  }

  private emit(event: RealtimeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[realtime] listener failed:", error);
      }
    }
  }

  /** Visible for tests: processes one NOTIFY payload. */
  async handle(event: BusEvent): Promise<void> {
    try {
      switch (event.t) {
        case "article.published": {
          if (this.listeners.size === 0) return;
          const card = await this.cachedCard(event.id);
          if (card) this.emit({ name: "article.published", data: card });
          return;
        }
        case "article.stats":
          if (this.listeners.size > 0) this.scheduleStats(event.id);
          return;
        case "article.deleted":
          this.cardCache.delete(event.id);
          this.emit({ name: "article.deleted", data: { id: event.id } });
          return;
        case "notify":
          this.emit({ name: "notifications.changed", data: { userId: event.id } });
          return;
        case "behaviour":
          if (this.listeners.size > 0) this.scheduleBehaviour(event.id);
          return;
        case "comments":
          if (this.listeners.size > 0) this.emit({ name: "comments.changed", data: { articleId: event.id } });
          return;
        case "chat":
          if (this.listeners.size > 0) this.emit({ name: "messages.changed", data: { userId: event.id, conversationId: event.c, reason: event.r } });
          return;
        case "meet": {
          if (this.listeners.size === 0) return;
          const signal = event.p ?? (event.s ? await readStoredSignal(event.s) : null);
          if (signal) this.emit({ name: "meet.signal", data: { ...signal, userId: event.id } });
          return;
        }
        case "meetc":
          if (this.listeners.size > 0) this.emit({ name: "meet.changed", data: { userId: event.id, meetId: event.m } });
          return;
        case "meetq":
          if (this.listeners.size > 0) this.emit({ name: "meet.chat", data: { userId: event.id, meetId: event.m } });
          return;
      }
    } catch (error) {
      console.error(`[realtime] failed to process ${event.t}:`, error instanceof Error ? error.message : error);
    }
  }

  private cachedCard(id: string): Promise<ArticleCard | null> {
    const now = Date.now();
    for (const [key, entry] of this.cardCache) if (entry.expires <= now) this.cardCache.delete(key);
    const hit = this.cardCache.get(id);
    if (hit) return hit.card;
    const card = this.fetchCard(id);
    this.cardCache.set(id, { expires: now + this.cardCacheMs, card });
    return card;
  }

  private scheduleBehaviour(userId: string): void {
    if (userId) this.behaviourPeople.add(userId);
    if (this.behaviourTimer) return;
    const wait = Math.max(0, this.behaviourLast + BEHAVIOUR_EVERY_MS - Date.now());
    this.behaviourTimer = setTimeout(() => {
      this.behaviourTimer = null;
      this.behaviourLast = Date.now();
      const userIds = [...this.behaviourPeople];
      this.behaviourPeople.clear();
      this.emit({ name: "behaviour.changed", data: { userIds } });
    }, wait);
    this.behaviourTimer.unref?.();
  }

  /** Leading + trailing throttle: first change goes out immediately, bursts collapse into one event per interval. */
  private scheduleStats(id: string): void {
    const state = this.statsState.get(id) ?? { lastSent: 0, timer: null };
    this.statsState.set(id, state);
    if (state.timer) return;
    const wait = Math.max(0, state.lastSent + this.statsIntervalMs - Date.now());
    state.timer = setTimeout(() => {
      state.timer = null;
      state.lastSent = Date.now();
      void this.fetchStats(id)
        .then((stats) => {
          if (stats) this.emit({ name: "article.stats", data: stats });
        })
        .catch((error: unknown) => console.error("[realtime] stats fetch failed:", error instanceof Error ? error.message : error))
        .finally(() => this.pruneStats());
    }, wait);
    state.timer.unref?.();
  }

  private pruneStats(): void {
    if (this.statsState.size < 1_000) return;
    const cutoff = Date.now() - 60_000;
    for (const [id, state] of this.statsState) if (!state.timer && state.lastSent < cutoff) this.statsState.delete(id);
  }
}

/** A room signal stored because it was too big for a NOTIFY payload (lib/press-meet-room.ts). */
async function readStoredSignal(id: string): Promise<PressMeetSignal | null> {
  const rows = await db.execute<{ payload: PressMeetSignal }>(drizzleSql`select payload from press_meet_signal where id = ${id}`);
  return rows[0]?.payload ?? null;
}

/** The process-wide bus. `src/index.ts` starts it; tests may start/stop it. */
export const realtime = new RealtimeBus({ databaseUrl: env.DATABASE_URL });
