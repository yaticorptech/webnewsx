import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { env } from "../env.js";
import { sendPush, type PushMessage } from "../lib/push.js";
import { FLAG_REASON_LABELS, type FlagReason, type NotificationType, type PressMeetPlatform } from "../shared/contracts.js";
import { meetWhen } from "./press-meets.js";

/*
 * Phone push notifications (owner 2026-10-02): the bell's rows are the queue. Every new or bumped notification starts
 * with `pushed_at` null; the worker (lib/push-worker.ts) claims them and sends every one (owner 2026-10-02: everything
 * the bell shows, worded like the bell) to every phone the recipient is logged in on, unless they turned push off in
 * Settings. Grouped rows (likes, comments, messages) are pushed again when they grow, the newer push replacing the older.
 */

/** The app on this phone, for this account (moves the token over when someone else logs in on the phone). */
export async function registerPushDevice(userId: string, token: string, platform: "android" | "ios"): Promise<void> {
  await db.execute(sql`
    insert into push_device (token, user_id, platform) values (${token}, ${userId}, ${platform})
    on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now()
  `);
}

/** Logging out on that phone: it stops getting this account's pushes. */
export async function removePushDevice(userId: string, token: string): Promise<void> {
  await db.execute(sql`delete from push_device where token = ${token} and user_id = ${userId}`);
}

/** Settings → Notifications. */
export async function setPushNotifications(userId: string, enabled: boolean): Promise<boolean> {
  await db.execute(sql`update "user" set push_notifications = ${enabled} where id = ${userId}`);
  return enabled;
}

export type QueuedRow = {
  id: string;
  user_id: string;
  type: NotificationType;
  note: string | null;
  article_id: string | null;
  article_title: string | null;
  reason: FlagReason | null;
  reports: number | null;
  amount: number | null;
  conversation_id: string | null;
  press_meet_id: string | null;
  recipient_username: string | null;
  actor_name: string | null;
  actor_username: string | null;
  actor_image: string | null;
  slug: string | null;
  cover_url: string | null;
  conv_name: string | null;
  conv_kind: string | null;
  conv_request: boolean | null;
  meet_title: string | null;
  meet_starts_at: string | null;
  meet_platform: PressMeetPlatform | null;
  group_count: number | null;
  tokens: string[];
  /** The recipient has push on and the notification is still fresh. */
  wanted: boolean;
};

const BATCH = 200;
/** Older than this when the worker gets to it (e.g. pushes were off, or the server was down): not worth a buzz. */
const STALE = "1 hour";

/**
 * Claims the waiting rows (safe with several API instances: `skip locked`) and sends them. Returns how many were
 * claimed, so the worker can go again straight away while there's a backlog.
 */
