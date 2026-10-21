import { and, eq, sql, type SQL } from "drizzle-orm";
import { db, type Executor, type Transaction } from "../db/client.js";
import { article, notification, pressMeet, pressMeetInvite } from "../db/schema.js";
import { env } from "../env.js";
import { ApiError, forbidden, notFound } from "../lib/errors.js";
import { EVENTS_CHANNEL, publishEvent } from "../lib/events.js";
import { pressMeetMail, sendMail, type Mail } from "../lib/mail.js";
import { isLinkCollision, makeShortCode, makeSlug } from "../lib/slug.js";
import { notifyFollowers } from "./notifications.js";
import { attachBookingItems, bookingExtras } from "./press-meet-booking.js";
import { BADGE_LEVEL_U } from "./shared.js";
import { enqueueSocialPosts } from "./social-accounts.js";
import {
  DEFAULT_POSTER_TEMPLATE,
  PRESS_MEET,
  istDateKey,
  istInstant,
  istMinutes,
  type ArticlePressMeet,
  type AuthorSummary,
  type Category,
  type NotificationType,
  type PressMeetDetail,
  type PressMeetDuration,
  type PressMeetInvite,
  type PressMeetListResponse,
  type PressMeetNotes,
  type PressMeetMonthResponse,
  type PressMeetPlatform,
  type PressMeetRecording,
  type PressMeetReporter,
  type PressMeetReportersResponse,
  type PressMeetSlot,
  type PressMeetSlotsResponse,
  type PressMeetStatus,
  type PressMeetStoryPreview,
  type PressMeetSummary,
  type PressMeetVisibility,
  type PosterTemplate,
  type ReporterLevel,
  type createPressMeetSchema,
} from "../shared/contracts.js";
import type { Viewer } from "../types.js";
import type { z } from "zod";

/*
 * Press meets (owner 2026-10-01) — see the contracts' "Press meets" section for the whole flow. Every change pings the
 * organizer's and the invited reporters' open tabs (`meet.changed`) and, where someone has to act, their bell.
 */

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const iso = (value: string | Date | null | undefined): string | null => (value ? new Date(value).toISOString() : null);
const isoOf = (value: string | Date): string => new Date(value).toISOString();
const inList = (ids: readonly string[]): SQL => sql.join(ids.map((id) => sql`${id}`), sql`, `);

/* ─────────────── Time & slots (IST) ─────────────── */

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: PRESS_MEET.timeZone,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const TIME_FORMAT = new Intl.DateTimeFormat("en-IN", { timeZone: PRESS_MEET.timeZone, hour: "numeric", minute: "2-digit", hour12: true });

/** "Sat, 4 Oct 2026 · 3:00 PM IST" (emails). */
export function meetWhen(input: Date | string): string {
  const date = new Date(input);
  return `${DATE_FORMAT.format(date)} · ${TIME_FORMAT.format(date).toUpperCase()} IST`;
}

/** The last day the calendar opens (IST). */
export function lastBookableDate(now: Date): string {
  return istDateKey(now.getTime() + PRESS_MEET.bookAheadDays * DAY);
}

/** Why a start time can't be booked (null = fine; overlapping press meets are checked by the database). */
export function slotProblem(startsAt: Date, duration: number, now: Date): string | null {
  const time = startsAt.getTime();
  if (Number.isNaN(time)) return "Choose a time slot";
  // IST is UTC+5:30, so its half hours are also UTC half hours.
  if (time % (PRESS_MEET.slotStepMinutes * MINUTE) !== 0) return "Choose one of the listed time slots";
  const minutes = istMinutes(startsAt);
  if (minutes < PRESS_MEET.dayStartMinutes || minutes + duration > PRESS_MEET.dayEndMinutes) {
    return "Press meets run between 9 AM and 9 PM IST";
  }
  if (time < now.getTime() + PRESS_MEET.leadMinutes * MINUTE) return "That time has already started — choose a later slot";
  if (istDateKey(startsAt) > lastBookableDate(now)) return `You can book up to ${PRESS_MEET.bookAheadDays} days ahead`;
  return null;
}

type Range = { start: number; end: number };

/** The organizer's own press meets (not cancelled) overlapping [from, to) — other organizers' don't block a time. */
async function bookedRanges(organizerId: string, from: Date, to: Date): Promise<Range[]> {
  const rows = await db.execute<{ starts_at: string; ends_at: string }>(sql`
    select starts_at, ends_at from press_meet
    where organizer_id = ${organizerId} and status <> 'cancelled' and starts_at < ${to.toISOString()} and ends_at > ${from.toISOString()}
  `);
  return [...rows].map((row) => ({ start: Date.parse(isoOf(row.starts_at)), end: Date.parse(isoOf(row.ends_at)) }));
}

function buildSlots(dateKey: string, duration: PressMeetDuration, booked: Range[], now: Date): PressMeetSlot[] {
  const earliest = now.getTime() + PRESS_MEET.leadMinutes * MINUTE;
  const beyond = dateKey > lastBookableDate(now);
  const slots: PressMeetSlot[] = [];
  for (let minutes = PRESS_MEET.dayStartMinutes; minutes + duration <= PRESS_MEET.dayEndMinutes; minutes += PRESS_MEET.slotStepMinutes) {
    const start = istInstant(dateKey, minutes).getTime();
    const end = start + duration * MINUTE;
    const taken = booked.some((range) => range.start < end && range.end > start);
    const past = start < earliest || beyond;
    slots.push({
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      available: !taken && !past,
      reason: past ? "past" : taken ? "booked" : null,
    });
  }
  return slots;
}

/** Every start time of one day (IST) for a length, free or not (for this organizer). */
export async function daySlots(organizerId: string, dateKey: string, duration: PressMeetDuration, now = new Date()): Promise<PressMeetSlotsResponse> {
  const booked = await bookedRanges(organizerId, istInstant(dateKey, 0), istInstant(dateKey, 24 * 60));
  return { date: dateKey, duration, slots: buildSlots(dateKey, duration, booked, now) };
}

/** How many start times are free on each day of a month ("2026-10") for this organizer. */
export async function monthAvailability(
  organizerId: string,
  month: string,
  duration: PressMeetDuration,
  now = new Date(),
): Promise<PressMeetMonthResponse> {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const keys = Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const firstDate = istDateKey(now);
  const lastDate = lastBookableDate(now);
  const booked = await bookedRanges(organizerId, istInstant(`${month}-01`, 0), istInstant(`${month}-${String(daysInMonth).padStart(2, "0")}`, 24 * 60));
  return {
    month,
    duration,
    firstDate,
    lastDate,
    days: keys.map((date) => ({
      date,
      open: date < firstDate || date > lastDate ? 0 : buildSlots(date, duration, booked, now).filter((slot) => slot.available).length,
    })),
  };
}

/* ─────────────── Reporters to invite ─────────────── */

const REPORTERS_PAGE = 24;

/**
 * Verified reporters (not the viewer), priced ones first, then by followers. Offset cursor. `state` + `district` +
 * `city` = the event's location (owner 2026-10-05: "select location → reporters there are listed"): their Press Pass
 * region; the city is a place picked from the suggestions, matched whole (case-insensitive); the district matches when it
 * contains the text (typed outside Karnataka).
 */
