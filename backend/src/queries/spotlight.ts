import { and, asc, desc, eq, gt, inArray, lte, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import { article, spotlightOrder, spotlightPackage, user, type SpotlightOrderRecord } from "../db/schema.js";
import { writeAudit } from "../lib/audit.js";
import { decodeCursor, encodeCursor } from "../lib/cursor.js";
import { ApiError, notFound } from "../lib/errors.js";
import { activePaymentProvider } from "../lib/payments.js";
import { RANKING } from "../lib/ranking.js";
import { toReporterLevel } from "../lib/roles.js";
import {
  SPOTLIGHT_PENDING_MESSAGE,
  type AdminSpotlightOrder,
  type Page,
  type SpotlightOrder,
  type SpotlightOrderResponse,
  type SpotlightResults,
  type SpotlightPackage,
  type spotlightPackageSchema,
  type spotlightPackageUpdateSchema,
} from "../shared/contracts.js";
import type { z } from "zod";
import type { Actor } from "./admin-stories.js";
import { visibleWhere } from "./articles.js";
import { isUuid } from "./shared.js";

type PackageRecord = typeof spotlightPackage.$inferSelect;

function toPackage(p: PackageRecord): SpotlightPackage {
  return { id: p.id, name: p.name, hours: p.hours, priceInr: p.priceInr, active: p.active, sort: p.sort };
}

export async function listPackages(includeInactive = false): Promise<SpotlightPackage[]> {
  const rows = await db
    .select()
    .from(spotlightPackage)
    .where(includeInactive ? undefined : eq(spotlightPackage.active, true))
    .orderBy(asc(spotlightPackage.sort), asc(spotlightPackage.hours));
  return rows.map(toPackage);
}

/** Granted orders whose time ran out become `expired` (lazy sweep before any listing). */
export async function expireSpotlights(): Promise<void> {
  await db
    .update(spotlightOrder)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(spotlightOrder.status, "granted"), lte(spotlightOrder.endsAt, new Date())));
}

type OrderRow = { order: SpotlightOrderRecord; slug: string | null; title: string | null; coverUrl: string | null };

function toOrder(r: OrderRow, now = Date.now()): SpotlightOrder {
  const o = r.order;
  const active = o.status === "granted" && o.startsAt !== null && o.endsAt !== null && o.startsAt.getTime() <= now && o.endsAt.getTime() > now;
  return {
    id: o.id,
    status: o.status === "granted" && o.endsAt && o.endsAt.getTime() <= now ? "expired" : o.status,
    active,
    provider: o.provider,
    packageId: o.packageId,
    packageName: o.packageName,
    hours: o.hours,
    priceInr: o.priceInr,
    startsAt: o.startsAt?.toISOString() ?? null,
    endsAt: o.endsAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
    decidedAt: o.decidedAt?.toISOString() ?? null,
    note: o.note,
    article: { id: o.articleId, slug: r.slug, title: r.title, coverUrl: r.coverUrl },
  };
}

function selectOrders() {
  return db
    .select({ order: spotlightOrder, slug: article.slug, title: article.title, coverUrl: article.coverUrl })
    .from(spotlightOrder)
    .innerJoin(article, eq(article.id, spotlightOrder.articleId));
}

export async function listMyOrders(reporterId: string, limit = 50): Promise<SpotlightOrder[]> {
  await expireSpotlights();
  const rows = await selectOrders().where(eq(spotlightOrder.reporterId, reporterId)).orderBy(desc(spotlightOrder.createdAt)).limit(limit);
  const orders = rows.map((r) => toOrder(r));
  const results = await spotlightResults(rows.filter((r) => r.order.startsAt && r.order.endsAt).map((r) => r.order.id));
  return orders.map((order) => ({ ...order, results: results.get(order.id) ?? null }));
}

/**
 * What each boost did while it ran (owner 2026-10-16): showings and readers reached (spotlight_impression), readers who
 * opened the story, likes and comments on it, and new followers of the reporter — all between its start and its end
 * (or now, while it runs).
 */
