import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import type { AuthorSummary, LoginsPage, VisitorsReport, VisitorWho } from "../shared/contracts.js";

/*
 * Desk → Visitors (owner 2026-11-11): who opened WebNewsX — guests and signed-in people — with IP address and device,
 * built from user_event (every page view and tap already carries the viewer key, IP and user agent), and every sign-in
 * from login_event (one row per new session, kept after sign-out). Days are India time.
 */

const TZ = "Asia/Kolkata";
const PAGE = 50;
const num = (value: unknown): number => Number(value ?? 0);
const iso = (value: unknown): string => new Date(value as string).toISOString();

/** "Chrome on Android", "WebNewsX app on Android", "Safari on iPhone"… (best effort). */
export function deviceOf(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const os = /Android/i.test(ua)
    ? "Android"
    : /iPhone/i.test(ua)
      ? "iPhone"
      : /iPad/i.test(ua)
        ? "iPad"
        : /Windows/i.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/i.test(ua)
            ? "Mac"
            : /Linux/i.test(ua)
              ? "Linux"
              : null;
  const app = /WebNewsXApp|; wv\)/i.test(ua)
    ? "WebNewsX app"
    : /bot|crawler|spider|slurp/i.test(ua)
      ? "Search bot"
      : /Edg\//.test(ua)
        ? "Edge"
        : /SamsungBrowser/i.test(ua)
          ? "Samsung Internet"
          : /Chrome\//.test(ua)
            ? "Chrome"
            : /Firefox\//.test(ua)
              ? "Firefox"
              : /Safari\//.test(ua)
                ? "Safari"
                : "Browser";
  return os ? `${app} on ${os}` : app;
}

const person = (p: { id: string | null; username: string | null; name: string | null; image: string | null }): AuthorSummary | null =>
  p.id ? { id: p.id, username: p.username ?? "", name: p.name ?? "", image: p.image } : null;

const encode = (at: string, key: string) => Buffer.from(`${at}|${key}`).toString("base64url");
function decode(cursor: string | undefined): { at: string; key: string } | null {
  if (!cursor) return null;
  const [at, key] = Buffer.from(cursor, "base64url").toString().split("|");
  return at && key && !Number.isNaN(Date.parse(at)) ? { at, key } : null;
}

