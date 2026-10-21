import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { membershipPayout } from "../db/schema.js";
import { notFound } from "../lib/errors.js";
import { toReporterLevel } from "../lib/roles.js";
import {
  MEMBERSHIP_FEE_PERCENT,
  type AdminMemberships,
  type AuthorSummary,
  type MembershipEarnings,
  type MembershipPaymentRow,
  type MembershipPayoutInput,
  type MyMemberships,
} from "../shared/contracts.js";

/*
 * Membership dashboards (owner 2026-10-15): what a member has bought (Settings → My memberships), what a reporter
 * earns (Settings → Premium membership) and what the Editor Desk owes each reporter (Desk → Memberships), with the
 * payouts the desk records. Only `paid` payments count. Amounts in paise; net = amount − WebNEWS's fee.
 */

const iso = (value: unknown): string => new Date(value as string | number | Date).toISOString();
const isoOrNull = (value: unknown): string | null => (value ? iso(value) : null);
const num = (value: unknown): number => Number(value ?? 0);

type PersonRow = { id: string; username: string | null; name: string; image: string | null };
const person = (p: PersonRow): AuthorSummary => ({ id: p.id, username: p.username ?? "", name: p.name, image: p.image });

type PaymentDb = {
  id: string;
  paid_at: string;
  period_start: string | null;
  period_end: string | null;
  amount_paise: number;
  fee_paise: number;
  provider: "test" | "razorpay";
};
const payment = (row: PaymentDb): MembershipPaymentRow => ({
  id: row.id,
  paidAt: iso(row.paid_at),
  periodStart: isoOrNull(row.period_start),
  periodEnd: isoOrNull(row.period_end),
  amountPaise: num(row.amount_paise),
  feePaise: num(row.fee_paise),
  netPaise: num(row.amount_paise) - num(row.fee_paise),
  provider: row.provider,
});

/* ─────────────── The member ─────────────── */

export async function listMyMemberships(memberId: string): Promise<MyMemberships> {
  const rows = [
    ...(await db.execute<PaymentDb & { reporter: PersonRow & { level: string | null; price: number | null } }>(sql`
      select p.id, p.paid_at, p.period_start, p.period_end, p.amount_paise, p.fee_paise, p.provider,
        json_build_object('id', u.id, 'username', u.username, 'name', u.name, 'image', u.image,
          'level', case when u.role = 'admin' then 'verified' else u.reporter_level end, 'price', u.membership_price) as reporter
      from membership_payment p join "user" u on u.id = p.reporter_id
      where p.member_id = ${memberId} and p.status = 'paid'
      order by p.paid_at desc`)),
  ];
  const byReporter = new Map<string, MyMemberships["items"][number]>();
  const now = Date.now();
  for (const row of rows) {
    const pay = payment(row);
    let item = byReporter.get(row.reporter.id);
    if (!item) {
      item = {
        reporter: { ...person(row.reporter), reporterLevel: toReporterLevel(row.reporter.level) },
        priceInr: row.reporter.price ?? null,
        memberSince: pay.periodStart ?? pay.paidAt,
        validUntil: pay.periodEnd ?? pay.paidAt,
        active: false,
        totalPaidPaise: 0,
        payments: [],
      };
      byReporter.set(row.reporter.id, item);
    }
    item.payments.push(pay);
    item.totalPaidPaise += pay.amountPaise;
    const start = pay.periodStart ?? pay.paidAt;
    if (start < item.memberSince) item.memberSince = start;
    if (pay.periodEnd && pay.periodEnd > item.validUntil) item.validUntil = pay.periodEnd;
  }
  const items = [...byReporter.values()].map((item) => ({ ...item, active: Date.parse(item.validUntil) > now }));
  // Active first, then the latest-ending.
  items.sort((a, b) => Number(b.active) - Number(a.active) || b.validUntil.localeCompare(a.validUntil));
  return { items };
}

/* ─────────────── The reporter ─────────────── */

type MemberAgg = PersonRow & { since: string; until: string; payments: number; paid: number; net: number };

