"use client";

import { useEffect, useRef } from "react";
import { meetDay, meetTime } from "@/components/press-meet/format";
import { useRealtimeEvent, useRealtimeReconnect } from "@/components/providers/realtime-provider";
import { PUSH_RECEIVED_EVENT } from "@/lib/native-push";
import { useViewer } from "@/components/providers/viewer-provider";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { AppNotification, NotificationType } from "@/lib/shared/contracts";

/*
 * The important notifications as popups (owner 2026-10-08: "not all — some, like press meets"): the moment one of
 * these arrives it shows as an alert card (bottom right) with a button to open it, as well as landing in the bell.
 * Everyday ones — new stories, likes, comments, followers, messages, someone joining a community — stay in the bell
 * only (the bell's own chime and count already announce them).
 */
const POPUP_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  "press_meet_invited",
  "press_meet_accepted",
  "press_meet_declined",
  "press_meet_reminder",
  "press_meet_live",
  "press_meet_cancelled",
  "press_meet_submitted",
  "press_meet_approved",
  "press_meet_changes",
  "press_meet_paid",
  "press_meet_received",
  "press_meet_public",
  "press_meet_public_live",
  "press_meet_joined",
  "story_returned",
  "story_hidden",
  "story_warned",
  "community_invite",
  "outlet_invite",
  "group_added",
  // Premium membership renewals (owner 2026-10-16).
  "membership_ending",
  "membership_ended",
]);
/** A burst (several at once) shows at most this many popups. */
const MAX_AT_ONCE = 3;
/** How long each stays (ms). */
const DURATION = 12_000;

const inr = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;
/** Dev only: the phone's console reaches the dev server's log, so this shows what happened there. */
const log = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") console.info("[notification-toasts]", ...args);
};

/** The popup's title, line and button for one notification; null = not one that pops up. */
function copyOf(item: AppNotification, username: string): { title: string; description?: string; href: string | null; cta: string } | null {
  if (!POPUP_TYPES.has(item.type)) return null;
  const who = item.actor?.name ?? "Someone";
  const meet = item.pressMeet;
  const meetHref = meet ? `/press-meet/${meet.id}` : null;
  const when = meet ? `${meetDay(meet.startsAt)} · ${meetTime(meet.startsAt)} IST` : undefined;
  const fee = item.amount !== null && item.amount > 0 ? inr(item.amount) : null;
  const chat = item.conversation;
  switch (item.type) {
    case "press_meet_invited":
      return { title: "Press meet invitation", description: `${who} has invited you to cover their press meet${when ? ` · ${when}` : ""}${fee ? ` · Your fee ${fee}` : ""}.`, href: meetHref, cta: "Respond" };
    case "press_meet_accepted":
      return { title: `${who} accepted your invitation`, description: when, href: meetHref, cta: "Open" };
    case "press_meet_declined":
      return { title: `${who} declined your invitation`, description: when, href: meetHref, cta: "Open" };
    case "press_meet_reminder":
      return {
        title: meet?.soon ? "Your press meet starts in 15 minutes" : "Press meet today",
        description: meet?.soon ? undefined : `At ${meet ? meetTime(meet.startsAt) : ""} IST${meet?.platform === "google_meet" ? " on Google Meet" : " on WebNEWS Live"}.`,
        href: meetHref,
        cta: "Open",
      };
    case "press_meet_live":
      return {
        title: "The press meet has started",
        description: `${who} is live now${meet?.platform === "google_meet" ? " on Google Meet" : " on WebNEWS Live"}.`,
        href: meet ? (meet.platform === "webnews" ? `/press-meet/${meet.id}/live` : meetHref) : null,
        cta: "Join now",
      };
    case "press_meet_cancelled":
      return { title: "Press meet cancelled", description: `${who} has cancelled the press meet${when ? ` · ${when}` : ""}.`, href: meetHref, cta: "Open" };
    case "press_meet_public":
      return { title: "New public press meet", description: `${who}: ${meet?.title ?? "a press meet"}${when ? ` · ${when}` : ""}.`, href: meetHref, cta: "See it" };
    case "press_meet_public_live":
      return { title: "A public press meet is live", description: `${who}: ${meet?.title ?? ""}`, href: meetHref, cta: "Join" };
    case "press_meet_joined":
      return { title: `${who} joined your press meet`, description: when, href: meetHref, cta: "Open" };
    case "press_meet_submitted":
      return { title: "Coverage to verify", description: `${who} has submitted their story of your press meet.`, href: meetHref, cta: "Read it" };
    case "press_meet_approved":
      return { title: "Your story is live", description: `${who} verified your press meet coverage.${fee ? ` Your fee of ${fee} follows shortly.` : ""}`, href: meetHref, cta: "Open" };
    case "press_meet_changes":
      return { title: "Changes requested", description: `${who} asked for changes to your press meet coverage.`, href: meetHref, cta: "Open" };
    case "press_meet_paid":
      return { title: "Your fee was released", description: `${who} has released your fee${fee ? ` of ${fee}` : ""}. Please confirm once you receive it.`, href: meetHref, cta: "Open" };
    case "press_meet_received":
      return { title: "Payment confirmed", description: `${who} confirmed receiving${fee ? ` ${fee}` : " the payment"}.`, href: meetHref, cta: "Open" };
    case "story_returned":
      return { title: "The Editor Desk returned your story", description: item.note ?? item.story?.title, href: item.story?.id ? `/publish/${item.story.id}` : `/${username}?tab=drafts`, cta: "Open" };
    case "story_hidden":
      return { title: "The Editor Desk hid your story", description: item.story?.title, href: `/${username}?tab=reported`, cta: "See why" };
    case "story_warned":
      return { title: "A warning from the Editor Desk", description: item.note ?? item.story?.title, href: `/${username}?tab=reported`, cta: "Open" };
    case "community_invite":
      return { title: "Community invitation", description: `${who} invited you to join ${chat?.name ?? "a community"}.`, href: chat ? `/communities/${chat.id}` : null, cta: "Open" };
    case "outlet_invite":
      return { title: "Team invitation", description: `${who} invited you to post for them${item.note ? ` as ${item.note === "editor" ? "an Editor" : "a Writer"}` : ""}.`, href: "/groups", cta: "View" };
    case "group_added":
      return { title: "Added to a group", description: `${who} added you to ${chat?.name ?? "a group chat"}.`, href: chat ? `/messages/${chat.id}` : null, cta: "Open" };
    case "membership_ending":
    case "membership_ended": {
      const href = item.actor ? `/membership/${item.actor.username}` : "/settings?section=my-memberships";
      const days = item.amount ?? 0;
      return item.type === "membership_ended"
        ? { title: "Your premium membership has ended", description: `Renew ${who}'s membership to keep reading their members-only stories.`, href, cta: "Renew now" }
        : { title: `Premium membership ends ${days <= 1 ? "tomorrow" : `in ${days} days`}`, description: `Renew ${who}'s membership so you don't lose access.`, href, cta: "Renew" };
    }
    default:
      return null;
  }
}

