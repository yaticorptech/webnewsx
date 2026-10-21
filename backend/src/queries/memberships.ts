import { randomUUID } from "node:crypto";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db, type Executor } from "../db/client.js";
import { article, membershipPayment, siteSetting, user, type UserRecord } from "../db/schema.js";
import { env } from "../env.js";
import { ApiError, notFound } from "../lib/errors.js";
import { writeAudit } from "../lib/audit.js";
import { publishEvent } from "../lib/events.js";
import { createRazorpayOrder, razorpayEnabled, razorpaySignatureValid } from "../lib/payments.js";
import { toReporterLevel } from "../lib/roles.js";
import {
  MEMBERSHIP_DAYS,
  MEMBERSHIP_FEE_PERCENT,
  MEMBERSHIP_REMIND_DAYS,
  DEFAULT_MEMBERSHIP_RULES,
  MEMBERSHIP_RULE_METRIC_VALUES,
  membershipRuleTitle,
  type AdminMembershipRules,
  type MembershipRule,
  membershipSplit,
  type MembershipCheckout,
  type MembershipEligibility,
  type MembershipOrder,
  type ProfileData,
} from "../shared/contracts.js";
import type { Viewer } from "../types.js";
import { visibleWhere } from "./articles.js";
import { findProfileUser } from "./users.js";

/*
 * Premium membership (owner 2026-10-14, "like YouTube"): readers pay a reporter's monthly price through Razorpay and
 * read that reporter's members-only stories for MEMBERSHIP_DAYS; paying again adds the days on. WebNEWS keeps
 * MEMBERSHIP_FEE_PERCENT of the price. Without Razorpay keys, development uses the `test` provider (no money moves);
 * production refuses until the keys are set.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

type Provider = MembershipCheckout["provider"];
const provider = (): Provider => (razorpayEnabled() ? "razorpay" : env.isProduction ? null : "test");

/** When the member's current membership of `reporterId` ends (null = not a member). */
export async function activeUntil(memberId: string, reporterId: string, executor: Executor = db): Promise<Date | null> {
  const [row] = await executor
    .select({ end: sql<Date | null>`max(${membershipPayment.periodEnd})`.mapWith((v) => (v ? new Date(v) : null)) })
    .from(membershipPayment)
    .where(and(eq(membershipPayment.memberId, memberId), eq(membershipPayment.reporterId, reporterId), eq(membershipPayment.status, "paid")));
  const end = row?.end ?? null;
  return end && end.getTime() > Date.now() ? end : null;
}

/** The profile's membership block: price, members-only story count, the viewer's end date. */
export async function profileMembership(reporter: Pick<UserRecord, "id" | "membershipPrice">, viewerId: string | null): Promise<NonNullable<ProfileData["membership"]>> {
  const [[premium], until] = await Promise.all([
    db
      .select({ n: count() })
      .from(article)
      .innerJoin(user, eq(user.id, article.authorId))
      .where(and(visibleWhere(), eq(article.authorId, reporter.id), eq(article.premium, true))),
    viewerId && viewerId !== reporter.id ? activeUntil(viewerId, reporter.id) : Promise.resolve(null),
  ]);
  return { priceInr: reporter.membershipPrice, premiumCount: premium?.n ?? 0, activeUntil: until?.toISOString() ?? null };
}

/** The reporter a viewer can buy a membership of (onboarded, not suspended, a reporter with a price, not themselves). */
async function sellingReporter(username: string, viewer: Viewer): Promise<UserRecord & { membershipPrice: number }> {
  const reporter = await findProfileUser(username.toLowerCase());
  if (!reporter || reporter.role === "reader") throw notFound("Reporter not found");
  if (reporter.id === viewer.id) throw new ApiError(409, "own_membership", "You can't buy your own membership");
  if (!reporter.membershipPrice) throw new ApiError(409, "membership_unavailable", "This reporter doesn't offer a membership yet");
  return reporter as UserRecord & { membershipPrice: number };
}

