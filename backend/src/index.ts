import { Server as HttpServer } from "node:http";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { closeDatabase } from "./db/client.js";
import { env } from "./env.js";
import { cacheStatus, invalidate } from "./lib/cache.js";
import { realtime } from "./lib/realtime.js";
import { storage } from "./lib/storage.js";
import { startPressMeetWorker } from "./lib/press-meet-worker.js";
import { startPushWorker } from "./lib/push-worker.js";
import { startMembershipWorker } from "./lib/membership-worker.js";
import { startUploadSweeper } from "./lib/upload-sweep.js";
import { startSocialPoster } from "./queries/social-accounts.js";

const app = createApp();

// A story published or deleted anywhere: drop the cached signed-out feeds right away (every instance hears it).
realtime.subscribe((event) => {
  if (event.name === "article.published" || event.name === "article.deleted") void invalidate("feed:");
});

try {
  await realtime.start();
} catch (error) {
  // GET /api/stream calls start() again, so realtime recovers once the database is reachable.
  console.warn("[webnews] realtime LISTEN connection failed (will retry on first /api/stream):", error instanceof Error ? error.message : error);
}

// Loopback only unless HOST says otherwise (production defaults to 0.0.0.0): a dev API must never be reachable
// from the LAN (it trusts X-Forwarded-For from the local frontend and may hold demo accounts).
const server = serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, (info) => {
  const shown = env.HOST === "127.0.0.1" || env.HOST === "::1" ? "localhost" : env.HOST;
  console.log(`[webnews] API listening on http://${shown}:${info.port} (bound to ${env.HOST})`);
  console.log(`[webnews] frontend origin: ${env.FRONTEND_URL} · storage: ${storage.kind} · google: ${env.googleEnabled ? "on" : "off"} · push: ${env.pushEnabled ? "on" : "off"} · cache: ${cacheStatus()}`);
});

const stopUploadSweeper = startUploadSweeper();
const stopSocialPoster = startSocialPoster();
const stopPressMeetWorker = startPressMeetWorker();
const stopPushWorker = startPushWorker();
const stopMembershipWorker = startMembershipWorker();

// The frontend's /api proxy keeps sockets alive (Node's agent drops idle ones after 5s). Node's server default
// is also 5s, so under load the proxy could reuse a socket the API was closing at that moment → ECONNRESET.
// Keep idle sockets longer than any client keeps them (headersTimeout must exceed keepAliveTimeout).
if (server instanceof HttpServer) {
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
}

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[webnews] ${signal} received, shutting down…`);
  const force = setTimeout(() => {
    console.warn("[webnews] forced exit after 10s");
    process.exit(1);
  }, 10_000);
  force.unref();

  // Stop accepting connections, end SSE streams, then close the LISTEN connection and the pool.
  stopUploadSweeper();
  stopSocialPoster();
  stopPressMeetWorker();
  stopPushWorker();
  stopMembershipWorker();
  server.close();
  await realtime.stop();
  if ("closeIdleConnections" in server && typeof server.closeIdleConnections === "function") server.closeIdleConnections();
  await closeDatabase();
  console.log("[webnews] bye");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
