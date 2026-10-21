"use client";

import { useSyncExternalStore } from "react";
import { toast } from "@/components/ui/toast";
import { isNativeApp, nativeTextToSpeech, type TextToSpeechPlugin } from "./native-app";

/*
 * Read-aloud with the device's own voice (Web Speech API) — the story page's "Listen" (components/article/listen-bar.tsx)
 * and the feed's News radio (components/feed/news-radio.tsx). Text goes in short chunks: Chrome drops an utterance
 * after ~15 s, and pause/resume are unreliable on Android, so a pause cancels and a resume restarts the chunk.
 * One speaker at a time: starting one silences (and notifies) the one before.
 * Inside the WebNEWS Android app (owner 2026-09-30) the WebView has no Web Speech API: the app's text-to-speech plugin
 * (lib/native-app.ts) reads instead, chunk by chunk, with the languages the phone has voices for.
 */

const CHUNK_CHARS = 220;
const WORDS_PER_MINUTE = 150;

/** The story's language from its dominant script (the device picks a voice for it). */
const SCRIPTS: ReadonlyArray<[RegExp, string]> = [
  [/\p{Script=Devanagari}/gu, "hi-IN"],
  [/\p{Script=Kannada}/gu, "kn-IN"],
  [/\p{Script=Tamil}/gu, "ta-IN"],
  [/\p{Script=Telugu}/gu, "te-IN"],
  [/\p{Script=Malayalam}/gu, "ml-IN"],
  [/\p{Script=Bengali}/gu, "bn-IN"],
  [/\p{Script=Gujarati}/gu, "gu-IN"],
  [/\p{Script=Gurmukhi}/gu, "pa-IN"],
  [/\p{Script=Oriya}/gu, "or-IN"],
  [/\p{Script=Arabic}/gu, "ur-IN"],
];

export function speechLanguage(text: string): string {
  let best = { lang: "en-IN", count: text.match(/\p{Script=Latin}/gu)?.length ?? 0 };
  for (const [pattern, lang] of SCRIPTS) {
    const count = text.match(pattern)?.length ?? 0;
    if (count > best.count) best = { lang, count };
  }
  return best.lang;
}

/** A story body's text, block by block (paragraphs, headings, list items, quotes). */
export function htmlBlocks(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks = [...doc.body.querySelectorAll("p, h2, h3, h4, li, blockquote")]
    .filter((node) => !node.parentElement?.closest("li, blockquote"))
    .map((node) => node.textContent ?? "");
  return blocks.length > 0 ? blocks : [doc.body.textContent ?? ""];
}