export async function listInvitableReporters(
  viewerId: string,
  {
    q,
    language,
    state,
    district,
    city,
    cursor,
  }: { q?: string; language?: string; state?: string; district?: string; city?: string; cursor?: string },
): Promise<PressMeetReportersResponse> {
  const offset = Math.max(0, Number.parseInt(cursor ?? "0", 10) || 0);
  const contains = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const term = q?.trim().replace(/^@/, "").slice(0, 60);
  const like = term ? contains(term) : null;
  const place = district?.trim().slice(0, 60);
  const inDistrict = place ? contains(place) : null;
  const inCity = city?.trim().slice(0, 60) || null;
  const rows = await db.execute<{
    id: string;
    username: string;
    name: string;
    image: string | null;
    price: number | null;
    state: string | null;
    district: string | null;
    city: string | null;
    languages: string[];
    outlet: string | null;
    reporter_type: string | null;
    experience: string | null;
    followers: number;
    articles: number;
  }>(sql`
    select u.id, u.username, u.name, u.image, u.press_meet_price as price,
      p.state, p.district, p.city, p.languages, p.outlet, p.reporter_type, p.experience,
      (select count(*) from follow f where f.following_id = u.id)::int as followers,
      (select count(*) from article a where a.author_id = u.id and a.status = 'published' and a.hidden_at is null)::int as articles
    from "user" u
    join press_pass p on p.user_id = u.id and p.revoked_at is null
    where u.role = 'reporter' and u.reporter_level = 'verified' and u.suspended_at is null
      and u.onboarded_at is not null and u.username is not null and u.id <> ${viewerId}
      ${like ? sql`and (u.name ilike ${like} or u.username ilike ${like} or p.district ilike ${like} or p.city ilike ${like} or p.outlet ilike ${like})` : sql``}
      ${language ? sql`and ${language} = any(p.languages)` : sql``}
      ${state ? sql`and p.state = ${state}` : sql``}
      ${inDistrict ? sql`and p.district ilike ${inDistrict}` : sql``}
      ${inCity ? sql`and lower(p.city) = lower(${inCity})` : sql``}
    order by (u.press_meet_price is null), followers desc, u.name, u.id
    limit ${REPORTERS_PAGE + 1} offset ${offset}
  `);
  const list = [...rows];
  const items: PressMeetReporter[] = list.slice(0, REPORTERS_PAGE).map((row) => ({
    id: row.id,
    username: row.username,
    name: row.name,
    image: row.image,
    state: row.state,
    district: row.district,
    city: row.city,
    languages: row.languages as PressMeetReporter["languages"],
    outlet: row.outlet,
    reporterType: row.reporter_type as PressMeetReporter["reporterType"],
    experience: row.experience as PressMeetReporter["experience"],
    followers: row.followers,
    articles: row.articles,
    price: row.price,
  }));
  return { items, nextCursor: list.length > REPORTERS_PAGE ? String(offset + REPORTERS_PAGE) : null };
}

/* ─────────────── Pings, notifications, emails ─────────────── */

/** Pings the open tabs of the organizer and every invited reporter: the press meet changed. */
export async function pingMeet(executor: Executor, meetId: string): Promise<void> {
  await executor.execute(sql`
    select pg_notify(${EVENTS_CHANNEL}, json_build_object('t', 'meetc', 'id', u.id, 'm', ${meetId}::text)::text)
    from (
      select organizer_id as id from press_meet where id = ${meetId}
      union select reporter_id from press_meet_invite where press_meet_id = ${meetId}
    ) u
  `);
}

type MeetNotice = { userId: string; type: NotificationType; actorId?: string | null; note?: string | null; amount?: number | null };

/** Bell rows for one press meet (+ pings each recipient's bell). */
export async function notifyMeet(executor: Executor, meetId: string, notices: MeetNotice[]): Promise<void> {
  if (notices.length === 0) return;
  await executor.insert(notification).values(
    notices.map((n) => ({
      userId: n.userId,
      type: n.type,
      actorId: n.actorId ?? null,
      pressMeetId: meetId,
      note: n.note ?? null,
      amount: n.amount ?? null,
    })),
  );
  for (const userId of new Set(notices.map((n) => n.userId))) await publishEvent(executor, { t: "notify", id: userId });
}

/**
 * Public press meets (owner 2026-10-07): a bell row (and so a phone alert) for every reporter who can join — active
 * reporters with a Press Pass, not suspended — except the organizer and, with `skipSeated`, those already in it.
 */
async function notifyAllReporters(
  executor: Executor,
  meetId: string,
  organizerId: string,
  type: "press_meet_public" | "press_meet_public_live",
  skipSeated: boolean,
): Promise<void> {
  const rows = await executor.execute<{ user_id: string }>(sql`
    insert into notification (user_id, type, actor_id, press_meet_id)
    select u.id, ${type}, ${organizerId}, ${meetId}
    from "user" u
    join press_pass p on p.user_id = u.id and p.revoked_at is null
    where u.role = 'reporter' and u.suspended_at is null and u.id <> ${organizerId}
      ${
        skipSeated
          ? sql`and not exists (
              select 1 from press_meet_invite i where i.press_meet_id = ${meetId} and i.reporter_id = u.id and i.status <> 'declined'
            )`
          : sql``
      }
    returning user_id
  `);
  for (const row of rows) await publishEvent(executor, { t: "notify", id: row.user_id });
}

const meetLink = (id: string) => `${env.FRONTEND_URL.replace(/\/+$/, "")}/press-meet/${id}`;

/** Emails each user (best-effort, after the change committed). */
export function emailUsers(userIds: string[], build: (person: { email: string; name: string }) => Mail): void {
  if (userIds.length === 0) return;
  void (async () => {
    const people = await db.execute<{ email: string; name: string }>(sql`select email, name from "user" where id in (${inList(userIds)})`);
    for (const person of people) {
      try {
        await sendMail(build(person));
      } catch (error) {
        console.warn("[press-meet] email failed:", error instanceof Error ? error.message : error);
      }
    }
  })().catch((error: unknown) => console.warn("[press-meet] email lookup failed:", error instanceof Error ? error.message : error));
}

/* ─────────────── Reading ─────────────── */

type MeetRow = {
  id: string;
  title: string;
  agenda: string | null;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  platform: PressMeetPlatform;
  visibility: PressMeetVisibility;
  meet_url: string | null;
  status: PressMeetStatus;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  organizer_id: string;
  recording_consent_at: string | null;
  o_username: string;
  o_name: string;
  o_image: string | null;
  total: number;
  invited: number;
  accepted: number;
  declined: number;
  amount: number;
};

const MEET_SELECT = sql`
  select m.id, m.title, m.agenda, m.starts_at, m.ends_at, m.duration_minutes, m.platform, m.visibility, m.meet_url, m.status,
    m.started_at, m.ended_at, m.created_at, m.organizer_id, m.recording_consent_at,
    o.username as o_username, o.name as o_name, o.image as o_image,
    c.total, c.invited, c.accepted, c.declined, c.amount
  from press_meet m
  join "user" o on o.id = m.organizer_id
  cross join lateral (
    select count(*)::int as total,
      (count(*) filter (where i.status = 'invited'))::int as invited,
      (count(*) filter (where i.status = 'accepted'))::int as accepted,
      (count(*) filter (where i.status = 'declined'))::int as declined,
      coalesce(sum(i.price) filter (where i.status <> 'declined'), 0)::int as amount
    from press_meet_invite i where i.press_meet_id = m.id
  ) c
`;

