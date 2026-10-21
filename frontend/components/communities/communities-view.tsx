"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  EllipsisVertical,
  Eye,
  Flame,
  Globe,
  Link2,
  Loader2,
  Lock,
  MessageCircle,
  Plus,
  Search,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { useAuthPrompt } from "@/components/layout/auth-prompt";
import { PageHeader } from "@/components/layout/page-header";
import { useDebounced } from "@/components/messages/people-picker";
import { useCanMessage } from "@/components/messages/use-can-message";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { TimeAgo } from "@/components/ui/time-ago";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { compactNumber } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import type { ChatRole, CommunityInvite, CommunitySummary } from "@/lib/shared/contracts";
import { cn, initialsOf } from "@/lib/utils";
import { CreateCommunityModal } from "./create-community-modal";

type Scope = "discover" | "mine" | "invites";

/** Discover's carousel: the biggest public communities (the list comes biggest first). */
const FEATURED = 3;

/**
 * /communities (owner 2026-09-30; redesigned 2026-10-09 from the owner's reference — the layout, with each community's
 * own photo and words): Yours — your communities as cards (most recently active first) with their photo as a cover and
 * in the round badge over its edge, name, public / private · members, your role, Open chat and View;
 * Discover — a carousel of the biggest communities, a search by name (owner 2026-10-10: no topic chips) and the
 * communities as cards with Join and View; Invitations — accept / decline. "Create community" makes you its owner. Header, tabs and every action are
 * as before.
 */
export function CommunitiesView() {
  const signedIn = useCanMessage();
  const authPrompt = useAuthPrompt();
  const [scope, setScope] = useState<Scope>(signedIn ? "mine" : "discover");
  const [creating, setCreating] = useState(false);
  const [text, setText] = useState("");
  const q = useDebounced(text.trim());

  const invites = useQuery({
    queryKey: qk.communityInvites,
    queryFn: ({ signal }) => api.communities.invites(signal),
    enabled: signedIn,
  });
  const list = useQuery({
    queryKey: qk.communities(scope === "mine" ? "mine" : "discover", scope === "discover" ? q : ""),
    queryFn: ({ signal }) => api.communities.list({ q: scope === "discover" ? q : undefined, mine: scope === "mine" }, signal),
    enabled: scope !== "invites",
  });
  const inviteCount = invites.data?.items.length ?? 0;
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  return (
    // Full screen width (owner 2026-10-01, data-grid-page like Home): the communities fill rows of cards.
    <section aria-labelledby="communities-heading" data-grid-page="" className="flex flex-col gap-4">
      <PageHeader
        id="communities-heading"
        title="Communities"
        subtitle="Groups around places and topics, each with its own chat."
        // Under the line of text, not beside it (owner 2026-10-10: the text was squeezed into a narrow column).
        actionsPlacement="below"
        actions={
          <Button
            size="sm"
            leftIcon={<Plus aria-hidden strokeWidth={2.75} />}
            onClick={() => (signedIn ? setCreating(true) : authPrompt.open("Log in to create a community"))}
          >
            Create<span className="max-[359px]:sr-only">&nbsp;community</span>
          </Button>
        }
      />

      <Tabs
        ariaLabel="Communities"
        value={scope}
        onValueChange={(value) => setScope(value as Scope)}
        items={[
          ...(signedIn ? [{ value: "mine", label: "Yours" }] : []),
          { value: "discover", label: "Discover" },
          ...(signedIn ? [{ value: "invites", label: "Invitations", count: inviteCount || undefined }] : []),
        ]}
      />

      {scope === "discover" && (
        <>
          {!q && items.length > 0 && <Featured items={items.slice(0, FEATURED)} />}

          <label className="flex h-12 w-full items-center gap-2.5 rounded-full bg-surface-3 px-4 transition-shadow focus-within:shadow-[0_0_0_2px_var(--brand)] sm:max-w-xl">
            <Search aria-hidden className="size-4.5 shrink-0 text-muted" />
            <input
              type="search"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Search communities by name…"
              aria-label="Search communities"
              className="h-full min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink outline-none placeholder:text-muted-2"
            />
          </label>
        </>
      )}

      {scope === "invites" ? (
        invites.isPending ? (
          <YoursSkeleton />
        ) : inviteCount === 0 ? (
          <EmptyState size="sm" className="card" title="No invitations" description="When someone invites you to a community, it shows up here and in your notifications." />
        ) : (
          <ul className={YOURS_GRID}>
            {invites.data?.items.map((invite) => (
              <InviteCard key={invite.id} invite={invite} />
            ))}
          </ul>
        )
      ) : list.isPending ? (
        scope === "mine" ? (
          <YoursSkeleton />
        ) : (
          <DiscoverSkeleton />
        )
      ) : list.isError ? (
        <p className="card px-4 py-10 text-center text-sm text-muted">Couldn&rsquo;t load communities. Try again in a moment.</p>
      ) : items.length === 0 ? (
        <EmptyState
          size="sm"
          className="card"
          icon={<UsersRound aria-hidden />}
          title={scope === "mine" ? "You're not in any community yet" : q ? "No communities found" : "No public communities yet"}
          description={scope === "mine" ? "Join one from Discover, or start your own." : "Be the first — create one and invite people."}
          action={
            scope === "mine" ? (
              <Button variant="secondary" onClick={() => setScope("discover")}>
                Discover communities
              </Button>
            ) : undefined
          }
        />
      ) : scope === "mine" ? (
        <>
          <ul className={YOURS_GRID}>
            {items.map((community) => (
              <YoursCard key={community.id} community={community} />
            ))}
          </ul>
        </>
      ) : (
        <>
          <h2 className="font-wide text-lg font-extrabold text-ink">{q ? <>Results for &ldquo;{q}&rdquo;</> : "Popular communities"}</h2>
          <ul className={DISCOVER_GRID}>
            {items.map((community) => (
              <DiscoverCard key={community.id} community={community} />
            ))}
          </ul>
        </>
      )}

      <CreateCommunityModal open={creating} onOpenChange={setCreating} />
    </section>
  );
}

