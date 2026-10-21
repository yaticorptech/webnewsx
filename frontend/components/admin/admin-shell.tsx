"use client";

import { ArrowUpRight, ChevronDown, Globe, LogOut, Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRealtimeEvent } from "@/components/providers/realtime-provider";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLogOut } from "@/components/auth/logout-button";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { UserHandle } from "@/components/brand/user-handle";
import { BackButton } from "@/components/layout/back-button";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import { Avatar } from "@/components/ui/avatar";
import { ADMIN_HOME } from "@/lib/admin-home";
import { compactNumber } from "@/lib/format";
import { api } from "@/lib/api";
import { LIVE_WINDOW_MINUTES, type AdminOverview } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { DESK_GROUPS, DESK_SECTIONS, activeSection, type DeskGroup, type DeskKpis, type DeskSection } from "./nav";
import { useOverview } from "./use-overview";

export type DeskViewer = { name: string; username: string; image: string | null };

type AdminShellProps = {
  viewer: DeskViewer;
  overview: AdminOverview | null;
  children: ReactNode;
};

/**
 * Editor Desk chrome (SPEC §3.11): a sticky sidebar on ≥1024px; below that a compact top bar whose ☰ slides the same
 * sections in from the left (owner 2026-10-01: a side menu, not a tab row). Pending counts (review queue, flagged stories, Spotlight requests)
 * come from the shared overview query, so they drop as soon as an action lands.
 * Self-contained (owner rule 2026-09-25): the Desk is reached only by typing the admin's email + password on the Log
 * in page (where Log out returns to). "Visit site" opens the site in a new tab, seen exactly as a visitor sees it
 * (with an "Admin panel" button back). Every page but the Overview opens with the back arrow.
 */
