import { and, eq, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { db, type Transaction } from "../db/client.js";
import { purgeAccount } from "../db/purge.js";
import { article, follow, pressPass, session, user, type PressPassRecord, type UserRecord } from "../db/schema.js";
import { writeAudit } from "../lib/audit.js";
import { decodeCursor, encodeCursor } from "../lib/cursor.js";
import { ApiError, isUniqueViolation, notFound } from "../lib/errors.js";
import { publishEvent } from "../lib/events.js";
import { hasPasswordLogin } from "../lib/desk-sign-in.js";
import { isAdminEmail } from "../lib/roles.js";
import type { AdminReporterRow, AdminUserRow, Page, ReporterLevel, Role } from "../shared/contracts.js";
import { newPassNumber, setPassLevel, toPressPass } from "./press-pass.js";
import { unpinAuthorStories, type Actor } from "./admin-stories.js";

const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;

/** Audit label for an account: its username (shown as a handle, never with "@"), else its e-mail. */
const handle = (u: Pick<UserRecord, "username" | "email">) => u.username ?? u.email;

async function lockUser(tx: Transaction, id: string): Promise<UserRecord> {
  const [row] = await tx.select().from(user).where(eq(user.id, id)).for("update").limit(1);
  if (!row) throw notFound("Account not found");
  return row;
}

function assertNotSelf(actor: Actor, targetId: string): void {
  if (actor.id === targetId) throw new ApiError(400, "cannot_modify_self", "You can't change your own account from the Editor Desk");
}

/* ─────────────── People ─────────────── */

export type UserFilters = {
  q?: string | undefined;
  role?: Role | undefined;
  status?: "active" | "suspended" | undefined;
  cursor: string | undefined;
  limit: number;
  viewerId: string;
};

const USER_ID = sql.raw('"user"."id"');

export async function listUsers(filters: UserFilters): Promise<Page<AdminUserRow>> {
  const cursor = decodeCursor(filters.cursor);
  const conditions: SQL[] = [];
  if (filters.q) {
    const pattern = likePattern(filters.q.replace(/^@/, ""));
    conditions.push(or(ilike(user.username, pattern), ilike(user.name, pattern), ilike(user.email, pattern)) as SQL);
  }
  if (filters.role) conditions.push(eq(user.role, filters.role));
  if (filters.status === "suspended") conditions.push(isNotNull(user.suspendedAt));
  if (filters.status === "active") conditions.push(isNull(user.suspendedAt));
  if (cursor) conditions.push(sql`(${user.createdAt}, ${user.id}) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::text)`);
  const rows = await db
    .select({
      user,
      published: sql<number>`(select count(*)::int from ${article} a where a.author_id = ${USER_ID} and a.status = 'published')`,
      followers: sql<number>`(select count(*)::int from ${follow} f where f.following_id = ${USER_ID})`,
    })
    .from(user)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${user.createdAt} desc, ${user.id} desc`)
    .limit(filters.limit + 1);
  const hasMore = rows.length > filters.limit;
  const items = hasMore ? rows.slice(0, filters.limit) : rows;
  const last = items.at(-1);
  return {
    items: items.map((r) => toUserRow(r.user, Number(r.published), Number(r.followers), filters.viewerId)),
    nextCursor: hasMore && last ? encodeCursor(last.user.createdAt, last.user.id) : null,
  };
}

function toUserRow(u: UserRecord, published: number, followers: number, viewerId: string): AdminUserRow {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    email: u.email,
    image: u.image,
    role: u.role,
    reporterLevel: u.reporterLevel,
    onboarded: Boolean(u.onboardedAt),
    suspended: Boolean(u.suspendedAt),
    suspendedAt: u.suspendedAt?.toISOString() ?? null,
    suspendReason: u.suspendReason,
    createdAt: u.createdAt.toISOString(),
    published,
    followers,
    isSelf: u.id === viewerId,
    adminEmail: isAdminEmail(u.email),
  };
}

export async function getUserRow(id: string, viewerId: string): Promise<AdminUserRow> {
  const page = await db
    .select({
      user,
      published: sql<number>`(select count(*)::int from ${article} a where a.author_id = ${USER_ID} and a.status = 'published')`,
      followers: sql<number>`(select count(*)::int from ${follow} f where f.following_id = ${USER_ID})`,
    })
    .from(user)
    .where(eq(user.id, id))
    .limit(1);
  const row = page[0];
  if (!row) throw notFound("Account not found");
  return toUserRow(row.user, Number(row.published), Number(row.followers), viewerId);
}

async function issuePassFor(tx: Transaction, userId: string): Promise<PressPassRecord> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const passNumber = newPassNumber(null);
    const [taken] = await tx.select({ id: pressPass.userId }).from(pressPass).where(eq(pressPass.passNumber, passNumber)).limit(1);
    if (taken) continue;
    const [row] = await tx.insert(pressPass).values({ userId, passNumber, level: "trainee" }).returning();
    if (row) return row;
  }
  throw new ApiError(500, "internal_error", "Could not generate a unique pass number");
}

/**
 * Role change from the People console. reader → revokes an active pass; reporter → issues a Trainee pass
 * (or reinstates a revoked one); admin → Editor Desk with Verified standing (any pass is raised to Verified), signed
 * out everywhere until they log in with email + password (409 `admin_needs_password` for Google-only accounts).
 * You can't change your own role.
 */
export async function setUserRole(actor: Actor, userId: string, role: Role): Promise<void> {
  assertNotSelf(actor, userId);
  try {
    await db.transaction(async (tx) => {
      const target = await lockUser(tx, userId);
      const [pass] = await tx.select().from(pressPass).where(eq(pressPass.userId, userId)).for("update").limit(1);
      let level: ReporterLevel | null = pass && !pass.revokedAt ? pass.level : null;
      if (role === "reader" && pass && !pass.revokedAt) {
        await tx.update(pressPass).set({ revokedAt: new Date(), updatedAt: new Date() }).where(eq(pressPass.userId, userId));
        level = null;
      }
      if (role === "reporter") {
        if (!pass) level = (await issuePassFor(tx, userId)).level;
        else {
          if (pass.revokedAt) await tx.update(pressPass).set({ revokedAt: null, updatedAt: new Date() }).where(eq(pressPass.userId, userId));
          level = pass.level;
        }
      }
      if (role === "admin") {
        // The Desk opens only after a typed email + password sign-in (lib/desk-sign-in.ts): a Google-only account
        // could never reach it, and none of the person's current sessions may carry it.
        if (!(await hasPasswordLogin(tx, userId))) {
          throw new ApiError(409, "admin_needs_password", "This person signs in with Google only. Editor Desk accounts log in with an email and password.");
        }
        if (target.role !== "admin") await tx.delete(session).where(eq(session.userId, userId));
        // The Editor Desk has Verified-reporter standing (SPEC §3.11): badge beside the name, instant publishing.
        level = "verified";
        if (pass && !pass.revokedAt && pass.level !== "verified") {
          await tx.update(pressPass).set({ level: "verified", updatedAt: new Date() }).where(eq(pressPass.userId, userId));
        }
      }
      await tx.update(user).set({ role, reporterLevel: level }).where(eq(user.id, userId));
      await writeAudit(tx, {
        actorId: actor.id,
        action: "user.role",
        targetType: "user",
        targetId: userId,
        targetLabel: handle(target),
        meta: { from: target.role, to: role },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApiError(409, "conflict", "Please try again");
    throw error;
  }
}

/**
 * Suspends an account: sign-in is refused, every session is revoked, their stories disappear from
 * every public surface (live `article.deleted`), and their Editor's Picks are unpinned.
 */
export async function suspendUser(actor: Actor, userId: string, reason: string): Promise<void> {
  assertNotSelf(actor, userId);
  await db.transaction(async (tx) => {
    const target = await lockUser(tx, userId);
    if (target.role === "admin") throw new ApiError(409, "cannot_suspend_admin", "Change their role before suspending an Editor Desk account");
    await tx.update(user).set({ suspendedAt: target.suspendedAt ?? new Date(), suspendReason: reason }).where(eq(user.id, userId));
    await tx.delete(session).where(eq(session.userId, userId));
    await unpinAuthorStories(tx, userId);
    if (!target.suspendedAt) {
      const visible = await tx
        .select({ id: article.id })
        .from(article)
        .where(and(eq(article.authorId, userId), eq(article.status, "published"), isNull(article.hiddenAt)));
      for (const { id } of visible) await publishEvent(tx, { t: "article.deleted", id });
    }
    await writeAudit(tx, { actorId: actor.id, action: "user.suspend", targetType: "user", targetId: userId, targetLabel: handle(target), meta: { reason } });
  });
}

/**
 * Deletes an account for good (owner 2026-10-01, People ⋯ → Delete account): the person and everything they own —
 * stories with their text, images and videos, comments, likes, follows, saves, messages and chat memberships, Press
 * Pass, Spotlight orders, notifications — and their uploaded files (db/purge.ts). Counters on everyone else's stories
 * are corrected and open feeds update live. Never yourself, never an Editor Desk account (change the role first).
 * The audit log keeps one "deleted @username" line.
 */
export async function deleteAccount(actor: Actor, userId: string): Promise<{ stories: number }> {
  assertNotSelf(actor, userId);
  const [target] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!target) throw notFound("User not found");
  if (target.role === "admin" || isAdminEmail(target.email)) {
    throw new ApiError(409, "cannot_delete_admin", "Editor Desk accounts can't be deleted here — change their role first");
  }
  const result = await purgeAccount(userId);
  await writeAudit(db, {
    actorId: actor.id,
    action: "user.delete",
    targetType: "user",
    targetId: userId,
    targetLabel: handle(target),
    meta: { stories: result.articles },
  });
  return { stories: result.articles };
}

export async function unsuspendUser(actor: Actor, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const target = await lockUser(tx, userId);
    if (!target.suspendedAt) return;
    await tx.update(user).set({ suspendedAt: null, suspendReason: null }).where(eq(user.id, userId));
    await writeAudit(tx, { actorId: actor.id, action: "user.unsuspend", targetType: "user", targetId: userId, targetLabel: handle(target) });
  });
}

/* ─────────────── Reporters (Press Pass holders) ─────────────── */

export type ReporterFilters = {
  level?: ReporterLevel | "revoked" | "added" | undefined;
  q?: string | undefined;
  cursor: string | undefined;
  limit: number;
};

export async function listReporters(filters: ReporterFilters): Promise<Page<AdminReporterRow>> {
  const cursor = decodeCursor(filters.cursor);
  const conditions: SQL[] = [];
  if (filters.level === "added") conditions.push(isNotNull(user.addedBy));
  else if (filters.level === "revoked") conditions.push(isNotNull(pressPass.revokedAt));
  else if (filters.level) conditions.push(and(isNull(pressPass.revokedAt), eq(pressPass.level, filters.level)) as SQL);
  if (filters.q) {
    const pattern = likePattern(filters.q.replace(/^@/, ""));
    // Mobile numbers are stored as +91XXXXXXXXXX: match on the typed digits ("98450 12345" → 9845012345).
    const digits = filters.q.replace(/[\s().+-]/g, "");
    conditions.push(
      or(
        ilike(user.username, pattern),
        ilike(user.name, pattern),
        ilike(pressPass.passNumber, pattern),
        /^\d{4,}$/.test(digits) ? ilike(pressPass.mobile, `%${digits}%`) : undefined,
      ) as SQL,
    );
  }
  if (cursor) conditions.push(sql`(${pressPass.issuedAt}, ${pressPass.userId}) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::text)`);
  const rows = await db
    .select({
      user,
      pass: pressPass,
      published: sql<number>`(select count(*)::int from ${article} a where a.author_id = ${USER_ID} and a.status = 'published')`,
      inReview: sql<number>`(select count(*)::int from ${article} a where a.author_id = ${USER_ID} and a.status = 'in_review')`,
    })
    .from(pressPass)
    .innerJoin(user, eq(user.id, pressPass.userId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${pressPass.issuedAt} desc, ${pressPass.userId} desc`)
    .limit(filters.limit + 1);
  const hasMore = rows.length > filters.limit;
  const items = hasMore ? rows.slice(0, filters.limit) : rows;
  const last = items.at(-1);
  return {
    items: items.map((r) => toReporterRow(r.user, r.pass, Number(r.published), Number(r.inReview))),
    nextCursor: hasMore && last ? encodeCursor(last.pass.issuedAt, last.pass.userId) : null,
  };
}