export async function getEarnings(reporterId: string): Promise<MembershipEarnings> {
  const [priceRow] = [...(await db.execute<{ price: number | null }>(sql`select membership_price as price from "user" where id = ${reporterId}`))];
  const [totals] = [
    ...(await db.execute<{ gross: number; fee: number; members: number; active: number }>(sql`
      select coalesce(sum(amount_paise), 0) as gross, coalesce(sum(fee_paise), 0) as fee,
        count(distinct member_id) as members,
        count(distinct member_id) filter (where period_end > now()) as active
      from membership_payment where reporter_id = ${reporterId} and status = 'paid'`)),
  ];
  const [paidOut] = [...(await db.execute<{ total: number }>(sql`select coalesce(sum(amount_paise), 0) as total from membership_payout where reporter_id = ${reporterId}`))];
  const monthly = [
    ...(await db.execute<{ month: string; net: number; payments: number }>(sql`
      with months as (
        select to_char(generate_series(date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '5 months',
          date_trunc('month', now() at time zone 'Asia/Kolkata'), interval '1 month'), 'YYYY-MM') as month
      )
      select m.month, coalesce(sum(p.amount_paise - p.fee_paise), 0) as net, count(p.id) as payments
      from months m left join membership_payment p
        on p.reporter_id = ${reporterId} and p.status = 'paid' and to_char(p.paid_at at time zone 'Asia/Kolkata', 'YYYY-MM') = m.month
      group by m.month order by m.month`)),
  ];
  const members = [
    ...(await db.execute<MemberAgg>(sql`
      select u.id, u.username, u.name, u.image,
        min(coalesce(p.period_start, p.paid_at)) as since, max(p.period_end) as until,
        count(*) as payments, sum(p.amount_paise) as paid, sum(p.amount_paise - p.fee_paise) as net
      from membership_payment p join "user" u on u.id = p.member_id
      where p.reporter_id = ${reporterId} and p.status = 'paid'
      group by u.id order by max(p.period_end) desc limit 200`)),
  ];
  const recent = [
    ...(await db.execute<PaymentDb & { member: PersonRow }>(sql`
      select p.id, p.paid_at, p.period_start, p.period_end, p.amount_paise, p.fee_paise, p.provider,
        json_build_object('id', u.id, 'username', u.username, 'name', u.name, 'image', u.image) as member
      from membership_payment p join "user" u on u.id = p.member_id
      where p.reporter_id = ${reporterId} and p.status = 'paid' order by p.paid_at desc limit 50`)),
  ];
  const payouts = [
    ...(await db.execute<{ id: string; amount_paise: number; reference: string | null; note: string | null; paid_at: string }>(sql`
      select id, amount_paise, reference, note, paid_at from membership_payout where reporter_id = ${reporterId} order by paid_at desc limit 50`)),
  ];
  const gross = num(totals?.gross);
  const fee = num(totals?.fee);
  const net = gross - fee;
  const out = num(paidOut?.total);
  const now = Date.now();
  return {
    priceInr: priceRow?.price ?? null,
    feePercent: MEMBERSHIP_FEE_PERCENT,
    activeMembers: num(totals?.active),
    totalMembers: num(totals?.members),
    grossPaise: gross,
    feePaise: fee,
    netPaise: net,
    paidOutPaise: out,
    balancePaise: net - out,
    monthly: monthly.map((m) => ({ month: m.month, netPaise: num(m.net), payments: num(m.payments) })),
    members: members.map((m) => ({
      member: person(m),
      memberSince: iso(m.since),
      validUntil: iso(m.until),
      active: Date.parse(iso(m.until)) > now,
      payments: num(m.payments),
      paidPaise: num(m.paid),
      netPaise: num(m.net),
    })),
    recent: recent.map((row) => ({ ...payment(row), member: person(row.member) })),
    payouts: payouts.map((p) => ({ id: p.id, amountPaise: num(p.amount_paise), reference: p.reference, note: p.note, paidAt: iso(p.paid_at) })),
  };
}

/* ─────────────── The Editor Desk ─────────────── */

