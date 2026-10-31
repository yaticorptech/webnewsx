/**
 * Dummy Reader Testing System (owner 2026-10-31) — LOCAL development database only.
 *
 * Creates 50 reader accounts through the real auth + onboarding APIs (email + password, a first-letter profile
 * picture), then has them view, like / unlike, comment on and share stories and follow / unfollow reporters — every
 * call through the real API routes (in-process, the same app the server runs), so permissions, rate limits and
 * database rules all apply. Finally checks the database: rows saved, no duplicate likes, story counts match.
 *
 *   npm --prefix backend run dummy:readers            (refuses to run against a non-local database)
 *
 * Runs in the app's test mode (VITEST=1, set by the npm script): readers can't use email + password on the real site
 * (WhatsApp / Google only), and test mode is what lets these accounts sign up and in with one. Every other rule —
 * permissions, rate limits, validation, the database's own constraints — is the same as in production.
 */
import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { createApp } from "../src/app.js";
import { closeDatabase, db } from "../src/db/client.js";
import { sql } from "drizzle-orm";
import { env } from "../src/env.js";

const host = new URL(env.DATABASE_URL).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error(`[dummy-readers] refusing: DATABASE_URL points at ${host} — this tool is for the local development database only`);
  process.exit(1);
}

const PEOPLE = `Aarav Sharma|aarav.sharma01
Ananya Shetty|ananya.shetty02
Vihaan Nair|vihaan.nair03
Aadhya Reddy|aadhya.reddy04
Reyansh Mehta|reyansh.mehta05
Kiara Menon|kiara.menon06
Advik Patel|advik.patel07
Saanvi Gowda|saanvi.gowda08
Ishaan Verma|ishaan.verma09
Myra Kapoor|myra.kapoor10
Ayaan Khan|ayaan.khan11
Diya Kulkarni|diya.kulkarni12
Riaan Thomas|riaan.thomas13
Anika Iyer|anika.iyer14
Dhruv Joshi|dhruv.joshi15
Kavya Hegde|kavya.hegde16
Arnav Das|arnav.das17
Prisha Rao|prisha.rao18
Kian Fernandes|kian.fernandes19
Nila Pillai|nila.pillai20
Yuvaan Shah|yuvaan.shah21
Tanvi Nayak|tanvi.nayak22
Shaurya Malhotra|shaurya.malhotra23
Ahaana Nambiar|ahaana.nambiar24
Devansh Bhat|devansh.bhat25
Riya Choudhary|riya.choudhary26
Neil Mathew|neil.mathew27
Avani Desai|avani.desai28
Krishiv Poojary|krishiv.poojary29
Samaira Jain|samaira.jain30
Rishaan Varma|rishaan.varma31
Ishani Rao|ishani.rao32
Zayan Rahman|zayan.rahman33
Meera Krishnan|meera.krishnan34
Aarush Shetty|aarush.shetty35
Vihana Gowda|vihana.gowda36
Nirvaan Gupta|nirvaan.gupta37
Tara Menon|tara.menon38
Advaith Nair|advaith.nair39
Nethra Acharya|nethra.acharya40
Ronav Sinha|ronav.sinha41
Alina Joseph|alina.joseph42
Eshan Mukherjee|eshan.mukherjee43
Sanvi Patil|sanvi.patil44
Rayan D'Souza|rayan.dsouza45
Aarna Kulal|aarna.kulal46
Atharv Mishra|atharv.mishra47
Sreya Pillai|sreya.pillai48
Vivaan Chawla|vivaan.chawla49
Anvi Shetty|anvi.shetty50`
  .split("\n")
  .map((line) => {
    const [name, handle] = line.split("|") as [string, string];
    return { name, handle, email: `${handle}@gmail.com` };
  });

const COMMENTS = [
  "Very informative, thanks for sharing.",
  "Good report, please keep us updated.",
  "Important news for everyone.",
  "Well written and clear.",
  "Thanks for covering this.",
  "Useful update, sharing with my family.",
];
const CHANNELS = ["whatsapp", "copy", "facebook", "x", "telegram"] as const;
/** A strong password unrelated to the name / email (the site refuses passwords that contain them). */
const PASSWORD_OF = (handle: string) => {
  let h = 2166136261;
  for (const ch of handle) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const word = (h >>> 0).toString(36).toUpperCase();
  return `Qz!${word}m7Tk#4`;
};

const app = createApp({ logRequests: false });
let ipSeq = 10;

type Client = { cookie: string; ip: string; req: (path: string, init?: { method?: string; json?: unknown; body?: FormData | string; headers?: Record<string, string> }) => Promise<Response> };
function client(): Client {
  const c: Client = {
    cookie: "",
    ip: `10.77.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`,
    req: async (path, init = {}) => {
      const headers: Record<string, string> = { origin: env.FRONTEND_URL, "x-forwarded-for": c.ip, ...init.headers };
      if (c.cookie) headers.cookie = c.cookie;
      let body = init.body;
      if (init.json !== undefined) {
        headers["content-type"] = "application/json";
        body = JSON.stringify(init.json);
      }
      const res = await app.request(path, { method: init.method ?? (body ? "POST" : "GET"), headers, body });
      const jar = new Map(c.cookie.split(/;\s*/).filter(Boolean).map((p) => [p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1)] as [string, string]));
      for (const h of res.headers.getSetCookie()) {
        const [pair] = h.split(";");
        if (!pair) continue;
        const k = pair.slice(0, pair.indexOf("="));
        const v = pair.slice(pair.indexOf("=") + 1);
        if (/max-age=0/i.test(h) || !v) jar.delete(k);
        else jar.set(k, v);
      }
      c.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
      return res;
    },
  };
  return c;
}

