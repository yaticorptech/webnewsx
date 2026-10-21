import { sql } from "drizzle-orm";
import type { Executor } from "../db/client.js";
import type { ChatEventReason, PressMeetSignal } from "../shared/contracts.js";

/** Postgres NOTIFY channel shared by every backend instance. */
export const EVENTS_CHANNEL = "webnews_events";

/** Tiny wire payloads; the realtime bus expands them into full SSE events. */
export type BusEvent =
  | { t: "article.published"; id: string }
  | { t: "article.stats"; id: string }
  | { t: "article.deleted"; id: string }
  /** `id` = a user id: that user's bell changed (delivered only to their own connections). */
  | { t: "notify"; id: string }
  /** Behaviour events were recorded (owner 2026-10-16); `id` = the signed-in person ("" for visitors). Desk only. */
  | { t: "behaviour"; id: string }
  /** `id` = an article id: a comment was posted or deleted there. */
  | { t: "comments"; id: string }
  /** `id` = a user id: their chat `c` changed (delivered only to their own connections). */
  | { t: "chat"; id: string; c: string; r: ChatEventReason }
  /**
   * `id` = a user id: a press meet room signal for them — inline (`p`) when it fits a NOTIFY payload, else the
   * press_meet_signal row `s` (SDP offers / answers).
   */
  | { t: "meet"; id: string; p?: PressMeetSignal; s?: string }
  /** `id` = a user id: their press meet `m` changed (invites, status, stories, payments). */
  | { t: "meetc"; id: string; m: string }
  /** `id` = a user id: the chat of their press meet `m`'s room changed (owner 2026-10-02). */
  | { t: "meetq"; id: string; m: string };

/**
 * Queues a NOTIFY inside the caller's transaction, so listeners only hear about committed changes.
 */
export async function publishEvent(executor: Executor, event: BusEvent): Promise<void> {
  await executor.execute(sql`select pg_notify(${EVENTS_CHANNEL}, ${JSON.stringify(event)})`);
}

export function parseBusEvent(payload: string): BusEvent | null {
  try {
    const value = JSON.parse(payload) as Partial<BusEvent>;
    if (typeof value.id !== "string") return null;
    if (
      value.t === "article.published" ||
      value.t === "article.stats" ||
      value.t === "article.deleted" ||
      value.t === "notify" ||
      value.t === "comments" ||
      value.t === "behaviour"
    ) {
      return { t: value.t, id: value.id };
    }
    if (value.t === "chat") {
      const chat = value as Partial<Extract<BusEvent, { t: "chat" }>>;
      if (typeof chat.c !== "string" || (chat.r !== "message" && chat.r !== "read" && chat.r !== "update")) return null;
      return { t: "chat", id: value.id, c: chat.c, r: chat.r };
    }
    if (value.t === "meet") {
      const meet = value as Partial<Extract<BusEvent, { t: "meet" }>>;
      if (typeof meet.s === "string") return { t: "meet", id: value.id, s: meet.s };
      if (meet.p && typeof meet.p === "object" && typeof meet.p.meetId === "string") return { t: "meet", id: value.id, p: meet.p };
      return null;
    }
    if (value.t === "meetc") {
      const changed = value as Partial<Extract<BusEvent, { t: "meetc" }>>;
      return typeof changed.m === "string" ? { t: "meetc", id: value.id, m: changed.m } : null;
    }
    if (value.t === "meetq") {
      const chat = value as Partial<Extract<BusEvent, { t: "meetq" }>>;
      return typeof chat.m === "string" ? { t: "meetq", id: value.id, m: chat.m } : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Queues a `chat` event for every current member of a conversation (plus `extraUserIds`, e.g. someone just removed),
 * inside the caller's transaction. One NOTIFY per member, so each only reaches that member's own connections.
 */
export async function publishChatEvent(
  executor: Executor,
  conversationId: string,
  reason: ChatEventReason,
  extraUserIds: string[] = [],
): Promise<void> {
  const extra =
    extraUserIds.length > 0
      ? sql`union select unnest(array[${sql.join(
          extraUserIds.map((id) => sql`${id}`),
          sql`, `,
        )}]::text[])`
      : sql``;
  await executor.execute(sql`
    select pg_notify(${EVENTS_CHANNEL}, json_build_object('t', 'chat', 'id', u.user_id, 'c', ${conversationId}::text, 'r', ${reason}::text)::text)
    from (select user_id from conversation_member where conversation_id = ${conversationId} ${extra}) u
  `);
}
