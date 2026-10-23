"use client";

import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bell,
  LifeBuoy,
  Mic,
  Share2,
  UsersRound,
  Check,
  ChevronDown,
  ChevronUp,
  Heart,
  ImageIcon,
  Languages,
  MessageCircle,
  MousePointerClick,
  PenLine,
  Pointer,
  Radio,
  Search,
  Send,
  SquarePlay,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { MarketIcon } from "@/components/brand/market-icon";
import { isFeedPath } from "@/components/feed/feed-views";
import { showPendingPage } from "@/components/layout/pending-page";
import { useViewer } from "@/components/providers/viewer-provider";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { canPublish } from "@/lib/shared/contracts";
import { track } from "@/lib/track";
import { cn } from "@/lib/utils";
import { buildSteps, stepText, type StepContext, type TourStep } from "./tour-steps";
import {
  clearTour,
  guideToOffer,
  isMarked,
  isPageGuide,
  markGuide,
  readProgress,
  readTour,
  TOUR_OFFERED_KEY,
  writeProgress,
  writeTour,
  type GuideId,
  type TourViewer,
} from "./tour-storage";

/*
 * Guided tour (owner 2026-10-22): four short, hands-on guides, each offered where it belongs with "Guide / Skip"
 * (Instagram style — owner: "not all in once"; tour-storage.ts says which is offered where):
 *  - the basics on the first opening of the site or the app (Reels, swipe, auto-scroll, News radio, Explore, search,
 *    languages, Home), then — signed in, on a later feed visit or straight on from the basics — the engagement guide
 *    (like, save, follow, comments, the bell, the profile);
 *  - the Press Pass guide when a Reader opens the Press Pass page; the publish guide when a reporter opens the composer.
 * No video: each step points at one real control, says what to do, and only moves on once the page shows they did it,
 * after a moment with the feature. Steps follow the person across pages; a reload resumes.
 *
 * The guide itself (owner 2026-10-22: "realistic, not a dimmed popup"): the page stays exactly as it is — no dark
 * backdrop. A glowing ring marks the control, an animated finger taps it (or swipes up, for the swipe step), a caption
 * card types its instruction out letter by letter, and when the control is off screen an arrow says which way to scroll.
 *
 * Remembered per device (tour-storage.ts); Settings → Help center → "Take the tour again"; `/?tour=start` opens the
 * basics. Never under Playwright (navigator.webdriver) and never for the Editor Desk.
 */

/** The feed guides wait a moment after the page shows; a page guide (Press Pass, composer) comes a little sooner. */
const OFFER_DELAY_MS = 1500;
const PAGE_OFFER_DELAY_MS = 900;
/** Another popup is up (the sign-in welcome, a sheet): the offer waits for it, checking every second up to this many. */
const OFFER_WAIT_TRIES = 60;
/** Breathing room around the marked control (px). */
const PAD = 6;
/** How often a step checks whether its action happened (ms); the ring itself follows every frame. */
const CHECK_MS = 150;

type Phase =
  | { kind: "idle" }
  | { kind: "welcome"; guide: GuideId }
  | { kind: "step"; guide: GuideId; steps: TourStep[]; index: number; doneAt: number | null }
  | { kind: "finished"; guide: GuideId };

type GuideCopy = { title: string; description: string; cta: string; items: { icon: LucideIcon; text: string }[] };