export async function drainPushQueue(): Promise<number> {
  if (!env.pushEnabled) {
    // Nothing can be sent: just mark them, so the queue stays small.
    const rows = await db.execute(sql`
      update notification set pushed_at = now()
      where id in (select id from notification where pushed_at is null order by created_at limit ${BATCH} for update skip locked)
      returning id
    `);
    return [...rows].length;
  }

  const rows = [
    ...(await db.execute<QueuedRow & { claimed: number }>(sql`
      with claimed as (
        update notification n set pushed_at = now()
        where n.id in (select id from notification where pushed_at is null order by created_at limit ${BATCH} for update skip locked)
        returning n.*
      ), counted as (select count(*)::int as claimed from claimed)
      select c.id, c.user_id, c.type, c.note, c.article_id, c.article_title, c.reason, c.reports, c.amount,
        c.conversation_id, c.press_meet_id,
        recipient.username as recipient_username, actor.name as actor_name, actor.username as actor_username, actor.image as actor_image,
        a.slug, a.cover_url, conv.name as conv_name, conv.kind as conv_kind, (cm.status = 'request') as conv_request,
        pm.title as meet_title, pm.starts_at as meet_starts_at, pm.platform as meet_platform,
        case
          when c.type = 'story_liked' then
            (select count(*) from article_like l where l.article_id = c.article_id and l.created_at >= c.batch_start and l.user_id <> c.user_id)
            + (select count(*) from article_anon_like v where v.article_id = c.article_id and v.created_at >= c.batch_start)
          when c.type = 'story_commented' then
            (select count(*) from article_comment m where m.article_id = c.article_id and m.created_at >= c.batch_start and m.author_id <> c.user_id)
          when c.type = 'message' then
            (select count(*) from message m where m.conversation_id = c.conversation_id and m.created_at >= c.batch_start
              and m.kind <> 'system' and m.sender_id is distinct from c.user_id)
        end::int as group_count,
        array(select d.token from push_device d where d.user_id = c.user_id) as tokens,
        coalesce(recipient.push_notifications and c.created_at > now() - ${STALE}::interval, false) as wanted,
        counted.claimed
      from counted
      left join claimed c on true
      left join "user" recipient on recipient.id = c.user_id
      left join "user" actor on actor.id = c.actor_id
      left join article a on a.id = c.article_id
      left join conversation conv on conv.id = c.conversation_id
      left join conversation_member cm on cm.conversation_id = c.conversation_id and cm.user_id = c.user_id
      left join press_meet pm on pm.id = c.press_meet_id
    `)),
  ];
  const claimed = rows[0]?.claimed ?? 0;

  const dead: string[] = [];
  for (const row of rows) {
    if (!row.id || !row.wanted || row.tokens.length === 0) continue;
    const plain = toMessage(row);
    if (!plain) continue;
    const message = instagramStyle(plain, row);
    try {
      dead.push(...(await sendPush(row.tokens, message)));
    } catch (error) {
      console.warn("[push] send failed:", error instanceof Error ? error.message : error);
    }
  }
  if (dead.length > 0) {
    await db.execute(sql`delete from push_device where token in (${sql.join(
      dead.map((token) => sql`${token}`),
      sql`, `,
    )})`);
  }
  return claimed;
}

/** The phone push a bell row becomes (exported for tests: tests/api/membership-eligibility.test.ts). */
export function phonePushFor(row: QueuedRow): PushMessage | null {
  const plain = toMessage(row);
  return plain ? instagramStyle(plain, row) : null;
}

/** One action button per kind of notification (owner 2026-10-16, Instagram-style pushes). */
const ACTIONS: Partial<Record<NotificationType, string>> = {
  new_story: "Read now",
  story_liked: "View",
  story_commented: "Reply",
  new_follower: "View profile",
  message: "Reply",
  group_added: "Open chat",
  community_invite: "View invite",
  community_joined: "View",
  story_returned: "Edit story",
  membership_ending: "Renew",
  membership_ended: "Renew",
};

/**
 * Instagram-style pushes (owner 2026-10-16): the person's photo beside every push, the story's photo on story pushes
 * (expands like a post), chats stacked as a conversation, and one action button. Drawn by the app on Android.
 */
function instagramStyle(message: PushMessage, row: QueuedRow): PushMessage {
  const storyPush = row.type === "new_story" || row.type === "story_liked" || row.type === "story_commented";
  const chat = row.type === "message";
  const press = row.type.startsWith("press_meet_");
  const actionLabel = ACTIONS[row.type] ?? (press ? "Open" : null);
  return {
    ...message,
    avatarUrl: httpsOnly(row.actor_image),
    sender: row.actor_name,
    imageUrl: message.imageUrl ?? (storyPush ? httpsOnly(row.cover_url) : null),
    style: chat ? "message" : storyPush && row.cover_url ? "picture" : "text",
    thread: chat ? row.conversation_id : null,
    action: actionLabel ? { label: actionLabel, url: message.url } : null,
  };
}

