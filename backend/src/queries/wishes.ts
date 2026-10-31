import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { user, wish, wishComment } from "../db/schema.js";
import { ApiError, validationError } from "../lib/errors.js";
import { KEY_PATTERN, storage } from "../lib/storage.js";
import { WISH_LIMITS, WISH_QUICK_COMMENTS, canPublish, type Role, type Wish, type WishComment, type WishInput, type WishKind, type WishTemplate } from "../shared/contracts.js";
import { isUuid } from "./shared.js";

const DAY = 86_400_000;

type Row = typeof wish.$inferSelect & { username: string | null; name: string; image: string | null };

const LATEST_COMMENTS = 3;

/** Each wish's quick-wish count and latest few, for the cards. */
async function commentsFor(ids: string[]): Promise<Map<string, { count: number; latest: WishComment[] }>> {
  const out = new Map<string, { count: number; latest: WishComment[] }>();
  if (ids.length === 0) return out;
  const rows = await db.execute<{ id: string; wish_id: string; body: string; created_at: Date; user_id: string; username: string | null; name: string; image: string | null; n: number; total: number }>(sql`
    select * from (
      select c.id, c.wish_id, c.body, c.created_at, u.id as user_id, u.username, u.name, u.image,
             row_number() over (partition by c.wish_id order by c.created_at desc) as n,
             count(*) over (partition by c.wish_id)::int as total
      from wish_comment c join "user" u on u.id = c.user_id
      where c.wish_id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}) and u.suspended_at is null
    ) t where n <= ${LATEST_COMMENTS} order by created_at desc`);
  for (const row of rows) {
    const entry = out.get(row.wish_id) ?? { count: Number(row.total), latest: [] };
    entry.latest.push({
      id: row.id,
      body: row.body,
      createdAt: new Date(row.created_at).toISOString(),
      author: { id: row.user_id, username: row.username ?? "", name: row.name, image: row.image },
    });
    out.set(row.wish_id, entry);
  }
  return out;
}

function toWish(row: Row, viewer: { id: string; role: Role } | null, comments?: { count: number; latest: WishComment[] }): Wish {
  return {
    id: row.id,
    kind: row.kind as WishKind,
    template: row.template as WishTemplate,
    title: row.title,
    message: row.message,
    photoUrl: row.photoUrl,
    eventAt: row.eventAt?.toISOString() ?? null,
    venue: row.venue,
    createdAt: row.createdAt.toISOString(),
    author: { id: row.authorId, username: row.username ?? "", name: row.name, image: row.image },
    canDelete: viewer !== null && (viewer.id === row.authorId || viewer.role === "admin"),
    commentCount: comments?.count ?? 0,
    comments: comments?.latest ?? [],
  };
}

const columns = {
  id: wish.id,
  authorId: wish.authorId,
  kind: wish.kind,
  template: wish.template,
  title: wish.title,
  message: wish.message,
  photoUrl: wish.photoUrl,
  photoKey: wish.photoKey,
  eventAt: wish.eventAt,
  venue: wish.venue,
  createdAt: wish.createdAt,
  expiresAt: wish.expiresAt,
  username: user.username,
  name: user.name,
  image: user.image,
};

/** The wishes in the feed (author not suspended), newest first — the feed scatters them. They never expire (owner 2026-10-31). */
export async function activeWishes(viewer: { id: string; role: Role } | null, limit = 30): Promise<Wish[]> {
  const rows = await db
    .select(columns)
    .from(wish)
    .innerJoin(user, eq(user.id, wish.authorId))
    .where(isNull(user.suspendedAt))
    .orderBy(desc(wish.createdAt))
    .limit(limit);
  const comments = await commentsFor(rows.map((row) => row.id));
  return rows.map((row) => toWish(row, viewer, comments.get(row.id)));
}

/** Posts a wish (any onboarded member, owner 2026-10-31: no Press Pass). */
export async function createWish(author: { id: string; role: Role }, input: WishInput & { message: string }): Promise<Wish> {
  // Invitations need a Press Pass; every member can post a birthday wish (owner 2026-10-31).
  if (input.kind === "invitation" && !canPublish(author)) throw new ApiError(403, "press_pass_required", "Invitations need a Press Pass — birthday wishes are open to everyone");
  const [today] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(wish)
    .where(and(eq(wish.authorId, author.id), gte(wish.createdAt, new Date(Date.now() - DAY))));
  if ((today?.n ?? 0) >= WISH_LIMITS.maxPerDay) throw new ApiError(429, "rate_limited", `You can post ${WISH_LIMITS.maxPerDay} wishes a day`);

  let photo: { url: string; key: string } | null = null;
  if (input.photo) {
    const key = input.photo.key;
    if (!KEY_PATTERN.test(key) || !key.startsWith(`covers/${author.id}/`)) throw validationError({ photo: "Please upload the photo again" });
    photo = { url: storage.urlFor(key), key };
  }
  const now = Date.now();
  let eventAt: Date | null = null;
  let expiresAt = new Date(now + WISH_LIMITS.birthdayDays * DAY);
  if (input.kind === "invitation") {
    eventAt = new Date(input.eventAt!);
    if (Number.isNaN(eventAt.getTime()) || eventAt.getTime() < now - DAY) throw validationError({ eventAt: "Pick a date that hasn't passed" });
    if (eventAt.getTime() > now + 366 * DAY) throw validationError({ eventAt: "Pick a date within a year" });
    expiresAt = new Date(eventAt.getTime() + DAY);
  }
  const [row] = await db
    .insert(wish)
    .values({
      authorId: author.id,
      kind: input.kind,
      template: input.template,
      title: input.title ?? "",
      message: input.message || null,
      photoUrl: photo?.url ?? null,
      photoKey: photo?.key ?? null,
      eventAt,
      venue: input.kind === "invitation" ? input.venue || null : null,
      expiresAt,
    })
    .returning({ id: wish.id });
  const [full] = await db.select(columns).from(wish).innerJoin(user, eq(user.id, wish.authorId)).where(eq(wish.id, row!.id)).limit(1);
  return toWish(full!, author);
}

/** Its author or the Editor Desk removes a wish. False = not found / not allowed. */
export async function deleteWish(viewer: { id: string; role: Role }, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const where = viewer.role === "admin" ? eq(wish.id, id) : and(eq(wish.id, id), eq(wish.authorId, viewer.id));
  const gone = await db.delete(wish).where(where).returning({ id: wish.id });
  return gone.length > 0;
}

/** Sends one of the quick wishes (WISH_QUICK_COMMENTS) on a wish — one per person, the latest tap kept. */
export async function addWishComment(viewer: { id: string; role: Role }, wishId: string, body: string): Promise<{ commentCount: number; comments: WishComment[] } | null> {
  if (!isUuid(wishId)) return null;
  const [target] = await db.select({ kind: wish.kind }).from(wish).where(eq(wish.id, wishId)).limit(1);
  if (!target) return null;
  if (!(WISH_QUICK_COMMENTS[target.kind as WishKind] as readonly string[]).includes(body)) throw validationError({ body: "Pick one of the wishes" });
  // One per person (owner 2026-10-31): a new tap replaces their earlier wish.
  await db
    .insert(wishComment)
    .values({ wishId, userId: viewer.id, body })
    .onConflictDoUpdate({ target: [wishComment.wishId, wishComment.userId], set: { body, createdAt: new Date() } });
  const entry = (await commentsFor([wishId])).get(wishId);
  return { commentCount: entry?.count ?? 0, comments: entry?.latest ?? [] };
}