export async function getVisitors(days: number, who: VisitorWho, q: string, cursor?: string): Promise<VisitorsReport> {
  const since = sql`(date_trunc('day', now() at time zone ${TZ}) - make_interval(days => ${days - 1})) at time zone ${TZ}`;
  const [totals] = [
    ...(await db.execute<Record<string, number>>(sql`
      select count(*) as visitors,
        count(*) filter (where not signed) as guests,
        count(*) filter (where signed) as signed_in,
        count(*) filter (where app) as app,
        count(*) filter (where not app) as web,
        coalesce(sum(views), 0) as page_views
      from (
        select viewer_key, bool_or(user_id is not null) as signed, bool_or(platform = 'app') as app,
          count(*) filter (where name = 'page_view') as views
        from user_event where created_at >= ${since} group by viewer_key
      ) v`)),
  ];
  const daily = [
    ...(await db.execute<{ day: string; guests: number; signed_in: number }>(sql`
      select to_char(day, 'YYYY-MM-DD') as day, count(*) filter (where not signed) as guests, count(*) filter (where signed) as signed_in
      from (
        select date_trunc('day', created_at at time zone ${TZ}) as day, viewer_key, bool_or(user_id is not null) as signed
        from user_event where created_at >= ${since} group by 1, 2
      ) d group by day order by day`)),
  ];

  const after = decode(cursor);
  const term = q.trim().toLowerCase();
  const rows = [
    ...(await db.execute<{
      viewer_key: string;
      user_id: string | null;
      username: string | null;
      name: string | null;
      image: string | null;
      ip: string | null;
      ua: string | null;
      platform: "web" | "app";
      pages: number;
      last_path: string;
      first_at: string;
      last_at: string;
    }>(sql`
      select v.*, u.username, u.name, u.image from (
        select viewer_key,
          (array_agg(user_id order by created_at desc) filter (where user_id is not null))[1] as user_id,
          (array_agg(ip order by created_at desc) filter (where ip is not null))[1] as ip,
          (array_agg(user_agent order by created_at desc) filter (where user_agent is not null))[1] as ua,
          (array_agg(platform order by created_at desc))[1] as platform,
          count(*) filter (where name = 'page_view') as pages,
          (array_agg(path order by created_at desc))[1] as last_path,
          min(created_at) as first_at,
          max(created_at) as last_at
        from user_event where created_at >= ${since} group by viewer_key
      ) v left join "user" u on u.id = v.user_id
      where true
        ${who === "guests" ? sql`and v.user_id is null` : who === "signed-in" ? sql`and v.user_id is not null` : sql``}
        ${term ? sql`and (v.ip ilike ${`%${term}%`} or lower(u.username) like ${`%${term}%`} or lower(u.name) like ${`%${term}%`} or v.viewer_key ilike ${`${term}%`})` : sql``}
        ${after ? sql`and (v.last_at, v.viewer_key) < (${after.at}::timestamptz, ${after.key})` : sql``}
      order by v.last_at desc, v.viewer_key desc
      limit ${PAGE + 1}`)),
  ];
  const page = rows.slice(0, PAGE);
  const last = page.at(-1);
  const t = totals ?? {};
  return {
    days,
    totals: {
      visitors: num(t.visitors),
      guests: num(t.guests),
      signedIn: num(t.signed_in),
      app: num(t.app),
      web: num(t.web),
      pageViews: num(t.page_views),
    },
    daily: daily.map((d) => ({ day: d.day, guests: num(d.guests), signedIn: num(d.signed_in) })),
    items: page.map((r) => ({
      visitorId: r.viewer_key.replace(/^[a-z]:/, "").slice(0, 8),
      person: person({ id: r.user_id, username: r.username, name: r.name, image: r.image }),
      ip: r.ip,
      device: deviceOf(r.ua),
      platform: r.platform === "app" ? "app" : "web",
      pages: num(r.pages),
      lastPath: r.last_path,
      firstAt: iso(r.first_at),
      lastAt: iso(r.last_at),
    })),
    nextCursor: rows.length > PAGE && last ? encode(iso(last.last_at), last.viewer_key) : null,
  };
}

/** Every sign-in (login_event, written by auth.ts recordSignIn), newest first, with its IP address and device. */
export async function getLogins(q: string, cursor?: string): Promise<LoginsPage> {
  const after = decode(cursor);
  const term = q.trim().toLowerCase();
  const rows = [
    ...(await db.execute<{ id: string; user_id: string; username: string | null; name: string; image: string | null; ip: string | null; ua: string | null; created_at: string }>(sql`
      select s.id::text as id, s.user_id, u.username, u.name, u.image, s.ip, s.user_agent as ua, s.created_at
      from login_event s join "user" u on u.id = s.user_id
      where true
        ${term ? sql`and (s.ip ilike ${`%${term}%`} or lower(u.username) like ${`%${term}%`} or lower(u.name) like ${`%${term}%`})` : sql``}
        ${after ? sql`and (s.created_at, s.id) < (${after.at}::timestamptz, ${after.key}::bigint)` : sql``}
      order by s.created_at desc, s.id desc
      limit ${PAGE + 1}`)),
  ];
  const page = rows.slice(0, PAGE);
  const last = page.at(-1);
  return {
    items: page.map((r) => ({
      id: r.id,
      person: { id: r.user_id, username: r.username ?? "", name: r.name, image: r.image },
      ip: r.ip,
      device: deviceOf(r.ua),
      at: iso(r.created_at),
    })),
    nextCursor: rows.length > PAGE && last ? encode(iso(last.created_at), last.id) : null,
  };
}