/** Story covers are shown in the notification only when the phone can fetch them (an https address). */
const httpsOnly = (url: string | null) => (url && url.startsWith("https://") ? url : null);
const quoted = (text: string | null) => (text ? `“${text}”` : null);
// ₹0 is a public press meet's free seat (owner 2026-10-07): no fee to mention.
const inr = (amount: number | null) => (amount === null || amount <= 0 ? null : `₹${amount.toLocaleString("en-IN")}`);
const joined = (...parts: Array<string | null | undefined | false>) => parts.filter(Boolean).join(" · ");

/** The bell's line for one notification (frontend components/notifications/notification-bell.tsx), as a push. */
function toMessage(row: QueuedRow): PushMessage | null {
  const who = row.actor_name ?? "Someone";
  const story = row.article_title ?? "your article";
  const storyUrl = row.slug ? `/a/${row.slug}` : "/";
  const reportedUrl = row.recipient_username ? `/${row.recipient_username}?tab=reported` : "/";
  const tag = `${row.type}-${row.id}`;
  const count = row.group_count ?? 1;
  const crowd = count > 1 ? `${who} and ${count - 1} ${count === 2 ? "other" : "others"}` : who;

  if (row.type.startsWith("press_meet_")) return meetMessage(row, who, tag);
  switch (row.type) {
    case "new_story":
      return { title: `${who} posted a new article`, body: story, url: storyUrl, tag, imageUrl: httpsOnly(row.cover_url) };
    case "new_follower":
      return {
        title: `${who} started following you`,
        body: row.actor_username ? `@${row.actor_username}` : "You have a new follower",
        url: row.actor_username ? `/${row.actor_username}` : "/",
        tag,
      };
    case "story_liked":
      if (count === 0) return null; // every like in the group was taken back
      return { title: `${crowd} liked your article`, body: story, url: storyUrl, tag };
    case "story_commented":
      if (count === 0) return null;
      return { title: `${crowd} commented on your article`, body: joined(quoted(row.note), story), url: row.slug ? `${storyUrl}#comments` : storyUrl, tag };
    case "story_reported":
      return {
        title: "A reader reported your article",
        body: joined(`Reason: ${row.reason ? FLAG_REASON_LABELS[row.reason] : "Not given"}`, story),
        url: reportedUrl,
        tag,
      };
    case "story_hidden":
      return { title: "Your article is hidden from everyone", body: joined(`Reported by ${row.reports ?? "many"} readers`, story), url: reportedUrl, tag };
    case "story_returned":
      return {
        title: "The Editor Desk returned your article",
        body: joined(quoted(row.note), "Make the changes and send it for review again."),
        url: row.article_id ? `/publish/${row.article_id}` : "/",
        tag,
      };
    case "story_warned":
      return { title: "The Editor Desk warned you about your article", body: joined(quoted(row.note), story), url: reportedUrl, tag };
    case "message": {
      if (count === 0) return null; // every message in the group was unsent
      const url = row.conversation_id ? `/messages/${row.conversation_id}` : "/messages";
      // Who and where only — never what the message says (owner 2026-09-30).
      if (row.conv_kind && row.conv_kind !== "direct") {
        const group = row.conv_name || "your group";
        return { title: count > 1 ? `${count} new messages in ${group}` : `${who} sent a message in ${group}`, body: "Open WebNEWS to read it", url, tag };
      }
      if (row.conv_request) return { title: `${who} wants to send you a message`, body: "It's in your message requests", url, tag };
      return { title: `${who} sent you ${count > 1 ? `${count} messages` : "a message"}`, body: "Open WebNEWS to read it", url, tag };
    }
    case "group_added":
      return {
        title: `${who} added you to ${row.conv_name || "a group chat"}`,
        body: row.conv_request ? "They're not someone you follow — it's waiting in your message requests." : "Say hello in the chat",
        url: row.conversation_id ? `/messages/${row.conversation_id}` : "/messages",
        tag,
      };
    case "community_invite":
      return {
        title: `${who} invited you to join the community ${row.conv_name ?? ""}`.trim(),
        body: "Accept or decline the invitation",
        url: row.conversation_id ? `/communities/${row.conversation_id}` : "/communities",
        tag,
      };
    case "membership_ending":
    case "membership_ended": {
      const url = row.actor_username ? `/membership/${row.actor_username}` : "/settings?section=my-memberships";
      const days = row.amount ?? 0;
      return row.type === "membership_ended"
        ? { title: `Your premium membership of ${who} has ended`, body: "Renew now to keep reading their members-only stories.", url, tag }
        : {
            title: `Your premium membership of ${who} ends ${days <= 1 ? "tomorrow" : `in ${days} days`}`,
            body: "Renew now so you don't lose access to their members-only stories.",
            url,
            tag,
          };
    }
    case "community_joined":
      return {
        title: `${who} joined ${row.conv_name ?? "your community"}`,
        body: "Your community is growing",
        url: row.conversation_id ? `/communities/${row.conversation_id}` : "/communities",
        tag,
      };
    default:
      return null;
  }
}

