"use client";

import { ArrowRight, Heart, LockKeyhole, MessageCircle, Share2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { Button } from "@/components/ui/button";
import { GoogleButton, useGoogleSignIn } from "@/components/ui/google-button";
import { Modal } from "@/components/ui/modal";
import { StoryPoster, toPosterStory } from "@/components/poster/story-poster";
import { compactNumber } from "@/lib/format";
import type { ArticleCard } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { closeReadWall, dismissReadWall, isWallHard, isWallOpen, markLockedStories, subscribeWall, useMetered, wallPath } from "./read-meter";

/*
 * The sign-up wall, Instagram style (owner 2026-10-08). A visitor's 11th new story (read-meter.ts: story pages and
 * reels together) — then every third after each close — blurs the whole screen behind ONE centred popup asking them to
 * sign up. The stories themselves are never blurred: closing the popup (X) shows the story as it is.
 */

/** Mounted once in the site shell. Does nothing for logged-in readers. */
export function ReadWallHost() {
  const metered = useMetered();
  const pathname = usePathname();
  const open = useSyncExternalStore(subscribeWall, isWallOpen, () => false);
  // A story the visitor saw blurred in a feed: no X — sign up or log in to read it.
  const hard = useSyncExternalStore(subscribeWall, isWallHard, () => false);

  // Logged in (e.g. back from signing up): closed, nothing pending — also when the shell goes (on /signup, /login).
  useEffect(() => {
    if (!metered) dismissReadWall();
  }, [metered]);
  useEffect(() => dismissReadWall, []);
  // Left the story it came up on (the browser's Back): closed, that story not counted.
  useEffect(() => {
    if (isWallOpen() && wallPath() !== pathname) dismissReadWall();
  }, [pathname]);

  const next = encodeURIComponent(pathname);
  return (
    <Modal
      open={metered && open}
      onOpenChange={(value) => {
        if (!value) closeReadWall();
      }}
      title={hard ? "Sign in to read this story" : "Sign up to continue reading"}
      description={
        hard
          ? "This story is for WebNEWS members. Create a free account or log in to read it — it takes less than a minute."
          : "Create a free WebNEWS account to keep reading. It takes less than a minute."
      }
      dismissible={!hard}
      size="sm"
      variant="dialog"
      // Like Instagram: the page stays there, blurred out, behind the popup.
      overlayClassName="bg-ink/45 backdrop-blur-lg"
    >
      <div className="panel-tint mb-5 flex items-center justify-between gap-4 overflow-hidden px-5 py-5">
        <BrandLockup size="xs" align="start" />
        <SpeedBarsSvg className="hidden w-12 text-brand min-[360px]:block" />
      </div>
      <div className="flex flex-col gap-2.5">
        <Button href={`/signup?next=${next}`} fullWidth size="lg" rightIcon={<ArrowRight aria-hidden />}>
          Sign up free
        </Button>
        <GoogleSignUp callbackURL={pathname} />
        <p className="pt-1 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href={`/login?next=${next}`} className="font-bold text-brand hover:text-brand-hover hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </Modal>
  );
}

function GoogleSignUp({ callbackURL }: { callbackURL: string }) {
  const google = useGoogleSignIn();
  return google ? <GoogleButton callbackURL={callbackURL} label="Sign up with Google" /> : null;
}

/**
 * What a logged-out visitor gets of a feed: FREE_CARDS stories open, then BLURRED_CARDS blurred under "Sign in to read",
 * and no more pages until they sign in. The open ones are a day's mix of recent and older stories, not the newest
 * (owner 2026-10-22: "don't show the latest news on top — what's the use of logging in? Old and latest mixed on top,
 * then sign in to read more"): the feeds ask the API for the shuffled order with the day's seed (lib/shuffle.ts
 * visitorShuffleSeed). `splitForVisitor` applies the counts (Home grid, Reels, Explore).
 */
export const FREE_CARDS = 10;
export const BLURRED_CARDS = 10;

/** A visitor's view of `all`: the open stories, the blurred ones after them, and whether that's all they get. */
export function splitForVisitor<T>(all: T[], gated: boolean): { free: T[]; locked: T[]; complete: boolean } {
  if (!gated) return { free: all, locked: [], complete: false };
  return {
    free: all.slice(0, FREE_CARDS),
    locked: all.slice(FREE_CARDS, FREE_CARDS + BLURRED_CARDS),
    complete: all.length >= FREE_CARDS + BLURRED_CARDS,
  };
}

/**
 * The grid past a visitor's free cards (owner 2026-10-08): the next stories keep their card shape — poster, views and
 * actions — softly blurred, each with a small frosted "Sign in to read" pill in its middle; the whole card opens Sign in (and comes
 * back here). Plain posters: no links into the story, no view counting.
 */
/** The centred frosted pill over a blurred story. */
function SignInPill() {
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-2">
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/85 px-3 py-1.5 text-xs font-bold text-ink shadow-card ring-1 ring-black/5 backdrop-blur-md transition-colors group-hover:bg-white group-hover:text-brand">
        <LockKeyhole aria-hidden className="size-3.5" />
        Sign in to read
      </span>
    </span>
  );
}

