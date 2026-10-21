"use client";

import { Headphones, Pause, Play, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  canSpeak,
  htmlBlocks,
  readingSeconds,
  showAppUpdateForSpeech,
  speak,
  speechChunks,
  speechLanguage,
  useSpeechNeedsAppUpdate,
  useVoices,
  type Speaker,
} from "@/lib/speech";
import { openMediaNotification, type MediaNotification } from "@/lib/media-notification";
import { cn } from "@/lib/utils";

/*
 * "Listen" (owner 2026-09-29): the story read aloud by the device's own voice (lib/speech.ts) — free, no server.
 * Pausing stops the speech and resuming (or a new speed) restarts the current chunk. Stops when the page goes away.
 * While it plays or is paused, the phone shows a "now playing" notification with play / pause, a seek bar, 10 s back /
 * forward and stop (owner 2026-10-07, lib/media-notification.ts); the bar here can be dragged too. Seeking lands on
 * the start of the chunk (sentence) at that point: the voice can't start mid-sentence.
 */

const RATES = [1, 1.25, 1.5] as const;
/** Dragging the bar here: jump once it rests this long. */
const SCRUB_SETTLE_MS = 250;

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The story in chunks, and where each one starts as a share of the whole text (0…1). */
type Script = { all: string[]; starts: number[]; total: number };

export type ListenBarProps = { title: string; bodyHtml: string; className?: string };

