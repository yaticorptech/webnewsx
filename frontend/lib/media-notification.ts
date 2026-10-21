"use client";

import { isNativeApp, nativeMediaNotification, type MediaNotificationPlugin } from "./native-app";

/*
 * The phone's "now playing" notification for read-aloud (owner 2026-10-07, like Spotify): the story's title with play /
 * pause, a seek bar, 10 s back / forward (owner 2026-10-07, later) and stop — in the notification shade, on the lock
 * screen, on headphones and in desktop browsers' media controls.
 * Website: the Media Session API. Browsers only show it while a media element plays, and speech isn't one, so a silent
 * looping clip plays alongside the voice. App: the MediaNotification plugin (Android's WebView shows no media
 * notification of its own). One at a time: opening one closes the one before.
 */

/** How far the back / forward buttons jump. */
export const SKIP_SECONDS = 10;

export type MediaControls = {
  title: string;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  /** Go to this many seconds in (the seek bar, or the back / forward buttons from the current position). */
  onSeek: (seconds: number) => void;
};

/** What the notification shows; seconds at the current speed (the bar moves on by itself while playing). */
export type MediaState = { playing: boolean; position: number; duration: number };

export type MediaNotification = {
  update: (state: MediaState) => void;
  /** Takes the notification away. */
  close: () => void;
};

const ARTIST = "WebNEWS · Listen";
const NONE: MediaNotification = { update: () => {}, close: () => {} };

let current: MediaNotification | null = null;

/** Shows the notification and hands back its controls. A no-op where nothing can show it. */
export function openMediaNotification(controls: MediaControls, state: MediaState): MediaNotification {
  current?.close();
  const plugin = nativeMediaNotification();
  const opened = plugin
    ? openNative(plugin, controls)
    : !isNativeApp() && typeof navigator !== "undefined" && "mediaSession" in navigator
      ? openWeb(controls)
      : NONE;
  let open = true;
  const handle: MediaNotification = {
    update: (next) => {
      if (open) opened.update(next);
    },
    close: () => {
      if (!open) return;
      open = false;
      if (current === handle) current = null;
      opened.close();
    },
  };
  current = handle;
  handle.update(state);
  return handle;
}

/** The last state shown and where its bar is now (it runs on while playing). */
function tracker() {
  let state: MediaState = { playing: false, position: 0, duration: 0 };
  let at = 0;
  return {
    set: (next: MediaState) => {
      state = next;
      at = performance.now();
    },
    now: () => Math.min(state.duration, state.position + (state.playing ? (performance.now() - at) / 1000 : 0)),
  };
}

function openNative(plugin: MediaNotificationPlugin, controls: MediaControls): MediaNotification {
  const bar = tracker();
  // In the app (a remote page) addListener may hand back the listener itself rather than a promise of it.
  const listener = Promise.resolve(
    plugin.addListener("action", ({ action, position }) => {
      if (action === "play") controls.onPlay();
      else if (action === "pause") controls.onPause();
      else if (action === "seek") controls.onSeek(position ?? 0);
      else if (action === "rewind") controls.onSeek(Math.max(0, bar.now() - SKIP_SECONDS));
      else if (action === "forward") controls.onSeek(bar.now() + SKIP_SECONDS);
      else controls.onStop();
    }),
  );
  return {
    update: (state) => {
      bar.set(state);
      void plugin.show({ title: controls.title, artist: ARTIST, ...state }).catch(() => {});
    },
    close: () => {
      void listener.then((handle) => handle.remove()).catch(() => {});
      void plugin.hide().catch(() => {});
    },
  };
}

let silentUrl: string | null = null;
let silentClip: HTMLAudioElement | null = null;

/** 10 s of silence (8 kHz, 8-bit mono WAV), looped: browsers skip the notification for clips under ~5 s. */
function silence(): { clip: HTMLAudioElement; url: string } {
  if (!silentUrl) {
    const rate = 8000;
    const samples = rate * 10;
    const wav = new DataView(new ArrayBuffer(44 + samples));
    const text = (at: number, value: string) => [...value].forEach((char, i) => wav.setUint8(at + i, char.charCodeAt(0)));
    text(0, "RIFF");
    wav.setUint32(4, 36 + samples, true);
    text(8, "WAVE");
    text(12, "fmt ");
    wav.setUint32(16, 16, true);
    wav.setUint16(20, 1, true); // PCM
    wav.setUint16(22, 1, true); // mono
    wav.setUint32(24, rate, true);
    wav.setUint32(28, rate, true); // bytes per second
    wav.setUint16(32, 1, true); // bytes per sample
    wav.setUint16(34, 8, true); // bits per sample
    text(36, "data");
    wav.setUint32(40, samples, true);
    new Uint8Array(wav.buffer, 44).fill(128); // 8-bit silence is the midpoint
    silentUrl = URL.createObjectURL(new Blob([wav.buffer], { type: "audio/wav" }));
  }
  silentClip ??= Object.assign(new Audio(), { loop: true });
  return { clip: silentClip, url: silentUrl };
}

const ACTIONS = ["play", "pause", "stop", "seekto", "seekbackward", "seekforward"] as const;

function openWeb(controls: MediaControls): MediaNotification {
  const session = navigator.mediaSession;
  const { clip, url } = silence();
  const bar = tracker();
  let playing = false;

  // Something else took the sound (a call, another app): pause the voice too. (`clip.paused`: a late event from the
  // notification before this one, already playing again, isn't that.)
  const onClipPause = () => {
    if (playing && clip.paused) controls.onPause();
  };
  clip.addEventListener("pause", onClipPause);

  session.metadata = new MediaMetadata({
    title: controls.title,
    artist: ARTIST,
    artwork: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  });
  const handlers: Record<(typeof ACTIONS)[number], MediaSessionActionHandler> = {
    play: () => controls.onPlay(),
    pause: () => controls.onPause(),
    stop: () => controls.onStop(),
    seekto: (details) => {
      // Dragging sends a stream of fastSeek steps: jump once, where the finger lets go.
      if (!details.fastSeek) controls.onSeek(details.seekTime ?? 0);
    },
    seekbackward: (details) => controls.onSeek(Math.max(0, bar.now() - (details.seekOffset ?? SKIP_SECONDS))),
    seekforward: (details) => controls.onSeek(bar.now() + (details.seekOffset ?? SKIP_SECONDS)),
  };
  for (const action of ACTIONS) {
    try {
      session.setActionHandler(action, handlers[action]);
    } catch {
      // Not supported by this browser.
    }
  }

  return {
    update: (state) => {
      bar.set(state);
      playing = state.playing;
      session.playbackState = state.playing ? "playing" : "paused";
      if (state.duration > 0) {
        try {
          session.setPositionState({ duration: state.duration, position: Math.min(state.position, state.duration), playbackRate: 1 });
        } catch {
          // Not supported by this browser.
        }
      }
      if (state.playing) {
        if (clip.getAttribute("src") !== url) clip.src = url;
        void clip.play().catch(() => {});
      } else {
        clip.pause();
      }
    },
    close: () => {
      playing = false;
      clip.removeEventListener("pause", onClipPause);
      clip.pause();
      // Unloading the clip ends the media session, so the notification goes.
      clip.removeAttribute("src");
      clip.load();
      for (const action of ACTIONS) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // Not supported by this browser.
        }
      }
      try {
        session.setPositionState();
      } catch {
        // Not supported by this browser.
      }
      session.metadata = null;
      session.playbackState = "none";
    },
  };
}