async function initialAvatar(name: string): Promise<Blob> {
  const letter = name.trim()[0]!.toUpperCase();
  const hue = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="hsl(${hue} 55% 46%)"/><text x="200" y="262" font-family="Helvetica, Arial, sans-serif" font-size="210" font-weight="700" fill="#fff" text-anchor="middle">${letter}</text></svg>`;
  return new Blob([new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer())], { type: "image/png" });
}

const tally = { created: 0, reused: 0, views: 0, likes: 0, unlikes: 0, duplicateLikesBlocked: 0, comments: 0, shares: 0, follows: 0, unfollows: 0, failures: [] as string[] };
const fail = (what: string, res: Response, text: string) => tally.failures.push(`${what}: ${res.status} ${text.slice(0, 160)}`);
const pick = <T,>(items: T[], n: number) => [...items].sort(() => Math.random() - 0.5).slice(0, n);

// The stories and reporters the readers interact with: recent published stories on this database.
const stories = [...(await db.execute<{ id: string; author: string }>(sql`
  select a.id, u.username as author from article a join "user" u on u.id = a.author_id
  where a.status = 'published' and a.hidden_at is null and u.suspended_at is null and u.username is not null
  order by a.published_at desc limit 40`))];
if (stories.length === 0) {
  console.error("[dummy-readers] no published stories on this database to interact with");
  process.exit(1);
}
const reporters = [...new Set(stories.map((s) => s.author))];
console.log(`[dummy-readers] ${PEOPLE.length} readers · ${stories.length} stories by ${reporters.length} reporters`);

const creds: string[] = ["name,username,email,password"];
const readers: { c: Client; userId: string; username: string }[] = [];

for (const p of PEOPLE) {
  const c = client();
  const password = PASSWORD_OF(p.handle);
  let res = await c.req("/api/auth/sign-up/email", { json: { email: p.email, password, name: p.name } });
  const signUpError = res.status === 200 ? "" : await res.clone().text();
  if (res.status !== 200) {
    // Already there from an earlier run: sign in instead.
    res = await c.req("/api/auth/sign-in/email", { json: { email: p.email, password } });
    if (res.status !== 200) {
      fail(`sign-up ${p.email} (${signUpError.slice(0, 120)}) / sign-in`, res, await res.text());
      continue;
    }
    tally.reused++;
  } else tally.created++;
  const { user } = (await res.json()) as { user: { id: string } };

  const [row] = [...(await db.execute<{ username: string | null; onboarded_at: Date | null }>(sql`select username, onboarded_at from "user" where id = ${user.id}`))];
  let username = row?.onboarded_at ? (row.username ?? "") : "";
  if (!row?.onboarded_at) {
    const form = new FormData();
    form.append("file", await initialAvatar(p.name), "avatar.png");
    form.append("kind", "avatar");
    const up = await c.req("/api/upload", { method: "POST", body: form });
    const upText = await up.text();
    if (up.status !== 201) {
      fail(`avatar ${p.email}`, up, upText);
      continue;
    }
    const avatar = JSON.parse(upText) as { url: string };
    // A free username: first.last, then with a short suffix.
    const base = p.handle.replace(/\d+$/, "");
    for (const candidate of [base, `${base}.news`, `${base}.reads`, `${base}.in`]) {
      const ob = await c.req("/api/onboarding", {
        json: { username: candidate, name: p.name, bio: "WebNEWS reader (test account).", image: avatar.url, languages: ["en"], acceptTerms: true },
      });
      if (ob.status === 200) {
        username = candidate;
        break;
      }
      const t = await ob.text();
      if (!/taken|not available/i.test(t)) {
        fail(`onboarding ${p.email}`, ob, t);
        break;
      }
    }
    if (!username) continue;
  }
  await db.execute(sql`update "user" set added_by = 'claude' where id = ${user.id}`);
  creds.push(`${p.name},${username},${p.email},${password}`);
  readers.push({ c, userId: user.id, username });
}
console.log(`[dummy-readers] accounts ready: ${readers.length} (created ${tally.created}, existing ${tally.reused})`);
if (readers.length === 0) {
  for (const f of tally.failures.slice(0, 5)) console.log("  - " + f);
  await closeDatabase();
  process.exit(1);
}

for (const r of readers) {
  const seen = pick(stories, 6);
  const v = await r.c.req("/api/views", { json: { ids: seen.map((s) => s.id) } });
  if (v.status === 200) tally.views += ((await v.json()) as { counted: string[] }).counted.length;
  else fail(`views @${r.username}`, v, await v.text());

  // Profiles are viewed too (GET, nothing stored).
  for (const author of pick(reporters, 2)) await r.c.req(`/api/users/${encodeURIComponent(author)}`);

  const liked = pick(seen, 3);
  for (const s of liked) {
    const res = await r.c.req(`/api/articles/${s.id}/like`, { method: "POST" });
    if (res.status === 200) tally.likes++;
    else fail(`like @${r.username}`, res, await res.text());
  }
  // The same like again must not count twice.
  const before = (await db.execute<{ n: number }>(sql`select count(*)::int as n from article_like where user_id = ${r.userId} and article_id = ${liked[0]!.id}`))[0]?.n;
  await r.c.req(`/api/articles/${liked[0]!.id}/like`, { method: "POST" });
  const after = (await db.execute<{ n: number }>(sql`select count(*)::int as n from article_like where user_id = ${r.userId} and article_id = ${liked[0]!.id}`))[0]?.n;
  if (before === 1 && after === 1) tally.duplicateLikesBlocked++;
  else tally.failures.push(`duplicate like @${r.username}: before ${before}, after ${after}`);
  // And one unliked.
  const un = await r.c.req(`/api/articles/${liked[2]!.id}/like`, { method: "DELETE" });
  if (un.status === 200) tally.unlikes++;
  else fail(`unlike @${r.username}`, un, await un.text());

  const target = seen[0]!;
  const cm = await r.c.req(`/api/articles/${target.id}/comments`, { json: { body: COMMENTS[Math.floor(Math.random() * COMMENTS.length)] } });
  if (cm.status === 201) tally.comments++;
  else fail(`comment @${r.username}`, cm, await cm.text());

  const sh = await r.c.req(`/api/articles/${seen[1]!.id}/share`, { json: { channel: CHANNELS[Math.floor(Math.random() * CHANNELS.length)] } });
  if (sh.status === 200 || sh.status === 201 || sh.status === 204) tally.shares++;
  else fail(`share @${r.username}`, sh, await sh.text());

  const followed = pick(reporters, Math.min(2, reporters.length));
  for (const u of followed) {
    const f = await r.c.req(`/api/users/${encodeURIComponent(u)}/follow`, { method: "POST" });
    if (f.status === 200) tally.follows++;
    else fail(`follow @${r.username} → @${u}`, f, await f.text());
  }
  if (followed.length === 2) {
    const uf = await r.c.req(`/api/users/${encodeURIComponent(followed[1]!)}/follow`, { method: "DELETE" });
    if (uf.status === 200) tally.unfollows++;
    else fail(`unfollow @${r.username}`, uf, await uf.text());
  }
}

// What the database holds for these accounts, and whether every story's counters agree with its rows.
const ids = readers.map((r) => r.userId);
const inList = sql.join(ids.map((id) => sql`${id}`), sql`, `);
const keyList = sql.join(ids.map((id) => sql`${`u:${id}`}`), sql`, `);
const [rows] = [
  ...(await db.execute<{ likes: number; comments: number; shares: number; views: number; follows: number; dup: number }>(sql`
  select
    (select count(*)::int from article_like where user_id in (${inList})) as likes,
    (select count(*)::int from article_comment where author_id in (${inList})) as comments,
    (select count(*)::int from article_share where viewer_key in (${keyList})) as shares,
    (select count(*)::int from article_view where viewer_key in (${keyList})) as views,
    (select count(*)::int from follow where follower_id in (${inList})) as follows,
    (select count(*)::int from (select user_id, article_id from article_like group by 1, 2 having count(*) > 1) d) as dup`)),
];
const mismatched = [
  ...(await db.execute<{ id: string }>(sql`
  select a.id from article a where a.id in (${sql.join(stories.map((s) => sql`${s.id}::uuid`), sql`, `)})
  and a.comment_count <> (select count(*) from article_comment c where c.article_id = a.id)`)),
];

writeFileSync(new URL("../.dummy-readers.csv", import.meta.url), creds.join("\n") + "\n");
console.log("\n=== Dummy Reader Testing report (local database) ===");
console.log(`Accounts: ${readers.length} ready (${tally.created} created now, ${tally.reused} from an earlier run)`);
console.log(`API calls that succeeded — views counted: ${tally.views}, likes: ${tally.likes}, unlikes: ${tally.unlikes}, repeat likes kept to one: ${tally.duplicateLikesBlocked}/${readers.length}, comments: ${tally.comments}, shares: ${tally.shares}, follows: ${tally.follows}, unfollows: ${tally.unfollows}`);
console.log(`Saved in the database for these accounts — likes: ${rows?.likes}, comments: ${rows?.comments}, shares: ${rows?.shares}, views: ${rows?.views}, follows: ${rows?.follows}`);
console.log(`Duplicate likes anywhere: ${rows?.dup} · stories whose comment count disagrees with its rows: ${mismatched.length}`);
console.log(`Failures: ${tally.failures.length}`);
for (const f of tally.failures.slice(0, 20)) console.log("  - " + f);
console.log("Logins: backend/.dummy-readers.csv");
await closeDatabase();