export function ListenBar({ title, bodyHtml, className }: ListenBarProps) {
  const voices = useVoices();
  // An old app without a voice still shows Listen (owner 2026-09-30): tapping it asks to update.
  const needsUpdate = useSpeechNeedsAppUpdate();
  const [status, setStatus] = useState<"idle" | "playing" | "paused">("idle");
  const [rate, setRate] = useState<(typeof RATES)[number]>(1);
  const [progress, setProgress] = useState(0);
  /** The bar here while it's being dragged (0…1), before the jump. */
  const [scrub, setScrub] = useState<number | null>(null);

  const text = useMemo(() => `${title} ${bodyHtml.replace(/<[^>]*>/g, " ")}`, [title, bodyHtml]);
  const lang = useMemo(() => speechLanguage(text), [text]);
  const totalSeconds = useMemo(() => readingSeconds(text), [text]);

  const chunks = useRef<Script | null>(null);
  const index = useRef(0);
  /** How much has been read (0…1) — `progress`, readable from the notification's callbacks. */
  const played = useRef(0);
  const speaker = useRef<Speaker | null>(null);
  const media = useRef<MediaNotification | null>(null);
  const scrubTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The notification's buttons (and the settled drag) call the latest handlers (their closures read the speed). */
  const actions = useRef({ play: () => {}, pause: () => {}, stop: () => {}, seek: (_share: number) => {}, seekSeconds: (_at: number) => {} });

  const script = (): Script => {
    if (!chunks.current) {
      const all = speechChunks([title, ...htmlBlocks(bodyHtml)]);
      const total = all.reduce((sum, chunk) => sum + chunk.length, 0) || 1;
      let read = 0;
      const starts = all.map((chunk) => {
        const at = read / total;
        read += chunk.length;
        return at;
      });
      chunks.current = { all, starts, total };
    }
    return chunks.current;
  };

  const moveTo = (share: number) => {
    played.current = share;
    setProgress(share);
  };

  /** Shows (or refreshes) the notification: playing or paused, and where its bar is at this speed. */
  const notify = (playing: boolean, speed: number = rate) => {
    const duration = totalSeconds / speed;
    const state = { playing, position: played.current * duration, duration };
    if (media.current) media.current.update(state);
    else {
      media.current = openMediaNotification(
        {
          title,
          onPlay: () => actions.current.play(),
          onPause: () => actions.current.pause(),
          onStop: () => actions.current.stop(),
          onSeek: (seconds) => actions.current.seekSeconds(seconds),
        },
        state,
      );
    }
  };

  const closeMedia = () => {
    media.current?.close();
    media.current = null;
  };

  const reset = () => {
    closeMedia();
    speaker.current = null;
    index.current = 0;
    moveTo(0);
    setStatus("idle");
  };

  const speakFrom = (at: number, speed: number = rate) => {
    const { all, starts, total } = script();
    speaker.current?.stop();
    speaker.current = speak(all, {
      lang,
      rate: speed,
      from: at,
      // Every chunk (the first one right away) also sets the notification's bar to where the voice really is.
      onChunk: (i) => {
        index.current = i;
        moveTo(starts[i] ?? 0);
        notify(true, speed);
      },
      onBoundary: (i, charIndex) => moveTo((starts[i] ?? 0) + charIndex / total),
      onDone: reset,
      // Another speaker took over (or the browser gave up): back to the Listen button.
      onInterrupted: reset,
    });
    setStatus("playing");
  };

  const stop = () => {
    speaker.current?.stop();
    reset();
  };

  const pause = () => {
    speaker.current?.stop();
    speaker.current = null;
    setStatus("paused");
    notify(false);
  };

  /** Jump to `share` of the story (0…1): the chunk there; playing carries on from it, paused stays paused. */
  const seek = (share: number) => {
    const { all, starts } = script();
    const to = Math.min(Math.max(share, 0), 1);
    let target = 0;
    while (target + 1 < starts.length && starts[target + 1]! <= to) target++;
    // Forward to a point inside the chunk being read would restart it: the next one instead.
    if (to > played.current && target <= index.current) target = index.current + 1;
    if (target >= all.length) {
      stop();
      return;
    }
    if (status === "playing") {
      speakFrom(target);
      return;
    }
    index.current = target;
    moveTo(starts[target] ?? 0);
    notify(false);
  };

  const cycleRate = () => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length]!;
    setRate(next);
    if (status === "playing") speakFrom(index.current, next);
    else notify(false, next);
  };

  /** Dragging the bar here: follow the finger, jump once it rests. */
  const onScrub = (share: number) => {
    setScrub(share);
    if (scrubTimer.current) clearTimeout(scrubTimer.current);
    scrubTimer.current = setTimeout(() => {
      scrubTimer.current = null;
      setScrub(null);
      actions.current.seek(share);
    }, SCRUB_SETTLE_MS);
  };

  useEffect(() => {
    actions.current = {
      play: () => {
        if (status === "paused") speakFrom(index.current);
      },
      pause: () => {
        if (status === "playing") pause();
      },
      stop,
      seek: (share) => {
        if (status !== "idle") seek(share);
      },
      // The notification's seconds are at the current speed.
      seekSeconds: (at) => {
        if (status !== "idle") seek(at / (totalSeconds / rate));
      },
    };
  });

  // A new story or leaving the page: silence.
  useEffect(() => {
    chunks.current = null;
    return () => {
      speaker.current?.stop();
      closeMedia();
      if (scrubTimer.current) clearTimeout(scrubTimer.current);
    };
  }, [title, bodyHtml]);

  // No speech here, or no voice speaks this language (an English voice would garble it).
  if (!needsUpdate && (voices === null || !canSpeak(voices, lang))) return null;

  const minutes = Math.max(1, Math.round(totalSeconds / 60));
  const active = status !== "idle";
  const shown = scrub ?? progress;
  const duration = totalSeconds / rate;

  if (!active) {
    // Redesign 2026-10-07: a soft card across the column — the red play button, "Listen to this story", its length.
    return (
      <div className={className}>
        <button
          type="button"
          onClick={() => (needsUpdate ? showAppUpdateForSpeech() : speakFrom(0))}
          className="group flex w-full items-center gap-3 rounded-2xl bg-surface-2 p-2.5 pr-4 text-left transition-colors duration-150 hover:bg-tint-2"
        >
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-brand-contrast shadow-[0_6px_14px_-6px_rgb(227_6_19/0.7)] transition-transform duration-150 group-active:scale-95 motion-reduce:group-active:scale-100">
            <Play aria-hidden className="size-4.5 translate-x-px fill-current" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold text-ink">Listen to this story</span>
            <span className="block text-xs text-muted">Read aloud · {minutes} min</span>
          </span>
          <Headphones aria-hidden className="size-5 shrink-0 text-muted transition-colors group-hover:text-brand" />
        </button>
      </div>
    );
  }

  return (
    // Stays under the masthead while the story scrolls (the phone masthead slides away on scroll-down: follow it up).
    <div
      role="group"
      aria-label="Listening to this story"
      className={cn(
        "sticky top-[calc(var(--nav-h)+0.5rem)] z-30 transition-[top] duration-300 ease-snap [body:has(header[data-hidden])_&]:top-2",
        "flex items-center gap-2.5 rounded-2xl border border-border bg-surface p-2 pr-2.5 shadow-pop",
        className,
      )}
    >
      <button
        type="button"
        onClick={status === "playing" ? pause : () => speakFrom(index.current)}
        aria-label={status === "playing" ? "Pause" : "Resume"}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-brand-contrast transition-transform duration-150 active:scale-95 motion-reduce:active:scale-100"
      >
        {status === "playing" ? (
          <Pause aria-hidden className="size-4 fill-current" />
        ) : (
          <Play aria-hidden className="size-4 translate-x-px fill-current" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 text-xs font-semibold">
          <span className="truncate text-ink">{status === "playing" ? "Listening" : "Paused"}</span>
          <span className="shrink-0 tabular-nums text-muted">{formatTime((1 - shown) * duration)} left</span>
        </div>
        {/* Draggable (owner 2026-10-07): an invisible range input over the bar, with a taller touch area. */}
        <div className="relative mt-1.5 flex h-1 items-center rounded-full has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand has-[:focus-visible]:ring-offset-2">
          <div aria-hidden className="h-full w-full overflow-hidden rounded-full bg-border">
            <div
              className={cn("h-full rounded-full bg-brand", scrub === null && "transition-[width] duration-300")}
              style={{ width: `${shown * 100}%` }}
            />
          </div>
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute size-2.5 -translate-x-1/2 rounded-full bg-brand shadow-sm",
              scrub === null && "transition-[left] duration-300",
            )}
            style={{ left: `${shown * 100}%` }}
          />
          <input
            type="range"
            min={0}
            max={1000}
            step={1}
            value={Math.round(shown * 1000)}
            onChange={(event) => onScrub(Number(event.target.value) / 1000)}
            aria-label="Seek"
            aria-valuetext={`${formatTime(shown * duration)} of ${formatTime(duration)}`}
            className="absolute inset-x-0 top-1/2 h-6 w-full -translate-y-1/2 cursor-pointer appearance-none opacity-0"
          />
        </div>
      </div>
      <button
        type="button"
        onClick={cycleRate}
        aria-label={`Speed ${rate}×, change`}
        className="h-8 min-w-12 shrink-0 rounded-full bg-tint px-2 text-xs font-bold tabular-nums text-ink transition-colors hover:text-brand"
      >
        {rate}×
      </button>
      <button
        type="button"
        onClick={stop}
        aria-label="Stop listening"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-tint hover:text-ink"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