/**
 * Mounted once in the site shell. Keeps the time of the newest notification it has seen; when the server pings
 * (`notifications.changed`) it fetches the latest and pops up the new, unread, important ones. The app (owner
 * 2026-10-08: "not showing up in the app"): Android pauses the page in the background, so the ping is missed — the same
 * check runs when the live stream reconnects, when the app comes back to the front, and when a push arrives while it's
 * open; what came in meanwhile pops up then.
 */
export function NotificationToasts() {
  const viewer = useViewer();
  const username = viewer?.username ?? null;
  /** The newest notification already seen (ISO); null until the first fetch sets the baseline. */
  const newest = useRef<string | null>(null);
  const shown = useRef(new Set<string>());

  // The baseline: what's already there pops up nothing.
  useEffect(() => {
    if (!username) return;
    const controller = new AbortController();
    api
      .notifications(null, controller.signal, 1)
      .then((page) => {
        if (newest.current === null) newest.current = page.items[0]?.createdAt ?? new Date(0).toISOString();
        log("baseline", newest.current);
      })
      .catch((error: unknown) => log("baseline failed", error));
    return () => controller.abort();
  }, [username]);

  const check = (why: string) => {
    if (!username) return;
    void api
      .notifications(null, undefined, 10)
      .then((page) => {
        // No baseline yet (the first fetch failed or hasn't answered): this page is it, nothing pops up.
        if (newest.current === null) {
          newest.current = page.items[0]?.createdAt ?? new Date(0).toISOString();
          log("baseline (late)", newest.current);
          return;
        }
        const since = newest.current;
        const fresh = page.items.filter((item) => item.createdAt > since && !item.read && !shown.current.has(item.id));
        log(why, "since", since, "fresh", fresh.map((item) => item.type));
        if (page.items[0]) newest.current = page.items[0].createdAt > since ? page.items[0].createdAt : since;
        fresh
          .slice()
          .reverse()
          .map((item) => ({ item, copy: copyOf(item, username) }))
          .filter((entry): entry is { item: AppNotification; copy: NonNullable<ReturnType<typeof copyOf>> } => entry.copy !== null)
          .slice(-MAX_AT_ONCE)
          .forEach(({ item, copy }) => {
            shown.current.add(item.id);
            toast(copy.title, {
              id: `notification-${item.id}`,
              description: copy.description,
              duration: DURATION,
              action: copy.href ? { label: copy.cta, href: copy.href } : undefined,
            });
          });
      })
      .catch((error: unknown) => log("check failed", error));
  };

  useRealtimeEvent("notifications.changed", () => check("live ping"));
  useRealtimeReconnect(() => check("reconnected"));
  useEffect(() => {
    if (!username) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") check("back in front");
    };
    const onPush = () => check("push received");
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(PUSH_RECEIVED_EVENT, onPush);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(PUSH_RECEIVED_EVENT, onPush);
    };
    // `check` reads refs; it only changes with the account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  return null;
}
