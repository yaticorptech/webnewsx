"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Play, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { MORE_ICON, NAV_FOLLOWING, NAV_HOME, NAV_MAIN, NAV_MARKET, type NavItem, type NavKey } from "@/lib/categories";
import { cn } from "@/lib/utils";
import type { Menu } from "./category-nav";
import { useViewer } from "@/components/providers/viewer-provider";
import { api } from "@/lib/api";
import type { ArticleCard, AuthorSummary, Page } from "@/lib/shared/contracts";
import { SectionStory, STORY_FRESH_MS } from "./section-story";

/**
 * Each section's cover photo in its circle (owner 2026-10-09: "HD cover image for the respective category"), 256px
 * squares in public/categories/. Free Unsplash photos (no attribution required; credited here):
 * karnataka — Vidhana Soudha, Jayanth Muppaneni (y96JVdGu7XU) · national — India Gate, shalender kumar (XjKaPInYVCM) ·
 * world — NASA (vhSz50AaFAs) · sports — Alessandro Bogliari (oDs_AxeR5g4) · entertainment — Leslie del Moral
 * (TVV49SQuQ_c) · technology — Igor Omilaev (eGGFZ5X2LnA) · astrology — Josh Rangel (aDmYkVd6rs4).
 * For you, Following and More keep their icons.
 */
const COVERS: Partial<Record<NavKey, string>> = {
  karnataka: "/categories/karnataka.jpg",
  national: "/categories/national.jpg",
  world: "/categories/world.jpg",
  sports: "/categories/sports.jpg",
  entertainment: "/categories/entertainment.jpg",
  technology: "/categories/technology.jpg",
  astrology: "/categories/astrology.jpg",
  // More's sections (owner 2026-10-10), Unsplash: business — Maxim Hopman · crime — David von Diemar · education —
  // National Cancer Institute · cinema — Lennon Cheng · others — AbsolutVision · politics — Zoshua Colah · press
  // releases — Andrew Medhat · trending — camilo jimenez · jobs — Radission US.
  business: "/categories/business.jpg",
  crime: "/categories/crime.jpg",
  education: "/categories/education.jpg",
  cinema: "/categories/cinema.jpg",
  others: "/categories/others.jpg",
  politics: "/categories/politics.jpg",
  "press-releases": "/categories/press-releases.jpg",
  trending: "/categories/trending.jpg",
  jobs: "/categories/jobs.jpg",
};
/** A section's cover photo (the circles row and the More panel). */
export const coverOf = (key: NavKey): string | undefined => COVERS[key];

/** "For you" (like the chips' first): every story, the mix. */
const FOR_YOU: NavItem = { ...NAV_HOME, label: "Home" };

/**
 * Phones' sections row (owner 2026-10-09: "all the old categories, in the circle UI"): the chips' sections in the
 * chips' order — For you · Following · National · World · Sports · Entertainment · Technology · Karnataka ▾ ·
 * Astrology · More ▾ — as small circles with a red ring (the section's cover photo, or an icon) and the name under
 * each, scrolling sideways. The open section: a thicker ring (an icon circle turns solid red) and a bold red name. Karnataka ▾ and More ▾ open the same panels as the chips (category-nav.tsx
 * renders them, `panel`). The grid / reels switch is in the top bar (owner 2026-10-09).
 */
