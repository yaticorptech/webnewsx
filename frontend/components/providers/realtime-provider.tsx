"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { streamUrl } from "@/lib/config";
import { useViewer } from "@/components/providers/viewer-provider";
import type { RealtimeEventMap, RealtimeEventName } from "@/lib/shared/contracts";

/**
 * One shared EventSource for the whole app (SPEC §5.3). Components subscribe with
 * `useRealtimeEvent(name, handler)`; the provider reconnects with exponential backoff and
 * notifies `useRealtimeReconnected` listeners so feeds can refetch what they missed.
 */

export type RealtimeStatus = "connecting" | "open" | "reconnecting";

const EVENT_NAMES = [
  "article.published",
  "article.stats",
  "article.deleted",
  // Only ever sent to the signed-in viewer's own connection.
  "notifications.changed",
  "comments.changed",
  // Only ever sent to the signed-in viewer's own connection.
  "messages.changed",
  // Press meets (owner 2026-10-01): only ever sent to the signed-in viewer's own connection.
  "meet.signal",
  "meet.changed",
  // The room's chat (owner 2026-10-02): only ever sent to the signed-in viewer's own connection.
  "meet.chat",
  // Desk → Analytics, live (owner 2026-10-16): only ever sent to the Editor Desk.
  "behaviour.changed",
] as const satisfies readonly RealtimeEventName[];

type AnyHandler = (data: unknown) => void;

type RealtimeBus = {
  subscribe: (name: RealtimeEventName, handler: AnyHandler) => () => void;
  onReconnect: (handler: () => void) => () => void;
  /** Deliver an event to local subscribers only (dev style guide, tests). Never hits the network. */
  emit: (name: RealtimeEventName, data: unknown) => void;
};

const BusContext = createContext<RealtimeBus | null>(null);
const StatusContext = createContext<RealtimeStatus>("connecting");

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

function parse(data: unknown): unknown {
  if (typeof data !== "string") return undefined;
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

export function RealtimeProvider({ children, url = streamUrl }: { children: ReactNode; url?: string }) {
  const listeners = useRef(new Map<RealtimeEventName, Set<AnyHandler>>());
  const reconnectListeners = useRef(new Set<() => void>());
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  // Log in / log out without a reload: a fresh connection, so the server serves (and counts online) the right account.
  const viewerId = useViewer()?.id ?? null;

  // Stable bus object: subscribers never re-render because of connection churn.
  const [bus] = useState<RealtimeBus>(() => ({
    emit(name, data) {
      listeners.current.get(name)?.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`[realtime] ${name} handler failed`, error);
        }
      });
    },
    subscribe(name, handler) {
      let set = listeners.current.get(name);
      if (!set) {
        set = new Set();
        listeners.current.set(name, set);
      }
      set.add(handler);
      return () => {
        set.delete(handler);
      };
    },
    onReconnect(handler) {
      reconnectListeners.current.add(handler);
      return () => {
        reconnectListeners.current.delete(handler);
      };
    },
  }));

  useEffect(() => {
    // Every supported browser has EventSource; without it the app simply isn't live.
    if (typeof EventSource === "undefined") return;

    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let hasOpened = false;
    let disposed = false;

    const dispatch = (name: RealtimeEventName, event: MessageEvent) => {
      const payload = parse(event.data);
      if (payload !== undefined) bus.emit(name, payload);
    };

    const scheduleReconnect = () => {
      if (disposed) return;
      setStatus("reconnecting");
      // Exponential backoff with ±30% jitter so many tabs don't reconnect in lockstep.
      const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt) * (0.7 + Math.random() * 0.6);
      attempt += 1;
      timer = setTimeout(connect, delay);
    };

    function connect() {
      if (disposed) return;
      timer = null;
      setStatus(hasOpened ? "reconnecting" : "connecting");
      const es = new EventSource(url);
      source = es;

      es.onopen = () => {
        const isReconnect = hasOpened;
        hasOpened = true;
        attempt = 0;
        setStatus("open");
        if (isReconnect) reconnectListeners.current.forEach((handler) => handler());
      };
      for (const name of EVENT_NAMES) {
        es.addEventListener(name, (event) => dispatch(name, event as MessageEvent));
      }
      es.onerror = () => {
        // Take over from the browser's fixed retry so we can back off and notify on reconnect.
        es.close();
        if (source === es) source = null;
        scheduleReconnect();
      };
    }

    const reconnectNow = () => {
      if (disposed || source) return;
      if (timer) clearTimeout(timer);
      attempt = 0;
      connect();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") reconnectNow();
    };

    connect();
    window.addEventListener("online", reconnectNow);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      source?.close();
      source = null;
      window.removeEventListener("online", reconnectNow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url, bus, viewerId]);

  return (
    <BusContext.Provider value={bus}>
      <StatusContext.Provider value={status}>{children}</StatusContext.Provider>
    </BusContext.Provider>
  );
}

/** Keeps a ref pointing at the latest callback so effects can stay subscribed once. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Subscribe to a typed realtime event for the component's lifetime. The handler may change
 * between renders without resubscribing.
 */
export function useRealtimeEvent<K extends RealtimeEventName>(
  name: K,
  handler: (data: RealtimeEventMap[K]) => void,
): void {
  const bus = useContext(BusContext);
  const latest = useLatest(handler);
  useEffect(() => {
    if (!bus) return;
    return bus.subscribe(name, (data) => latest.current(data as RealtimeEventMap[K]));
  }, [bus, name, latest]);
}

/** Connection status of the shared stream. */
export function useRealtimeStatus(): RealtimeStatus {
  return useContext(StatusContext);
}

/**
 * Catch-up hook: `callback` runs after the stream REconnects (not on the first connect), e.g.
 * refetch the first feed page / headlines to pick up events missed while offline.
 */
export function useRealtimeReconnect(callback: () => void): void {
  const bus = useContext(BusContext);
  const latest = useLatest(callback);
  useEffect(() => {
    if (!bus) return;
    return bus.onReconnect(() => latest.current());
  }, [bus, latest]);
}

/** Alias of `useRealtimeReconnect`. */
export const useRealtimeReconnected = useRealtimeReconnect;

/** Emit a typed event to local subscribers only (dev style guide / tests). */
export function useRealtimeEmit(): <K extends RealtimeEventName>(name: K, data: RealtimeEventMap[K]) => void {
  const bus = useContext(BusContext);
  return useCallback(
    <K extends RealtimeEventName>(name: K, data: RealtimeEventMap[K]) => {
      bus?.emit(name, data);
    },
    [bus],
  );
}