export async function getCheckout(username: string, viewer: Viewer): Promise<MembershipCheckout> {
  const reporter = await sellingReporter(username, viewer);
  const until = await activeUntil(viewer.id, reporter.id);
  return {
    reporter: {
      id: reporter.id,
      username: reporter.username ?? "",
      name: reporter.name,
      image: reporter.image,
      reporterLevel: reporter.role === "admin" ? "verified" : toReporterLevel(reporter.reporterLevel),
    },
    priceInr: reporter.membershipPrice,
    ...membershipSplit(reporter.membershipPrice),
    feePercent: MEMBERSHIP_FEE_PERCENT,
    days: MEMBERSHIP_DAYS,
    activeUntil: until?.toISOString() ?? null,
    provider: provider(),
  };
}

/** Marks a payment paid and gives it its period: from the end of the current membership (or now) for MEMBERSHIP_DAYS. */
async function grant(paymentId: string, memberId: string, reporterId: string, providerPaymentId: string | null): Promise<Date> {
  return db.transaction(async (tx) => {
    // One grant at a time per member + reporter, so two payments never get the same period.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`membership:${memberId}:${reporterId}`}))`);
    const [row] = await tx.select().from(membershipPayment).where(eq(membershipPayment.id, paymentId)).for("update").limit(1);
    if (!row) throw notFound("Payment not found");
    if (row.status === "paid" && row.periodEnd) return row.periodEnd;
    const now = new Date();
    const current = await activeUntil(memberId, reporterId, tx);
    const start = current && current > now ? current : now;
    const end = new Date(start.getTime() + MEMBERSHIP_DAYS * DAY_MS);
    await tx
      .update(membershipPayment)
      .set({ status: "paid", paidAt: now, periodStart: start, periodEnd: end, providerPaymentId })
      .where(eq(membershipPayment.id, paymentId));
    return end;
  });
}

/** "Pay now": a Razorpay order for Checkout, or — `test` provider — a payment that is paid at once. */
export async function createOrder(viewer: Viewer, username: string): Promise<MembershipOrder> {
  const reporter = await sellingReporter(username, viewer);
  const how = provider();
  if (!how) throw new ApiError(503, "payments_unavailable", "Online payments aren't connected yet");
  const { totalPaise, feePaise } = membershipSplit(reporter.membershipPrice);
  const base = { memberId: viewer.id, reporterId: reporter.id, priceInr: reporter.membershipPrice, amountPaise: totalPaise, feePaise };

  if (how === "test") {
    const [row] = await db.insert(membershipPayment).values({ ...base, provider: "test", providerOrderId: `test_${randomUUID()}` }).returning();
    if (!row) throw new ApiError(500, "payment_failed", "Couldn't take the payment");
    return { kind: "paid", activeUntil: (await grant(row.id, viewer.id, reporter.id, null)).toISOString() };
  }

  const id = randomUUID();
  const orderId = await createRazorpayOrder({
    amountPaise: totalPaise,
    receipt: `m_${id.replace(/-/g, "").slice(0, 30)}`,
    notes: { membershipPaymentId: id, reporter: reporter.username ?? reporter.id, member: viewer.id },
  });
  await db.insert(membershipPayment).values({ ...base, id, provider: "razorpay", providerOrderId: orderId });
  return {
    kind: "razorpay",
    orderId,
    keyId: env.RAZORPAY_KEY_ID ?? "",
    amountPaise: totalPaise,
    currency: "INR",
    description: `Premium membership · ${reporter.name} · ${MEMBERSHIP_DAYS} days`,
    email: viewer.email,
    name: viewer.name,
  };
}

/** Checkout's success handler: checks Razorpay's signature, then grants the membership. */
export async function verifyPayment(
  viewer: Viewer,
  input: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
): Promise<{ activeUntil: string; username: string }> {
  if (!razorpayEnabled()) throw new ApiError(503, "payments_unavailable", "Online payments aren't connected yet");
  const [row] = await db
    .select({ id: membershipPayment.id, reporterId: membershipPayment.reporterId, username: user.username })
    .from(membershipPayment)
    .innerJoin(user, eq(user.id, membershipPayment.reporterId))
    .where(and(eq(membershipPayment.providerOrderId, input.razorpayOrderId), eq(membershipPayment.memberId, viewer.id)))
    .orderBy(desc(membershipPayment.createdAt))
    .limit(1);
  if (!row) throw notFound("Payment not found");
  if (!razorpaySignatureValid(input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature)) {
    throw new ApiError(400, "payment_invalid", "We couldn't confirm this payment");
  }
  const end = await grant(row.id, viewer.id, row.reporterId, input.razorpayPaymentId);
  return { activeUntil: end.toISOString(), username: row.username ?? "" };
}