export function CategoryCircles({
  current,
  district,
  moreActive,
  open,
  onTap,
  onToggle,
  panel,
  controls,
  className,
}: {
  current: NavKey | null;
  district: string | null;
  /** The More section that's open (its circle borrows its name and icon). */
  moreActive: NavItem | null;
  open: Menu | null;
  onTap: (key: NavKey) => (event: MouseEvent) => void;
  onToggle: (menu: Menu) => void;
  /** A menu's panel, placed after its circle. */
  panel: (menu: Menu) => ReactNode;
  /** A menu panel's id (aria-controls). */
  controls: (menu: Menu) => string;
  className?: string;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  // Following swaps the categories for the people you follow (owner 2026-10-12); For you there brings the categories
  // back, scrolled to where they were, and goes back to the page Following was tapped on.
  const following = current === "following";

  // Keep the open section in view in the scrolling row, without scrolling the page — or, coming back from Following,
  // put the row back where it was.
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const restore = following ? null : takeReturnScroll();
    if (restore !== null) {
      row.scrollLeft = restore;
      return;
    }
    const item = row.querySelector<HTMLElement>('[data-current="true"]');
    if (!item) return;
    const rowBox = row.getBoundingClientRect();
    const box = item.getBoundingClientRect();
    if (box.left >= rowBox.left && box.right <= rowBox.right) return;
    row.scrollLeft += box.left - rowBox.left - (rowBox.width - box.width) / 2;
  }, [current, district, following]);

  const link = (item: NavItem, remember = false) => {
    const here = current === item.key;
    return (
      <li key={item.key} className={ITEM} data-current={here || undefined}>
        <Link
          href={item.href}
          onClick={(event) => {
            if (remember) rememberReturn(rowRef.current);
            onTap(item.key)(event);
          }}
          aria-current={here ? "page" : undefined}
          className="group flex w-full min-w-0 flex-col items-center gap-1 rounded-xl outline-offset-2"
        >
          {/* Home looks like the other icon circles now (owner 2026-10-16: "no filled red") — outline icon on a soft disc,
              with the red ring only while it's the page you're on. */}
          <Ring icon={item.icon} image={coverOf(item.key)} on={here} />
          <span className={NAME}>
            <Name label={item.label} on={here} />
          </span>
        </Link>
      </li>
    );
  };

  const menu = (key: Menu, label: string, icon: LucideIcon, here: boolean) => (
    <li key={key} className={ITEM}>
      <button
        type="button"
        aria-expanded={open === key}
        aria-controls={controls(key)}
        data-menu-circle={key}
        data-current={here || undefined}
        onClick={() => onToggle(key)}
        className="group flex w-full min-w-0 flex-col items-center gap-1 rounded-xl outline-offset-2"
      >
        <Ring icon={icon} on={here} open={open === key} />
        <span className={NAME}>
          <Name label={label} on={here} chevron open={open === key} />
        </span>
      </button>
      {panel(key)}
    </li>
  );

  return (
    // 52px circles (owner 2026-10-09: small ones first, then "a little bigger") — the row is --tabnav-h (5.5rem) tall.
    <div ref={rowRef} className={cn("no-scrollbar h-(--tabnav-h) overflow-x-auto", className)}>
      {/* From 640px the row sits centred (owner 2026-10-10: it looked pushed to one side); mx-auto drops to 0 once it
          overflows, so it still scrolls from its start. */}
      <ul className="flex w-max gap-2 px-3 pt-2 sm:mx-auto sm:gap-3">
        {following ? (
          <>
            {link({ ...FOR_YOU, href: back.href })}
            <FollowedAccounts />
          </>
        ) : (
          <>
            {link(FOR_YOU)}
            {/* Market right after Home (owner 2026-10-22): the live prices page. */}
            {link(NAV_MARKET)}
            {link(NAV_FOLLOWING, true)}
            {/* Karnataka is a section like the others (owner 2026-10-12); its districts are picked on its page. */}
            {NAV_MAIN.map((item) => link(item))}
            {menu("more", moreActive?.label ?? "More", moreActive?.icon ?? MORE_ICON, moreActive !== null)}
          </>
        )}
      </ul>
    </div>
  );
}

/** Where For you goes back to from Following: the page and the row's scroll when Following was tapped. */
const back: { href: string; scroll: number | null } = { href: "/", scroll: null };
function rememberReturn(row: HTMLElement | null) {
  back.href = `${window.location.pathname}${window.location.search}`;
  back.scroll = row?.scrollLeft ?? 0;
}
function takeReturnScroll(): number | null {
  const scroll = back.scroll;
  back.scroll = null;
  return scroll;
}

/**
 * Desktop Following page (owner 2026-10-15: stories on desktop, inside Following): the followed reporters' story
 * circles in one row — the same circles and player as the phones' Following row. Nothing when no one has a story.
 */
export function FollowingStoriesRow({ className }: { className?: string }) {
  return (
    <section aria-labelledby="following-stories" className={cn("flex flex-col gap-3", className)}>
      <h2 id="following-stories" className="kicker text-ink">
        Stories
      </h2>
      <div className="no-scrollbar overflow-x-auto">
        <ul className="peer flex w-max gap-3 pb-1">
          <FollowedAccounts />
        </ul>
        {/* Shown only while the row above is empty. */}
        <p className="hidden text-sm text-muted peer-empty:block">No new stories from people you follow in the last 24 hours.</p>
      </div>
    </section>
  );
}

/**
 * The people you follow who published in the last 24 h, newest first, as story circles (owner 2026-10-12: no story →
 * not shown). Tapping one plays their latest story; a tap skips to the next person's, press-and-hold pauses, swipe up
 * reads it; after the last one you stay on Following.
 * A name opens the profile.
 */