export async function getAdminMemberships(): Promise<AdminMemberships> {
  const [totals] = [
    ...(await db.execute<{ gross: number; fee: number; active: number; payments: number; test: number }>(sql`
      select coalesce(sum(amount_paise), 0) as gross, coalesce(sum(fee_paise), 0) as fee,
        count(distinct (member_id, reporter_id)) filter (where period_end > now()) as active,
        count(*) as payments, count(*) filter (where provider = 'test') as test
      from membership_payment where status = 'paid'`)),
  ];
  const [paidOut] = [...(await db.execute<{ total: number }>(sql`select coalesce(sum(amount_paise), 0) as total from membership_payout`))];
  const reporters = [
    ...(await db.execute<PersonRow & {
      email: string | null; price: number | null; active: number; members: number; gross: number; fee: number; out: number; last: string | null;
    }>(sql`
      select u.id, u.username, u.name, u.image, u.email, u.membership_price as price,
        count(distinct p.member_id) filter (where p.period_end > now()) as active,
        count(distinct p.member_id) as members,
        sum(p.amount_paise) as gross, sum(p.fee_paise) as fee,
        coalesce((select sum(o.amount_paise) from membership_payout o where o.reporter_id = u.id), 0) as out,
        max(p.paid_at) as last
      from membership_payment p join "user" u on u.id = p.reporter_id
      where p.status = 'paid'
      group by u.id
      order by (sum(p.amount_paise) - sum(p.fee_paise)
        - coalesce((select sum(o.amount_paise) from membership_payout o where o.reporter_id = u.id), 0)) desc`)),
  ];
  const recent = [
    ...(await db.execute<PaymentDb & { member: PersonRow; reporter: PersonRow }>(sql`
      select p.id, p.paid_at, p.period_start, p.period_end, p.amount_paise, p.fee_paise, p.provider,
        json_build_object('id', m.id, 'username', m.username, 'name', m.name, 'image', m.image) as member,
        json_build_object('id', r.id, 'username', r.username, 'name', r.name, 'image', r.image) as reporter
      from membership_payment p join "user" m on m.id = p.member_id join "user" r on r.id = p.reporter_id
      where p.status = 'paid' order by p.paid_at desc limit 100`)),
  ];
  const payouts = [
    ...(await db.execute<{ id: string; amount_paise: number; reference: string | null; note: string | null; paid_at: string; reporter: PersonRow }>(sql`
      select o.id, o.amount_paise, o.reference, o.note, o.paid_at,
        json_build_object('id', r.id, 'username', r.username, 'name', r.name, 'image', r.image) as reporter
      from membership_payout o join "user" r on r.id = o.reporter_id order by o.paid_at desc limit 100`)),
  ];
  const gross = num(totals?.gross);
  const fee = num(totals?.fee);
  const out = num(paidOut?.total);
  return {
    totals: {
      grossPaise: gross,
      feePaise: fee,
      netPaise: gross - fee,
      paidOutPaise: out,
      balancePaise: gross - fee - out,
      activeMemberships: num(totals?.active),
      payments: num(totals?.payments),
      testPayments: num(totals?.test),
    },
    reporters: reporters.map((r) => {
      const net = num(r.gross) - num(r.fee);
      return {
        reporter: { ...person(r), email: r.email },
        priceInr: r.price ?? null,
        activeMembers: num(r.active),
        totalMembers: num(r.members),
        grossPaise: num(r.gross),
        feePaise: num(r.fee),
        netPaise: net,
        paidOutPaise: num(r.out),
        balancePaise: net - num(r.out),
        lastPaymentAt: isoOrNull(r.last),
      };
    }),
    recent: recent.map((row) => ({ ...payment(row), member: person(row.member), reporter: person(row.reporter) })),
    payouts: payouts.map((p) => ({
      id: p.id,
      amountPaise: num(p.amount_paise),
      reference: p.reference,
      note: p.note,
      paidAt: iso(p.paid_at),
      reporter: person(p.reporter),
    })),
  };
}

/** The desk records money sent to a reporter. */
export async function recordPayout(input: MembershipPayoutInput & { amountInr: number }, adminId: string): Promise<void> {
  const [reporter] = [...(await db.execute<{ id: string }>(sql`select id from "user" where id = ${input.reporterId}`))];
  if (!reporter) throw notFound("Reporter not found");
  await db.insert(membershipPayout).values({
    reporterId: input.reporterId,
    amountPaise: Math.round(input.amountInr * 100),
    reference: input.reference?.trim() || null,
    note: input.note?.trim() || null,
    createdBy: adminId,
  });
}
