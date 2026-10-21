import { sweepRoom } from "../queries/press-meet-room.js";
import { finishQuietRecordings } from "../queries/press-meet-recordings.js";
import { closeOverdueMeets, sendDueReminders } from "../queries/press-meets.js";

const TICK_MS = 10_000;

/**
 * Press meets in the background (owner 2026-10-01): reminders (8 AM IST on the day, 15 minutes before), closing press
 * meets left running past their slot, sweeping room tabs that went away, and finishing recordings whose tab closed.
 * Returns the stop function (src/index.ts).
 */
export function startPressMeetWorker(): () => void {
  let stopped = false;
  let running = false;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    for (const [name, task] of [
      ["room", sweepRoom],
      ["reminders", sendDueReminders],
      ["close", closeOverdueMeets],
      ["recordings", finishQuietRecordings],
    ] as const) {
      try {
        await task();
      } catch (error) {
        console.warn(`[press-meet] ${name} failed:`, error instanceof Error ? error.message : error);
      }
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