function FollowedAccounts() {
  const viewer = useViewer();
  const signedIn = Boolean(viewer?.onboarded);
  const [story, setStory] = useState<AuthorSummary | null>(null);
  const closeStory = useCallback(() => setStory(null), []);
  // The Following feed (the same request the Following page makes): its authors with a story from the last 24 h.
  const recent = useQuery({
    queryKey: ["section-story", "following"],
    queryFn: ({ signal }) => api.feed({ tab: "following" }, signal),
    enabled: signedIn,
    staleTime: 60_000,
    retry: false,
    select: (page: Page<ArticleCard>) => {
      const seen = new Map<string, AuthorSummary>();
      for (const card of page.items) {
        if (Date.now() - Date.parse(card.publishedAt) < STORY_FRESH_MS && !seen.has(card.author.username)) seen.set(card.author.username, card.author);
      }
      return [...seen.values()];
    },
  });

  return (
    <>
      {(recent.data ?? []).map((person) => {
        const href = `/${person.username}`;
        return (
          <li key={person.id} className={ITEM}>
            <Link
              href={href}
              onClick={(event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                setStory(person);
              }}
              aria-label={`${person.name}: latest story`}
              className="rounded-full outline-offset-2"
            >
              <Ring icon={UserRound} image={person.image ?? undefined} on={false} story />
            </Link>
            <Link href={href} className={NAME}>
              <Name label={person.name} on={false} />
            </Link>
          </li>
        );
      })}
      {story && (
        <SectionStory
          key={story.username}
          onNext={() => {
            const list = recent.data ?? [];
            const at = list.findIndex((person) => person.username === story.username);
            setStory(list[at + 1] ?? null);
          }}
          item={{ key: `user:${story.username}` as NavKey, label: story.name, href: `/${story.username}`, icon: UserRound }}
          cover={story.image ?? undefined}
          load={(signal) => api.userArticles(story.username, null, signal)}
          account
          onClose={closeStory}
        />
      )}
    </>
  );
}

// Each circle's slot, and its name kept inside it (owner 2026-10-16: "Entertainment" ran into "Technology").
const ITEM = "group flex w-[4.75rem] min-w-0 flex-col items-center gap-1 sm:w-20";
/** The name: plain text under the circle (owner 2026-10-12: no pill border, like before). */
const NAME = "flex max-w-full rounded outline-offset-2";

/**
 * The circle (owner 2026-10-12, from their reference): a section with a latest story gets an Instagram-style gradient
 * ring and a small red play badge; the icon circles (For you, Following, More) are soft filled discs — red-tinted for
 * For you, grey for the rest.
 */
function Ring({
  icon: Icon,
  image,
  on,
  open = false,
  story = false,
  brand = false,
}: {
  icon: LucideIcon;
  image?: string;
  on: boolean;
  open?: boolean;
  story?: boolean;
  /** For you's red-tinted disc. */
  brand?: boolean;
}) {
  return (
    <span aria-hidden className="relative flex size-13 shrink-0">
      <span
        className={cn(
          "flex size-full items-center justify-center rounded-full",
          story ? "bg-[linear-gradient(45deg,#f9a03f,#e5323b_45%,#d6249f_75%,#a43ad3)] p-[2px]" : on && "ring-2 ring-brand ring-offset-1 ring-offset-surface",
        )}
      >
        <span className={cn("flex size-full items-center justify-center rounded-full bg-surface", story && "p-[2px]")}>
          {image ? (
            <img
              src={image}
              alt=""
              width={256}
              height={256}
              decoding="async"
              draggable={false}
              className={cn("size-full rounded-full bg-tint object-cover transition-opacity", open && "opacity-80")}
            />
          ) : (
            <span
              className={cn(
                "flex size-full items-center justify-center rounded-full transition-colors duration-150",
                brand ? "bg-tint-3 text-brand" : open ? "bg-border text-ink" : "bg-surface-2 text-ink group-hover:bg-border",
              )}
            >
              <Icon className="size-6" strokeWidth={2.25} fill={brand ? "currentColor" : "none"} />
            </span>
          )}
        </span>
      </span>
      {story && (
        <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-brand text-white ring-2 ring-surface">
          <Play className="ml-px size-2.5" fill="currentColor" strokeWidth={0} />
        </span>
      )}
    </span>
  );
}

function Name({
  label,
  on,
  icon: Icon,
  chevron = false,
  open = false,
}: {
  label: string;
  on: boolean;
  /** The section's icon before its name (the categories; not For you, Following or More). */
  icon?: LucideIcon;
  chevron?: boolean;
  open?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex max-w-full items-center gap-0.5 text-[0.6875rem] leading-4 tracking-[-0.01em] sm:text-xs sm:tracking-normal",
        on ? "font-bold text-brand" : "font-medium text-ink",
      )}
    >
      {Icon && <Icon aria-hidden className="size-3 shrink-0" strokeWidth={2.25} />}
      <span className="truncate">{label}</span>
      {chevron && <ChevronDown aria-hidden className={cn("size-3 shrink-0 transition-transform duration-200", open && "rotate-180")} strokeWidth={2.5} />}
    </span>
  );
}