/** Blocks cut at sentence ends into chunks of at most CHUNK_CHARS (a longer sentence goes word by word). */
export function speechChunks(blocks: readonly string[]): string[] {
  const chunks: string[] = [];
  for (const block of blocks) {
    const text = block.replace(/\s+/g, " ").trim();
    if (!text) continue;
    let chunk = "";
    for (const sentence of text.split(/(?<=[.!?।॥])\s+/)) {
      for (const piece of sentence.length > CHUNK_CHARS ? sentence.split(" ") : [sentence]) {
        if (chunk && chunk.length + piece.length + 1 > CHUNK_CHARS) {
          chunks.push(chunk);
          chunk = "";
        }
        chunk = chunk ? `${chunk} ${piece}` : piece;
      }
    }
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

/** Roughly how long `text` takes to read aloud at 1×. */
export function readingSeconds(text: string): number {
  return (text.split(/\s+/).filter(Boolean).length / WORDS_PER_MINUTE) * 60;
}

/** The best installed voice for `lang` (exact region first, then the language; Google's voices sound best). */
export function pickVoice(voices: readonly SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | null {
  const norm = (value: string) => value.replace("_", "-").toLowerCase();
  const base = lang.split("-")[0]!;
  const exact = voices.filter((voice) => norm(voice.lang) === lang.toLowerCase());
  const same = exact.length ? exact : voices.filter((voice) => norm(voice.lang).split("-")[0] === base);
  return same.find((voice) => /google/i.test(voice.name)) ?? same[0] ?? null;
}

/** Can this device read `lang` aloud? Unknown voices (the list is empty on some browsers) count as yes. */
export function canSpeak(voices: readonly SpeechSynthesisVoice[], lang: string): boolean {
  return voices.length === 0 || lang.startsWith("en") || pickVoice(voices, lang) !== null;
}

let voiceCache: SpeechSynthesisVoice[] = [];

const hasWebSpeech = () => typeof speechSynthesis !== "undefined";

/** The app's voice when the browser has none (Android WebView). */
function nativeVoice(): TextToSpeechPlugin | null {
  return hasWebSpeech() ? null : nativeTextToSpeech();
}

/** The app's languages as voice-like entries (`pickVoice` / `canSpeak` only read `lang` and `name`). */
let nativeVoices: Promise<void> | null = null;
function loadNativeVoices(plugin: TextToSpeechPlugin, onChange: () => void) {
  nativeVoices ??= plugin
    .getSupportedLanguages()
    .then(({ languages }) => {
      voiceCache = languages.map((lang) => ({ lang, name: "Device voice", voiceURI: lang, localService: true, default: false }) as SpeechSynthesisVoice);
    })
    .catch(() => {
      voiceCache = [];
    });
  void nativeVoices.then(onChange);
}

function subscribeVoices(onChange: () => void) {
  if (!hasWebSpeech()) {
    const plugin = nativeTextToSpeech();
    if (plugin) loadNativeVoices(plugin, onChange);
    return () => {};
  }
  const update = () => {
    voiceCache = speechSynthesis.getVoices();
    onChange();
  };
  update();
  speechSynthesis.addEventListener("voiceschanged", update);
  return () => speechSynthesis.removeEventListener("voiceschanged", update);
}

/** Installed voices; null on the server or where nothing can speak (a browser without speech, an old app build). */
export function useVoices(): SpeechSynthesisVoice[] | null {
  return useSyncExternalStore(
    subscribeVoices,
    () => (hasWebSpeech() || nativeTextToSpeech() ? voiceCache : null),
    () => null,
  );
}

const noopSubscribe = () => () => {};
/** The app but without a voice: a build from before its text-to-speech (2026-09-30) — Listen / radio ask to update. */
const appNeedsUpdate = () => !hasWebSpeech() && isNativeApp() && !nativeTextToSpeech();

/** True in an old WebNEWS app that can't read aloud (client only; false on the server and on the website). */
export function useSpeechNeedsAppUpdate(): boolean {
  return useSyncExternalStore(noopSubscribe, appNeedsUpdate, () => false);
}

/** Tells the reader why nothing plays in an old app. */
export function showAppUpdateForSpeech(): void {
  toast("Update the WebNEWS app to listen", {
    id: "speech-update",
    description: "This version of the app can't read stories aloud. Install the latest version, then open the story again.",
  });
}

/** Silences whatever is speaking (the browser's or the app's voice). */
function cancelSpeech() {
  if (hasWebSpeech()) speechSynthesis.cancel();
  else void nativeTextToSpeech()?.stop().catch(() => {});
}

export type SpeakOptions = {
  lang: string;
  rate?: number;
  /** Chunk to start from. */
  from?: number;
  /** A chunk starts (its index). */
  onChunk?: (index: number) => void;
  /** Word boundary inside chunk `index` (not every voice reports them). */
  onBoundary?: (index: number, charIndex: number) => void;
  /** Every chunk was read. */
  onDone?: () => void;
  /** Stopped by the browser (an error) or by another speaker starting. Not called after `stop()`. */
  onInterrupted?: () => void;
};

export type Speaker = { stop: () => void };

let current: { id: number; onInterrupted?: () => void } | null = null;
let nextId = 0;

/** Reads `chunks` one after another in the voice for `lang`. */
export function speak(chunks: readonly string[], options: SpeakOptions): Speaker {
  const previous = current;
  const id = ++nextId;
  current = { id, onInterrupted: options.onInterrupted };
  cancelSpeech();
  previous?.onInterrupted?.();

  const live = () => current?.id === id;
  const voice = pickVoice(voiceCache, options.lang);
  const stop = () => {
    if (!live()) return;
    current = null;
    cancelSpeech();
  };

  const plugin = nativeVoice();
  if (plugin) {
    // The app's voice: one chunk at a time; `speak` resolves when a chunk is done (or stopped).
    const sayNative = (index: number) => {
      if (!live()) return;
      if (index >= chunks.length) {
        current = null;
        options.onDone?.();
        return;
      }
      options.onChunk?.(index);
      plugin
        .speak({ text: chunks[index] ?? "", lang: voice?.lang ?? options.lang, rate: options.rate ?? 1, category: "playback" })
        .then(() => sayNative(index + 1))
        .catch(() => {
          if (!live()) return;
          current = null;
          options.onInterrupted?.();
        });
    };
    sayNative(options.from ?? 0);
    return { stop };
  }

  const say = (index: number) => {
    if (!live()) return;
    if (index >= chunks.length) {
      current = null;
      options.onDone?.();
      return;
    }
    options.onChunk?.(index);
    const utterance = new SpeechSynthesisUtterance(chunks[index]);
    utterance.lang = voice?.lang ?? options.lang;
    if (voice) utterance.voice = voice;
    utterance.rate = options.rate ?? 1;
    utterance.onboundary = (event) => {
      if (live()) options.onBoundary?.(index, event.charIndex);
    };
    utterance.onend = () => say(index + 1);
    utterance.onerror = (event) => {
      if (!live() || event.error === "interrupted" || event.error === "canceled") return;
      current = null;
      options.onInterrupted?.();
    };
    speechSynthesis.speak(utterance);
  };
  say(options.from ?? 0);
  return { stop };
}