async function spotlightResults(orderIds: string[]): Promise<Map<string, SpotlightResults>> {
  if (orderIds.length === 0) return new Map();
  const rows = [
    ...(await db.execute<{ id: string; shown: number; reached: number; opens: number; likes: number; comments: number; followers: number }>(sql`
      select so.id,
        coalesce((select sum(si.shows) from spotlight_impression si where si.order_id = so.id), 0)::int as shown,
        (select count(*) from spotlight_impression si where si.order_id = so.id)::int as reached,
        (select count(*) from article_read r where r.article_id = so.article_id
          and r.created_at >= so.starts_at and r.created_at < least(so.ends_at, now()))::int as opens,
        ((select count(*) from article_like l where l.article_id = so.article_id
            and l.created_at >= so.starts_at and l.created_at < least(so.ends_at, now()))
          + (select count(*) from article_anon_like l where l.article_id = so.article_id
            and l.created_at >= so.starts_at and l.created_at < least(so.ends_at, now())))::int as likes,
        (select count(*) from article_comment m where m.article_id = so.article_id
          and m.created_at >= so.starts_at and m.created_at < least(so.ends_at, now()))::int as comments,
        (select count(*) from follow f where f.following_id = so.reporter_id
          and f.created_at >= so.starts_at and f.created_at < least(so.ends_at, now()))::int as followers
      from spotlight_order so
      where so.id in (${sql.join(
        orderIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
    `)),
  ];
  return new Map(
    rows.map((r) => [
      r.id,
      { shown: Number(r.shown), reached: Number(r.reached), opens: Number(r.opens), likes: Number(r.likes), comments: Number(r.comments), newFollowers: Number(r.followers) },
    ]),
  );
}

/**
 * A reporter asks for a Spotlight on one of their own live stories (published in the For You window).
 * Payments aren't connected, so the order waits as `pending` for the Editor Desk (provider `manual`).
 */
export async function createOrder(reporter: { id: string; email: string }, articleId: string, packageId: string): Promise<SpotlightOrderResponse> {
  await expireSpotlights();
  const [story] = await db
    .select({ id: article.id, authorId: article.authorId, title: article.title, slug: article.slug, coverUrl: article.coverUrl, publishedAt: article.publishedAt })
    .from(article)
    .innerJoin(user, eq(user.id, article.authorId))
    .where(and(eq(article.id, articleId), visibleWhere()))
    .limit(1);
  if (!story || story.authorId !== reporter.id) throw notFound("Story not found");
  const windowStart = Date.now() - RANKING.windowDays * 24 * 3_600_000;
  if (!story.publishedAt || story.publishedAt.getTime() < windowStart) {
    throw new ApiError(400, "spotlight_ineligible", `Spotlight is available for stories published in the last ${RANKING.windowDays} days`);
  }
  const [pkg] = await db
    .select()
    .from(spotlightPackage)
    .where(and(eq(spotlightPackage.id, packageId), eq(spotlightPackage.active, true)))
    .limit(1);
  if (!pkg) throw notFound("Package not found");

  const provider = activePaymentProvider();
  const order = await db.transaction(async (tx) => {
    // One pending or running Spotlight per story at a time.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`webnews:spotlight:${articleId}`}))`);
    const [open] = await tx
      .select({ id: spotlightOrder.id })
      .from(spotlightOrder)
      .where(
        and(
          eq(spotlightOrder.articleId, articleId),
          sql`(${spotlightOrder.status} = 'pending' or (${spotlightOrder.status} = 'granted' and ${spotlightOrder.endsAt} > now()))`,
        ),
      )
      .limit(1);
    if (open) throw new ApiError(409, "spotlight_exists", "This story already has a Spotlight request or boost");
    const [row] = await tx
      .insert(spotlightOrder)
      .values({
        articleId,
        reporterId: reporter.id,
        packageId: pkg.id,
        packageName: pkg.name,
        hours: pkg.hours,
        priceInr: pkg.priceInr,
        status: "pending",
        provider: provider.id,
      })
      .returning();
    if (!row) throw new ApiError(500, "internal_error", "Spotlight request could not be saved");
    return row;
  });
  const checkout = await provider.createCheckout({
    orderId: order.id,
    amountInr: order.priceInr,
    description: `Spotlight · ${order.packageName}`,
    customerEmail: reporter.email,
  });
  if (checkout.providerRef) await db.update(spotlightOrder).set({ providerRef: checkout.providerRef }).where(eq(spotlightOrder.id, order.id));
  return {
    order: toOrder({ order, slug: story.slug, title: story.title, coverUrl: story.coverUrl }),
    message: SPOTLIGHT_PENDING_MESSAGE,
    payment: { provider: provider.id, status: "pending", checkoutUrl: checkout.checkoutUrl },
  };
}