type InviteRow = {
  id: string;
  press_meet_id: string;
  reporter_id: string;
  price: number;
  status: PressMeetInvite["status"];
  responded_at: string | null;
  joined_at: string | null;
  article_id: string | null;
  article_title: string | null;
  submitted_at: string | null;
  review: PressMeetInvite["review"];
  review_note: string | null;
  reviewed_at: string | null;
  payment: PressMeetInvite["payment"];
  payment_ref: string | null;
  released_at: string | null;
  received_at: string | null;
  r_username: string;
  r_name: string;
  r_image: string | null;
  a_slug: string | null;
  a_title: string | null;
  a_status: string | null;
  a_hidden: string | null;
  a_cover: string | null;
};

async function loadInvites(meetIds: string[], reporterId?: string): Promise<InviteRow[]> {
  if (meetIds.length === 0) return [];
  const rows = await db.execute<InviteRow>(sql`
    select i.id, i.press_meet_id, i.reporter_id, i.price, i.status, i.responded_at, i.joined_at, i.article_id, i.article_title,
      i.submitted_at, i.review, i.review_note, i.reviewed_at, i.payment, i.payment_ref, i.released_at, i.received_at,
      r.username as r_username, r.name as r_name, r.image as r_image,
      a.slug as a_slug, a.title as a_title, a.status as a_status, a.hidden_at as a_hidden, a.cover_url as a_cover
    from press_meet_invite i
    join "user" r on r.id = i.reporter_id
    left join article a on a.id = i.article_id
    where i.press_meet_id in (${inList(meetIds)}) ${reporterId ? sql`and i.reporter_id = ${reporterId}` : sql``}
    order by i.created_at, r.name
  `);
  return [...rows];
}

/** `forOrganizer`: a reporter's story shows only once they've sent it (not while it's their draft). */
function toInvite(row: InviteRow, forOrganizer = false): PressMeetInvite {
  const openable = row.a_status === "published" && !row.a_hidden;
  const hasStory = (row.article_id !== null || row.article_title !== null) && (!forOrganizer || row.review !== null);
  return {
    id: row.id,
    reporter: { id: row.reporter_id, username: row.r_username, name: row.r_name, image: row.r_image },
    price: row.price,
    status: row.status,
    respondedAt: iso(row.responded_at),
    joinedAt: iso(row.joined_at),
    article: hasStory
      ? {
          id: row.article_id ?? "",
          slug: openable ? row.a_slug : null,
          title: row.a_title ?? row.article_title ?? "Untitled story",
          coverUrl: row.a_cover,
        }
      : null,
    submittedAt: iso(row.submitted_at),
    review: row.review,
    reviewNote: row.review_note,
    reviewedAt: iso(row.reviewed_at),
    payment: row.payment,
    paymentRef: row.payment_ref,
    releasedAt: iso(row.released_at),
    receivedAt: iso(row.received_at),
  };
}

/**
 * Testing: start right away instead of 10 minutes early — every press meet with PRESS_MEET_START_ANYTIME, or just the
 * ones titled "test…" (owner 2026-10-02). Never in production.
 */
function startsAnytime(title: string): boolean {
  return env.pressMeetStartAnytime || (!env.isProduction && /^\s*test/i.test(title));
}

/** When the organizer may start (ms): 10 minutes early, or right away for a test press meet. */
function startOpensAt(startsAt: string, createdAt: string, title: string): number {
  return startsAnytime(title) ? Date.parse(isoOf(createdAt)) : Date.parse(isoOf(startsAt)) - PRESS_MEET.startEarlyMinutes * MINUTE;
}

function toSummary(row: MeetRow, role: "organizer" | "reporter", myInvite: PressMeetInvite | null): PressMeetSummary {
  const organizer: AuthorSummary = { id: row.organizer_id, username: row.o_username, name: row.o_name, image: row.o_image };
  return {
    id: row.id,
    title: row.title,
    agenda: row.agenda,
    startsAt: isoOf(row.starts_at),
    endsAt: isoOf(row.ends_at),
    durationMinutes: row.duration_minutes as PressMeetDuration,
    platform: row.platform,
    visibility: row.visibility,
    // Seats are the reporters who haven't declined (or left).
    seatsLeft: row.visibility === "public" ? Math.max(0, PRESS_MEET.reportersMax - row.invited - row.accepted) : null,
    status: row.status,
    startedAt: iso(row.started_at),
    endedAt: iso(row.ended_at),
    createdAt: isoOf(row.created_at),
    startOpensAt: new Date(startOpensAt(row.starts_at, row.created_at, row.title)).toISOString(),
    organizer,
    role,
    counts: { invited: row.invited, accepted: row.accepted, declined: row.declined, total: row.total },
    totalAmount: row.amount,
    myInvite,
  };
}

/** Live first, then upcoming (soonest first), then the rest (latest first). */
const MEET_ORDER = sql`
  order by case m.status when 'live' then 0 when 'scheduled' then 1 else 2 end,
    case when m.status in ('live', 'scheduled') then m.starts_at end asc,
    m.starts_at desc
  limit 100
`;

/**
 * The press meets the viewer organizes, the ones they're invited to (profile → "Press meet" tab), or — `public` —
 * every public press meet that's coming up or live (owner 2026-10-07), with the viewer's seat if they took one.
 */