/** The welcome of each guide. */
const GUIDE_COPY: Record<GuideId, GuideCopy> = {
  basics: {
    title: "Welcome to WebNEWS",
    description: "A two-minute tour of the basics. A finger shows you where to tap, you try each one yourself, and it moves on once you have.",
    cta: "Start tour",
    items: [
      { icon: SquarePlay, text: "Reels, swiping and auto-scroll" },
      { icon: Radio, text: "News radio — the headlines read aloud" },
      { icon: Search, text: "Explore and search" },
      { icon: Languages, text: "Your languages" },
    ],
  },
  engage: {
    title: "Make WebNEWS yours",
    description: "One minute, hands on: like and save stories, follow a reporter, open the comments, your notifications and your profile.",
    cta: "Show me",
    items: [
      { icon: Heart, text: "Like and save stories" },
      { icon: UserRound, text: "Follow reporters" },
      { icon: MessageCircle, text: "Comments" },
      { icon: Bell, text: "Notifications and your profile" },
    ],
  },
  "press-pass": {
    title: "Your Press Pass, step by step",
    description: "A short guide through the application — your details, then the Reporter Pledge — and your pass is issued on the spot.",
    cta: "Guide me",
    items: [
      { icon: BadgeCheck, text: "Your details and where you report from" },
      { icon: PenLine, text: "The Reporter Pledge" },
    ],
  },
  profile: {
    title: "Your profile",
    description: "A quick look round your profile: followers, your tabs, sharing it, and editing it.",
    cta: "Show me",
    items: [
      { icon: UsersRound, text: "Followers and following" },
      { icon: Share2, text: "Share your profile and QR card" },
      { icon: PenLine, text: "Edit your photo, name and bio" },
    ],
  },
  "edit-profile": {
    title: "Edit your profile",
    description: "Your photo, name, bio and the languages you read — one at a time, then save.",
    cta: "Guide me",
    items: [
      { icon: UserRound, text: "Photo, display name and bio" },
      { icon: Languages, text: "The languages your feeds show first" },
    ],
  },
  settings: {
    title: "Settings",
    description: "Where everything about your account lives — and the Help center.",
    cta: "Show me",
    items: [
      { icon: Bell, text: "Notifications, drafts, connected accounts" },
      { icon: LifeBuoy, text: "Help center — and replaying any guide" },
    ],
  },
  notifications: {
    title: "Notifications",
    description: "New stories from reporters you follow, replies and likes — all in one place.",
    cta: "Show me",
    items: [
      { icon: Bell, text: "Unread only, or everything" },
      { icon: Check, text: "Mark all as read" },
    ],
  },
  messages: {
    title: "Messages",
    description: "Chat with reporters and readers — one to one, in groups, or in communities.",
    cta: "Show me",
    items: [
      { icon: MessageCircle, text: "Start a chat" },
      { icon: UsersRound, text: "Make a group chat" },
      { icon: Send, text: "Message requests" },
      { icon: UsersRound, text: "Communities — join one or create your own" },
    ],
  },
  "press-meet": {
    title: "Press meets",
    description: "Events reporters cover live — join one, or hold your own.",
    cta: "Show me",
    items: [
      { icon: Mic, text: "Press meets coming up" },
      { icon: PenLine, text: "Book your own" },
    ],
  },
  communities: {
    title: "Communities",
    description: "Groups around a place, a beat or a topic.",
    cta: "Show me",
    items: [
      { icon: Search, text: "Find and join" },
      { icon: UsersRound, text: "Start your own" },
    ],
  },
  newsroom: {
    title: "Your Newsroom",
    description: "How your stories are doing: views, reads, likes, followers.",
    cta: "Show me",
    items: [
      { icon: BarChart3, text: "Your numbers over 7, 30 or 90 days" },
      { icon: PenLine, text: "Every story's own numbers" },
    ],
  },
  market: {
    title: "Market",
    description: "Live Nifty, Sensex, gold, the rupee and more — with charts.",
    cta: "Show me",
    items: [{ icon: MarketIcon, text: "Prices, charts and the 52-week range" }],
  },
  publish: {
    title: "Publishing, step by step",
    description: "The guide points at each part as you go: the images, the story, then publish.",
    cta: "Guide me",
    items: [
      { icon: ImageIcon, text: "A cover photo and an article image" },
      { icon: PenLine, text: "Category, headline, blurb and the story" },
      { icon: Send, text: "Preview, then publish" },
    ],
  },
};

type Rect = { top: number; left: number; width: number; height: number };
type View = {
  /** The control's box (also when it's off screen). */
  rect: Rect | null;
  /** The person is on the step's page. */
  onRoute: boolean;
  /** The control exists on this page. */
  found: boolean;
  /** The control is above / below the visible screen: show which way to scroll. */
  offscreen: "up" | "down" | null;
  /** The caption sits at the top (the control is in the lower half of the screen). */
  top: boolean;
  instruction: string;
};