/** Yours and Invitations: 1 per row on phones, then 2, 3, 4. */
const YOURS_GRID = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
/** Discover: wider cards (photo beside the words), 1 per row on phones, then 2, 3. */
const DISCOVER_GRID = "grid gap-3 md:grid-cols-2 2xl:grid-cols-3";

/* ─────────────────────────── Parts ─────────────────────────── */

/** Join from a card: the API, the toast with "Open chat", the sign-in prompt for visitors. */
function useJoin(community: CommunitySummary) {
  const queryClient = useQueryClient();
  const signedIn = useCanMessage();
  const authPrompt = useAuthPrompt();
  const join = useMutation({
    mutationFn: () => api.communities.join(community.id),
    onSuccess: () => {
      // No "You joined" popup (owner 2026-10-10): the card itself changes (the "+" goes, a tap opens the chat).
      void queryClient.invalidateQueries({ queryKey: qk.communitiesAll });
      void queryClient.invalidateQueries({ queryKey: qk.messagesAll });
    },
    onError: (error) => toast.error("Couldn't join", { description: errorMessage(error) }),
  });
  return {
    pending: join.isPending,
    onJoin: () => (signedIn ? join.mutate() : authPrompt.open(`Log in to join ${community.name}`)),
    label: community.viewer.inviteId ? "Accept invite" : "Join",
  };
}

/**
 * The community's photo (uploaded when it was created or edited) as a cover (object-cover), or — without one — the
 * WebNEWS red with the logo's bars. `children`
 * sit over it (it clips its own corners: pass the rounding in `className`).
 */