function toReporterRow(u: UserRecord, pass: PressPassRecord, published: number, inReview: number): AdminReporterRow {
  return {
    user: { id: u.id, username: u.username ?? "", name: u.name, image: u.image, email: u.email, role: u.role, suspended: Boolean(u.suspendedAt) },
    pass: toPressPass(pass, u),
    published,
    inReview,
  };
}

export async function getReporterRow(userId: string): Promise<AdminReporterRow> {
  const [row] = await db
    .select({
      user,
      pass: pressPass,
      published: sql<number>`(select count(*)::int from ${article} a where a.author_id = ${USER_ID} and a.status = 'published')`,
      inReview: sql<number>`(select count(*)::int from ${article} a where a.author_id = ${USER_ID} and a.status = 'in_review')`,
    })
    .from(pressPass)
    .innerJoin(user, eq(user.id, pressPass.userId))
    .where(eq(pressPass.userId, userId))
    .limit(1);
  if (!row) throw notFound("Press Pass not found");
  return toReporterRow(row.user, row.pass, Number(row.published), Number(row.inReview));
}

async function lockPass(tx: Transaction, userId: string): Promise<{ pass: PressPassRecord; target: UserRecord }> {
  const target = await lockUser(tx, userId);
  const [pass] = await tx.select().from(pressPass).where(eq(pressPass.userId, userId)).for("update").limit(1);
  if (!pass) throw notFound("Press Pass not found");
  return { pass, target };
}