/** The reporter withdraws a pending request. */
export async function cancelOrder(reporterId: string, orderId: string): Promise<SpotlightOrder> {
  if (!isUuid(orderId)) throw notFound("Spotlight request not found");
  const [updated] = await db
    .update(spotlightOrder)
    .set({ status: "cancelled", updatedAt: new Date(), decidedAt: new Date() })
    .where(and(eq(spotlightOrder.id, orderId), eq(spotlightOrder.reporterId, reporterId), eq(spotlightOrder.status, "pending")))
    .returning({ id: spotlightOrder.id });
  if (!updated) {
    const [exists] = await db.select({ id: spotlightOrder.id }).from(spotlightOrder).where(and(eq(spotlightOrder.id, orderId), eq(spotlightOrder.reporterId, reporterId))).limit(1);
    if (!exists) throw notFound("Spotlight request not found");
    throw new ApiError(409, "not_pending", "Only pending requests can be cancelled");
  }
  const [row] = await selectOrders().where(eq(spotlightOrder.id, orderId)).limit(1);
  if (!row) throw notFound("Spotlight request not found");
  return toOrder(row);
}

/* ─────────────── Editor Desk ─────────────── */

export type AdminOrderFilter = "pending" | "active" | "past" | "all";

const ORDER_FILTERS: Record<AdminOrderFilter, SQL | undefined> = {
  pending: eq(spotlightOrder.status, "pending"),
  active: and(eq(spotlightOrder.status, "granted"), gt(spotlightOrder.endsAt, sql`now()`)) as SQL,
  past: inArray(spotlightOrder.status, ["declined", "expired", "cancelled"]),
  all: undefined,
};

function selectAdminOrders() {
  return db
    .select({
      order: spotlightOrder,
      slug: article.slug,
      title: article.title,
      coverUrl: article.coverUrl,
      reporterUsername: user.username,
      reporterName: user.name,
      reporterImage: user.image,
      reporterLevel: user.reporterLevel,
      granterId: sql<string | null>`g.id`,
      granterUsername: sql<string | null>`g.username`,
      granterName: sql<string | null>`g.name`,
    })
    .from(spotlightOrder)
    .innerJoin(article, eq(article.id, spotlightOrder.articleId))
    .innerJoin(user, eq(user.id, spotlightOrder.reporterId))
    .leftJoin(sql`"user" g`, sql`g.id = ${spotlightOrder.grantedBy}`);
}

type AdminOrderRow = Awaited<ReturnType<ReturnType<typeof selectAdminOrders>["execute"]>>[number];

function toAdminOrder(r: AdminOrderRow): AdminSpotlightOrder {
  return {
    ...toOrder(r),
    reporter: {
      id: r.order.reporterId,
      username: r.reporterUsername ?? "",
      name: r.reporterName,
      image: r.reporterImage,
      reporterLevel: toReporterLevel(r.reporterLevel),
    },
    grantedBy: r.granterId ? { id: r.granterId, username: r.granterUsername, name: r.granterName ?? "" } : null,
  };
}

export async function listAdminOrders(opts: { status: AdminOrderFilter; cursor: string | undefined; limit: number }): Promise<Page<AdminSpotlightOrder>> {
  await expireSpotlights();
  const cursor = decodeCursor(opts.cursor);
  const conditions: SQL[] = [];
  const filter = ORDER_FILTERS[opts.status];
  if (filter) conditions.push(filter);
  if (cursor) {
    if (!isUuid(cursor.id)) throw new ApiError(400, "invalid_cursor", "Invalid pagination cursor");
    conditions.push(sql`(${spotlightOrder.createdAt}, ${spotlightOrder.id}) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::uuid)`);
  }
  const rows = await selectAdminOrders()
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(spotlightOrder.createdAt), desc(spotlightOrder.id))
    .limit(opts.limit + 1);
  const hasMore = rows.length > opts.limit;
  const items = hasMore ? rows.slice(0, opts.limit) : rows;
  const last = items.at(-1);
  return {
    items: items.map(toAdminOrder),
    nextCursor: hasMore && last ? encodeCursor(last.order.createdAt, last.order.id) : null,
  };
}

async function adminOrder(orderId: string): Promise<AdminSpotlightOrder> {
  const [row] = await selectAdminOrders().where(eq(spotlightOrder.id, orderId)).limit(1);
  if (!row) throw notFound("Spotlight request not found");
  return toAdminOrder(row);
}