function Cover({ community, className, children }: { community: CommunitySummary; className?: string; children?: ReactNode }) {
  return (
    <div className={cn("relative isolate overflow-hidden bg-[linear-gradient(135deg,#e30613_0%,#a5000c_50%,#16181d_100%)]", className)}>
      {community.image ? (
        <img src={community.image} alt="" loading="lazy" decoding="async" draggable={false} className="absolute inset-0 -z-10 size-full object-cover" />
      ) : (
        <SpeedBarsSvg className="pointer-events-none absolute -bottom-2 -right-3 -z-10 w-[45%] max-w-36 text-white/15" />
      )}
      {children}
    </div>
  );
}

/**
 * The round badge over the cover's edge: the community's photo — the one uploaded when it was created or edited (owner
 * 2026-10-10: in the circle and as the cover) — or, without one (or if it fails to load), its initials ("LM").
 */
function Badge({ name, image, className }: { name: string; image: string | null; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const show = Boolean(image) && failed !== image;
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-tint-2 font-wide font-black uppercase leading-none tracking-tight text-brand shadow-card ring-surface",
        className,
      )}
    >
      {initialsOf(name)}
      {show && image && (
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(image)}
          className="absolute inset-0 size-full bg-tint-2 object-cover"
        />
      )}
    </span>
  );
}

function Meta({ community, className }: { community: CommunitySummary; className?: string }) {
  const count = community.memberCount;
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5 text-[0.8125rem] font-medium text-muted [&_svg]:size-4 [&_svg]:shrink-0", className)}>
      {community.visibility === "public" ? <Globe aria-hidden /> : <Lock aria-hidden />}
      <span className="truncate">
        {community.visibility === "public" ? "Public" : "Private"} · {compactNumber(count)} {count === 1 ? "member" : "members"}
      </span>
    </span>
  );
}

/** Kept for the community page's header. */
export function VisibilityLabel({ visibility, memberCount }: { visibility: CommunitySummary["visibility"]; memberCount: number }) {
  return (
    <span className="flex items-center gap-1 text-xs font-semibold text-muted [&_svg]:size-3.5">
      {visibility === "public" ? <Globe aria-hidden /> : <Lock aria-hidden />}
      {visibility === "public" ? "Public" : "Private"} · {memberCount} {memberCount === 1 ? "member" : "members"}
    </span>
  );
}

const ROLE: Record<ChatRole, string> = { owner: "Owner", admin: "Admin", member: "Member" };

/** The invitations' buttons: Accept (solid red), Decline (outlined). */
const JOIN =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand px-3 text-[0.8125rem] font-bold text-brand-contrast transition-colors hover:bg-brand-hover disabled:opacity-70";
const VIEW =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 text-[0.8125rem] font-bold text-ink transition-colors hover:border-ink [&_svg]:size-4";

/* ─────────────────────────── Yours ─────────────────────────── */

