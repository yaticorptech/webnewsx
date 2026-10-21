"use client";

import { useSyncExternalStore } from "react";

/*
 * Feed video autoplay (owner rule 2026-09-25): videos play muted and looped while on screen, like Instagram.
 * Only ONE video plays at a time — the most visible one (≥ 60% in view) — so sound never overlaps and phones
 * don't decode a whole feed at once. Sound is one switch for every video: turning it on in one card keeps it on
 * for the next. A video the reader paused stays paused until they press play again.
 */

const VISIBLE = 0.6;

type Entry = { ratio: number; userPaused: boolean; userPlayed: boolean };

const entries = new Map<HTMLVideoElement, Entry>();
let observer: IntersectionObserver | null = null;
let soundOn = false;
const soundListeners = new Set<() => void>();

function play(video: HTMLVideoElement) {
  video.muted = !soundOn;
  void video.play().catch(() => {
    // Sound needs a user gesture in some browsers: fall back to a silent start.
    if (!video.muted) {
      video.muted = true;
      void video.play().catch(() => {});
    }
  });
}

/** Plays the most visible eligible video and pauses every other one. */
function arbitrate() {
  let best: HTMLVideoElement | null = null;
  let bestScore = 0;
  for (const [video, entry] of entries) {
    if (entry.userPaused || entry.ratio < VISIBLE) continue;
    // A video the reader explicitly started wins while it stays on screen.
    const score = entry.ratio + (entry.userPlayed ? 1 : 0);
    if (score > bestScore) {
      best = video;
      bestScore = score;
    }
  }
  for (const video of entries.keys()) if (video !== best && !video.paused) video.pause();
  if (best && best.paused) play(best);
}

function getObserver(): IntersectionObserver {
  observer ??= new IntersectionObserver(
    (records) => {
      for (const record of records) {
        const entry = entries.get(record.target as HTMLVideoElement);
        if (!entry) continue;
        entry.ratio = record.isIntersecting ? record.intersectionRatio : 0;
        // Scrolled away: forget "the reader started this one".
        if (entry.ratio < VISIBLE) entry.userPlayed = false;
      }
      arbitrate();
    },
    { threshold: [0, 0.25, 0.5, VISIBLE, 0.75, 0.9, 1] },
  );
  return observer;
}

/** Starts autoplay management for a video element; returns the cleanup. */
export function registerAutoplay(video: HTMLVideoElement): () => void {
  entries.set(video, { ratio: 0, userPaused: false, userPlayed: false });
  video.muted = !soundOn;
  getObserver().observe(video);
  return () => {
    observer?.unobserve(video);
    entries.delete(video);
    video.pause();
    arbitrate();
  };
}

/** The reader pressed play / pause on this video. */
export function setUserPlaying(video: HTMLVideoElement, playing: boolean) {
  const entry = entries.get(video);
  if (!entry) {
    if (playing) play(video);
    else video.pause();
    return;
  }
  entry.userPaused = !playing;
  entry.userPlayed = playing;
  if (playing) {
    for (const other of entries.keys()) if (other !== video) other.pause();
    play(video);
  } else {
    video.pause();
  }
}

/** Sound on/off for every video (the one playing follows at once). */
export function setVideoSound(on: boolean) {
  soundOn = on;
  for (const video of entries.keys()) video.muted = !on;
  for (const listener of soundListeners) listener();
}

export function useVideoSound(): boolean {
  return useSyncExternalStore(
    (listener) => {
      soundListeners.add(listener);
      return () => soundListeners.delete(listener);
    },
    () => soundOn,
    () => false,
  );
}

/** "0:07", "0:30". */
export function clipLength(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Frame shape for a cover or a video: its own aspect ratio, kept between 9:16 (portrait — new covers are cropped to
 * it, owner 2026-09-26) and 16:9 (landscape — older covers). Unknown size = 16:9.
 */
export function mediaAspect(width: number | null | undefined, height: number | null | undefined): number {
  const ratio = width && height && width > 0 && height > 0 ? width / height : 16 / 9;
  return Math.min(16 / 9, Math.max(9 / 16, ratio));
}
