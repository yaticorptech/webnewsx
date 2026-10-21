/*
 * The notification chime (owner 2026-10-01): a soft two-note "ding-ding" when something new reaches the bell while
 * you're on the site. Made with the Web Audio API — no sound file to load. Only the tab you're looking at plays it;
 * several bells on one page (masthead row, sticky bar) share one chime. Browsers only allow sound after the reader
 * has tapped or typed on the page once, so the audio is unlocked on that first gesture (`primeNotificationSound`).
 */

type AudioCtor = typeof AudioContext;

let context: AudioContext | null = null;
let lastPlayed = 0;
let primed = false;

/** Notes of the chime (Hz) and how far apart they start (s). */
const NOTES = [987.77, 1318.51];
const NOTE_GAP = 0.11;
const VOLUME = 0.16;
/** Bells mounted twice on a page, or two quick arrivals, chime once. */
const MIN_GAP_MS = 1_500;

function audio(): AudioContext | null {
  if (context) return context;
  const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  context = Ctor ? new Ctor() : null;
  return context;
}

/** Unlocks the audio on the reader's first tap / key press (call once on mount). */
export function primeNotificationSound(): void {
  if (primed || typeof window === "undefined") return;
  primed = true;
  const unlock = () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    const ctx = audio();
    if (ctx?.state === "suspended") void ctx.resume().catch(() => {});
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
}

export function playNotificationSound(): void {
  if (typeof window === "undefined" || document.visibilityState !== "visible") return;
  const now = Date.now();
  if (now - lastPlayed < MIN_GAP_MS) return;
  lastPlayed = now;
  const ctx = audio();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  const t0 = ctx.currentTime + 0.01;
  NOTES.forEach((frequency, i) => {
    const start = t0 + i * NOTE_GAP;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    // A quick swell, then a bell-like fade.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(VOLUME, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.55);
  });
}