function YoursCard({ community }: { community: CommunitySummary }) {
  const href = `/communities/${community.id}`;
  const chat = `/messages/${community.id}`;
  return (
    // Compact (owner 2026-10-10: "too big"); the whole card opens the community's chat (owner 2026-10-10: no Open chat /
    // View buttons — they're in the ⋮ menu). No overflow clipping on the card: the menu opens past its edge (the cover
    // rounds its own corners).
    <li className="relative flex flex-col rounded-2xl border border-border bg-surface shadow-card transition-shadow hover:shadow-pop">
      <Cover community={community} className="h-20 rounded-t-[calc(1rem-1px)] sm:h-24" />
      {/* z-20: above the card-wide chat link. */}
      <div className="absolute right-2 top-2 z-20">
        <DropdownMenu
          label={`${community.name} options`}
          trigger={<EllipsisVertical aria-hidden />}
          triggerClassName="inline-flex size-7 items-center justify-center rounded-full bg-white/90 text-[#16181d] shadow-sm backdrop-blur-sm transition-colors hover:bg-white [&_svg]:size-4"
          items={[
            { label: "View community", icon: <Eye aria-hidden />, href },
            { label: "Open chat", icon: <MessageCircle aria-hidden />, href: chat },
            { label: "Copy link", icon: <Link2 aria-hidden />, onSelect: () => void copyCommunityLink(community.id) },
          ]}
        />
      </div>

      <div className="flex gap-2.5 px-3.5 pb-3.5">
        {/* relative z-10: over the cover (a positioned box), not behind it. */}
        <span className="relative z-10 -mt-6 shrink-0">
          <Badge name={community.name} image={community.image} className="size-13 text-base ring-[3px]" />
        </span>
        <div className="min-w-0 flex-1 pt-1.5">
          {/* Stretched over the whole card (its ::after, z-15: above the cover and the badge, under the ⋮ menu). */}
          <Link
            href={chat}
            className="line-clamp-1 rounded-sm text-[0.9375rem] font-extrabold text-ink outline-offset-2 transition-colors after:absolute after:inset-0 after:z-15 after:rounded-2xl after:content-[''] hover:text-brand"
          >
            {community.name}
            <span className="sr-only"> — open chat</span>
          </Link>
          <span className="flex min-w-0 items-center gap-2">
            <Meta community={community} className="text-xs [&_svg]:size-3.5" />
            {community.viewer.role && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[0.6875rem] font-semibold text-ink-2">
                <span aria-hidden className="size-1.5 rounded-full bg-brand" />
                {ROLE[community.viewer.role]}
              </span>
            )}
          </span>
          {community.description && <p className="mt-1.5 line-clamp-2 text-[0.8125rem] leading-snug text-ink-2">{community.description}</p>}
        </div>
      </div>
    </li>
  );
}

/* ─────────────────────────── Discover ─────────────────────────── */

