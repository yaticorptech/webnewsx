"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { isFeedPath } from "@/components/feed/feed-views";
import { ChevronDown } from "lucide-react";
import { NAV_FOLLOWING, NAV_HOME, NAV_MAIN, NAV_MORE, type NavItem, type NavKey } from "@/lib/categories";
import { districtFromSlug, isCategory } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { CategoryCircles, coverOf } from "./category-circles";

type Active = { key: NavKey | null; district: string | null };
export type Menu = "karnataka" | "more";

/** Panel widths (≥640px; phones get the full width). */
const PANEL_WIDTH: Record<Menu, number> = { more: 420, karnataka: 520 };

/** The chip a URL belongs to: "/" = Home, "/?tab=following", "/category/<category>[/<district>]", "/trending". */
export function activeSection(pathname: string, tab: string | null): Active {
  if (pathname === "/") return { key: tab === "following" ? "following" : "home", district: null };
  if (pathname === "/trending") return { key: "trending", district: null };
  const match = /^\/category\/([^/]+)(?:\/([^/]+))?\/?$/.exec(pathname);
  if (match && isCategory(match[1])) return { key: match[1], district: match[2] ? districtFromSlug(match[2]) : null };
  return { key: null, district: null };
}

/** Pages with the chip row: the feeds (Home, Following, categories, languages) and Trending. */
export function showsCategoryNav(pathname: string): boolean {
  return isFeedPath(pathname) || pathname === "/trending";
}

/**
 * The category chips under the top bar (redesign 2026-10-07, YouTube-style; before: "C · Icon chips", owner
 * 2026-09-26): For you · Following · the main sections · Karnataka ▾ (31 districts) · Astrology · More ▾, plain
 * rounded chips, the current one a red box with white text (owner 2026-10-08; before: filled ink) — one fill that
 * glides to the tapped chip. Only on feed pages and
 * Trending (`showsCategoryNav`; --nav-h counts the row only where it shows, globals.css). ≥1024px the chips start in
 * line with the page column (after the side menu) and `trail` (the grid / reels switch) sits at the row's end.
 * Karnataka ▾ opens the districts (with a search box), More ▾ a grid of icon tiles. The panels sit in the DOM right
 * after their chip (Tab walks into them) but are positioned against the <nav>, so the row's horizontal scrolling never
 * clips them; scrolling the row or resizing re-aligns them with their chip. Escape, a click outside or leaving with
 * Tab closes them.
 */
type CategoryNavProps = {
  className?: string;
  /** ≥1024px: at the end of the row (the grid / reels switch). */
  trail?: ReactNode;
};

export function CategoryNav({ className, trail }: CategoryNavProps) {
  const pathname = usePathname();
  if (!showsCategoryNav(pathname)) return null;
  return (
    <Suspense fallback={<CategoryNavView active={{ key: null, district: null }} className={className} trail={trail} />}>
      <CategoryNavLive className={className} trail={trail} />
    </Suspense>
  );
}

function CategoryNavLive(props: CategoryNavProps) {
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  return <CategoryNavView active={activeSection(pathname, tab)} {...props} />;
}