/** The story's poster, blurred inside its rounded frame (scaled a little so the blur's soft edge stays outside it). */
function BlurredPoster({ article, className }: { article: ArticleCard; className?: string }) {
  return (
    <div aria-hidden className={cn("overflow-hidden shadow-card ring-1 ring-ink/5", className)}>
      <div className="scale-[1.06] blur-[6px]">
        <StoryPoster template={article.template} story={{ ...toPosterStory(article), videoUrl: null }} />
      </div>
    </div>
  );
}

/** Remembers the stories shown blurred, so opening one directly is locked too (read-meter.ts). */
function useMarkLocked(articles: ArticleCard[]) {
  const ids = articles.map((article) => article.id).join(",");
  useEffect(() => {
    if (ids) markLockedStories(ids.split(","));
  }, [ids]);
}

export function BlurredCards({
  articles,
  gridClassName,
  label = "More stories",
  flush = false,
}: {
  articles: ArticleCard[];
  gridClassName: string;
  label?: string;
  /** At the top of a feed (the locked latest): no gap above. */
  flush?: boolean;
}) {
  useMarkLocked(articles);
  const pathname = usePathname();
  const login = `/login?next=${encodeURIComponent(pathname)}`;
  return (
    <ul aria-label={label} className={cn(gridClassName, !flush && "mt-5 md:mt-7")}>
      {articles.map((article) => (
        <li key={article.id} className="min-w-0">
          <Link href={login} aria-label="Sign in to read this story" className="group block rounded-[0.875rem] outline-offset-4 md:rounded-2xl">
            <div className="relative">
              <BlurredPoster article={article} className="rounded-[0.875rem] md:rounded-2xl" />
              <SignInPill />
            </div>
            {/* The card's views and actions, blurred like the rest. */}
            <div aria-hidden className="select-none blur-[3px]">
              <p className="mt-2.5 px-0.5 text-xs font-medium text-muted">
                {compactNumber(article.viewCount)} views · {compactNumber(article.likeCount)} likes
              </p>
              <div className="mt-2 flex items-center gap-4 px-0.5 text-muted [&_svg]:size-5">
                <Heart />
                <MessageCircle />
                <Share2 />
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * The home feed past a visitor's free stories (owner 2026-10-16: "follow the home feed's format"; owner 2026-10-22: "don't
 * break — continue the cards till the end"): the feeds place these single cards inside their own grid / list, right
 * after the free cards, so the rows run on unbroken — the same card shape, blurred, with "Sign in to read". Call
 * `useMarkLocked` once with the locked stories so opening one directly is locked too.
 */
export { useMarkLocked };

/** A phone post (phone-story-card.tsx's shape), blurred. */
export function LockedPhoneCard({ article }: { article: ArticleCard }) {
  const pathname = usePathname();
  const login = `/login?next=${encodeURIComponent(pathname)}`;
  return (
    <Link href={login} aria-label="Sign in to read this story" className="group block pb-4 outline-offset-4">
      <div aria-hidden className="flex select-none items-center gap-3 px-3 py-2.5 blur-[3px]">
        <span className="size-10.5 shrink-0 rounded-full bg-surface-3" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-bold text-ink">{article.author.name}</span>
          <span className="block text-[0.8125rem] text-muted">{compactNumber(article.viewCount)} views</span>
        </span>
      </div>
      <div className="relative mx-1">
        <BlurredPhoto article={article} className="aspect-10/7 rounded-2xl" />
        <SignInPill />
      </div>
      <div aria-hidden className="flex h-12 select-none items-center gap-5 px-4 text-muted blur-[3px] [&_svg]:size-6">
        <Heart />
        <MessageCircle />
        <Share2 />
      </div>
    </Link>
  );
}

/** A front-page news card (front-page.tsx GridCard's shape: photo, headline, blurb, the reporter row), blurred. */
export function LockedGridCard({ article }: { article: ArticleCard }) {
  const pathname = usePathname();
  const login = `/login?next=${encodeURIComponent(pathname)}`;
  return (
    <Link href={login} aria-label="Sign in to read this story" className="group flex h-full flex-col gap-3 outline-offset-4">
      <div className="relative">
        <BlurredPhoto article={article} className="aspect-video rounded-none" />
        <SignInPill />
      </div>
      <div aria-hidden className="mt-2 flex select-none flex-col gap-3 blur-[3px]">
        <span className="line-clamp-2 text-[1.125rem] font-semibold leading-[1.45] text-ink">{article.title}</span>
        {article.excerpt && <span className="line-clamp-3 text-[0.9375rem] leading-[1.7] text-muted">{article.excerpt}</span>}
      </div>
      <div aria-hidden className="mt-auto flex select-none items-center gap-2 pt-1 blur-[3px]">
        <span className="size-6.5 shrink-0 rounded-full bg-surface-3" />
        <span className="truncate text-[0.8125rem] font-semibold text-ink-2">{article.author.name}</span>
        <span className="ml-auto flex items-center gap-3 text-muted [&_svg]:size-4">
          <Heart />
          <MessageCircle />
          <Share2 />
        </span>
      </div>
    </Link>
  );
}

/**
 * The locked cards as a block of their own, under a page that has no grid to continue (a story's "More stories",
 * more-stories.tsx): a full-width post list on phones, the front page's grid on bigger screens.
 */
export function BlurredFeedCards({ articles, phone }: { articles: ArticleCard[]; phone: boolean }) {
  useMarkLocked(articles);
  if (phone) {
    return (
      <ul aria-label="More stories" className="-mx-4 flex flex-col divide-y divide-border">
        {articles.map((article) => (
          <li key={article.id} className="pt-1.5">
            <LockedPhoneCard article={article} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul aria-label="More stories" className="-mx-6 mt-14 grid grid-cols-2 gap-y-14 min-[960px]:grid-cols-3 min-[1380px]:grid-cols-4">
      {articles.map((article) => (
        <li
          key={article.id}
          className="min-w-0 border-r border-border px-6 max-[959px]:[&:nth-child(2n)]:border-r-0 min-[960px]:max-[1379px]:[&:nth-child(3n)]:border-r-0 min-[1380px]:[&:nth-child(4n)]:border-r-0"
        >
          <LockedGridCard article={article} />
        </li>
      ))}
    </ul>
  );
}

/** A story's photo (article image, else cover), blurred inside its rounded frame. */
function BlurredPhoto({ article, className }: { article: ArticleCard; className?: string }) {
  const src = article.articleImage?.url || article.coverUrl;
  return (
    <div aria-hidden className={cn("relative overflow-hidden bg-surface-3 ring-1 ring-ink/5", className)}>
      {src && <img src={src} alt="" loading="lazy" className="absolute inset-0 size-full scale-110 object-cover blur-md" />}
    </div>
  );
}

/**
 * The reel feed past a visitor's free reels (owner 2026-10-08), as BlurredCards for the grid: each next story one reel
 * tall (a snap stop like the others), its poster blurred with the centred "Sign in to read" pill; tapping it opens Sign
 * in (and comes back here).
 */
export function BlurredReels({ articles }: { articles: ArticleCard[] }) {
  useMarkLocked(articles);
  const pathname = usePathname();
  const login = `/login?next=${encodeURIComponent(pathname)}`;
  return (
    <ul aria-label="More stories" className="flex flex-col">
      {articles.map((article) => (
        <li key={article.id} className="pb-(--reel-gap)">
          <div className="reel reel-frame relative isolate flex h-(--reel-h) items-center justify-center rounded-2xl sm:rounded-3xl">
            <Link href={login} aria-label="Sign in to read this story" className="group reel-poster relative block rounded-2xl outline-offset-4 sm:rounded-3xl">
              <BlurredPoster article={article} className="rounded-[inherit] shadow-pop" />
              <SignInPill />
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
