import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { sessionAlive, TOUCH_EVERY_MS, touchPresence } from "../lib/presence.js";
import { realtime, type RealtimeBus, type RealtimeEvent } from "../lib/realtime.js";
import type { AppEnv } from "../types.js";

const HEARTBEAT_MS = 15_000;
const RETRY_MS = 3_000;

/**
 * GET /api/stream — public Server-Sent Events: article.published | article.stats | article.deleted (+ ready, ping),
 * plus `notifications.changed` / `messages.changed` to a signed-in viewer's own connections only. A signed-in
 * viewer's open connection also keeps their online presence fresh (lib/presence.ts).
 */
export function streamRoutes(bus: RealtimeBus = realtime) {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    await bus.start();
    const viewerId = c.get("viewer")?.id ?? null;
    const isAdmin = c.get("viewer")?.role === "admin";
    const sessionId = c.get("sessionId");
    c.header("X-Accel-Buffering", "no"); // disable proxy buffering (nginx & co.)

    const response = streamSSE(c, async (stream) => {
      let closed = false;
      let queue: Promise<void> = Promise.resolve();
      // Serialize writes so events never interleave.
      const send = (event: string, data: string, retry?: number) => {
        if (closed) return;
        queue = queue
          .then(() => stream.writeSSE(retry === undefined ? { event, data } : { event, data, retry }))
          .catch(() => {
            closed = true;
          });
      };

      let resolveDone: () => void = () => {};
      const done = new Promise<void>((resolve) => {
        resolveDone = resolve;
      });

      const unsubscribe = bus.subscribe(
        (event: RealtimeEvent) => {
          // Live Analytics goes to the Editor Desk only (owner 2026-10-16).
          if (event.name === "behaviour.changed" && !isAdmin) return;
          if (
            (event.name === "notifications.changed" ||
              event.name === "messages.changed" ||
              event.name === "meet.signal" ||
              event.name === "meet.changed" ||
              event.name === "meet.chat") &&
            event.data.userId !== viewerId
          ) {
            return;
          }
          send(event.name, JSON.stringify(event.data));
        },
        () => resolveDone(),
      );
      const heartbeat = setInterval(() => send("ping", JSON.stringify({ t: Date.now() })), HEARTBEAT_MS);
      // Presence: each beat re-checks the session — logged out (or expired) ends the stream, and the client reconnects
      // as a visitor; otherwise the online time is refreshed. Best-effort: a failed query never breaks the stream.
      const beat = async (first = false) => {
        if (!viewerId || !sessionId) return;
        try {
          if (!first && !(await sessionAlive(sessionId))) {
            resolveDone();
            return;
          }
          await touchPresence(viewerId, first);
        } catch {
          // try again next beat
        }
      };
      void beat(true);
      const presence = setInterval(() => void beat(), TOUCH_EVERY_MS);
      stream.onAbort(() => resolveDone());

      send("ready", JSON.stringify({ t: Date.now() }), RETRY_MS);
      await done;

      closed = true;
      clearInterval(heartbeat);
      clearInterval(presence);
      unsubscribe();
      await queue;
    });
    // streamSSE sets plain "no-cache"; "no-transform" also stops compressing proxies from buffering events.
    // (Set on the context: Hono merges context headers over the returned response.)
    c.header("Cache-Control", "no-cache, no-transform");
    return response;
  });

  return app;
}