const local = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};
const session = (): Storage | null => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const noopSubscribe = () => () => {};

/** The tour is on screen (welcome, a step or the finish): other popups wait (press pass nudge, "Get the app"). */
export function isTourActive(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.tour === "on";
}

/** The first welcome (the basics) is about to show on this page: the site's own after-sign-in popup steps aside. */
export function basicsTourPendingOn(pathname: string): boolean {
  if (typeof navigator !== "undefined" && navigator.webdriver) return false;
  return isFeedPath(pathname) && !isMarked(readTour(local()), "basics", null);
}

const feedOfferedThisSession = (): boolean => {
  try {
    return sessionStorage.getItem(TOUR_OFFERED_KEY) === "1";
  } catch {
    return false;
  }
};
const setFeedOffered = (offered: boolean): void => {
  try {
    if (offered) sessionStorage.setItem(TOUR_OFFERED_KEY, "1");
    else sessionStorage.removeItem(TOUR_OFFERED_KEY);
  } catch {
    // Then the next feed guide may follow in this session.
  }
};

/** Settings → "Take the tour again": forgets every guide and opens the basics on Home. */
export function restartTour(router: { push: (href: string) => void }): void {
  clearTour(local());
  showPendingPage("/");
  router.push("/?tour=start");
}

const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b || (a !== null && b !== null && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

export function GuidedTour() {
  const viewer = useViewer();
  const pathname = usePathname();
  const router = useRouter();
  const phone = useMediaQuery("(max-width: 767.98px)");
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [view, setView] = useState<View | null>(null);
  const viewerId = viewer?.id ?? null;

  // The latest page facts and phase for the frame loop and the button handlers (no stale closures, no restarts).
  const memo = useRef<Record<string, unknown>>({});
  const ctxRef = useRef<Omit<StepContext, "memo">>({ pathname, viewer, phone });
  const phaseRef = useRef<Phase>(phase);
  useEffect(() => {
    ctxRef.current = { pathname, viewer, phone };
    phaseRef.current = phase;
  });
  const context = (): StepContext => ({ ...ctxRef.current, memo: memo.current });

  /* ─────────── Offering (and resuming after a reload) ─────────── */

  useEffect(() => {
    if (phase.kind !== "idle") return;
    if (navigator.webdriver) return; // e2e runs never see a welcome
    const params = new URLSearchParams(window.location.search);
    if (params.get("tour") === "reset") clearTour(local());
    const forced = params.get("tour") === "start";
    const tourViewer: TourViewer = viewer ? { id: viewer.id, onboarded: viewer.onboarded, username: viewer.username, role: viewer.role } : null;

    const progress = readProgress(session());
    if (progress && !forced) {
      const steps = progress.viewerId === viewerId ? buildSteps(progress.guide) : [];
      const index = steps.findIndex((step) => step.id === progress.stepId);
      if (index >= 0) {
        const timer = setTimeout(() => setPhase({ kind: "step", guide: progress.guide, steps, index, doneAt: null }), 0);
        return () => clearTimeout(timer);
      }
      writeProgress(session(), null);
    }

    const guide: GuideId | null = forced
      ? "basics"
      : guideToOffer({
          viewer: tourViewer,
          canPublish: canPublish(viewer),
          pathname,
          onFeed: isFeedPath(pathname),
          record: readTour(local()),
          feedOfferedThisSession: feedOfferedThisSession(),
        });
    if (!guide) return;
    const feedGuide = guide === "basics" || guide === "engage";
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      // Another popup is up (the sign-in welcome, a sheet, the composer's Press Pass ask): wait for it.
      if (document.querySelector('[role="dialog"], [role="alertdialog"]') && tries++ < OFFER_WAIT_TRIES) {
        timer = setTimeout(attempt, 1000);
        return;
      }
      if (forced) {
        clearTour(local());
        // Once handled, the flag leaves the address bar, or finishing the tour would open it again.
        window.history.replaceState(window.history.state, "", pathname);
      }
      if (feedGuide) setFeedOffered(true);
      setPhase({ kind: "welcome", guide });
    };
    timer = setTimeout(attempt, forced ? 300 : feedGuide ? OFFER_DELAY_MS : PAGE_OFFER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [phase.kind, pathname, viewer, viewerId]);

  // While it's on screen, the other popups wait (press-pass-nudge.tsx, get-app-banner.tsx).
  useEffect(() => {
    if (phase.kind === "idle") return;
    document.documentElement.dataset.tour = "on";
    return () => {
      delete document.documentElement.dataset.tour;
    };
  }, [phase.kind]);

  /* ─────────── Moving through the steps ─────────── */

  /** Runs `guide` from its first step (the welcome's button; "Continue" from the basics' closing card). */
  const startGuide = useCallback((guide: GuideId) => {
    const steps = buildSteps(guide);
    track("tour_start", { props: { guide } });
    writeProgress(session(), { guide, stepId: steps[0]!.id, viewerId: ctxRef.current.viewer?.id ?? null });
    setPhase({ kind: "step", guide, steps, index: 0, doneAt: null });
  }, []);

  const start = useCallback(() => {
    const current = phaseRef.current;
    if (current.kind === "welcome") startGuide(current.guide);
  }, [startGuide]);

  const advance = useCallback((skipped = false) => {
    const current = phaseRef.current;
    if (current.kind !== "step") return;
    const step = current.steps[current.index]!;
    const id = ctxRef.current.viewer?.id ?? null;
    step.leave?.(context());
    if (skipped) track("tour_step_skipped", { props: { guide: current.guide, step: step.id } });
    const next = current.index + 1;
    if (next < current.steps.length) {
      writeProgress(session(), { guide: current.guide, stepId: current.steps[next]!.id, viewerId: id });
      setPhase({ kind: "step", guide: current.guide, steps: current.steps, index: next, doneAt: null });
      return;
    }
    writeProgress(session(), null);
    writeTour(local(), markGuide(readTour(local()), current.guide, id, "done"));
    // A page's own guide ends quietly (owner 2026-10-22): a toast, no closing card.
    if (isPageGuide(current.guide)) {
      track("tour_done", { props: { guide: current.guide } });
      toast.success(`${GUIDE_COPY[current.guide].title}: guide done`, { id: "tour-done", description: "Settings → Help center replays any guide." });
      setPhase({ kind: "idle" });
      return;
    }
    // The basics done: the next feed guide may follow once they're signed in ("Later" below holds it back).
    if (current.guide === "basics") setFeedOffered(false);
    track("tour_done", { props: { guide: current.guide } });
    setPhase({ kind: "finished", guide: current.guide });
  }, []);

  /** "Skip" on a welcome, the × on a step, or a closing card's Done / Later. */
  const exit = useCallback(() => {
    const current = phaseRef.current;
    const id = ctxRef.current.viewer?.id ?? null;
    if (current.kind === "welcome") {
      writeTour(local(), markGuide(readTour(local()), current.guide, id, "skipped"));
      track("tour_declined", { props: { guide: current.guide } });
    } else if (current.kind === "step") {
      const step = current.steps[current.index]!;
      step.leave?.(context());
      // Not offered again (Settings brings every guide back).
      writeTour(local(), markGuide(readTour(local()), current.guide, id, "skipped"));
      writeProgress(session(), null);
      track("tour_exit", { props: { guide: current.guide, step: step.id } });
    } else if (current.kind === "finished" && current.guide === "basics") {
      // "Later": the engagement guide waits for a fresh visit to the feed.
      setFeedOffered(true);
    }
    setPhase({ kind: "idle" });
  }, []);

  const go = (href: string) => {
    showPendingPage(href);
    router.push(href);
  };

  const step = phase.kind === "step" ? phase.steps[phase.index]! : null;
  const index = phase.kind === "step" ? phase.index : -1;
  const done = phase.kind === "step" && phase.doneAt !== null;

  // A new step starts with a clean scratch pad.
  useEffect(() => {
    memo.current = {};
  }, [step]);

  // The frame loop: the ring follows the control; every CHECK_MS the step looks for its action.
  useEffect(() => {
    if (!step) return;
    let frame = 0;
    let lastCheck = 0;
    let last: View | null = null;
    const loop = (now: number) => {
      const ctx = context();
      const onRoute = step.route.match(ctx.pathname);
      const target = onRoute ? step.target(ctx) : null;
      let rect: Rect | null = null;
      let offscreen: View["offscreen"] = null;
      if (target) {
        const r = target.getBoundingClientRect();
        rect = { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
        if (r.bottom <= 0) offscreen = "up";
        else if (r.top >= window.innerHeight) offscreen = "down";
      }
      // The caption keeps clear of the control: top when the control is low on the screen (with slack, so it doesn't
      // flip back and forth while something scrolls past the middle).
      const centre = rect && !offscreen ? (rect.top + rect.height / 2) / window.innerHeight : null;
      const top = centre === null ? (last?.top ?? false) : last?.top ? centre > 0.42 : centre > 0.58;
      const next: View = { rect, onRoute, found: target !== null, offscreen, top, instruction: stepText(step.instruction, ctx) };
      if (
        !last ||
        !sameRect(last.rect, next.rect) ||
        last.onRoute !== next.onRoute ||
        last.found !== next.found ||
        last.offscreen !== next.offscreen ||
        last.top !== next.top ||
        last.instruction !== next.instruction
      ) {
        last = next;
        setView(next);
      }
      if (!done && onRoute && now - lastCheck >= CHECK_MS) {
        lastCheck = now;
        if (step.done(ctx)) {
          track("tour_step_done", { props: { step: step.id } });
          setPhase((p) => (p.kind === "step" && p.steps[p.index] === step ? { ...p, doneAt: Date.now() } : p));
          return; // the effect restarts with `done`, without the checks
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [step, done]);

  // Done: a moment with the feature, then the next step (or Next, right away).
  useEffect(() => {
    if (!step || !done) return;
    const timer = setTimeout(() => advance(), step.dwellMs);
    return () => clearTimeout(timer);
  }, [step, done, advance]);

  if (!isClient) return null;

  const guide = phase.kind === "welcome" || phase.kind === "finished" ? phase.guide : null;
  const copy = guide ? GUIDE_COPY[guide] : null;
  const signedIn = Boolean(viewer);
  const publisher = canPublish(viewer);
  const shown = step && view ? view : null;
  /** Leave the tour for a page (a closing card's button). */
  const leaveTo = (href: string) => {
    setPhase({ kind: "idle" });
    go(href);
  };

  return (
    <>
      <TourCard
        open={phase.kind === "welcome"}
        onClose={exit}
        title={copy?.title ?? ""}
        description={copy?.description}
        footer={
          <>
            <Button variant="ghost" onClick={exit}>
              Skip
            </Button>
            <Button onClick={start} leftIcon={<MousePointerClick aria-hidden />}>
              {copy?.cta}
            </Button>
          </>
        }
      >
        <ul className="flex flex-col gap-2.5 py-1 text-sm text-ink-2">
          {copy?.items.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-tint text-brand">
                <Icon aria-hidden className="size-4" />
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </TourCard>

      {/* The closing card: what they did, and the one thing that comes next. */}
      <TourCard
        open={phase.kind === "finished"}
        onClose={exit}
        title={
          guide === "basics"
            ? "That's the basics!"
            : guide === "engage"
              ? "You're all set"
              : guide === "press-pass"
                ? "You're a Trainee reporter"
                : "Filed!"
        }
        description={
          guide === "basics"
            ? signedIn
              ? "Next: likes, saves, follows, comments and your profile — a one-minute guide."
              : "Log in to like, save, follow reporters and publish your own stories — we'll guide you once you're in."
            : guide === "engage"
              ? publisher
                ? "Ready to publish? The composer has its own short guide."
                : "Want to publish too? Your Press Pass takes a minute — the guide walks you through it."
              : guide === "press-pass"
                ? "Your Press Pass is issued. Your first story is next — the composer has its own short guide."
                : "Your story is on its way. Settings → Help center brings the guides back any time."
        }
        footer={
          guide === "basics" ? (
            signedIn ? (
              <>
                <Button variant="ghost" onClick={exit}>
                  Later
                </Button>
                <Button onClick={() => startGuide("engage")} rightIcon={<ArrowRight aria-hidden />}>
                  Continue
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={exit}>
                  Done
                </Button>
                <Button onClick={() => leaveTo("/login")}>Log in</Button>
              </>
            )
          ) : guide === "engage" ? (
            <>
              <Button variant="ghost" onClick={exit}>
                Done
              </Button>
              {publisher ? (
                <Button onClick={() => leaveTo("/publish")} leftIcon={<PenLine aria-hidden />}>
                  Write a story
                </Button>
              ) : (
                <Button onClick={() => leaveTo("/press-pass")} leftIcon={<BadgeCheck aria-hidden />}>
                  Get Press Pass
                </Button>
              )}
            </>
          ) : guide === "press-pass" ? (
            <>
              <Button variant="ghost" onClick={exit}>
                Done
              </Button>
              <Button onClick={() => leaveTo("/publish")} leftIcon={<PenLine aria-hidden />}>
                Write a story
              </Button>
            </>
          ) : (
            <Button onClick={exit}>Done</Button>
          )
        }
      />

      {step &&
        phase.kind === "step" &&
        createPortal(
          <>
            {/* The page stays as it is: only the control is marked, and taps pass straight through. */}
            <div aria-hidden className="pointer-events-none fixed inset-0 z-90">
              {shown?.rect && !shown.offscreen && <Spotlight rect={shown.rect} gesture={step.gesture ?? "tap"} done={done} />}
              {shown?.onRoute && shown.offscreen && !done && <ScrollHint direction={shown.offscreen} />}
            </div>

            <AnimatePresence mode="wait">
              <motion.section
                key={step.id}
                role="region"
                aria-label="Guided tour"
                initial={{ opacity: 0, y: shown?.top ? -12 : 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: shown?.top ? -8 : 8, transition: { duration: 0.12 } }}
                transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                className={cn(
                  // A see-through caption (owner 2026-10-22: "transparent, no background"): the page shows through it.
                  "fixed z-90 mx-auto flex max-w-md flex-col gap-1.5 rounded-2xl border border-brand/25 bg-surface/80 p-3.5 shadow-pop backdrop-blur-md",
                  "inset-x-3 md:inset-x-auto md:right-6 md:w-96",
                  shown?.top ? "top-[calc(var(--nav-h)+0.75rem)]" : "bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+0.75rem)] md:bottom-6",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="kicker text-brand">
                    Step {index + 1} of {phase.steps.length}
                  </p>
                  <button
                    type="button"
                    onClick={exit}
                    aria-label="Exit tour"
                    className="-m-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <X aria-hidden className="size-4.5" />
                  </button>
                </div>
                <h2 className="font-wide text-[1.0625rem] font-extrabold leading-tight text-ink">{step.title}</h2>

                {shown && !shown.onRoute ? (
                  <>
                    <Typewriter key={`route-${step.id}`} text={`This step happens on ${step.route.label}.`} />
                    <div className="pt-1">
                      <Button size="sm" onClick={() => go(step.route.href)} rightIcon={<ArrowRight aria-hidden />}>
                        Take me there
                      </Button>
                    </div>
                  </>
                ) : done ? (
                  <>
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-success text-white">
                        <Check aria-hidden className="size-3" strokeWidth={3} />
                      </span>
                      <Typewriter key={`praise-${step.id}`} text={step.praise} />
                    </div>
                    <span aria-hidden className="mt-1 block h-1 overflow-hidden rounded-full bg-tint-3">
                      <span className="block h-full origin-left bg-brand animate-tour-fill" style={{ animationDuration: `${step.dwellMs}ms` }} />
                    </span>
                  </>
                ) : (
                  <>
                    <Typewriter key={`do-${step.id}-${shown?.instruction ?? ""}`} text={shown?.instruction ?? stepText(step.instruction, { pathname, viewer, phone, memo: {} })} />
                    {shown && !shown.found && <p className="text-xs text-muted">Can&rsquo;t see it here? Scroll a little — or skip this step.</p>}
                  </>
                )}

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button type="button" onClick={() => advance(true)} className="text-xs font-semibold text-muted transition-colors hover:text-ink">
                    Skip this step
                  </button>
                  {done ? (
                    <Button size="sm" onClick={() => advance()} rightIcon={<ArrowRight aria-hidden />}>
                      Next
                    </Button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
                      <Pointer aria-hidden className="size-3.5" />
                      Try it to continue
                    </span>
                  )}
                </div>
              </motion.section>
            </AnimatePresence>
          </>,
          document.body,
        )}
    </>
  );
}

/* ─────────────── The guide's pieces ─────────────── */

/**
 * A guide's welcome and closing card (owner 2026-10-23: "any side, simple, not full screen"): a frosted card in the
 * corner (phones: above the tab bar), no backdrop — the page stays as it is and usable. Esc closes it. Not a
 * `role="dialog"`, which would pause reel auto-scroll.
 */
function TourCard({
  open,
  onClose,
  title,
  description,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  footer: React.ReactNode;
  children?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.section
          role="region"
          aria-label={title}
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, transition: { duration: 0.14 } }}
          transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
          className={cn(
            "fixed z-90 flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-surface/85 p-4 shadow-pop backdrop-blur-xl",
            "inset-x-3 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+0.75rem)] md:inset-x-auto md:bottom-6 md:right-6 md:w-88",
          )}
        >
          <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-brand" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-ink">{title}</h2>
              {description && <p className="mt-0.5 text-sm leading-relaxed text-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          {children}
          <div className="flex items-center justify-end gap-2">{footer}</div>
        </motion.section>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * Writes `text` out letter by letter (owner 2026-10-22: "text should appear typing animated"), the whole line within
 * about 1.5 s however long it is. Screen readers get the full sentence at once; Reduce Motion shows it at once.
 * Give it a `key` that changes with the text, so a new sentence starts from the first letter.
 */
function Typewriter({ text, className }: { text: string; className?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(() => (reduce ? text.length : 0));
  useEffect(() => {
    if (reduce) return;
    const perChar = Math.min(26, Math.max(10, 1500 / Math.max(text.length, 1)));
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      setShown(count);
      if (count >= text.length) clearInterval(timer);
    }, perChar);
    return () => clearInterval(timer);
  }, [text, reduce]);
  const typing = shown < text.length;
  return (
    <p className={cn("text-sm leading-relaxed text-ink", className)}>
      <span aria-hidden>{text.slice(0, shown)}</span>
      {typing && <span aria-hidden className="ml-px inline-block h-[1em] w-0.5 translate-y-0.5 animate-pulse bg-brand" />}
      <span className="sr-only" aria-live="polite">
        {text}
      </span>
    </p>
  );
}

/**
 * The mark on the control: a glowing red ring that breathes, and a finger that taps it again and again (or swipes up
 * over it). Once the action is detected the ring turns green with a tick and the finger goes.
 */
function Spotlight({ rect, gesture, done }: { rect: Rect; gesture: "tap" | "swipe-up"; done: boolean }) {
  const box = { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 };
  const centreX = rect.left + rect.width / 2;
  const centreY = rect.top + rect.height / 2;
  return (
    <>
      <div
        className={cn(
          "absolute rounded-2xl ring-2 transition-[top,left,width,height,box-shadow] duration-200 ease-snap motion-reduce:transition-none",
          done
            ? "ring-success shadow-[0_0_0_5px_rgb(31_138_76/0.18),0_0_28px_rgb(31_138_76/0.5)]"
            : "ring-brand shadow-[0_0_0_5px_rgb(227_6_19/0.16),0_0_28px_rgb(227_6_19/0.5)] animate-tour-pulse motion-reduce:animate-none",
        )}
        style={box}
      />
      <AnimatePresence>
        {done ? (
          <motion.span
            key="tick"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 22 }}
            className="absolute inline-flex size-7 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full bg-success text-white shadow-pop ring-2 ring-white"
            style={{ top: box.top, left: box.left + box.width }}
          >
            <Check aria-hidden className="size-4" strokeWidth={3} />
          </motion.span>
        ) : gesture === "swipe-up" ? (
          <SwipeFinger key="swipe" x={centreX} y={centreY} />
        ) : (
          <TapFinger key="tap" x={centreX} y={centreY} />
        )}
      </AnimatePresence>
    </>
  );
}

const FINGER = "absolute size-9 text-white drop-shadow-[0_2px_4px_rgb(0_0_0/0.6)] [&_svg]:size-9 [&_svg]:fill-brand/90 [&_svg]:stroke-white";

/** A finger that comes in from the bottom right, presses the control (a ripple), lifts, and comes again. */
function TapFinger({ x, y }: { x: number; y: number }) {
  return (
    <motion.div className="absolute" style={{ left: x, top: y }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.span
        className="absolute -ml-5 -mt-5 size-10 rounded-full border-2 border-brand/80 bg-brand/25"
        animate={{ scale: [0.3, 1.5], opacity: [0.9, 0] }}
        transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 0.9, delay: 0.6, ease: "easeOut" }}
      />
      <motion.span
        className={cn(FINGER, "-ml-2 -mt-1.5")}
        animate={{ x: [22, 0, 0, 22], y: [26, 0, 0, 26], scale: [1, 0.88, 1, 1] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut", times: [0, 0.35, 0.55, 1] }}
      >
        <Pointer aria-hidden strokeWidth={1.6} />
      </motion.span>
    </motion.div>
  );
}

/** A finger that swipes up across the control, with chevrons rising ahead of it. */
function SwipeFinger({ x, y }: { x: number; y: number }) {
  return (
    <motion.div className="absolute" style={{ left: x, top: y }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <span className="absolute -ml-3 -mt-24 flex flex-col items-center text-white drop-shadow-[0_2px_4px_rgb(0_0_0/0.6)]">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="-mb-2.5 block"
            animate={{ opacity: [0.15, 1, 0.15], y: [4, -4, 4] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: (2 - i) * 0.18, ease: "easeInOut" }}
          >
            <ChevronUp aria-hidden className="size-6" strokeWidth={2.5} />
          </motion.span>
        ))}
      </span>
      <motion.span
        className={cn(FINGER, "-ml-4 -mt-2")}
        animate={{ y: [90, -70], opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 0.4, ease: "easeInOut", times: [0, 0.15, 0.8, 1] }}
      >
        <Pointer aria-hidden strokeWidth={1.6} />
      </motion.span>
    </motion.div>
  );
}

/** The control is further down (or up) the page: animated chevrons and a swiping finger show which way to scroll. */
function ScrollHint({ direction }: { direction: "up" | "down" }) {
  const Chevron = direction === "down" ? ChevronDown : ChevronUp;
  const travel = direction === "down" ? [40, -40] : [-40, 40];
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-x-0 top-[58%] flex justify-center"
    >
      <div className="flex items-center gap-4 rounded-full bg-ink/75 py-3 pl-5 pr-6 text-white shadow-pop backdrop-blur-sm">
        <span className="relative flex h-14 w-10 items-center justify-center">
          <motion.span
            className="absolute flex size-9 items-center justify-center [&_svg]:size-9 [&_svg]:fill-brand/90 [&_svg]:stroke-white"
            animate={{ y: travel, opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 0.3, ease: "easeInOut", times: [0, 0.2, 0.8, 1] }}
          >
            <Pointer aria-hidden strokeWidth={1.6} />
          </motion.span>
        </span>
        <span className="flex flex-col">
          <span className="flex flex-col items-center">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="-my-1.5 block"
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
              >
                <Chevron aria-hidden className="size-5" strokeWidth={2.75} />
              </motion.span>
            ))}
          </span>
          <span className="mt-1 text-xs font-bold">{direction === "down" ? "Scroll down" : "Scroll up"}</span>
        </span>
      </div>
    </motion.div>
  );
}