function CategoryNavView({ active, className, trail }: CategoryNavProps & { active: Active }) {
  const navRef = useRef<HTMLElement>(null);
  const ids = useId();
  const [open, setOpen] = useState<Menu | null>(null);
  const [left, setLeft] = useState(0);
  // The tapped chip turns red at once (the URL only changes once its page has loaded); a new URL drops the tap for good.
  const here = `${active.key}|${active.district}`;
  const [tap, setTap] = useState<{ key: NavKey; from: string } | null>(null);
  if (tap && tap.from !== here) setTap(null);
  const current = tap?.from === here ? tap.key : active.key;
  const onTap = (key: NavKey) => (event: MouseEvent) => {
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) setTap({ key, from: here });
  };
  const moreActive = NAV_MORE.find((item) => item.key === current) ?? null;
  const close = () => setOpen(null);

  /** Lines a panel up with its chip (clamped inside the nav). */
  const place = (menu: Menu) => {
    const nav = navRef.current;
    // The visible trigger: phones' circle or the desktop text menu's button.
    const trigger = [...(nav?.querySelectorAll<HTMLElement>(`[data-menu-circle="${menu}"]`) ?? [])].find((el) => el.offsetParent !== null);
    if (!nav || !trigger) return;
    const box = nav.getBoundingClientRect();
    const at = trigger.getBoundingClientRect().left - box.left;
    setLeft(Math.max(8, Math.min(at, box.width - PANEL_WIDTH[menu] - 8)));
  };

  useEffect(() => {
    if (!open) return;
    const nav = navRef.current;
    const onPointer = (event: PointerEvent) => {
      if (!nav?.contains(event.target as Node)) setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(null);
      const triggers = nav?.querySelectorAll<HTMLElement>(`[data-menu-circle="${open}"]`) ?? [];
      [...triggers].find((trigger) => trigger.offsetParent !== null)?.focus();
    };
    const realign = () => place(open);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", realign);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", realign);
    };
  }, [open]);

  const toggle = (menu: Menu) => {
    place(menu);
    setOpen((current) => (current === menu ? null : menu));
  };

  const panelStyle = { "--panel-left": `${left}px` } as CSSProperties;

  /**
   * A menu's panel (Karnataka's districts, More's sections) — rendered after its chip, and on phones after its circle
   * (`idSuffix` keeps the two copies' ids apart; only the visible row's copy shows).
   */
  const panelFor = (menu: Menu, id: string) => (
    <AnimatePresence>
      {open === menu &&
        menu === "more" && (
          <Panel id={id} label="More sections" width="sm:w-105" style={panelStyle}>
            <div className="rounded-3xl border border-border bg-surface p-3 shadow-pop sm:p-4">
              <ul className="grid grid-cols-3 gap-2">
                {NAV_MORE.map((item) => {
                  const isCurrent = current === item.key;
                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        onClick={(event) => {
                          onTap(item.key)(event);
                          close();
                        }}
                        aria-current={isCurrent ? "page" : undefined}
                        className={cn(
                          "group flex w-full flex-col items-center gap-1.5 rounded-2xl p-2 text-center transition-colors duration-150",
                          isCurrent ? "bg-tint" : "hover:bg-surface-2",
                        )}
                      >
                        {/* Like the circles row (owner 2026-10-10): the section's photo in a circle (no icon badge, owner 2026-10-10). */}
                        <span className="relative size-16">
                          {coverOf(item.key) ? (
                            <img
                              src={coverOf(item.key)}
                              alt=""
                              width={256}
                              height={256}
                              decoding="async"
                              draggable={false}
                              className="size-full rounded-full bg-tint object-cover"
                            />
                          ) : (
                            <span className="flex size-full items-center justify-center rounded-full bg-tint text-brand">
                              <item.icon aria-hidden className="size-6" />
                            </span>
                          )}
                        </span>
                        <span className={cn("text-xs font-bold leading-tight", isCurrent ? "text-brand" : "text-ink")}>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Panel>
        )}
    </AnimatePresence>
  );

  return (
    <nav
      ref={navRef}
      data-category-nav=""
      aria-label="Sections"
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(null);
      }}
      className={cn("relative border-b border-border bg-surface", className)}
    >
      {/* The sections as round photos at every width and over the reels too (owner 2026-10-10: no chips any more). */}
      {/* ≥1024px (owner 2026-10-15, newspaper header): the sections as a text menu starting in line with the page (after
          the side menu), spread across, the small grid / reels icon toggle at its end. Phones and tablets keep the circles. */}
      <div className="hidden h-(--tabnav-h) items-center gap-6 pl-[calc(var(--side-w)+2rem)] pr-8 lg:flex 2xl:pl-[calc(var(--side-w)+2.5rem)] 2xl:pr-10">
        {/* Scrolled down, the masthead slides away (nav-frame.tsx data-compact): a small logo appears here instead. */}
        <Link
          href="/"
          aria-label="WebNEWS home"
          className="hidden shrink-0 animate-fade-up items-center rounded-md outline-offset-2 in-data-compact:flex"
        >
          <img src="/brand/logo-light.svg" alt="" width={120} height={14} decoding="async" draggable={false} className="block h-5 w-auto" />
        </Link>
        <ul className="no-scrollbar flex min-w-0 flex-1 items-stretch justify-center gap-3 self-stretch overflow-x-auto">
          {TEXT_MENU.map((item) => {
            const here = current === item.key;
            return (
              <li key={item.key} className="flex">
                <Link
                  href={item.href}
                  onClick={onTap(item.key)}
                  aria-current={here ? "page" : undefined}
                  className={cn(TEXT_ITEM, here ? "text-brand after:bg-brand" : "text-ink hover:text-brand")}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li className="flex">
            <button
              type="button"
              aria-expanded={open === "more"}
              aria-controls={`${ids}-more-text`}
              data-menu-circle="more"
              onClick={() => toggle("more")}
              className={cn(TEXT_ITEM, "gap-1", moreActive ? "text-brand after:bg-brand" : "text-ink hover:text-brand")}
            >
              {moreActive?.label ?? "More"}
              <ChevronDown aria-hidden className={cn("size-3.5 transition-transform duration-200", open === "more" && "rotate-180")} strokeWidth={2.5} />
            </button>
          </li>
        </ul>
        {trail && <div className="flex shrink-0 justify-end">{trail}</div>}
      </div>
      <div className="hidden lg:block">{panelFor("more", `${ids}-more-text`)}</div>
      <div className="flex items-center lg:hidden">
        <CategoryCircles
          current={current}
          district={active.district}
          moreActive={moreActive}
          open={open}
          onTap={onTap}
          onToggle={toggle}
          panel={(menu) => panelFor(menu, `${ids}-${menu}-circle`)}
          controls={(menu) => `${ids}-${menu}-circle`}
          className="min-w-0 flex-1"
        />
      </div>
    </nav>
  );
}

/* ─────────────────────────── Desktop text menu ─────────────────────────── */

/** The desktop menu's sections, in the circles' order: For you · Following · the main sections (then More ▾). */
const TEXT_MENU: readonly NavItem[] = [{ ...NAV_HOME, label: "Home" }, NAV_FOLLOWING, ...NAV_MAIN];

/** A text menu item: bold, readable; the open one red with a thin red underline. */
const TEXT_ITEM =
  "relative inline-flex items-center whitespace-nowrap px-3.5 text-[0.875rem] font-semibold transition-colors outline-offset-[-2px] after:absolute after:inset-x-3.5 after:bottom-0 after:h-0.5 after:content-['']";

/* ─────────────────────────── Panels ─────────────────────────── */

function Panel({ id, label, width, style, children }: { id: string; label: string; width: string; style: CSSProperties; children: ReactNode }) {
  return (
    <motion.div
      id={id}
      role="region"
      aria-label={label}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      style={style}
      className={cn("absolute top-full z-40 mt-1.5 max-sm:inset-x-2 sm:left-(--panel-left)", width)}
    >
      {children}
    </motion.div>
  );
}

