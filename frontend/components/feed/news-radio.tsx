"use client";

import { Radio } from "lucide-react";
import { track } from "@/lib/track";
import { useReducedMotion } from "motion/react";
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { DropdownItem } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import type { ArticleCard } from "@/lib/shared/contracts";
import {
  canSpeak,
  showAppUpdateForSpeech,
  speak,
  speechChunks,
  speechLanguage,
  useSpeechNeedsAppUpdate,
  useVoices,
  type Speaker,
} from "@/lib/speech";
import { cn } from "@/lib/utils";
import type { ReelAutoplay } from "./reel-autoscroll";

/*
 * News radio (owner 2026-09-29): one tap and the feed reads itself aloud — each story's headline only (owner
 * 2026-10-01: not the summary) in the device's voice (lib/speech.ts), then the page glides to the next reel and reads that one, loading more stories as
 * it goes. Scrolling to another reel by hand makes the radio follow. Auto-scroll holds while it plays.
 */

type NewsRadio = {
  /** The story being read, or null when the radio is off. */
  onAir: ArticleCard | null;
  start: (id: string) => void;
  next: () => void;
  stop: () => void;
};

const NewsRadioContext = createContext<NewsRadio | null>(null);

/** The feed's radio, or null outside a feed (or where the device can't speak). */
export const useNewsRadio = (): NewsRadio | null => useContext(NewsRadioContext);

/** A story whose language has no voice here is skipped after this pause. */
const SKIP_MS = 1200;
/** Scrolls within this long after the radio moved the page are its own glide, not the reader's. */
const GLIDE_MS = 1500;

type FeedHooks = { items: readonly ArticleCard[]; hasNextPage: boolean; loadMore: () => void };

class RadioController {
  private feed: FeedHooks = { items: [], hasNextPage: false, loadMore: () => {} };
  private voices: readonly SpeechSynthesisVoice[] = [];
  private smooth = true;
  private speaker: Speaker | null = null;
  private skipTimer: ReturnType<typeof setTimeout> | null = null;
  private scrollTimer: ReturnType<typeof setTimeout> | null = null;
  /** Waiting for the next page after this story (the last one loaded). */
  private waitingAfter: string | null = null;
  private glideUntil = 0;
  private onAir: string | null = null;
  private listeners = new Set<() => void>();

  /** The feed's auto-scroll, held while the radio plays (none under a story: those reels don't auto-scroll). */
  constructor(private readonly autoplay: ReelAutoplay | null) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  onAirId = () => this.onAir;

  /** The latest feed (and device) state; carries on when the page the last story waited for has arrived. */
  sync(feed: FeedHooks, voices: readonly SpeechSynthesisVoice[], smooth: boolean) {
    const grew = feed.items.length > this.feed.items.length;
    this.feed = feed;
    this.voices = voices;
    this.smooth = smooth;
    const after = this.waitingAfter;
    if (grew && after && after === this.onAir) this.advance(after);
  }

  start = (id: string) => {
    track("radio_play", { articleId: id });
    this.read(id);
  };

  next = () => {
    const id = this.onAir;
    if (!id) return;
    this.silence();
    this.advance(id);
  };

  stop = () => {
    this.silence();
    this.waitingAfter = null;
    this.setOnAir(null);
  };

  dispose() {
    this.stop();
  }

  private setOnAir(id: string | null) {
    if (id === this.onAir) return;
    const was = this.onAir;
    this.onAir = id;
    // Auto-scroll's own timer would fight the radio for the page.
    this.autoplay?.setPaused("radio", id !== null);
    if (id && !was) window.addEventListener("scroll", this.onScroll, { passive: true });
    if (!id && was) {
      window.removeEventListener("scroll", this.onScroll);
      if (this.scrollTimer) clearTimeout(this.scrollTimer);
    }
    this.listeners.forEach((listener) => listener());
  }

  private silence() {
    this.speaker?.stop();
    this.speaker = null;
    if (this.skipTimer) clearTimeout(this.skipTimer);
    this.skipTimer = null;
  }

  private read(id: string) {
    const article = this.feed.items.find((item) => item.id === id);
    if (!article) {
      this.stop();
      return;
    }
    this.silence();
    this.waitingAfter = null;
    this.setOnAir(id);
    const lang = speechLanguage(article.title);
    if (!canSpeak(this.voices, lang)) {
      this.skipTimer = setTimeout(() => this.advance(id), SKIP_MS);
      return;
    }
    this.speaker = speak(speechChunks([article.title]), {
      lang,
      onDone: () => this.advance(id),
      // Another speaker took over (a story's Listen) or the browser gave up.
      onInterrupted: () => {
        this.speaker = null;
        this.stop();
      },
    });
  }