function meetMessage(row: QueuedRow, who: string, tag: string): PushMessage | null {
  const id = row.press_meet_id;
  const url = id ? `/press-meet/${id}` : "/press-meet";
  const when = row.meet_starts_at ? meetWhen(row.meet_starts_at) : null;
  const title = row.meet_title;
  const amount = inr(row.amount);
  const where = row.meet_platform === "google_meet" ? "On Google Meet" : "On WebNEWS Live";
  switch (row.type) {
    case "press_meet_invited":
      return { title: `${who} has invited you to cover their press meet`, body: joined(title, when, amount && `Your fee ${amount}`), url, tag };
    case "press_meet_accepted":
      return { title: `${who} has accepted your invitation to cover the press meet`, body: joined(title, when), url, tag };
    case "press_meet_declined":
      return { title: `${who} has declined your invitation to the press meet`, body: joined(title, when), url, tag };
    case "press_meet_reminder":
      return {
        title: row.note === "soon" ? "Your press meet starts in 15 minutes" : "Reminder: you have a press meet today",
        body: joined(title, when, where),
        url,
        tag,
      };
    case "press_meet_live":
      return {
        title: `${who} has started the press meet. Join now`,
        body: joined(title, where),
        url: id && row.meet_platform === "webnews" ? `/press-meet/${id}/live` : url,
        tag,
      };
    case "press_meet_cancelled":
      return { title: `${who} has cancelled the press meet`, body: joined(title, when), url, tag };
    case "press_meet_submitted":
      return { title: `${who} has submitted their coverage of your press meet for verification`, body: joined(title, "Read it and verify it — it goes live on WebNEWS once you do."), url, tag };
    case "press_meet_approved":
      return { title: `${who} has verified your story — it's live on WebNEWS`, body: joined(title, amount && `Your fee of ${amount} will be released to you shortly.`), url, tag };
    case "press_meet_changes":
      return { title: `${who} has requested changes to your press meet coverage`, body: joined(quoted(row.note), "Update your story and send it again."), url, tag };
    case "press_meet_paid":
      return { title: `${who} has released your fee${amount ? ` of ${amount}` : ""}`, body: joined(row.note && `Reference: ${row.note}`, "Please confirm once you receive it."), url, tag };
    case "press_meet_public":
      return { title: `${who} has scheduled a public press meet`, body: joined(title, when), url, tag };
    case "press_meet_public_live":
      return { title: `${who}'s public press meet is live now. Join`, body: joined(title, where), url, tag };
    case "press_meet_joined":
      return { title: `${who} has joined your public press meet`, body: joined(title, when), url, tag };
    case "press_meet_received":
      return { title: `${who} has confirmed receiving${amount ? ` ${amount}` : " the payment"} for the press meet`, body: joined(title), url, tag };
    default:
      return null;
  }
}