/*
 * Renewal reminders (owner 2026-10-16: "after it ends they should get notified to renew"): there is no auto-debit, so
 * each member hears — in the bell, as a popup and as a phone push (the push worker sends every bell row) — when their
 * membership ends within MEMBERSHIP_REMIND_DAYS, and again once it has ended. Only for a member's latest period (a
 * renewal moves the reminders to the new one) and only for periods that ended in the last week (no old backlog).
 */
export async function sendRenewalReminders(): Promise<void> {
  const rows = await db.transaction(async (tx) => {
    // One API instance at a time.
    const [lock] = [...(await tx.execute<{ ok: boolean }>(sql`select pg_try_advisory_xact_lock(hashtext('membership-reminders')) as ok`))];
    if (!lock?.ok) return [];
    return [
      ...(await tx.execute<{ user_id: string }>(sql`
      with latest as (
        select distinct on (p.member_id, p.reporter_id) p.id, p.member_id, p.reporter_id, p.period_end, p.ending_notified_at, p.ended_notified_at
        from membership_payment p
        where p.status = 'paid' and p.period_end > now() - interval '7 days'
        order by p.member_id, p.reporter_id, p.period_end desc
      ), due as (
        select l.id, l.member_id, l.reporter_id,
          case when l.period_end <= now() then 'membership_ended' else 'membership_ending' end as type,
          greatest(ceil(extract(epoch from (l.period_end - now())) / 86400), 0)::int as days_left
        from latest l
        where (l.period_end <= now() and l.ended_notified_at is null)
          or (l.period_end > now() and l.period_end <= now() + ${`${MEMBERSHIP_REMIND_DAYS} days`}::interval and l.ending_notified_at is null)
      ), marked as (
        update membership_payment p set
          ending_notified_at = case when d.type = 'membership_ending' then now() else coalesce(p.ending_notified_at, now()) end,
          ended_notified_at = case when d.type = 'membership_ended' then now() else p.ended_notified_at end
        from due d where p.id = d.id
        returning d.member_id, d.reporter_id, d.type, d.days_left
      )
      insert into notification (user_id, type, actor_id, amount)
      select m.member_id, m.type, m.reporter_id, m.days_left from marked m
      returning user_id
    `)),
    ];
  });
  for (const userId of new Set(rows.map((row) => row.user_id))) await publishEvent(db, { t: "notify", id: userId });
}

/* ─────────────── Who may start a membership (owner 2026-10-16) ─────────────── */

const IST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

const RULES_KEY = "membership.rules";

/** The Desk's rules (DEFAULT_MEMBERSHIP_RULES until it saves its own). Unknown kinds in the stored list are skipped. */
export async function membershipRules(executor: Executor = db): Promise<{ rules: MembershipRule[]; updatedAt: Date | null }> {
  const [row] = await executor.select().from(siteSetting).where(eq(siteSetting.key, RULES_KEY)).limit(1);
  const stored = (row?.value as { rules?: unknown } | undefined)?.rules;
  if (!Array.isArray(stored)) return { rules: DEFAULT_MEMBERSHIP_RULES, updatedAt: row?.updatedAt ?? null };
  const rules = stored.filter(
    (rule): rule is MembershipRule =>
      typeof rule === "object" &&
      rule !== null &&
      (MEMBERSHIP_RULE_METRIC_VALUES as string[]).includes((rule as MembershipRule).metric) &&
      Number.isInteger((rule as MembershipRule).value) &&
      typeof (rule as MembershipRule).enabled === "boolean",
  );
  return { rules, updatedAt: row?.updatedAt ?? null };
}