  /** Glide to the reel after `id` and read it; at the end of what's loaded, fetch more and carry on. */
  private advance(id: string) {
    if (this.onAir !== id) return;
    const nodes = reelNodes();
    const next = nodes[nodes.findIndex((node) => node.dataset.feedItem === id) + 1];
    if (next?.dataset.feedItem) {
      this.glideUntil = Date.now() + GLIDE_MS;
      // A reel (Reels) or a Home card.
      (next.querySelector(".reel") ?? next).scrollIntoView({ behavior: this.smooth ? "smooth" : "auto", block: "start" });
      this.read(next.dataset.feedItem);
      return;
    }
    if (this.feed.hasNextPage) {
      this.waitingAfter = id;
      this.feed.loadMore();
      return;
    }
    this.stop();
    toast.success("That's all the news for now", { description: "New stories appear at the top the moment they're published." });
    document.querySelector("[data-feed-end]")?.scrollIntoView({ behavior: this.smooth ? "smooth" : "auto", block: "start" });
  }

  /** The reader scrolled to another reel: the radio follows once the page settles. */
  private onScroll = () => {
    if (this.scrollTimer) clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => {
      if (Date.now() < this.glideUntil || !this.onAir) return;
      let best: { id: string; ratio: number } | null = null;
      for (const node of reelNodes()) {
        const rect = (node.querySelector(".reel") ?? node).getBoundingClientRect();
        const visible = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
        const ratio = rect.height > 0 ? visible / rect.height : 0;
        if (node.dataset.feedItem && ratio > (best?.ratio ?? 0.6)) best = { id: node.dataset.feedItem, ratio };
      }
      if (best && best.id !== this.onAir) this.read(best.id);
    }, 400);
  };
}

const reelNodes = () => [...document.querySelectorAll<HTMLElement>("[data-feed-item]")];

export type NewsRadioProviderProps = {
  items: readonly ArticleCard[];
  hasNextPage: boolean;
  loadMore: () => void;
  autoplay?: ReelAutoplay;
  children: ReactNode;
};

export function NewsRadioProvider({ items, hasNextPage, loadMore, autoplay, children }: NewsRadioProviderProps) {
  const voices = useVoices();
  const reduceMotion = useReducedMotion();
  const [controller] = useState(() => new RadioController(autoplay ?? null));
  const onAirId = useSyncExternalStore(controller.subscribe, controller.onAirId, () => null);

  useEffect(() => {
    controller.sync({ items, hasNextPage, loadMore }, voices ?? [], !reduceMotion);
  });
  // Leaving the feed: off.
  useEffect(() => () => controller.dispose(), [controller]);

  const onAir = onAirId ? (items.find((item) => item.id === onAirId) ?? null) : null;
  const radio = useMemo<NewsRadio | null>(
    () => (voices === null ? null : { onAir, start: controller.start, next: controller.next, stop: controller.stop }),
    [voices, onAir, controller],
  );

  return (
    <NewsRadioContext.Provider value={radio}>
      {children}
      {radio && onAir && <OnAirAnnouncer story={onAir} />}
    </NewsRadioContext.Provider>
  );
}

/**
 * News radio as an item of a reel's menu (owner 2026-10-05: back inside the menu from the rail): listen from this
 * story, or stop while it's on air (the sound bars moving); an old app asks to update; null without any voice.
 */
export function useRadioMenuItem(articleId: string): DropdownItem | null {
  const radio = useNewsRadio();
  const needsUpdate = useSpeechNeedsAppUpdate();
  if (!radio && !needsUpdate) return null;
  const onAir = radio?.onAir?.id === articleId;
  return {
    label: onAir ? "Stop News radio" : "News radio — listen from here",
    icon: onAir ? <SoundBars className="text-brand" /> : <Radio aria-hidden />,
    onSelect: () => {
      if (!radio) showAppUpdateForSpeech();
      else if (onAir) radio.stop();
      else radio.start(articleId);
    },
  };
}

/** Each bar's pace and offset (s), so the bars never move in step. */
const BARS = [
  { duration: 0.8, delay: -0.2, rest: 0.55 },
  { duration: 1.05, delay: -0.6, rest: 1 },
  { duration: 0.7, delay: -0.35, rest: 0.7 },
  { duration: 0.95, delay: -0.1, rest: 0.4 },
];

/**
 * "On air" (owner 2026-10-01): four sound bars rising and falling in place of the radio icon while a story is read.
 * Reduced motion: still bars at different heights.
 */
export function SoundBars({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex h-3.5 items-center justify-center gap-0.5", className)}>
      {BARS.map((bar, i) => (
        <span
          key={i}
          className="h-full w-0.5 animate-sound-bar rounded-full bg-current motion-reduce:animate-none"
          // The inline scale is the reduced-motion look; a running animation overrides it.
          style={{ animationDuration: `${bar.duration}s`, animationDelay: `${bar.delay}s`, transform: `scaleY(${bar.rest})` }}
        />
      ))}
    </span>
  );
}

/**
 * No floating player (owner 2026-10-01): the story being read shows a red radio icon (on its card / the reel's rail).
 * Screen readers still hear which story is on air.
 */
function OnAirAnnouncer({ story }: { story: ArticleCard }) {
  return (
    <p role="status" className="sr-only">
      On air: {story.title}
    </p>
  );
}