export async function listPressMeets(viewerId: string, scope: "organizing" | "invited" | "public"): Promise<PressMeetListResponse> {
  const where =
    scope === "organizing"
      ? sql`where m.organizer_id = ${viewerId}`
      : scope === "public"
        ? sql`where m.visibility = 'public' and m.status in ('scheduled', 'live') and m.ends_at > now()`
        : sql`where exists (select 1 from press_meet_invite x where x.press_meet_id = m.id and x.reporter_id = ${viewerId})`;
  const rows = [...(await db.execute<MeetRow>(sql`${MEET_SELECT} ${where} ${MEET_ORDER}`))];
  if (scope === "organizing") return { items: rows.map((row) => toSummary(row, "organizer", null)), nextCursor: null };
  if (scope === "public") {
    const seats = new Map((await loadInvites(rows.map((r) => r.id), viewerId)).map((invite) => [invite.press_meet_id, invite]));
    return {
      items: rows.map((row) => {
        if (row.organizer_id === viewerId) return toSummary(row, "organizer", null);
        const seat = seats.get(row.id);
        return toSummary(row, "reporter", seat ? toInvite(seat) : null);
      }),
      nextCursor: null,
    };
  }
  const invites = new Map((await loadInvites(rows.map((r) => r.id), viewerId)).map((invite) => [invite.press_meet_id, invite]));
  return {
    items: rows.map((row) => {
      const invite = invites.get(row.id);
      return toSummary(row, "reporter", invite ? toInvite(invite) : null);
    }),
    nextCursor: null,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertMeetId(id: string): string {
  if (!UUID.test(id)) throw notFound("Press meet not found");
  return id.toLowerCase();
}

/** One press meet as its organizer or an invited reporter sees it (404 for everyone else). */
export async function getPressMeetDetail(id: string, viewerId: string): Promise<PressMeetDetail> {
  const [row] = [...(await db.execute<MeetRow>(sql`${MEET_SELECT} where m.id = ${assertMeetId(id)}`))];
  if (!row) throw notFound("Press meet not found");
  const isOrganizer = row.organizer_id === viewerId;
  const invites = await loadInvites([row.id], isOrganizer ? undefined : viewerId);
  const mine = isOrganizer ? null : (invites[0] ?? null);
  // A public press meet (owner 2026-10-07): any signed-in member can look at it; reporters join from there.
  if (!isOrganizer && !mine && row.visibility !== "public") throw notFound("Press meet not found");

  let recordings: PressMeetRecording[] = [];
  if (mine) {
    const rows = await db.execute<{ id: string; status: PressMeetRecording["status"]; duration_ms: number | null; created_at: string; finished_at: string | null }>(sql`
      select id, status, duration_ms, created_at, finished_at from press_meet_recording
      where press_meet_id = ${row.id} and reporter_id = ${viewerId}
      order by created_at desc
    `);
    recordings = [...rows].map((r) => ({
      id: r.id,
      status: r.status,
      durationMs: r.duration_ms,
      createdAt: isoOf(r.created_at),
      finishedAt: iso(r.finished_at),
    }));
  }

  const summary = toSummary(row, isOrganizer ? "organizer" : "reporter", mine ? toInvite(mine) : null);
  const seesLink = isOrganizer || mine?.status === "accepted";
  const { report, platformFee } = await bookingExtras(row.id);
  return {
    ...summary,
    meetUrl: seesLink ? row.meet_url : null,
    invites: isOrganizer ? invites.map((invite) => toInvite(invite, true)) : [],
    recordings,
    // The report opens for the organizer and the reporters in it (not for someone just looking at a public one).
    report: isOrganizer || mine ? report : null,
    platformFee: isOrganizer ? platformFee : null,
    recordingConsentAt: iso(row.recording_consent_at),
  };
}

/* ─────────────── Booking ─────────────── */

type CreateInput = z.output<typeof createPressMeetSchema>;

const slotTaken = () =>
  new ApiError(409, "slot_taken", "You already have a press meet at that time. Choose another slot.", {
    startsAt: "You already have a press meet at that time",
  });

function isExclusionViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    if ((current as { code?: string }).code === "23P01") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** The chosen reporters who can be invited (Verified, not suspended, with a price) — 422 if any of them can't. */
async function eligibleReporters(ids: string[]): Promise<Array<{ id: string; price: number }>> {
  const reporters = [
    ...(await db.execute<{ id: string; price: number }>(sql`
      select u.id, u.press_meet_price as price from "user" u
      join press_pass p on p.user_id = u.id and p.revoked_at is null
      where u.id in (${inList(ids)}) and u.role = 'reporter' and u.reporter_level = 'verified'
        and u.suspended_at is null and u.press_meet_price is not null
    `)),
  ];
  if (reporters.length !== ids.length) {
    const message = "Some of the reporters you chose can't be invited any more (no longer verified, or no advertorial price set). Choose again.";
    throw new ApiError(422, "reporters_unavailable", message, { reporterIds: message });
  }
  return reporters;
}

type InviteMailMeet = { id: string; title: string; startsAt: Date | string; durationMinutes: number; platform: PressMeetPlatform };

/** The invitation email to each newly invited reporter. */
function emailInvitations(organizerName: string, meet: InviteMailMeet, reporterIds: string[]): void {
  emailUsers(reporterIds, (person) =>
    pressMeetMail({
      to: person.email,
      name: person.name,
      subject: `Press meet invitation: ${meet.title}`,
      heading: `${organizerName} has invited you to cover their press meet.`,
      lines: [
        `“${meet.title}”`,
        `${meetWhen(meet.startsAt)} · ${meet.durationMinutes} minutes · ${meet.platform === "google_meet" ? "Google Meet" : "WebNEWS Live"}`,
        "Please accept or decline the invitation on WebNEWS so the organizer can plan accordingly.",
      ],
      cta: "View invitation",
      url: meetLink(meet.id),
    }),
  );
}

/** Books the slot and invites the reporters (each at their current price). Returns the new press meet's id. */
export async function createPressMeet(viewer: Viewer, input: CreateInput): Promise<string> {
  const now = new Date();
  const startsAt = new Date(input.startsAt);
  const problem = slotProblem(startsAt, input.durationMinutes, now);
  if (problem) throw new ApiError(422, "invalid_slot", problem, { startsAt: problem });
  const endsAt = new Date(startsAt.getTime() + input.durationMinutes * MINUTE);

  const isPublic = input.visibility === "public";
  const ids = isPublic ? [] : [...new Set(input.reporterIds)].filter((id) => id !== viewer.id);
  if (!isPublic && ids.length === 0) {
    throw new ApiError(422, "no_reporters", "Choose at least one reporter", { reporterIds: "Choose at least one reporter" });
  }
  const reporters = isPublic ? [] : await eligibleReporters(ids);

  const meetId = await db.transaction(async (tx) => {
    let created: { id: string } | undefined;
    try {
      [created] = await tx
        .insert(pressMeet)
        .values({
          organizerId: viewer.id,
          title: input.title,
          agenda: input.agenda,
          startsAt,
          endsAt,
          durationMinutes: input.durationMinutes,
          platform: input.platform,
          visibility: input.visibility,
          meetUrl: input.platform === "google_meet" ? input.meetUrl : null,
          // Booked for today: the invitation is the day's notice.
          remindedDayAt: istDateKey(startsAt) === istDateKey(now) ? now : null,
        })
        .returning({ id: pressMeet.id });
    } catch (error) {
      if (isExclusionViolation(error)) throw slotTaken();
      throw error;
    }
    if (!created) throw new ApiError(500, "press_meet_failed", "Couldn't book the press meet");
    const id = created.id;
    // The report and the paid platform fee are required (owner 2026-10-05); both now belong to this press meet.
    await attachBookingItems(tx, viewer, id, { reportId: input.reportId, platformFeePaymentId: input.platformFeePaymentId });
    if (isPublic) {
      // Every reporter hears about it now (and again when it goes live).
      await notifyAllReporters(tx, id, viewer.id, "press_meet_public", false);
    } else {
      await tx.insert(pressMeetInvite).values(reporters.map((r) => ({ pressMeetId: id, reporterId: r.id, price: r.price })));
      await notifyMeet(
        tx,
        id,
        reporters.map((r) => ({ userId: r.id, type: "press_meet_invited" as const, actorId: viewer.id, amount: r.price })),
      );
    }
    await pingMeet(tx, id);
    return id;
  });

  emailInvitations(
    viewer.name,
    { id: meetId, title: input.title, startsAt, durationMinutes: input.durationMinutes, platform: input.platform },
    reporters.map((r) => r.id),
  );
  return meetId;
}

/* ─────────────── Changes ─────────────── */

type LockedMeet = {
  id: string;
  organizer_id: string;
  title: string;
  status: PressMeetStatus;
  platform: PressMeetPlatform;
  visibility: PressMeetVisibility;
  starts_at: string;
  ends_at: string;
  started_at: string | null;
  ended_at: string | null;
};

async function lockMeet(executor: Executor, id: string): Promise<LockedMeet> {
  const [meet] = [
    ...(await executor.execute<LockedMeet>(sql`
      select id, organizer_id, title, status, platform, visibility, starts_at, ends_at, started_at, ended_at
      from press_meet where id = ${assertMeetId(id)} for update
    `)),
  ];
  if (!meet) throw notFound("Press meet not found");
  return meet;
}

async function lockOwnMeet(executor: Executor, id: string, viewerId: string): Promise<LockedMeet> {
  const meet = await lockMeet(executor, id);
  if (meet.organizer_id !== viewerId) throw notFound("Press meet not found");
  return meet;
}

type LockedInvite = {
  id: string;
  reporter_id: string;
  price: number;
  status: PressMeetInvite["status"];
  review: PressMeetInvite["review"];
  payment: PressMeetInvite["payment"];
  article_id: string | null;
};

async function lockInvite(executor: Executor, meetId: string, where: SQL): Promise<LockedInvite> {
  const [invite] = [
    ...(await executor.execute<LockedInvite>(sql`
      select id, reporter_id, price, status, review, payment, article_id from press_meet_invite
      where press_meet_id = ${meetId} and ${where} for update
    `)),
  ];
  if (!invite) throw notFound("Invitation not found");
  return invite;
}

const conflict = (message: string) => new ApiError(409, "press_meet_state", message);

/**
 * The organizer invites more reporters after booking (owner 2026-10-01) — until the press meet ends, up to
 * PRESS_MEET.reportersMax who haven't declined. Someone who declined can be invited again (asked afresh, at their
 * current price); people already invited are skipped. Returns how many were invited.
 */
export async function inviteMoreReporters(meetId: string, viewer: Viewer, reporterIds: string[]): Promise<number> {
  const ids = [...new Set(reporterIds)].filter((id) => id !== viewer.id);
  if (ids.length === 0) throw new ApiError(422, "no_reporters", "Choose at least one reporter", { reporterIds: "Choose at least one reporter" });
  let meet: LockedMeet | null = null;
  let invited: Array<{ id: string; price: number }> = [];
  await db.transaction(async (tx) => {
    const locked = await lockOwnMeet(tx, meetId, viewer.id);
    if (locked.visibility === "public") throw conflict("Reporters join a public press meet themselves");
    if (locked.status !== "scheduled" && locked.status !== "live") throw conflict("You can invite reporters until the press meet ends");
    const existing = new Map(
      [
        ...(await tx.execute<{ reporter_id: string; status: string }>(sql`
          select reporter_id, status from press_meet_invite where press_meet_id = ${locked.id}
        `)),
      ].map((row) => [row.reporter_id, row.status]),
    );
    const fresh = ids.filter((id) => !existing.has(id) || existing.get(id) === "declined");
    if (fresh.length === 0) return;
    const active = [...existing.values()].filter((status) => status !== "declined").length;
    if (active + fresh.length > PRESS_MEET.reportersMax) {
      const left = Math.max(0, PRESS_MEET.reportersMax - active);
      const message = left === 0 ? `This press meet already has ${PRESS_MEET.reportersMax} reporters` : `You can invite ${left} more ${left === 1 ? "reporter" : "reporters"}`;
      throw new ApiError(422, "too_many_reporters", message, { reporterIds: message });
    }
    const reporters = await eligibleReporters(fresh);
    for (const r of reporters) {
      await tx.execute(sql`
        insert into press_meet_invite (press_meet_id, reporter_id, price) values (${locked.id}, ${r.id}, ${r.price})
        on conflict (press_meet_id, reporter_id) do update set status = 'invited', price = excluded.price, responded_at = null
      `);
    }
    await notifyMeet(
      tx,
      locked.id,
      reporters.map((r) => ({ userId: r.id, type: "press_meet_invited" as const, actorId: viewer.id, amount: r.price })),
    );
    await pingMeet(tx, locked.id);
    meet = locked;
    invited = reporters;
  });
  const done = meet as LockedMeet | null;
  if (done && invited.length > 0) {
    const durationMinutes = Math.round((Date.parse(isoOf(done.ends_at)) - Date.parse(isoOf(done.starts_at))) / MINUTE);
    emailInvitations(
      viewer.name,
      { id: done.id, title: done.title, startsAt: isoOf(done.starts_at), durationMinutes, platform: done.platform },
      invited.map((r) => r.id),
    );
  }
  return invited.length;
}

/** A reporter accepts or declines (changeable until the press meet is over). */
export async function respondToInvite(meetId: string, viewer: Viewer, accept: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    const meet = await lockMeet(tx, meetId);
    const invite = await lockInvite(tx, meet.id, sql`reporter_id = ${viewer.id}`);
    if (meet.status === "cancelled") throw conflict("This press meet was cancelled");
    if (meet.status === "ended") throw conflict("This press meet is over");
    const next = accept ? "accepted" : "declined";
    if (invite.status === next) return;
    await tx.update(pressMeetInvite).set({ status: next, respondedAt: new Date() }).where(eq(pressMeetInvite.id, invite.id));
    await notifyMeet(tx, meet.id, [
      { userId: meet.organizer_id, type: accept ? "press_meet_accepted" : "press_meet_declined", actorId: viewer.id },
    ]);
    await pingMeet(tx, meet.id);
  });
}

