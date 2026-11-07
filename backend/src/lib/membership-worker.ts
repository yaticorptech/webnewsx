import { pruneOldEvents } from "../queries/behaviour.js";
import { sendBirthdayWishes } from "../queries/birthdays.js";
import { sendRenewalReminders } from "../queries/memberships.js";

const TICK_MS = 5 * 60_000;

/**
 * Premium membership renewal reminders (owner 2026-10-16): every few minutes, members whose membership ends soon or
 * has just ended get a "renew" notification (queries/memberships.ts). Returns the stop function (src/index.ts).
 */
export function startMembershipWorker(): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await sendRenewalReminders();
      // Birthday wishes (owner 2026-11-07): once a day from 08:00 IST (queries/birthdays.ts).
      await sendBirthdayWishes().catch((error: unknown) => console.warn("[birthdays] failed:", error instanceof Error ? error.message : error));
      // Activity older than the Privacy Policy allows (owner 2026-10-16).
      await pruneOldEvents();
    } catch (error) {
      console.warn("[membership] reminders failed:", error instanceof Error ? error.message : error);
    }
    running = false;
  };
  const timer = setInterval(() => void tick(), TICK_MS);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