export type ReporterAction = "verify" | "downgrade" | "revoke";

/**
 * verify → Verified (reinstates a revoked pass) · downgrade → Trainee (approval count restarts) ·
 * revoke → back to Reader (their stories stay).
 */
export async function updateReporter(actor: Actor, userId: string, action: ReporterAction, reason: string | null): Promise<void> {
  if (action !== "verify") assertNotSelf(actor, userId);
  await db.transaction(async (tx) => {
    const { pass, target } = await lockPass(tx, userId);
    const now = new Date();
    if (action === "verify") {
      if (pass.revokedAt) await tx.update(pressPass).set({ revokedAt: null, updatedAt: now }).where(eq(pressPass.userId, userId));
      await setPassLevel(tx, userId, "verified", false);
      if (target.role === "reader") await tx.update(user).set({ role: "reporter" }).where(eq(user.id, userId));
    } else if (action === "downgrade") {
      if (pass.revokedAt) throw new ApiError(409, "pass_revoked", "This Press Pass is revoked — verify it to reinstate it first");
      await setPassLevel(tx, userId, "trainee", true);
    } else {
      if (pass.revokedAt) return;
      await tx.update(pressPass).set({ revokedAt: now, updatedAt: now }).where(eq(pressPass.userId, userId));
      await tx
        .update(user)
        .set({ reporterLevel: null, ...(target.role === "reporter" ? { role: "reader" as const } : {}) })
        .where(eq(user.id, userId));
    }
    await writeAudit(tx, {
      actorId: actor.id,
      action: `reporter.${action}`,
      targetType: "user",
      targetId: userId,
      targetLabel: handle(target),
      meta: { passNumber: pass.passNumber, from: pass.revokedAt ? "revoked" : pass.level, reason },
    });
  });
}