/**
 * A reporter takes a seat in a public press meet (owner 2026-10-07): any active reporter with a Press Pass, free, first
 * come first served up to PRESS_MEET.reportersMax — until it ends. Joining again after leaving takes a seat afresh.
 * Leaving is `respondToInvite(…, false)`, which frees the seat. The organizer is told.
 */
export async function joinPublicMeet(meetId: string, viewer: Viewer): Promise<void> {
  await db.transaction(async (tx) => {
    const meet = await lockMeet(tx, meetId);
    if (meet.visibility !== "public") throw notFound("Press meet not found");
    if (meet.organizer_id === viewer.id) throw conflict("It's your own press meet");
    if (meet.status === "cancelled") throw conflict("This press meet was cancelled");
    if (meet.status === "ended" || Date.now() > Date.parse(isoOf(meet.ends_at))) throw conflict("This press meet is over");
    const [reporter] = [
      ...(await tx.execute<{ id: string }>(sql`
        select u.id from "user" u join press_pass p on p.user_id = u.id and p.revoked_at is null
        where u.id = ${viewer.id} and u.role = 'reporter' and u.suspended_at is null
      `)),
    ];
    if (!reporter) throw forbidden("Only reporters with a Press Pass can join a press meet");
    const [seat] = [
      ...(await tx.execute<{ id: string; status: PressMeetInvite["status"] }>(sql`
        select id, status from press_meet_invite where press_meet_id = ${meet.id} and reporter_id = ${viewer.id} for update
      `)),
    ];
    if (seat?.status === "accepted") return;
    const [{ taken }] = [
      ...(await tx.execute<{ taken: number }>(sql`
        select count(*)::int as taken from press_meet_invite where press_meet_id = ${meet.id} and status <> 'declined'
      `)),
    ] as [{ taken: number }];
    if (taken >= PRESS_MEET.reportersMax) throw conflict("This press meet is full");
    const now = new Date();
    if (seat) {
      await tx.update(pressMeetInvite).set({ status: "accepted", respondedAt: now }).where(eq(pressMeetInvite.id, seat.id));
    } else {
      await tx.insert(pressMeetInvite).values({ pressMeetId: meet.id, reporterId: viewer.id, price: 0, status: "accepted", respondedAt: now });
    }
    await notifyMeet(tx, meet.id, [{ userId: meet.organizer_id, type: "press_meet_joined", actorId: viewer.id }]);
    await pingMeet(tx, meet.id);
  });
}

