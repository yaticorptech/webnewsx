"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Bell,
  CalendarClock,
  CalendarX2,
  Crown,
  EyeOff,
  FileText,
  Globe,
  Flag,
  Heart,
  IndianRupee,
  MessageCircle,
  MessageSquareWarning,
  Presentation,
  Radio,
  Send,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  Undo2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { UserHandle } from "@/components/brand/user-handle";
import { showPendingPage } from "@/components/layout/pending-page";
import { useRealtimeEvent } from "@/components/providers/realtime-provider";
import { playNotificationSound, primeNotificationSound } from "@/lib/notification-sound";
import { useViewer } from "@/components/providers/viewer-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SpeedLinesLoader } from "@/components/ui/speed-lines-loader";
import { TimeAgo } from "@/components/ui/time-ago";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { meetDay, meetTime } from "@/components/press-meet/format";
import { FLAG_REASON_LABELS, type AppNotification, type ReasonCount } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/**
 * The masthead bell (owner 2026-09-28): a publisher you follow posted; someone started following you; one of your
 * stories was reported (why, and the reader's note — never who); one of your stories was hidden after too many reports;
 * and (owner 2026-09-30) new messages (grouped per chat), being added to a group, community invitations (accept or
 * decline right here) and people joining your community. The red count comes with the
 * viewer and stays live: the server pings this viewer's own stream (`notifications.changed`), and any new story
 * refreshes it (it may be from someone they follow). Opening the panel marks everything read.
 */
export function NotificationBell({ className }: { className?: string }) {
  const router = useRouter();
  const viewer = useViewer();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const { data: unread = 0 } = useQuery({
    queryKey: qk.notificationsUnread,
    queryFn: async ({ signal }) => (await api.notifications(null, signal, 1)).unread,
    initialData: viewer?.unreadNotifications ?? 0,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    enabled: Boolean(viewer),
  });

  // Something new (owner 2026-10-01): the bell swings, the count pops and the chime plays — each time the count goes
  // up, not on load.
  const [seen, setSeen] = useState(unread);
  const [ring, setRing] = useState(0);
  if (unread !== seen) {
    setSeen(unread);
    if (unread > seen) setRing(ring + 1);
  }
  useEffect(() => primeNotificationSound(), []);
  useEffect(() => {
    if (ring > 0) playNotificationSound();
  }, [ring]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.notifications });
    void queryClient.invalidateQueries({ queryKey: qk.reportedStories });
    // A report also brings a warning banner (owner 2026-09-30).
    void queryClient.invalidateQueries({ queryKey: qk.notices });
  };
  useRealtimeEvent("notifications.changed", refresh);

  // Bursts of new stories collapse into one refresh.
  const publishedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtimeEvent("article.published", (card) => {
    if (!viewer || card.author.id === viewer.id) return;
    if (publishedTimer.current) clearTimeout(publishedTimer.current);
    publishedTimer.current = setTimeout(() => void queryClient.invalidateQueries({ queryKey: qk.notifications }), 1_500);
  });
  useEffect(() => () => {
    if (publishedTimer.current) clearTimeout(publishedTimer.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!viewer?.username) return null;
  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="Notifications"
        // Phones and tablets (owner 2026-10-08): the Notifications page; computers: the panel under the icon.
        onClick={() => {
          if (window.matchMedia("(max-width: 1023.98px)").matches) {
            showPendingPage("/notifications");
            router.push("/notifications");
            return;
          }
          setOpen((value) => !value);
        }}
        className={cn(
          "relative inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-tint-2 hover:text-brand after:absolute after:-inset-0.5 after:content-[''] max-sm:size-11",
          open ? "bg-tint-2 text-brand" : "text-ink",
        )}
      >
        <motion.span
          key={ring}
          aria-hidden
          className="inline-flex origin-[50%_10%]"
          initial={ring ? { rotate: 0 } : false}
          animate={ring ? { rotate: [0, 16, -12, 8, -4, 0] } : undefined}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <Bell className="size-5 max-sm:size-[1.375rem]" />
        </motion.span>
        {unread > 0 && (
          <motion.span
            key={`badge-${ring}`}
            aria-hidden
            initial={ring ? { scale: 0.4 } : false}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 600, damping: 14 }}
            className="absolute right-0.5 top-0.5 inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-brand px-1 text-[0.625rem] font-bold leading-none tabular-nums text-brand-contrast ring-2 ring-surface"
          >
            {unread > 9 ? "9+" : unread}
          </motion.span>
        )}
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Notifications"
          className={cn(
            "z-60 flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-pop",
            // Phones / tablets: under the sticky top bar across the screen; desktop: under the icon.
            "max-lg:fixed max-lg:right-4 max-lg:top-[calc(var(--bar-h)+var(--safe-top)+0.375rem)] max-lg:w-[min(24rem,calc(100vw-2rem))]",
            "lg:absolute lg:right-0 lg:top-full lg:mt-2 lg:w-96",
          )}
        >
          <NotificationsPanel username={viewer.username} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

