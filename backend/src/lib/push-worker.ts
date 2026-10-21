import { drainPushQueue } from "../queries/push.js";

const TICK_MS = 3_000;

/**
 * Phone pushes (owner 2026-10-02): every few seconds, the bell's new rows go out to phones (queries/push.ts) — again
 * straight away while a backlog lasts. Returns the stop function (src/index.ts).
 */
export function startPushWorker(): () => void {
  let stopped = false;
  let running = false;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      while (!stopped && (await drainPushQueue()) >= 200) {
        // A full batch: there may be more waiting.
      }
    } catch (error) {
      console.warn("[push] queue failed:", error instanceof Error ? error.message : error);
    }
    running = false;
  };
  const timer = setInterval(() => void tick(), TICK_MS);
  timer.unref();
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