/** The organizer cancels a press meet that hasn't started (the slot opens up again). */
export async function cancelPressMeet(meetId: string, viewer: Viewer): Promise<void> {
  await db.transaction(async (tx) => {
    const meet = await lockOwnMeet(tx, meetId, viewer.id);
    if (meet.status === "cancelled") return;
    if (meet.status !== "scheduled") throw conflict("Only a press meet that hasn't started can be cancelled");
    await tx
      .update(pressMeet)
      .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(pressMeet.id, meet.id));
    const invitees = await tx.execute<{ reporter_id: string }>(sql`
      select reporter_id from press_meet_invite where press_meet_id = ${meet.id} and status <> 'declined'
    `);
    await notifyMeet(
      tx,
      meet.id,
      [...invitees].map((i) => ({ userId: i.reporter_id, type: "press_meet_cancelled" as const, actorId: viewer.id })),
    );
    await pingMeet(tx, meet.id);
  });
}

/** The organizer starts it (from 10 minutes before) — reporters who accepted are told to join. */
export async function startPressMeet(meetId: string, viewer: Viewer): Promise<void> {
  let started: LockedMeet | null = null;
  let reporters: string[] = [];
  await db.transaction(async (tx) => {
    const meet = await lockOwnMeet(tx, meetId, viewer.id);
    if (meet.status === "live") return;
    if (meet.status !== "scheduled") throw conflict(meet.status === "cancelled" ? "This press meet was cancelled" : "This press meet is over");
    const now = Date.now();
    if (!startsAnytime(meet.title) && now < Date.parse(isoOf(meet.starts_at)) - PRESS_MEET.startEarlyMinutes * MINUTE) {
      throw conflict(`You can start your press meet ${PRESS_MEET.startEarlyMinutes} minutes before its time`);
    }
    if (now > Date.parse(isoOf(meet.ends_at))) throw conflict("This press meet's time slot is over");
    // Started from the Start dialog, whose recording consent the route requires (owner 2026-10-05).
    await tx
      .update(pressMeet)
      .set({ status: "live", startedAt: new Date(), recordingConsentAt: new Date(), updatedAt: new Date() })
      .where(eq(pressMeet.id, meet.id));
    reporters = [
      ...(await tx.execute<{ reporter_id: string }>(sql`
        select reporter_id from press_meet_invite where press_meet_id = ${meet.id} and status = 'accepted'
      `)),
    ].map((r) => r.reporter_id);
    await notifyMeet(
      tx,
      meet.id,
      reporters.map((id) => ({ userId: id, type: "press_meet_live" as const, actorId: viewer.id })),
    );
    // A public press meet (owner 2026-10-07): every other reporter is told it's live — while there are seats left.
    if (meet.visibility === "public") {
      const [{ taken }] = [
        ...(await tx.execute<{ taken: number }>(sql`
          select count(*)::int as taken from press_meet_invite where press_meet_id = ${meet.id} and status <> 'declined'
        `)),
      ] as [{ taken: number }];
      if (taken < PRESS_MEET.reportersMax) await notifyAllReporters(tx, meet.id, viewer.id, "press_meet_public_live", true);
    }
    await pingMeet(tx, meet.id);
    started = meet;
  });
  const meet = started as LockedMeet | null;
  if (!meet) return;
  emailUsers(reporters, (person) =>
    pressMeetMail({
      to: person.email,
      name: person.name,
      subject: `Live now: ${meet.title}`,
      heading: `${viewer.name} has started the press meet. Please join now.`,
      lines: [`“${meet.title}”`, meet.platform === "google_meet" ? "It's on Google Meet — the link is on the press meet page." : "Join the WebNEWS Live room from the press meet page."],
      cta: "Join press meet",
      url: meetLink(meet.id),
    }),
  );
}

/** Ends a live press meet: everyone in the room is told, and the room empties. */
export async function endPressMeet(executor: Executor, meetId: string): Promise<void> {
  await executor
    .update(pressMeet)
    .set({ status: "ended", endedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(pressMeet.id, meetId), sql`${pressMeet.status} in ('live', 'scheduled')`));
  const peers = await executor.execute<{ user_id: string }>(sql`
    delete from press_meet_peer where press_meet_id = ${meetId} returning user_id
  `);
  for (const userId of new Set([...peers].map((p) => p.user_id))) {
    await publishEvent(executor, { t: "meet", id: userId, p: { meetId, to: null, from: "server", kind: "ended", data: null } });
  }
  await pingMeet(executor, meetId);
}

export async function endOwnPressMeet(meetId: string, viewer: Viewer): Promise<void> {
  await db.transaction(async (tx) => {
    const meet = await lockOwnMeet(tx, meetId, viewer.id);
    if (meet.status === "ended") return;
    if (meet.status !== "live") throw conflict("Only a live press meet can be ended");
    await endPressMeet(tx, meet.id);
  });
}

/* ─────────────── Press meet stories (owner 2026-10-07) ─────────────── */

/*
 * A story written for a press meet (article.press_meet_id, from the press meet page's "Write your story") goes live only
 * when the organizer verifies it. The composer's Publish sends it to them instead (`pressMeetStorySaved`, inside
 * saveArticle's transaction): it stays a draft, invisible to everyone else, until the organizer reads it
 * (`storyPreview`) and verifies it — which publishes it — or asks for changes. Saving it as a draft while it waits takes
 * it back. One story per reporter per press meet, for every reporter (Trainees skip the Review Desk: the organizer
 * verifies it). Once verified it's locked — no edits, no deleting. It waits for the organizer however long that takes.
 */

export const pressMeetLocked = () =>
  new ApiError(409, "press_meet_locked", "The press meet organizer verified this story, so it can't be changed or deleted.");

/**
 * The composer saved a press meet story (in its transaction): it's linked to the reporter's invitation and, with `send`,
 * handed to the organizer to verify — otherwise one waiting for them is taken back. Returns the organizer's name.
 */