export function AdminShell({ viewer, overview, children }: AdminShellProps) {
  const pathname = usePathname();
  const current = activeSection(pathname);
  const { data } = useOverview(overview);
  const kpis = data?.kpis ?? null;
  const expanded = useSidebarExpanded();

  return (
    <div className="flex min-h-dvh bg-[#f7f7f8]">
      {/*
        ≥1024px (owner 2026-10-16, a newsroom CMS look): the red WebNEWS header, then the sections in groups that open
        and close. ☰ in the top bar folds it to icons (remembered on this device; names show on hover).
      */}
      <aside
        aria-label="Editor Desk"
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 lg:flex",
          expanded ? "w-64" : "w-17",
        )}
      >
        <Link
          href={ADMIN_HOME}
          aria-label="Editor Desk dashboard"
          className={cn("flex h-16 shrink-0 items-center gap-2.5 bg-brand", expanded ? "px-4" : "justify-center")}
        >
          {expanded ? (
            <>
              <span className="rounded-md bg-white px-2 py-1.5">
                <BrandLockup size="2xs" align="start" />
              </span>
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[0.625rem] font-bold tracking-[0.12em] text-white">ADMIN</span>
            </>
          ) : (
            <SpeedBarsSvg className="w-6 text-white" />
          )}
        </Link>
        <nav aria-label="Editor Desk sections" className={cn("no-scrollbar min-h-0 flex-1 overflow-y-auto py-3", expanded ? "px-3" : "px-2.5")}>
          {DESK_GROUPS.map((group) => (
            <NavGroup key={group} group={group} current={current} kpis={kpis} expanded={expanded} />
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileBar viewer={viewer} current={current} kpis={kpis} />
        {/* ≥1024px the top bar: ☰, where you are (group + page title), then Live now · View Site · Logout. */}
        <div className="sticky top-0 z-30 hidden h-16 items-center gap-4 border-b border-border bg-surface px-6 lg:flex">
          <button
            type="button"
            onClick={() => setSidebarExpanded(!expanded)}
            aria-expanded={expanded}
            aria-label={expanded ? "Show icons only" : "Show the full menu"}
            title={expanded ? "Collapse menu" : "Expand menu"}
            className="-ml-2 inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Menu aria-hidden className="size-5" />
          </button>
          <div className="min-w-0 leading-tight">
            <p className="text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-muted">{current?.group ?? "Editor Desk"}</p>
            <p className="truncate font-serif text-xl font-semibold text-ink">{current?.label ?? "Editor Desk"}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <LiveNow />
            <a
              href="/"
              target="_blank"
              rel="noopener"
              className="inline-flex h-9 items-center gap-1 rounded-md px-3 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              View Site
              <ArrowUpRight aria-hidden className="size-4" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <TopLogOut />
            <span title={viewer.name} className="ml-1">
              <Avatar src={viewer.image} name={viewer.name} size="sm" decorative />
            </span>
          </div>
        </div>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 pb-16 pt-3 outline-none sm:px-6 lg:px-6 lg:pt-6">
          {/* Full width (owner 2026-10-16). */}
          <div className="w-full">
            {pathname !== ADMIN_HOME && (
              <div data-app-no-back="" className="mb-3 flex">
                <BackButton fallback={ADMIN_HOME} />
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function DeskPill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "kicker inline-flex items-center gap-1.5 rounded-full bg-brand px-2.5 py-1 text-[0.625rem] text-brand-contrast shadow-[0_1px_2px_rgb(227_6_19/0.25)]",
        className,
      )}
    >
      <SpeedBarsSvg className="h-2 w-auto" />
      Editor Desk
    </span>
  );
}

/** One sidebar group: its small heading (red with a dot when you're in it), opening and closing its sections. */
function NavGroup({ group, current, kpis, expanded }: { group: DeskGroup; current: DeskSection | undefined; kpis: DeskKpis | null; expanded: boolean }) {
  const sections = DESK_SECTIONS.filter((section) => section.group === group);
  const here = current?.group === group;
  const waiting = kpis ? sections.reduce((sum, section) => sum + (section.pending ? section.pending(kpis) : 0), 0) : 0;
  const [open, setOpen] = useState(here || group === "Overview");
  const shown = !expanded || open;
  return (
    <div className={cn(expanded && "border-b border-border py-1.5 last:border-b-0")}>
      {expanded && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.12em] transition-colors hover:bg-surface-2"
        >
          <span className={cn(here ? "text-brand" : "text-muted")}>{group}</span>
          {(here || waiting > 0) && <span aria-hidden className={cn("size-1.5 rounded-full", waiting > 0 ? "bg-brand" : "bg-brand/60")} />}
          <ChevronDown aria-hidden className={cn("ml-auto size-4 text-muted transition-transform", open && "rotate-180")} />
        </button>
      )}
      {shown && (
        <ul className={cn("flex flex-col gap-0.5", expanded ? "pb-1.5 pt-0.5" : "pb-2")}>
          {sections.map((section) => (
            <li key={section.key}>
              <SidebarLink section={section} active={current?.key === section.key} kpis={kpis} expanded={expanded} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SidebarLink({ section, active, kpis, expanded }: { section: DeskSection; active: boolean; kpis: DeskKpis | null; expanded: boolean }) {
  const Icon = section.icon;
  const pending = kpis && section.pending ? section.pending(kpis) : 0;
  return (
    <Link
      href={section.href}
      aria-current={active ? "page" : undefined}
      aria-label={pending > 0 ? `${section.label}, ${pending} waiting` : section.label}
      className={cn(
        "group relative flex items-center rounded-md transition-colors duration-150",
        expanded ? "h-10 gap-3 px-2.5" : "size-12 justify-center",
        active ? "bg-tint text-brand" : "text-muted hover:bg-surface-2 hover:text-ink",
      )}
    >
      <Icon aria-hidden className="size-4.5 shrink-0" strokeWidth={active ? 2.25 : 1.9} />
      {expanded && <span className={cn("min-w-0 flex-1 truncate text-[0.9375rem]", active ? "font-semibold" : "text-ink")}>{section.label}</span>}
      {pending > 0 &&
        (expanded ? (
          <span aria-hidden className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[0.6875rem] font-semibold tabular-nums text-white">
            {compactNumber(pending)}
          </span>
        ) : (
          <span aria-hidden className="absolute right-1.5 top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[0.5625rem] font-bold tabular-nums text-white ring-2 ring-surface">
            {compactNumber(pending)}
          </span>
        ))}
      {!expanded && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {section.label}
          {pending > 0 && <span className="ml-1.5 font-medium text-brand">{pending} waiting</span>}
        </span>
      )}
    </Link>
  );
}

/** The desk menu full or icons only (≥1024px), remembered on this device; full by default. */
const SIDEBAR_KEY = "webnews-desk-sidebar";
let sidebarExpanded = (() => {
  try {
    return typeof window === "undefined" || localStorage.getItem(SIDEBAR_KEY) !== "closed";
  } catch {
    return true;
  }
})();
const sidebarListeners = new Set<() => void>();
function setSidebarExpanded(next: boolean) {
  sidebarExpanded = next;
  try {
    localStorage.setItem(SIDEBAR_KEY, next ? "open" : "closed");
  } catch {
    // Not remembered; fine.
  }
  sidebarListeners.forEach((listener) => listener());
}
function useSidebarExpanded(): boolean {
  return useSyncExternalStore(
    (listener) => {
      sidebarListeners.add(listener);
      return () => sidebarListeners.delete(listener);
    },
    () => sidebarExpanded,
    () => true,
  );
}

/** Logout in the top bar (owner 2026-10-16). */
function TopLogOut() {
  const { logOut, pending } = useLogOut("/login");
  return (
    <button
      type="button"
      onClick={logOut}
      disabled={pending}
      className="inline-flex h-9 items-center rounded-md bg-surface-2 px-3.5 text-sm font-medium text-ink transition-colors hover:bg-border disabled:opacity-60"
    >
      Logout
    </button>
  );
}

const LIVE_TIME = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });

/**
 * "● 12 live" (owner 2026-10-16: show the live visits): people on WebNEWS in the last few minutes, refreshed every 20 s.
 * Tap for the split (signed in / visitors, app / web), the pages they're on and who's signed in.
 */
function LiveNow() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const live = useQuery({
    queryKey: ["admin", "live"],
    queryFn: ({ signal }) => api.admin.live(signal),
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
  });
  // New activity anywhere: the count moves at once (owner 2026-10-16), the 20 s poll catches people leaving.
  const queryClient = useQueryClient();
  useRealtimeEvent("behaviour.changed", () => void queryClient.invalidateQueries({ queryKey: ["admin", "live"] }));
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);
  const data = live.data;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
      >
        <span className="relative flex size-2">
          <span aria-hidden className="absolute inline-flex size-full animate-ping rounded-full bg-[#22a35a] opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-[#22a35a]" />
        </span>
        <span className="tabular-nums">{data ? data.total.toLocaleString("en-IN") : "–"}</span>
        <span className="text-muted">live</span>
      </button>
      {open && data && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-border bg-surface p-4 shadow-xl">
          <p className="text-sm font-semibold text-ink">On WebNEWS now</p>
          <p className="text-xs text-muted">Active in the last {LIVE_WINDOW_MINUTES} minutes · updates live</p>
          <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
            {[
              ["Signed in", data.signedIn],
              ["Visitors", data.visitors],
              ["App", data.app],
              ["Web", data.web],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-surface-2 px-1 py-2">
                <dd className="text-base font-semibold tabular-nums text-ink">{value}</dd>
                <dt className="text-[0.6875rem] text-muted">{label}</dt>
              </div>
            ))}
          </dl>
          {data.pages.length > 0 && (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Pages</p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {data.pages.map((page) => (
                  <li key={page.path} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-ink">{page.path === "/" ? "Home" : page.path}</span>
                    <span className="shrink-0 tabular-nums text-muted">{page.people}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {data.people.length > 0 && (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Signed in</p>
              <ul className="mt-1.5 flex max-h-48 flex-col gap-1.5 overflow-y-auto">
                {data.people.map((person) => (
                  <li key={person.id}>
                    <Link
                      href={`/admin/behaviour/${encodeURIComponent(person.username)}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 rounded-md p-1 hover:bg-surface-2"
                    >
                      <Avatar src={person.image} name={person.name} size={28} decorative />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{person.name}</span>
                        <span className="block truncate text-xs text-muted">{person.path === "/" ? "Home" : person.path}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted">{LIVE_TIME.format(new Date(person.at))}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          {data.total === 0 && <p className="mt-4 text-sm text-muted">No one right now.</p>}
        </div>
      )}
    </div>
  );
}

/**
 * "Visit site": the public site in a new tab, as a visitor sees it (the admin's site view has an "Admin panel" button
 * back here). `compact` = round icon button.
 */
function VisitSite({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <a
      href="/"
      target="_blank"
      rel="noopener"
      aria-label={compact ? "Visit site (opens in a new tab)" : undefined}
      title={compact ? "Visit site" : "Opens in a new tab"}
      className={cn(
        "relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-bold transition-colors after:absolute after:-inset-1 after:content-['']",
        compact
          ? "size-10 text-muted hover:bg-tint-2 hover:text-brand"
          : "h-9 border border-border-strong px-3 text-xs text-ink hover:border-brand hover:text-brand",
        className,
      )}
    >
      <Globe aria-hidden className={compact ? "size-4" : "size-3.5"} />
      {!compact && (
        <>
          Visit site<span className="sr-only"> (opens in a new tab)</span>
        </>
      )}
    </a>
  );
}

/** Log out of the Editor Desk → back to the Log in page (the only way in). `compact` = round icon button. */
function DeskLogOut({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { logOut, pending } = useLogOut("/login");
  return (
    <button
      type="button"
      onClick={logOut}
      disabled={pending}
      aria-label={compact ? "Log out of the Editor Desk" : undefined}
      title={compact ? "Log out" : undefined}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-bold transition-colors disabled:opacity-60",
        // Phones: the tap area reaches 44px (invisible ::after); the label never wraps and drops below 360px.
        "relative whitespace-nowrap after:absolute after:-inset-1 after:content-['']",
        compact
          ? "size-10 text-muted hover:bg-tint-2 hover:text-brand"
          : "h-9 border border-border-strong px-3 text-xs text-ink hover:border-brand hover:text-brand max-[359px]:px-2.5",
        className,
      )}
    >
      <LogOut aria-hidden className={compact ? "size-4" : "size-3.5"} />
      {!compact && <span className="max-[359px]:sr-only">Log out</span>}
    </button>
  );
}

/**
 * <1024px: compact bar (☰ · lockup · current section · avatar). ☰ opens the side menu (MobileDrawer); a red dot on it
 * means something is waiting for the desk.
 */
function MobileBar({ viewer, current, kpis }: { viewer: DeskViewer; current: DeskSection | undefined; kpis: DeskKpis | null }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const waiting = kpis ? DESK_SECTIONS.reduce((sum, section) => sum + (section.pending ? section.pending(kpis) : 0), 0) : 0;

  return (
    <header className="sticky top-(--safe-top) z-40 border-b border-border bg-surface lg:hidden">
      <div className="flex h-16 items-center gap-2 px-3 sm:px-5">
        <button
          ref={menuRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={waiting > 0 ? `Open the Editor Desk menu, ${waiting} waiting` : "Open the Editor Desk menu"}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-tint hover:text-brand"
        >
          <Menu aria-hidden className="size-6" />
          {waiting > 0 && <span aria-hidden className="absolute right-2 top-2 size-2.5 rounded-full bg-brand ring-2 ring-surface" />}
        </button>
        <Link href={ADMIN_HOME} aria-label="Editor Desk overview" className="flex shrink-0 rounded-md outline-offset-4">
          <BrandLockup size="2xs" align="start" className="sm:lockup-xs" />
        </Link>
        {current && (
          <span className="ml-1 hidden min-w-0 truncate border-l border-border pl-3 text-sm font-semibold text-ink min-[400px]:block">
            {current.label}
          </span>
        )}
        <span title={viewer.name} className="ml-auto shrink-0 rounded-full p-1">
          <Avatar src={viewer.image} name={viewer.name} size="sm" ring="ink" decorative />
        </span>
      </div>
      <MobileDrawer
        open={open}
        onClose={() => {
          setOpen(false);
          menuRef.current?.focus();
        }}
        viewer={viewer}
        current={current}
        kpis={kpis}
      />
    </header>
  );
}

/**
 * The phones' side menu: the desk pill, every section (red badges for what's waiting), then who you are, Visit site and
 * Log out. Slides in from the left over a dimmed page; a tap outside, Escape, ✕ or opening a section closes it. The
 * page behind doesn't scroll while it's open.
 */
function MobileDrawer({
  open,
  onClose,
  viewer,
  current,
  kpis,
}: {
  open: boolean;
  onClose: () => void;
  viewer: DeskViewer;
  current: DeskSection | undefined;
  kpis: DeskKpis | null;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    // Open on the page you're on (owner 2026-10-16): the current section in view and focused, not the top of the list.
    const here = panelRef.current?.querySelector<HTMLElement>('[aria-current="page"]') ?? panelRef.current?.querySelector<HTMLElement>("a, button");
    here?.focus({ preventScroll: true });
    here?.scrollIntoView({ block: "center" });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.button
            type="button"
            aria-label="Close the menu"
            tabIndex={-1}
            onClick={onClose}
            className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Editor Desk menu"
            className="absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col bg-surface pt-(--safe-top) shadow-pop"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 40 }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4">
              <div className="flex min-w-0 flex-col items-start gap-2">
                <Link href={ADMIN_HOME} aria-label="Editor Desk overview" className="rounded-md outline-offset-4">
                  <BrandLockup size="2xs" align="start" />
                </Link>
                <DeskPill />
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close the menu"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-tint hover:text-brand"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <nav aria-label="Editor Desk sections" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
              <ul className="flex flex-col gap-0.5">
                {DESK_SECTIONS.map((section) => {
                  const active = current?.key === section.key;
                  const pending = kpis && section.pending ? section.pending(kpis) : 0;
                  const Icon = section.icon;
                  return (
                    <li key={section.key}>
                      <Link
                        href={section.href}
                        onClick={(event) => {
                          // The page you're already on: just close the menu — no reload, no jump to the top.
                          if (active) event.preventDefault();
                          onClose();
                        }}
                        scroll={!active}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "relative flex h-11 items-center gap-3 rounded-lg px-3 text-[0.9375rem] font-semibold transition-colors",
                          active ? "bg-tint text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                        )}
                      >
                        <Icon aria-hidden className={cn("size-5 shrink-0", active ? "text-brand" : "text-muted")} />
                        <span className="min-w-0 flex-1 truncate">{section.label}</span>
                        {pending > 0 && (
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[0.6875rem] font-bold tabular-nums text-brand-contrast">
                            {compactNumber(pending)}
                            <span className="sr-only"> waiting</span>
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <div className="flex items-center gap-3 px-1">
                <Avatar src={viewer.image} name={viewer.name} size="md" ring="ink" decorative />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-bold text-ink">
                    <span className="truncate">{viewer.name}</span>
                    <VerifiedBadge size={15} />
                  </p>
                  <UserHandle username={viewer.username} truncate className="flex text-xs text-muted" />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <VisitSite />
                <DeskLogOut />
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