function NotificationsPanel({ username, onNavigate }: { username: string; onNavigate: () => void }) {
  const queryClient = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: qk.notificationsList,
    queryFn: ({ pageParam, signal }) => api.notifications(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 0,
  });

  // Seen = read. The rows keep their unread dot while the panel stays open.
  const marked = useRef(false);
  const firstUnread = list.data?.pages[0]?.unread ?? 0;
  useEffect(() => {
    if (marked.current || firstUnread === 0) return;
    marked.current = true;
    api
      .readNotifications()
      .then(({ unread }) => queryClient.setQueryData(qk.notificationsUnread, unread))
      .catch(() => {
        marked.current = false;
      });
  }, [firstUnread, queryClient]);

  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="kicker text-brand">Notifications</p>
      </div>
      <div className="max-h-[min(30rem,65dvh)] overflow-y-auto overscroll-contain">
        {list.isPending ? (
          <div className="flex justify-center py-10">
            <SpeedLinesLoader size="sm" label="Loading notifications" />
          </div>
        ) : list.isError ? (
          <p className="px-4 py-8 text-center text-sm text-muted">Couldn&rsquo;t load your notifications. Try again in a moment.</p>
        ) : items.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="font-bold text-ink">Nothing new yet</p>
            <p className="mt-1 text-sm text-muted">New followers, messages, invitations and stories from publishers you follow show up here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <NotificationRow key={item.id} item={item} username={username} onNavigate={onNavigate} />
            ))}
          </ul>
        )}
        {list.hasNextPage && (
          <div className="flex justify-center border-t border-border p-3">
            <Button variant="ghost" size="sm" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
              Show older
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function reasonsLine(reasons: ReasonCount[] | null): string {
  return (reasons ?? []).map((r) => `${FLAG_REASON_LABELS[r.reason]} ×${r.count}`).join(", ");
}

/** An avatar with a small red badge (the kind of notification). */
function BadgedAvatar({ actor, badge }: { actor: AppNotification["actor"]; badge: ReactNode }) {
  return (
    <span className="relative block">
      <Avatar src={actor?.image} name={actor?.name ?? "WebNEWS"} size={40} decorative />
      <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-brand text-brand-contrast ring-2 ring-surface [&_svg]:size-2.75">
        {badge}
      </span>
    </span>
  );
}

const Name = ({ children }: { children: ReactNode }) => <strong className="font-bold text-ink">{children}</strong>;

/** Accept / Decline a community invitation right in the bell. */
function InviteActions({ inviteId, onNavigate }: { inviteId: string; onNavigate: () => void }) {
  const queryClient = useQueryClient();
  const respond = useMutation({
    mutationFn: (accept: boolean) => api.communities.respond(inviteId, accept),
    onSuccess: ({ status }) => {
      void queryClient.invalidateQueries({ queryKey: qk.notifications });
      void queryClient.invalidateQueries({ queryKey: qk.communitiesAll });
      void queryClient.invalidateQueries({ queryKey: qk.messagesAll });
      // No "You joined" popup (owner 2026-10-10).
      if (status === "accepted") onNavigate();
    },
    onError: (error) => toast.error("Couldn't answer the invitation", { description: errorMessage(error) }),
  });
  return (
    <span className="mt-2 flex gap-2">
      <Button size="sm" loading={respond.isPending && respond.variables === true} disabled={respond.isPending} onClick={() => respond.mutate(true)}>
        Accept
      </Button>
      <Button
        size="sm"
        variant="outline"
        loading={respond.isPending && respond.variables === false}
        disabled={respond.isPending}
        onClick={() => respond.mutate(false)}
      >
        Decline
      </Button>
    </span>
  );
}

/** What a notification shows: where it opens, its icon, the line, the small print and (invitations) its buttons. */
export type NotificationParts = { href: string | null; icon: ReactNode; text: ReactNode; detail: ReactNode; actions: ReactNode };

/** The bell's and the Notifications page's shared per-type copy (owner 2026-10-08: the page reuses it). */
export function notificationParts(item: AppNotification, username: string, onNavigate: () => void): NotificationParts {
  const reportedHref = `/${username}?tab=reported`;
  let icon: ReactNode;
  let text: ReactNode;
  let detail: ReactNode = null;
  let actions: ReactNode = null;
  let href: string | null;
  const chat = item.conversation;
  const actorName = item.actor?.name ?? "Someone";

  if (item.type.startsWith("press_meet_")) {
    ({ href, icon, text, detail } = pressMeetRow(item, actorName));
  } else if (item.type === "message") {
    href = chat ? `/messages/${chat.id}` : null;
    icon = <BadgedAvatar actor={item.actor} badge={<Send aria-hidden />} />;
    const count = item.count ?? 1;
    // Who and where only — never what the message says (owner 2026-09-30).
    if (chat && chat.kind !== "direct") {
      text =
        count > 1 ? (
          <>
            <Name>{formatNumber(count)} new messages</Name> in <Name>{chat.name || "your group"}</Name>
          </>
        ) : (
          <>
            <Name>{actorName}</Name> sent a message in <Name>{chat.name || "your group"}</Name>
          </>
        );
    } else if (chat?.request) {
      text = (
        <>
          <Name>{actorName}</Name> wants to send you a message
        </>
      );
    } else {
      text = (
        <>
          <Name>{actorName}</Name> sent you {count > 1 ? `${formatNumber(count)} messages` : "a message"}
        </>
      );
    }
  } else if (item.type === "group_added") {
    href = chat ? `/messages/${chat.id}` : null;
    icon = <BadgedAvatar actor={item.actor} badge={<UsersRound aria-hidden />} />;
    text = (
      <>
        <Name>{actorName}</Name> added you to {chat?.name ? <Name>{chat.name}</Name> : "a group chat"}
      </>
    );
    if (chat?.request) detail = <>They&rsquo;re not someone you follow — it&rsquo;s waiting in your message requests.</>;
  } else if (item.type === "community_invite") {
    href = chat ? `/communities/${chat.id}` : null;
    icon = <BadgedAvatar actor={item.actor} badge={<UserPlus aria-hidden />} />;
    text = (
      <>
        <Name>{actorName}</Name> invited you to join the community <Name>{chat?.name ?? "that was deleted"}</Name>
      </>
    );
    if (chat && item.invite?.status === "pending") {
      actions = <InviteActions inviteId={item.invite.id} onNavigate={onNavigate} />;
    } else if (item.invite) {
      detail = item.invite.status === "accepted" ? "You joined." : "You declined.";
    }
  } else if (item.type === "community_joined") {
    href = chat ? `/communities/${chat.id}` : null;
    icon = <BadgedAvatar actor={item.actor} badge={<UsersRound aria-hidden />} />;
    text = (
      <>
        <Name>{actorName}</Name> joined <Name>{chat?.name ?? "your community"}</Name>
      </>
    );
  } else if (item.type === "membership_ending" || item.type === "membership_ended") {
    // Renewal reminders (owner 2026-10-16): no auto-debit, so the member is told before and when it ends.
    href = item.actor ? `/membership/${item.actor.username}` : "/settings?section=my-memberships";
    icon = <BadgedAvatar actor={item.actor} badge={<Crown aria-hidden />} />;
    const days = item.amount ?? 0;
    text =
      item.type === "membership_ended" ? (
        <strong className="font-bold text-brand">
          Your premium membership of {actorName} has ended
        </strong>
      ) : (
        <>
          Your premium membership of <Name>{actorName}</Name> ends {days <= 1 ? "tomorrow" : `in ${days} days`}
        </>
      );
    detail = (
      <span className="font-semibold text-brand">
        {item.type === "membership_ended" ? "Renew now to keep reading their members-only stories." : "Renew now so you don't lose access."}
      </span>
    );
  } else if (item.type === "new_follower") {
    href = item.actor ? `/${item.actor.username}` : null;
    icon = <Avatar src={item.actor?.image} name={item.actor?.name ?? "Reader"} size={40} decorative />;
    text = (
      <>
        <strong className="font-bold text-ink">{item.actor?.name ?? "Someone"}</strong> started following you
      </>
    );
    detail = item.actor ? <UserHandle username={item.actor.username} className="text-brand" /> : null;
  } else if (item.type === "story_liked" || item.type === "story_commented") {
    const liked = item.type === "story_liked";
    href = item.story?.slug ? `/a/${item.story.slug}${liked ? "" : "#comments"}` : null;
    icon = (
      <span className="relative block">
        {item.actor ? (
          <Avatar src={item.actor.image} name={item.actor.name} size={40} decorative />
        ) : (
          <span className="flex size-10 items-center justify-center rounded-full bg-tint text-brand">
            <Heart aria-hidden className="size-4.5" />
          </span>
        )}
        {item.actor &&
          (liked ? (
            // A solid red heart with a thin white edge (owner 2026-10-09: "the like heart full red").
            <Heart aria-hidden className="absolute -bottom-1 -right-1 size-5.5! fill-brand text-surface drop-shadow-sm" strokeWidth={2.25} />
          ) : (
            <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-brand text-brand-contrast ring-2 ring-surface [&_svg]:size-2.75!">
              <MessageCircle aria-hidden className="fill-current" />
            </span>
          ))}
      </span>
    );
    text = <GroupText actorName={item.actor?.name ?? null} count={item.count ?? 1} verb={liked ? "liked your article" : "commented on your article"} />;
    if (!liked && item.note) detail = <span className="line-clamp-2 block italic text-ink-2">&ldquo;{item.note}&rdquo;</span>;
  } else if (item.type === "new_story") {
    href = item.story?.slug ? `/a/${item.story.slug}` : null;
    icon = <Avatar src={item.actor?.image} name={item.actor?.name ?? "Publisher"} size={40} decorative />;
    text = (
      <>
        <strong className="font-bold text-ink">{item.actor?.name ?? "A publisher you follow"}</strong> posted a new article
      </>
    );
  } else if (item.type === "story_returned") {
    // Opens the returned draft in the composer, where the Desk's note sits on top (owner 2026-10-01).
    href = item.story?.id ? `/publish/${item.story.id}` : null;
    icon = (
      <span className="flex size-10 items-center justify-center rounded-full bg-tint text-brand">
        <Undo2 aria-hidden className="size-4.5" />
      </span>
    );
    text = <>The Editor Desk returned your article</>;
    detail = (
      <>
        {item.note && <span className="line-clamp-3 block italic text-ink-2">&ldquo;{item.note}&rdquo;</span>}
        <span className="mt-0.5 block">Make the changes and send it for review again.</span>
      </>
    );
  } else if (item.type === "story_warned") {
    // The Desk's warning about a reported story (owner 2026-10-01); the same warning sits in the banner and Newsroom.
    href = reportedHref;
    icon = (
      <span className="flex size-10 items-center justify-center rounded-full bg-brand text-brand-contrast">
        <TriangleAlert aria-hidden className="size-4.5" />
      </span>
    );
    text = <strong className="font-bold text-brand">The Editor Desk warned you about your article</strong>;
    detail = (
      <>
        {item.note && <span className="line-clamp-3 block italic text-ink-2">&ldquo;{item.note}&rdquo;</span>}
        <span className="mt-0.5 block">Readers reported it. Please review it and follow the WebNEWS guidelines.</span>
      </>
    );
  } else if (item.type === "story_reported") {
    href = reportedHref;
    icon = (
      <span className="flex size-10 items-center justify-center rounded-full bg-tint text-brand">
        <Flag aria-hidden className="size-4.5" />
      </span>
    );
    text = <>A reader reported your article</>;
    detail = (
      <>
        <span className="block">
          Reason: <strong className="font-bold text-ink">{item.reason ? FLAG_REASON_LABELS[item.reason] : "Not given"}</strong>
        </span>
        {item.note && <span className="mt-0.5 line-clamp-2 block italic">&ldquo;{item.note}&rdquo;</span>}
      </>
    );
  } else {
    href = reportedHref;
    icon = (
      <span className="flex size-10 items-center justify-center rounded-full bg-brand text-brand-contrast">
        <EyeOff aria-hidden className="size-4.5" />
      </span>
    );
    text = <strong className="font-bold text-brand">Your article is hidden from everyone</strong>;
    detail = (
      <>
        <span className="block">
          Reported by {item.reports ?? "many"} readers: {reasonsLine(item.reasons)}.
        </span>
        <span className="block font-semibold text-ink-2">It can&rsquo;t be published again.</span>
      </>
    );
  }

  return { href, icon, text, detail, actions };
}

function NotificationRow({ item, username, onNavigate }: { item: AppNotification; username: string; onNavigate: () => void }) {
  const { href, icon, text, detail, actions } = notificationParts(item, username, onNavigate);
  const body = (
    <>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-snug text-ink-2">{text}</span>
        {item.story && (
          <span className="mt-1 line-clamp-2 block text-sm font-bold leading-snug text-ink">&ldquo;{item.story.title}&rdquo;</span>
        )}
        {item.pressMeet && (
          <span className="mt-1 line-clamp-2 block text-sm font-bold leading-snug text-ink">&ldquo;{item.pressMeet.title}&rdquo;</span>
        )}
        {detail && <span className="mt-1 block text-[0.8125rem] leading-snug text-muted">{detail}</span>}
        <span className="mt-1.5 block text-xs font-medium text-muted">
          <TimeAgo date={item.createdAt} />
        </span>
      </span>
      {!item.read && <span aria-label="Unread" className="mt-1.5 size-2.5 shrink-0 rounded-full bg-brand" />}
    </>
  );
  const rowClass = cn("flex items-start gap-3 px-4 py-3.5", !item.read && "bg-tint/60");

  if (actions) {
    // Buttons can't sit inside the row's link: the text links to the community, the buttons answer.
    return (
      <li className={cn("px-4 py-3.5", !item.read && "bg-tint/60")}>
        <div className="flex items-start gap-3">
          <span className="shrink-0">{icon}</span>
          <span className="min-w-0 flex-1">
            {href ? (
              <Link href={href} onClick={onNavigate} className="block text-sm leading-snug text-ink-2 hover:underline">
                {text}
              </Link>
            ) : (
              <span className="block text-sm leading-snug text-ink-2">{text}</span>
            )}
            {actions}
            <span className="mt-1.5 block text-xs font-medium text-muted">
              <TimeAgo date={item.createdAt} />
            </span>
          </span>
        </div>
      </li>
    );
  }

  return (
    <li>
      {href ? (
        <Link href={href} onClick={onNavigate} className={cn(rowClass, "transition-colors hover:bg-tint -outline-offset-2")}>
          {body}
        </Link>
      ) : (
        <div className={rowClass}>{body}</div>
      )}
    </li>
  );
}

/**
 * "Harikiran liked your article" · "Harikiran and 9 others liked your article" · "Someone liked your article" /
 * "10 people liked your article" (only logged-out visitors).
 */
function GroupText({ actorName, count, verb }: { actorName: string | null; count: number; verb: string }) {
  const others = count - 1;
  if (!actorName) return <>{count > 1 ? `${formatNumber(count)} people ${verb}` : `Someone ${verb}`}</>;
  return (
    <>
      <strong className="font-bold text-ink">{actorName}</strong>
      {others > 0 && (
        <>
          {" "}
          and <strong className="font-bold text-ink">{formatNumber(others)} {others === 1 ? "other" : "others"}</strong>
        </>
      )}{" "}
      {verb}
    </>
  );
}

const inr = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;

function MeetIcon({ actor, badge, solid = false }: { actor: AppNotification["actor"]; badge: ReactNode; solid?: boolean }) {
  if (actor) return <BadgedAvatar actor={actor} badge={badge} />;
  return (
    <span className={cn("flex size-10 items-center justify-center rounded-full [&_svg]:size-4.5", solid ? "bg-brand text-brand-contrast" : "bg-tint text-brand")}>
      {badge}
    </span>
  );
}

/**
 * Press meet notifications (owner 2026-10-01), worded the way a newsroom would put it. Every one opens the press
 * meet's page; "is live now" opens the room itself.
 */
function pressMeetRow(item: AppNotification, actorName: string): { href: string | null; icon: ReactNode; text: ReactNode; detail: ReactNode } {
  const meet = item.pressMeet;
  const href = meet ? `/press-meet/${meet.id}` : null;
  const when = meet ? `${meetDay(meet.startsAt)} · ${meetTime(meet.startsAt)} IST` : null;
  const name = <strong className="font-bold text-ink">{actorName}</strong>;
  // ₹0 is a public press meet's free seat: no fee to mention.
  const amount = item.amount !== null && item.amount > 0 ? inr(item.amount) : null;
  switch (item.type) {
    case "press_meet_invited":
      return {
        href,
        icon: <MeetIcon actor={item.actor} badge={<Presentation aria-hidden />} />,
        text: <>{name} has invited you to cover their press meet</>,
        detail: (
          <>
            {when}
            {amount && <> · Your fee {amount}</>}
            <span className="mt-0.5 block font-semibold text-brand">Please accept or decline the invitation.</span>
          </>
        ),
      };
    case "press_meet_accepted":
      return { href, icon: <MeetIcon actor={item.actor} badge={<ThumbsUp aria-hidden />} />, text: <>{name} has accepted your invitation to cover the press meet</>, detail: when };
    case "press_meet_declined":
      return { href, icon: <MeetIcon actor={item.actor} badge={<ThumbsDown aria-hidden />} />, text: <>{name} has declined your invitation to the press meet</>, detail: when };
    case "press_meet_reminder":
      return {
        href,
        icon: <MeetIcon actor={null} badge={<CalendarClock aria-hidden />} solid={meet?.soon} />,
        text: meet?.soon ? (
          <strong className="font-bold text-brand">Your press meet starts in 15 minutes</strong>
        ) : (
          <>Reminder: you have a press meet today at {meet ? meetTime(meet.startsAt) : ""} IST</>
        ),
        detail: meet?.platform === "google_meet" ? "On Google Meet — the link is on the press meet page." : "On WebNEWS Live.",
      };
    case "press_meet_live":
      return {
        href: meet ? (meet.platform === "webnews" ? `/press-meet/${meet.id}/live` : `/press-meet/${meet.id}`) : null,
        icon: <MeetIcon actor={item.actor} badge={<Radio aria-hidden />} />,
        text: (
          <>
            {name} has started the press meet. <strong className="font-bold text-brand">Join now</strong>
          </>
        ),
        detail: meet?.platform === "google_meet" ? "On Google Meet" : "On WebNEWS Live",
      };
    case "press_meet_cancelled":
      return { href, icon: <MeetIcon actor={item.actor} badge={<CalendarX2 aria-hidden />} />, text: <>{name} has cancelled the press meet</>, detail: when };
    // Public press meets (owner 2026-10-07): every reporter hears about one, and its organizer hears who joined.
    case "press_meet_public":
      return {
        href,
        icon: <MeetIcon actor={item.actor} badge={<Globe aria-hidden />} />,
        // Who, what and when — nothing more (owner 2026-10-07).
        text: <>{name} has scheduled a public press meet</>,
        detail: (
          <>
            {meet && <span className="line-clamp-2 block font-semibold text-ink-2">{meet.title}</span>}
            {when}
          </>
        ),
      };
    case "press_meet_public_live":
      return {
        href,
        icon: <MeetIcon actor={item.actor} badge={<Radio aria-hidden />} />,
        text: (
          <>
            {name}&rsquo;s public press meet is live now. <strong className="font-bold text-brand">Join</strong>
          </>
        ),
        detail: meet ? meet.title : null,
      };
    case "press_meet_joined":
      return { href, icon: <MeetIcon actor={item.actor} badge={<UserPlus aria-hidden />} />, text: <>{name} has joined your public press meet</>, detail: when };
    case "press_meet_submitted":
      return {
        href,
        icon: <MeetIcon actor={item.actor} badge={<FileText aria-hidden />} />,
        text: <>{name} has submitted their coverage of your press meet for verification</>,
        detail: "Read it and verify it — it goes live on WebNEWS once you do.",
      };
    case "press_meet_approved":
      return {
        href,
        icon: <MeetIcon actor={item.actor} badge={<BadgeCheck aria-hidden />} />,
        text: <>{name} has verified your story — it&rsquo;s live on WebNEWS</>,
        detail: amount ? `Your fee of ${amount} will be released to you shortly.` : null,
      };
    case "press_meet_changes":
      return {
        href,
        icon: <MeetIcon actor={item.actor} badge={<MessageSquareWarning aria-hidden />} />,
        text: <>{name} has requested changes to your press meet coverage</>,
        detail: (
          <>
            {item.note && <span className="line-clamp-3 block italic text-ink-2">&ldquo;{item.note}&rdquo;</span>}
            <span className="mt-0.5 block">Update your story and send it again.</span>
          </>
        ),
      };
    case "press_meet_paid":
      return {
        href,
        icon: <MeetIcon actor={item.actor} badge={<IndianRupee aria-hidden />} />,
        text: (
          <>
            {name} has released your fee{amount ? <> of <strong className="font-bold text-ink">{amount}</strong></> : null}
          </>
        ),
        detail: (
          <>
            {item.note && <span className="block">Reference: {item.note}</span>}
            <span className="block font-semibold text-brand">Please confirm once you receive it.</span>
          </>
        ),
      };
    default:
      return {
        href,
        icon: <MeetIcon actor={item.actor} badge={<IndianRupee aria-hidden />} />,
        text: (
          <>
            {name} has confirmed receiving{amount ? <> {amount}</> : " the payment"} for the press meet
          </>
        ),
        detail: null,
      };
  }
}