export async function pressMeetStorySaved(
  tx: Executor,
  input: { meetId: string; reporterId: string; articleId: string; title: string | null; send: boolean },
): Promise<{ organizerName: string }> {
  const meet = await lockMeet(tx, input.meetId);
  const invite = await lockInvite(tx, meet.id, sql`reporter_id = ${input.reporterId}`);
  if (invite.status !== "accepted") throw conflict("Only reporters who covered this press meet can write a story for it");
  if (meet.status !== "ended" || !meet.started_at) throw conflict("You can write your story once the press meet is over");
  if (invite.article_id && invite.article_id !== input.articleId) {
    throw conflict("You already have a story for this press meet — open it from the press meet page");
  }
  const review = input.send
    ? { submittedAt: new Date(), review: "pending" as const, reviewNote: null, reviewedAt: null }
    : invite.review === "pending"
      ? { submittedAt: null, review: null }
      : {};
  await tx
    .update(pressMeetInvite)
    .set({ articleId: input.articleId, articleTitle: input.title, ...review })
    .where(eq(pressMeetInvite.id, invite.id));
  if (input.send) await notifyMeet(tx, meet.id, [{ userId: meet.organizer_id, type: "press_meet_submitted", actorId: input.reporterId }]);
  await pingMeet(tx, meet.id);
  const [organizer] = [...(await tx.execute<{ name: string }>(sql`select name from "user" where id = ${meet.organizer_id}`))];
  return { organizerName: organizer?.name ?? "the organizer" };
}

/** The reporter deleted their press meet story before it was verified: their invitation is back to "write your story". */
export async function pressMeetStoryDeleted(tx: Executor, articleId: string, meetId: string): Promise<void> {
  await tx.execute(sql`
    update press_meet_invite
    set article_id = null, article_title = null, submitted_at = null, review = null, review_note = null, reviewed_at = null
    where article_id = ${articleId} and review is distinct from 'approved'
  `);
  await pingMeet(tx, meetId);
}

/** The press meet a reporter's story was written for, and where it stands with the organizer (for the composer). */
export async function storyPressMeet(meetId: string, reporterId: string, articleId: string): Promise<ArticlePressMeet | null> {
  const [row] = [
    ...(await db.execute<{
      id: string;
      title: string;
      organizer_id: string;
      o_username: string;
      o_name: string;
      o_image: string | null;
      article_id: string | null;
      review: PressMeetInvite["review"];
      review_note: string | null;
    }>(sql`
      select m.id, m.title, m.organizer_id, o.username as o_username, o.name as o_name, o.image as o_image,
        i.article_id, i.review, i.review_note
      from press_meet m
      join "user" o on o.id = m.organizer_id
      left join press_meet_invite i on i.press_meet_id = m.id and i.reporter_id = ${reporterId}
      where m.id = ${meetId}
    `)),
  ];
  if (!row) return null;
  const current = row.article_id === articleId;
  return {
    id: row.id,
    title: row.title,
    organizer: { id: row.organizer_id, username: row.o_username, name: row.o_name, image: row.o_image },
    review: current ? row.review : null,
    reviewNote: current ? row.review_note : null,
  };
}

/** A story sent for the organizer's press meet, for them to read before they verify it (it isn't public yet). */
export async function storyPreview(meetId: string, inviteId: string, viewer: Viewer): Promise<PressMeetStoryPreview> {
  const [row] = [
    ...(await db.execute<{
      id: string;
      title: string | null;
      body_html: string | null;
      category: Category | null;
      district: string | null;
      cover_url: string | null;
      cover_blur: string | null;
      video_url: string | null;
      article_image_url: string | null;
      article_image_blur: string | null;
      article_video_url: string | null;
      template: PosterTemplate | null;
      poster_x: number | null;
      poster_y: number | null;
      poster_zoom: number | null;
      submitted_at: string | null;
      u_id: string;
      u_username: string;
      u_name: string;
      u_image: string | null;
      u_level: ReporterLevel | null;
    }>(sql`
      select a.id, a.title, a.body_html, a.category, a.district, a.cover_url, a.cover_blur, a.video_url,
        a.article_image_url, a.article_image_blur, a.article_video_url, a.template, a.poster_x, a.poster_y, a.poster_zoom,
        i.submitted_at, u.id as u_id, u.username as u_username, u.name as u_name, u.image as u_image, ${BADGE_LEVEL_U} as u_level
      from press_meet_invite i
      join press_meet m on m.id = i.press_meet_id
      join article a on a.id = i.article_id
      join "user" u on u.id = a.author_id
      where i.id = ${assertMeetId(inviteId)} and m.id = ${assertMeetId(meetId)} and m.organizer_id = ${viewer.id} and i.review is not null
    `)),
  ];
  if (!row) throw notFound("Story not found");
  return {
    id: row.id,
    title: row.title ?? "Untitled story",
    bodyHtml: row.body_html ?? "",
    category: row.category,
    district: row.district,
    coverUrl: row.cover_url,
    coverBlur: row.cover_blur,
    videoUrl: row.video_url,
    articleImageUrl: row.article_image_url,
    articleImageBlur: row.article_image_blur,
    articleVideoUrl: row.article_video_url,
    template: row.template ?? DEFAULT_POSTER_TEMPLATE,
    posterFrame:
      row.poster_x !== null && row.poster_y !== null && row.poster_zoom !== null ? { x: row.poster_x, y: row.poster_y, zoom: row.poster_zoom } : null,
    author: { id: row.u_id, username: row.u_username, name: row.u_name, image: row.u_image, reporterLevel: row.u_level },
    submittedAt: iso(row.submitted_at),
  };
}

/**
 * The organizer verifies a story — which publishes it (owner 2026-10-07) — or asks for changes (with a note; it stays
 * the reporter's draft).
 */
export async function reviewStory(meetId: string, inviteId: string, viewer: Viewer, approve: boolean, note: string | null): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await db.transaction(async (tx) => {
        const meet = await lockOwnMeet(tx, meetId, viewer.id);
        const invite = await lockInvite(tx, meet.id, sql`id = ${assertMeetId(inviteId)}`);
        if (invite.review !== "pending") throw conflict("There's no story waiting for your review");
        const title = approve ? await publishStory(tx, invite) : null;
        await tx
          .update(pressMeetInvite)
          .set({ review: approve ? "approved" : "changes", reviewNote: approve ? null : note, reviewedAt: new Date(), ...(title ? { articleTitle: title } : {}) })
          .where(eq(pressMeetInvite.id, invite.id));
        await notifyMeet(tx, meet.id, [
          approve
            ? { userId: invite.reporter_id, type: "press_meet_approved", actorId: viewer.id, amount: invite.price }
            : { userId: invite.reporter_id, type: "press_meet_changes", actorId: viewer.id, note },
        ]);
        await pingMeet(tx, meet.id);
      });
      return;
    } catch (error) {
      if (isLinkCollision(error)) continue; // astronomically rare: retry with a new slug suffix / short code
      throw error;
    }
  }
  throw new ApiError(500, "internal_error", "Could not generate a unique link for this story");
}

/**
 * Verifying publishes the story the reporter sent, like a Verified reporter's Publish: its link, short code, followers'
 * notifications, auto-posts and the live feeds. It was checked as complete when they sent it.
 */
async function publishStory(tx: Transaction, invite: LockedInvite): Promise<string> {
  const [story] = invite.article_id ? await tx.select().from(article).where(eq(article.id, invite.article_id)).for("update").limit(1) : [];
  if (!story) throw conflict("The reporter deleted this story");
  if (story.status === "published") return story.title ?? "";
  if (!story.title || !story.bodyHtml || !story.coverUrl || !story.articleImageUrl || !story.category) {
    throw conflict("This story isn't complete — ask the reporter for changes");
  }
  const now = new Date();
  await tx
    .update(article)
    .set({
      status: "published",
      template: story.template ?? DEFAULT_POSTER_TEMPLATE,
      slug: makeSlug(story.title),
      shortCode: story.shortCode ?? makeShortCode(),
      publishedAt: now,
      editedAt: null,
      updatedAt: now,
      returnedAt: null,
      reviewNote: null,
    })
    .where(eq(article.id, story.id));
  await notifyFollowers(tx, story.id);
  await enqueueSocialPosts(tx, story.id, story.authorId);
  await publishEvent(tx, { t: "article.published", id: story.id });
  return story.title;
}