/** The biggest communities as a swipeable carousel (one at a time on phones), with dots. */
function Featured({ items }: { items: CommunitySummary[] }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const [active, setActive] = useState(0);
  const step = () => {
    const row = rowRef.current;
    const first = row?.firstElementChild as HTMLElement | null;
    return first ? first.offsetWidth + 12 : 1;
  };

  // One community at a time, sliding to the next every 5 s (back to the first after the last) — computers first, then
  // phones too (owner 2026-10-10) — not while a finger, the pointer or keyboard focus is on it, the tab is hidden, or
  // Reduce Motion is on. A swipe still moves it by hand.
  const count = items.length;
  useEffect(() => {
    if (count < 2) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timer = window.setInterval(() => {
      const row = rowRef.current;
      const first = row?.firstElementChild as HTMLElement | null;
      if (!row || !first || calm.matches || pausedRef.current || document.hidden) return;
      const width = first.offsetWidth + 12;
      const next = (Math.round(row.scrollLeft / width) + 1) % count;
      row.scrollTo({ left: next * width, behavior: "smooth" });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [count]);

  return (
    <section
      aria-label="Featured communities"
      className="flex flex-col gap-2.5 sm:gap-3"
      onPointerEnter={() => (pausedRef.current = true)}
      onPointerLeave={() => (pausedRef.current = false)}
      onFocus={() => (pausedRef.current = true)}
      onBlur={() => (pausedRef.current = false)}
    >
      <div
        ref={rowRef}
        onScroll={() => setActive(Math.round((rowRef.current?.scrollLeft ?? 0) / step()))}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 sm:mx-0 sm:scroll-px-0 sm:px-0"
      >
        {items.map((community) => (
          <FeaturedCard key={community.id} community={community} />
        ))}
      </div>
      {items.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {items.map((community, index) => (
            <button
              key={community.id}
              type="button"
              aria-label={`Show ${community.name}`}
              aria-current={index === active || undefined}
              onClick={() => rowRef.current?.scrollTo({ left: index * step(), behavior: "smooth" })}
              className={cn(
                "relative h-1.5 rounded-full transition-all duration-200 after:absolute after:-inset-2 after:content-['']",
                index === active ? "w-5 bg-brand" : "w-1.5 bg-border-strong",
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** "Copy link" in the cards' ⋮ menus — quietly (owner 2026-10-10: no "Link copied" popup); only a failure says so. */
async function copyCommunityLink(id: string) {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}/communities/${id}`);
  } catch {
    toast.error("Couldn't copy the link");
  }
}

/**
 * Join in one tap (owner 2026-10-10): a red "+" — before the name on the featured cards, on the small circle on the
 * list's cards. Only for communities you're not in; above the card-wide link (z-20). Signed out: the log-in prompt.
 */
function JoinPlus({ community, className }: { community: CommunitySummary; className?: string }) {
  const { pending, onJoin, label } = useJoin(community);
  return (
    <button
      type="button"
      onClick={onJoin}
      disabled={pending}
      aria-busy={pending || undefined}
      aria-label={`${label === "Join" ? "Join" : label}: ${community.name}`}
      title={label === "Join" ? "Join community" : label}
      className={cn(
        "relative z-20 flex shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-sm transition-transform after:absolute after:-inset-2 after:content-[''] hover:bg-brand-hover active:scale-90 disabled:opacity-80",
        className,
      )}
    >
      {pending ? <Loader2 aria-hidden className="size-[60%] animate-spin" /> : <Plus aria-hidden className="size-[62%]" strokeWidth={3} />}
    </button>
  );
}

/**
 * A featured community: its photo, the name (with the "+" to join when you're not in it), the start of its description,
 * members · public / private. The whole card opens its chat — or, before you've joined, its page (owner 2026-10-10).
 */
function FeaturedCard({ community }: { community: CommunitySummary }) {
  const member = community.viewer.role !== null;
  const to = member ? `/messages/${community.id}` : `/communities/${community.id}`;
  return (
    // One at a time at every size; from 640px a big rectangle with bigger words (owner 2026-10-10 — phones unchanged).
    <article className="relative w-full shrink-0 snap-start">
      <Cover
        community={community}
        className="flex h-44 flex-col justify-between rounded-2xl p-4 text-white shadow-card sm:h-64 sm:rounded-3xl sm:p-7 lg:h-80 lg:p-9"
      >
        <span aria-hidden className="absolute inset-0 -z-5 bg-linear-to-r from-black/80 via-black/55 to-black/15" />
        <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-brand px-2.5 py-1 text-[0.6875rem] font-extrabold uppercase tracking-wide sm:px-3 sm:py-1.5 sm:text-xs [&_svg]:size-3.5 sm:[&_svg]:size-4">
          <Flame aria-hidden />
          Featured community
        </span>
        <div className="min-w-0 max-w-[90%] sm:max-w-2xl">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {!member && <JoinPlus community={community} className="size-7 ring-2 ring-white/90 sm:size-9 lg:size-10" />}
            {/* Stretched over the whole card (z-15: above the photo, under the "+"). */}
            <Link
              href={to}
              className="min-w-0 truncate rounded-sm font-wide text-[1.375rem] font-extrabold leading-tight outline-offset-2 after:absolute after:inset-0 after:z-15 after:rounded-2xl after:content-[''] sm:text-3xl sm:after:rounded-3xl lg:text-4xl"
            >
              {community.name}
              <span className="sr-only">{member ? " — open chat" : " — view community"}</span>
            </Link>
          </div>
          {community.description && (
            <p className="mt-1 line-clamp-2 text-sm leading-snug text-white/85 sm:mt-2 sm:text-base lg:text-lg">{community.description}</p>
          )}
        </div>
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-white/90 sm:text-sm [&_svg]:size-4 [&_svg]:shrink-0 sm:[&_svg]:size-5">
          <UsersRound aria-hidden />
          <span className="truncate">
            {compactNumber(community.memberCount)} {community.memberCount === 1 ? "member" : "members"} ·{" "}
            {community.visibility === "public" ? "Public" : "Private"}
          </span>
        </span>
      </Cover>
    </article>
  );
}

/**
 * A community in Discover's list: its photo with the small circle (a "+" on it to join when you're not in it), name,
 * public / private · members and the start of its description, ⋮ (open chat or join, view, copy link). The whole card
 * opens its chat — or, before you've joined, its page (owner 2026-10-10: no buttons on the card).
 */
function DiscoverCard({ community }: { community: CommunitySummary }) {
  const { onJoin, label } = useJoin(community);
  const member = community.viewer.role !== null;
  const page = `/communities/${community.id}`;
  const chat = `/messages/${community.id}`;
  return (
    <li className="relative rounded-2xl border border-border bg-surface p-2.5 shadow-card transition-shadow hover:shadow-pop">
      <div className="flex gap-3">
        <span className="relative block shrink-0">
          <Cover community={community} className="size-20 rounded-xl" />
          {/* Above the card-wide link (z-20), letting taps through — except on the "+". */}
          <span className="pointer-events-none absolute -bottom-1 -left-1 z-20">
            <Badge name={community.name} image={community.image} className="size-10 text-xs ring-[3px]" />
            {!member && (
              <JoinPlus community={community} className="pointer-events-auto absolute -bottom-1 -right-1.5 size-5 ring-2 ring-surface" />
            )}
          </span>
        </span>
        <div className="min-w-0 flex-1 py-0.5 pr-7">
          {/* Stretched over the whole card (z-15: above the photo and circle, under the "+" and the ⋮ menu). */}
          <Link
            href={member ? chat : page}
            className="line-clamp-1 rounded-sm font-wide text-[0.9375rem] font-extrabold text-ink outline-offset-2 transition-colors after:absolute after:inset-0 after:z-15 after:rounded-2xl after:content-[''] hover:text-brand"
          >
            {community.name}
            <span className="sr-only">{member ? " — open chat" : " — view community"}</span>
          </Link>
          <Meta community={community} className="mt-0.5 text-xs [&_svg]:size-3.5" />
          {community.description && <p className="mt-1 line-clamp-2 text-[0.8125rem] leading-snug text-ink-2">{community.description}</p>}
        </div>
      </div>
      <div className="absolute right-1.5 top-1.5 z-20">
        <DropdownMenu
          label={`${community.name} options`}
          trigger={<EllipsisVertical aria-hidden />}
          triggerClassName="inline-flex size-8 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink [&_svg]:size-4.5"
          items={[
            member
              ? { label: "Open chat", icon: <MessageCircle aria-hidden />, href: chat }
              : { label: label === "Join" ? "Join community" : label, icon: <Plus aria-hidden />, onSelect: onJoin },
            { label: "View community", icon: <Eye aria-hidden />, href: page },
            { label: "Copy link", icon: <Link2 aria-hidden />, onSelect: () => void copyCommunityLink(community.id) },
          ]}
        />
      </div>
    </li>
  );
}

/* ─────────────────────────── Invitations ─────────────────────────── */

function InviteCard({ invite }: { invite: CommunityInvite }) {
  const queryClient = useQueryClient();
  const respond = useMutation({
    mutationFn: (accept: boolean) => api.communities.respond(invite.id, accept),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.communitiesAll });
      void queryClient.invalidateQueries({ queryKey: qk.notifications });
      // No "You joined" popup on accepting (owner 2026-10-10): the community moves to Yours.
      void queryClient.invalidateQueries({ queryKey: qk.messagesAll });
    },
    onError: (error) => toast.error("Couldn't answer the invitation", { description: errorMessage(error) }),
  });
  const community = invite.community;
  const href = `/communities/${community.id}`;
  const busy = (accept: boolean) => respond.isPending && respond.variables === accept;
  return (
    // Like a Yours card (owner 2026-10-10): the cover, the initials badge over its edge, name and details, who invited
    // you and when, then Accept / Decline.
    <li className="flex flex-col rounded-2xl border border-border bg-surface shadow-card transition-shadow hover:shadow-pop">
      <Link href={href} tabIndex={-1} aria-hidden className="block">
        <Cover community={community} className="h-20 rounded-t-[calc(1rem-1px)] sm:h-24" />
      </Link>

      <div className="flex gap-2.5 px-3.5">
        <Link href={href} tabIndex={-1} aria-hidden className="relative z-10 -mt-6 shrink-0 rounded-full">
          <Badge name={community.name} image={community.image} className="size-13 text-base ring-[3px]" />
        </Link>
        <div className="min-w-0 flex-1 pt-1.5">
          <Link href={href} className="line-clamp-1 text-[0.9375rem] font-extrabold text-ink transition-colors hover:text-brand">
            {community.name}
          </Link>
          <Meta community={community} className="text-xs [&_svg]:size-3.5" />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 px-3.5 pb-3.5 pt-2.5">
        <p className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] text-ink-2">
          {invite.inviter && <Avatar src={invite.inviter.image} name={invite.inviter.name} size={20} decorative />}
          <span className="min-w-0 truncate">
            {invite.inviter ? (
              <>
                <strong className="font-bold text-ink">{invite.inviter.name}</strong> invited you
              </>
            ) : (
              "You're invited"
            )}
          </span>
          <span aria-hidden className="text-muted">
            ·
          </span>
          <TimeAgo date={invite.createdAt} variant="short" className="shrink-0 text-muted" />
        </p>
        {community.description && <p className="line-clamp-2 text-[0.8125rem] leading-snug text-ink-2">{community.description}</p>}
        <div className="mt-auto flex gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => respond.mutate(true)}
            disabled={respond.isPending}
            aria-busy={busy(true) || undefined}
            className={cn(JOIN, "flex-1")}
          >
            {busy(true) ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" strokeWidth={2.75} />}
            Accept
          </button>
          <button
            type="button"
            onClick={() => respond.mutate(false)}
            disabled={respond.isPending}
            aria-busy={busy(false) || undefined}
            className={cn(VIEW, "flex-1 disabled:opacity-70")}
          >
            {busy(false) ? <Loader2 aria-hidden className="animate-spin" /> : <X aria-hidden />}
            Decline
          </button>
        </div>
      </div>
    </li>
  );
}

/* ─────────────────────────── Loading ─────────────────────────── */

function YoursSkeleton() {
  return (
    <div role="status" aria-label="Loading communities" className={YOURS_GRID}>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-border bg-surface">
          <Skeleton className="h-20 rounded-none sm:h-24" />
          <div className="flex gap-2.5 px-3.5 pb-3.5">
            <Skeleton shape="circle" className="relative z-10 -mt-6 size-13 shrink-0 ring-[3px] ring-surface" />
            <div className="flex flex-1 flex-col gap-2 pt-2">
              <Skeleton className="h-4 w-2/3 rounded-sm" />
              <Skeleton className="h-3 w-1/2 rounded-sm" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DiscoverSkeleton() {
  return (
    <div role="status" aria-label="Loading communities" className={DISCOVER_GRID}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex gap-3 rounded-2xl border border-border bg-surface p-2.5">
          <Skeleton className="size-20 shrink-0 rounded-xl" />
          <div className="flex flex-1 flex-col gap-2 py-1">
            <Skeleton className="h-4 w-2/3 rounded-sm" />
            <Skeleton className="h-3 w-1/2 rounded-sm" />
            <Skeleton className="h-3 w-full rounded-sm" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The page's loading state in its full-width shape (communities/loading.tsx): heading, tabs, rows of cards. */
export function CommunitiesSkeleton() {
  return (
    <div data-grid-page="" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <Skeleton shape="pill" className="h-3 w-24" />
        <Skeleton className="h-9 w-56 rounded-md" />
        <Skeleton shape="pill" className="h-3.5 w-72 max-w-full" />
      </div>
      <Skeleton shape="pill" className="h-9 w-64" />
      <YoursSkeleton />
    </div>
  );
}
