import { Redis } from "ioredis";
import { env } from "../env.js";

/**
 * Read cache for hot, viewer-independent responses (signed-out feeds, headlines, trending) so a traffic spike is served
 * from memory instead of Postgres. Redis when REDIS_URL is set (shared by every API instance), otherwise a small
 * in-process map. Concurrent misses for the same key share one database query. A Redis outage never fails a request:
 * it falls through to the database.
 */

const PREFIX = "wn:cache:";
const LOCAL_MAX = 500;

let redis: Redis | null = null;
if (env.REDIS_URL && !env.isTest) {
  redis = new Redis(env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 1, enableOfflineQueue: false });
  let warned = false;
  redis.on("error", (error) => {
    if (warned) return;
    warned = true;
    console.warn(`[cache] Redis unavailable, using the database directly: ${error.message}`);
  });
  redis.on("ready", () => {
    warned = false;
  });
}

const local = new Map<string, { value: string; expires: number }>();
const inflight = new Map<string, Promise<unknown>>();

async function read(key: string): Promise<string | null> {
  if (redis) {
    if (redis.status !== "ready") return null;
    try {
      return await redis.get(PREFIX + key);
    } catch {
      return null;
    }
  }
  const hit = local.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    local.delete(key);
    return null;
  }
  return hit.value;
}

async function write(key: string, value: string, ttlSeconds: number): Promise<void> {
  if (redis) {
    if (redis.status !== "ready") return;
    try {
      await redis.set(PREFIX + key, value, "EX", ttlSeconds);
    } catch {
      /* the next request just reads the database */
    }
    return;
  }
  if (local.size >= LOCAL_MAX) local.delete(local.keys().next().value as string);
  local.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
}

/** The cached value for `key`, or `load()`'s result (stored for `ttlSeconds`). Values must be JSON-serialisable. */
export async function cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  // Tests assert on data they just wrote: always the database.
  if (env.isTest) return load();
  const hit = await read(key);
  if (hit !== null) return JSON.parse(hit) as T;
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;
  const promise = (async () => {
    try {
      const value = await load();
      await write(key, JSON.stringify(value), ttlSeconds);
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

/** Drop every cached entry whose key starts with `prefix` (e.g. "feed:" after a story is published or hidden). */
export async function invalidate(prefix: string): Promise<void> {
  for (const key of local.keys()) if (key.startsWith(prefix)) local.delete(key);
  if (!redis || redis.status !== "ready") return;
  try {
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", `${PREFIX}${prefix}*`, "COUNT", 200);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== "0");
  } catch {
    /* entries expire on their own */
  }
}

/** For /api/health. */
export function cacheStatus(): "redis" | "redis-down" | "memory" {
  if (!redis) return "memory";
  return redis.status === "ready" ? "redis" : "redis-down";
}