/** The organizer records that they paid the reporter (outside WebNEWS, for now). */
export async function releasePayment(meetId: string, inviteId: string, viewer: Viewer, reference: string | null): Promise<void> {
  await db.transaction(async (tx) => {
    const meet = await lockOwnMeet(tx, meetId, viewer.id);
    const invite = await lockInvite(tx, meet.id, sql`id = ${assertMeetId(inviteId)}`);
    if (invite.review !== "approved") throw conflict("Verify the reporter's story before releasing the payment");
    if (invite.payment !== "unpaid") return;
    await tx
      .update(pressMeetInvite)
      .set({ payment: "released", paymentRef: reference, releasedAt: new Date() })
      .where(eq(pressMeetInvite.id, invite.id));
    await notifyMeet(tx, meet.id, [
      { userId: invite.reporter_id, type: "press_meet_paid", actorId: viewer.id, amount: invite.price, note: reference },
    ]);
    await pingMeet(tx, meet.id);
  });
}

/** The reporter confirms the payment reached them. */
export async function confirmReceived(meetId: string, viewer: Viewer): Promise<void> {
  await db.transaction(async (tx) => {
    const meet = await lockMeet(tx, meetId);
    const invite = await lockInvite(tx, meet.id, sql`reporter_id = ${viewer.id}`);
    if (invite.payment === "received") return;
    if (invite.payment !== "released") throw conflict("The organizer hasn't released your payment yet");
    await tx.update(pressMeetInvite).set({ payment: "received", receivedAt: new Date() }).where(eq(pressMeetInvite.id, invite.id));
    await notifyMeet(tx, meet.id, [{ userId: meet.organizer_id, type: "press_meet_received", actorId: viewer.id, amount: invite.price }]);
    await pingMeet(tx, meet.id);
  });
}

/* ─────────────── Background (lib/press-meet-worker.ts) ─────────────── */

type DueMeet = { id: string; title: string; starts_at: string; organizer_id: string; platform: PressMeetPlatform };

async function recipients(meetId: string, organizerId: string, statuses: string[]): Promise<string[]> {
  const rows = await db.execute<{ reporter_id: string }>(sql`
    select reporter_id from press_meet_invite where press_meet_id = ${meetId} and status in (${inList(statuses)})
  `);
  return [organizerId, ...[...rows].map((r) => r.reporter_id)];
}

/** 8 AM IST on the day (organizer + reporters who accepted or haven't answered) and 15 minutes before (+ who accepted). */
export async function sendDueReminders(): Promise<void> {
  const day = await db.execute<DueMeet>(sql`
    update press_meet set reminded_day_at = now()
    where status = 'scheduled' and reminded_day_at is null and starts_at > now()
      and (starts_at at time zone ${PRESS_MEET.timeZone})::date = (now() at time zone ${PRESS_MEET.timeZone})::date
      and extract(hour from now() at time zone ${PRESS_MEET.timeZone}) * 60 + extract(minute from now() at time zone ${PRESS_MEET.timeZone}) >= ${PRESS_MEET.dayReminderMinutes}
    returning id, title, starts_at, organizer_id, platform
  `);
  for (const meet of day) {
    const people = await recipients(meet.id, meet.organizer_id, ["accepted", "invited"]);
    await db.transaction(async (tx) => {
      await notifyMeet(tx, meet.id, people.map((userId) => ({ userId, type: "press_meet_reminder" as const, note: "day" })));
    });
    emailUsers(people, (person) =>
      pressMeetMail({
        to: person.email,
        name: person.name,
        subject: `Today: ${meet.title}`,
        heading: "A reminder about today's press meet.",
        lines: [`“${meet.title}”`, `${meetWhen(meet.starts_at)} · ${meet.platform === "google_meet" ? "Google Meet" : "WebNEWS Live"}`],
        cta: "Open press meet",
        url: meetLink(meet.id),
      }),
    );
  }

  const soon = await db.execute<DueMeet>(sql`
    update press_meet set reminded_soon_at = now(), reminded_day_at = coalesce(reminded_day_at, now())
    where status = 'scheduled' and reminded_soon_at is null
      and starts_at <= now() + make_interval(mins => ${PRESS_MEET.remindBeforeMinutes}) and starts_at > now() - interval '5 minutes'
    returning id, title, starts_at, organizer_id, platform
  `);
  for (const meet of soon) {
    const people = await recipients(meet.id, meet.organizer_id, ["accepted"]);
    await db.transaction(async (tx) => {
      await notifyMeet(tx, meet.id, people.map((userId) => ({ userId, type: "press_meet_reminder" as const, note: "soon" })));
    });
  }
}

/**
 * Closes press meets left running: a live WebNEWS Live one as soon as its slot has ended and the organizer is no longer
 * in the room (owner 2026-10-08: they closed the tab without pressing End — reporters opening the page saw "Live now"
 * and Join for another half hour); any live one 30 minutes past its slot end; never-started ones an hour past it.
 * Room tabs that stopped beating are swept just before this (press-meet-worker), so press_meet_peer is who's there now.
 */
export async function closeOverdueMeets(): Promise<void> {
  const overdue = await db.execute<{ id: string }>(sql`
    select id from press_meet m
    where (m.status = 'live' and m.ends_at < now() - interval '30 minutes')
       or (m.status = 'live' and m.platform = 'webnews' and m.ends_at < now()
           and not exists (select 1 from press_meet_peer p where p.press_meet_id = m.id and p.role = 'organizer'))
       or (m.status = 'scheduled' and m.ends_at < now() - interval '60 minutes')
  `);
  for (const meet of overdue) {
    await db.transaction((tx) => endPressMeet(tx, meet.id));
  }
}

/* ─────────────── Notepad ─────────────── */

/** The viewer's own notes for a press meet they organize or were invited to. */
export async function getNotes(meetId: string, viewer: Viewer): Promise<PressMeetNotes> {
  const meet = await getPressMeetDetail(meetId, viewer.id);
  const [row] = [
    ...(await db.execute<{ body: string; updated_at: string }>(sql`
      select body, updated_at from press_meet_note where press_meet_id = ${meet.id} and user_id = ${viewer.id}
    `)),
  ];
  return { body: row?.body ?? "", updatedAt: iso(row?.updated_at) };
}

export async function saveNotes(meetId: string, viewer: Viewer, body: string): Promise<PressMeetNotes> {
  const meet = await getPressMeetDetail(meetId, viewer.id);
  const [row] = [
    ...(await db.execute<{ updated_at: string }>(sql`
      insert into press_meet_note (press_meet_id, user_id, body) values (${meet.id}, ${viewer.id}, ${body})
      on conflict (press_meet_id, user_id) do update set body = excluded.body, updated_at = now()
      returning updated_at
    `)),
  ];
  return { body, updatedAt: iso(row?.updated_at) };
}