export async function adminMembershipRules(): Promise<AdminMembershipRules> {
  const { rules, updatedAt } = await membershipRules();
  return { rules, updatedAt: updatedAt?.toISOString() ?? null };
}

/** The Desk saves the whole list (audited with before / after). */
export async function setMembershipRules(actorId: string, rules: MembershipRule[]): Promise<AdminMembershipRules> {
  return db.transaction(async (tx) => {
    const before = await membershipRules(tx);
    const now = new Date();
    const value = { rules: rules.map((rule) => ({ ...rule, value: rule.metric === "verified" ? 1 : rule.value })) };
    await tx
      .insert(siteSetting)
      .values({ key: RULES_KEY, value, updatedBy: actorId, updatedAt: now })
      .onConflictDoUpdate({ target: siteSetting.key, set: { value, updatedBy: actorId, updatedAt: now } });
    await writeAudit(tx, {
      actorId,
      action: "membership.rules",
      targetType: "setting",
      targetId: RULES_KEY,
      targetLabel: "Premium membership rules",
      meta: { rules: describeRules(value.rules), previous: describeRules(before.rules) },
    });
    return { rules: value.rules, updatedAt: now.toISOString() };
  });
}

/** "Have 100 followers · Publish on 30 days" — for the audit log (switched-off rules left out). */
const describeRules = (rules: MembershipRule[]) =>
  rules
    .filter((rule) => rule.enabled)
    .map(membershipRuleTitle)
    .join(" · ") || "No rules";

/** Where a reporter stands on every switched-on rule; eligible when all are met (admins always are). */
export async function membershipEligibility(userId: string): Promise<MembershipEligibility> {
  const { rules } = await membershipRules();
  const today = IST_DATE.format(new Date());
  const [row] = [
    ...(await db.execute<{
      role: string;
      level: string | null;
      followers: number;
      days: number;
      today: boolean | null;
      stories: number;
      views: number;
      likes: number;
      age: number;
      since_warning: number | null;
    }>(sql`
      select u.role, u.reporter_level as level,
        (select count(*) from follow f where f.following_id = u.id)::int as followers,
        -- Every day (India time) with at least one live story — any days; several on one day count once.
        (select count(distinct (a.published_at at time zone 'Asia/Kolkata')::date) from article a
          where a.author_id = u.id and a.status = 'published' and a.published_at is not null)::int as days,
        (select bool_or(to_char(a.published_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') = ${today}) from article a
          where a.author_id = u.id and a.status = 'published')::boolean as today,
        (select count(*) from article a where a.author_id = u.id and a.status = 'published')::int as stories,
        (select coalesce(sum(a.view_count), 0) from article a where a.author_id = u.id and a.status = 'published')::int as views,
        (select coalesce(sum(a.like_count), 0) from article a where a.author_id = u.id and a.status = 'published')::int as likes,
        floor(extract(epoch from (now() - u.created_at)) / 86400)::int as age,
        (select floor(extract(epoch from (now() - max(n.created_at))) / 86400)::int from user_notice n
          where n.user_id = u.id and n.kind = 'warning') as since_warning
      from "user" u where u.id = ${userId}`)),
  ];
  const admin = row?.role === "admin";
  const current = (rule: MembershipRule): number => {
    if (!row) return 0;
    switch (rule.metric) {
      case "verified":
        return admin || row.level === "verified" ? 1 : 0;
      case "followers":
        return Number(row.followers);
      case "posting_days":
        return Number(row.days);
      case "stories":
        return Number(row.stories);
      case "views":
        return Number(row.views);
      case "likes":
        return Number(row.likes);
      case "account_age_days":
        return Number(row.age);
      case "no_warnings_days":
        // Never warned: met (counted as the whole window).
        return row.since_warning === null ? rule.value : Number(row.since_warning);
    }
  };
  const progress = rules
    .filter((rule) => rule.enabled)
    .map((rule) => {
      const target = rule.metric === "verified" ? 1 : rule.value;
      const now = current(rule);
      return { metric: rule.metric, title: membershipRuleTitle(rule), target, current: now, done: now >= target };
    });
  return { eligible: admin || progress.every((rule) => rule.done), rules: progress, postedToday: Boolean(row?.today) };
}