/** Grant (comped / paid by hand): the boost runs from now for the package's hours. */
export async function grantOrder(actor: Actor, orderId: string, note: string | null): Promise<AdminSpotlightOrder> {
  if (!isUuid(orderId)) throw notFound("Spotlight request not found");
  await db.transaction(async (tx) => {
    const [order] = await tx.select().from(spotlightOrder).where(eq(spotlightOrder.id, orderId)).for("update").limit(1);
    if (!order) throw notFound("Spotlight request not found");
    if (order.status !== "pending") throw new ApiError(409, "not_pending", "Only pending requests can be granted");
    const now = new Date();
    await tx
      .update(spotlightOrder)
      .set({ status: "granted", startsAt: now, endsAt: new Date(now.getTime() + order.hours * 3_600_000), grantedBy: actor.id, decidedAt: now, note, updatedAt: now })
      .where(eq(spotlightOrder.id, orderId));
    const [story] = await tx.select({ title: article.title }).from(article).where(eq(article.id, order.articleId)).limit(1);
    await writeAudit(tx, {
      actorId: actor.id,
      action: "spotlight.grant",
      targetType: "spotlight_order",
      targetId: orderId,
      targetLabel: story?.title ?? null,
      meta: { articleId: order.articleId, hours: order.hours, priceInr: order.priceInr, note },
    });
  });
  return adminOrder(orderId);
}

export async function declineOrder(actor: Actor, orderId: string, note: string | null): Promise<AdminSpotlightOrder> {
  if (!isUuid(orderId)) throw notFound("Spotlight request not found");
  await db.transaction(async (tx) => {
    const [order] = await tx.select().from(spotlightOrder).where(eq(spotlightOrder.id, orderId)).for("update").limit(1);
    if (!order) throw notFound("Spotlight request not found");
    if (order.status !== "pending") throw new ApiError(409, "not_pending", "Only pending requests can be declined");
    const now = new Date();
    await tx.update(spotlightOrder).set({ status: "declined", decidedAt: now, grantedBy: actor.id, note, updatedAt: now }).where(eq(spotlightOrder.id, orderId));
    const [story] = await tx.select({ title: article.title }).from(article).where(eq(article.id, order.articleId)).limit(1);
    await writeAudit(tx, {
      actorId: actor.id,
      action: "spotlight.decline",
      targetType: "spotlight_order",
      targetId: orderId,
      targetLabel: story?.title ?? null,
      meta: { articleId: order.articleId, note },
    });
  });
  return adminOrder(orderId);
}

export type PackageData = z.output<typeof spotlightPackageSchema>;
export type PackageUpdateData = z.output<typeof spotlightPackageUpdateSchema>;

export async function createPackage(actor: Actor, input: PackageData): Promise<SpotlightPackage> {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(spotlightPackage).values(input).returning();
    if (!row) throw new ApiError(500, "internal_error", "Package could not be saved");
    await writeAudit(tx, {
      actorId: actor.id,
      action: "spotlight.package_create",
      targetType: "spotlight_package",
      targetId: row.id,
      targetLabel: row.name,
      meta: { hours: row.hours, priceInr: row.priceInr, active: row.active },
    });
    return toPackage(row);
  });
}

export async function updatePackage(actor: Actor, id: string, input: PackageUpdateData): Promise<SpotlightPackage> {
  if (!isUuid(id)) throw notFound("Package not found");
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(spotlightPackage).where(eq(spotlightPackage.id, id)).for("update").limit(1);
    if (!before) throw notFound("Package not found");
    const [row] = await tx
      .update(spotlightPackage)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(spotlightPackage.id, id))
      .returning();
    if (!row) throw notFound("Package not found");
    await writeAudit(tx, {
      actorId: actor.id,
      action: "spotlight.package_update",
      targetType: "spotlight_package",
      targetId: id,
      targetLabel: row.name,
      meta: { hours: row.hours, priceInr: row.priceInr, active: row.active, previousPriceInr: before.priceInr },
    });
    return toPackage(row);
  });
}

/** Orders keep their snapshot (name, hours, price) when a package is deleted. */
export async function deletePackage(actor: Actor, id: string): Promise<void> {
  if (!isUuid(id)) throw notFound("Package not found");
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(spotlightPackage).where(eq(spotlightPackage.id, id)).returning();
    if (!row) throw notFound("Package not found");
    await writeAudit(tx, { actorId: actor.id, action: "spotlight.package_delete", targetType: "spotlight_package", targetId: id, targetLabel: row.name });
  });
}
