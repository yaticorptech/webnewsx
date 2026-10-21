import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, type Executor } from "../db/client.js";
import { pressMeetFeePayment, pressMeetReport, siteSetting } from "../db/schema.js";
import { env } from "../env.js";
import { writeAudit } from "../lib/audit.js";
import { ApiError, notFound, validationError } from "../lib/errors.js";
import {
  PRESS_MEET_REPORT,
  type AdminPlatformFee,
  type AdminPressMeetRow,
  type PlatformFeePayment,
  type PlatformFeeQuote,
  type PressMeetReportFile,
} from "../shared/contracts.js";
import type { Viewer } from "../types.js";

/*
 * What booking a press meet needs besides the slot and reporters (owner 2026-10-05): the organizer's press meet report
 * (a private file) and the platform fee — its amount set by the Editor Desk, paid with the `test` provider until online
 * payments are connected (no money moves). Both are made first, then linked to the press meet when it is scheduled.
 */

const FEE_KEY = "press_meet.platform_fee";
const REPORT_MB = PRESS_MEET_REPORT.maxBytes / (1024 * 1024);
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/* ─────────────── Platform fee ─────────────── */

async function feeSetting(executor: Executor = db): Promise<{ amountInr: number; updatedAt: Date | null }> {
  const [row] = await executor.select().from(siteSetting).where(eq(siteSetting.key, FEE_KEY)).limit(1);
  const amount = (row?.value as { amountInr?: unknown } | undefined)?.amountInr;
  return { amountInr: typeof amount === "number" && Number.isInteger(amount) && amount >= 0 ? amount : 0, updatedAt: row?.updatedAt ?? null };
}

export async function platformFeeQuote(): Promise<PlatformFeeQuote> {
  return { amountInr: (await feeSetting()).amountInr, provider: "test" };
}

export async function adminPlatformFee(): Promise<AdminPlatformFee> {
  const { amountInr, updatedAt } = await feeSetting();
  return { amountInr, updatedAt: updatedAt?.toISOString() ?? null };
}

/** The Editor Desk sets the fee (whole ₹; 0 = free); audited. */
export async function setPlatformFee(actorId: string, amountInr: number): Promise<AdminPlatformFee> {
  return db.transaction(async (tx) => {
    const before = await feeSetting(tx);
    const now = new Date();
    await tx
      .insert(siteSetting)
      .values({ key: FEE_KEY, value: { amountInr }, updatedBy: actorId, updatedAt: now })
      .onConflictDoUpdate({ target: siteSetting.key, set: { value: { amountInr }, updatedBy: actorId, updatedAt: now } });
    await writeAudit(tx, {
      actorId,
      action: "press_meet.platform_fee",
      targetType: "setting",
      targetId: FEE_KEY,
      targetLabel: "Press meet platform fee",
      meta: { amountInr, previousAmountInr: before.amountInr },
    });
    return { amountInr, updatedAt: now.toISOString() };
  });
}

const toPayment = (row: typeof pressMeetFeePayment.$inferSelect): PlatformFeePayment => ({
  id: row.id,
  amountInr: row.amountInr,
  provider: row.provider,
  paidAt: row.paidAt.toISOString(),
});

/**
 * "Pay platform fee": a `test` payment of the current fee (no money moves). An unused payment of the same amount is
 * handed back instead of a second one (a double tap, a reload, a booking that failed after paying).
 */
export async function payPlatformFee(viewer: Viewer): Promise<PlatformFeePayment> {
  const { amountInr } = await feeSetting();
  if (amountInr === 0) throw new ApiError(409, "no_platform_fee", "There's no platform fee to pay right now");
  const [unused] = await db
    .select()
    .from(pressMeetFeePayment)
    .where(and(eq(pressMeetFeePayment.userId, viewer.id), isNull(pressMeetFeePayment.pressMeetId), eq(pressMeetFeePayment.amountInr, amountInr)))
    .limit(1);
  if (unused) return toPayment(unused);
  const [row] = await db
    .insert(pressMeetFeePayment)
    .values({ userId: viewer.id, amountInr, provider: "test", providerRef: `test_${randomUUID()}` })
    .returning();
  if (!row) throw new ApiError(500, "payment_failed", "Couldn't take the platform fee");
  return toPayment(row);
}

/* ─────────────── Report file ─────────────── */

type ReportKind = { mime: string; ext: string };

/** What the bytes are (never the browser's word for it): PDF, Word (.doc / .docx), JPG or PNG. */
function sniffReport(bytes: Uint8Array, name: string): ReportKind | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  const lower = name.toLowerCase();
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return { mime: "application/pdf", ext: "pdf" };
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { mime: "image/png", ext: "png" };
  if (starts(0xff, 0xd8, 0xff)) return { mime: "image/jpeg", ext: "jpg" };
  if (starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1) && lower.endsWith(".doc")) return { mime: "application/msword", ext: "doc" };
  // A .docx is a zip with a word/ folder (its entry names are stored as plain text).
  if (starts(0x50, 0x4b, 0x03, 0x04) && lower.endsWith(".docx") && Buffer.from(bytes).includes("word/")) {
    return { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" };
  }
  return null;
}

/** A tidy display name with the right extension: no folders or control characters, at most 120 characters. */
function displayName(raw: string, ext: string): string {
  const base = (raw.split(/[\\/]/).pop() ?? "").replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  const stem = base.replace(/\.[^.]*$/, "").slice(0, 110) || "report";
  return `${stem}.${ext}`;
}

const reportPath = (id: string) => join(env.PRESS_MEET_REPORTS_DIR, id);

const toReport = (row: typeof pressMeetReport.$inferSelect): PressMeetReportFile => ({
  id: row.id,
  fileName: row.fileName,
  mime: row.mime,
  sizeBytes: row.sizeBytes,
});

/** Stores an organizer's report (≤ 10 MB, PDF / Word / JPG / PNG); linked to the press meet when it's scheduled. */
export async function saveReport(viewer: Viewer, file: unknown): Promise<PressMeetReportFile> {
  if (!(file instanceof File) || file.size === 0) throw validationError({ file: "Choose the report to upload" });
  if (file.size > PRESS_MEET_REPORT.maxBytes) throw new ApiError(413, "file_too_large", `The report must be ${REPORT_MB} MB or smaller`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffReport(bytes, file.name);
  if (!kind) throw new ApiError(415, "unsupported_report", "Upload the report as a PDF, a Word file (.doc, .docx) or a JPG / PNG image");
  const id = randomUUID();
  await mkdir(env.PRESS_MEET_REPORTS_DIR, { recursive: true });
  await writeFile(reportPath(id), bytes);
  try {
    const [row] = await db
      .insert(pressMeetReport)
      .values({ id, userId: viewer.id, fileName: displayName(file.name, kind.ext), mime: kind.mime, sizeBytes: bytes.byteLength })
      .returning();
    if (!row) throw new ApiError(500, "upload_failed", "Couldn't save the report");
    return toReport(row);
  } catch (error) {
    await rm(reportPath(id), { force: true });
    throw error;
  }
}

/* ─────────────── Booking ─────────────── */

/**
 * Inside the booking transaction: the organizer's own unused report is required, and a paid unused platform fee while
 * the fee isn't ₹0; both are then linked to the new press meet. Throws 422 with the field to fix.
 */
export async function attachBookingItems(
  tx: Executor,
  viewer: Viewer,
  meetId: string,
  { reportId, platformFeePaymentId }: { reportId: string; platformFeePaymentId: string | null },
): Promise<void> {
  const [report] = await tx
    .select({ id: pressMeetReport.id })
    .from(pressMeetReport)
    .where(and(eq(pressMeetReport.id, reportId), eq(pressMeetReport.userId, viewer.id), isNull(pressMeetReport.pressMeetId)))
    .for("update")
    .limit(1);
  if (!report) throw new ApiError(422, "report_required", "Upload the press meet report", { reportId: "Upload the press meet report" });

  const { amountInr } = await feeSetting(tx);
  const payment = platformFeePaymentId
    ? (
        await tx
          .select({ id: pressMeetFeePayment.id })
          .from(pressMeetFeePayment)
          .where(
            and(eq(pressMeetFeePayment.id, platformFeePaymentId), eq(pressMeetFeePayment.userId, viewer.id), isNull(pressMeetFeePayment.pressMeetId)),
          )
          .for("update")
          .limit(1)
      )[0]
    : undefined;
  if (amountInr > 0 && !payment) {
    throw new ApiError(422, "platform_fee_required", "Pay the platform fee to schedule", { platformFeePaymentId: "Pay the platform fee" });
  }

  await tx.update(pressMeetReport).set({ pressMeetId: meetId }).where(eq(pressMeetReport.id, report.id));
  if (payment) await tx.update(pressMeetFeePayment).set({ pressMeetId: meetId }).where(eq(pressMeetFeePayment.id, payment.id));
}

/** A press meet's report and (for its organizer) the fee paid — for the detail page. */
export async function bookingExtras(meetId: string): Promise<{ report: PressMeetReportFile | null; platformFee: PlatformFeePayment | null }> {
  const [[report], [payment]] = await Promise.all([
    db.select().from(pressMeetReport).where(eq(pressMeetReport.pressMeetId, meetId)).limit(1),
    db.select().from(pressMeetFeePayment).where(eq(pressMeetFeePayment.pressMeetId, meetId)).limit(1),
  ]);
  return { report: report ? toReport(report) : null, platformFee: payment ? toPayment(payment) : null };
}

/**
 * The report file for GET /api/press-meets/:id/report: the organizer, any reporter invited to it and the Editor Desk
 * may open it; everyone else gets a 404.
 */
export async function readableReport(meetId: string, viewer: Viewer): Promise<PressMeetReportFile & { path: string }> {
  if (!isUuid(meetId)) throw notFound("Report not found");
  const rows = await db.execute<{ id: string; file_name: string; mime: string; size_bytes: number; allowed: boolean }>(sql`
    select r.id, r.file_name, r.mime, r.size_bytes,
      (m.organizer_id = ${viewer.id} or ${viewer.role === "admin"}
        or exists (select 1 from press_meet_invite i where i.press_meet_id = m.id and i.reporter_id = ${viewer.id})) as allowed
    from press_meet_report r join press_meet m on m.id = r.press_meet_id
    where r.press_meet_id = ${meetId}
  `);
  const [row] = [...rows];
  if (!row || !row.allowed) throw notFound("Report not found");
  return { id: row.id, fileName: row.file_name, mime: row.mime, sizeBytes: row.size_bytes, path: reportPath(row.id) };
}

/* ─────────────── Editor Desk list ─────────────── */

const DESK_PAGE = 30;

/** Every press meet, newest booking first, with its report and platform fee (Desk → Press meets). Offset cursor. */
export async function listDeskPressMeets(cursor?: string): Promise<{ items: AdminPressMeetRow[]; nextCursor: string | null }> {
  const offset = Math.max(0, Number.parseInt(cursor ?? "0", 10) || 0);
  const rows = await db.execute<{
    id: string;
    title: string;
    starts_at: string;
    status: AdminPressMeetRow["status"];
    platform: AdminPressMeetRow["platform"];
    organizer_id: string;
    username: string | null;
    name: string;
    image: string | null;
    reporters: number;
    total_amount: number;
    report_id: string | null;
    file_name: string | null;
    mime: string | null;
    size_bytes: number | null;
    payment_id: string | null;
    amount_inr: number | null;
    provider: PlatformFeePayment["provider"] | null;
    paid_at: string | null;
  }>(sql`
    select m.id, m.title, m.starts_at, m.status, m.platform, m.organizer_id, u.username, u.name, u.image,
      (select count(*) from press_meet_invite i where i.press_meet_id = m.id)::int as reporters,
      coalesce((select sum(i.price) from press_meet_invite i where i.press_meet_id = m.id and i.status <> 'declined'), 0)::int as total_amount,
      r.id as report_id, r.file_name, r.mime, r.size_bytes,
      f.id as payment_id, f.amount_inr, f.provider, f.paid_at
    from press_meet m
    join "user" u on u.id = m.organizer_id
    left join press_meet_report r on r.press_meet_id = m.id
    left join press_meet_fee_payment f on f.press_meet_id = m.id
    order by m.created_at desc, m.id
    limit ${DESK_PAGE + 1} offset ${offset}
  `);
  const list = [...rows];
  const iso = (value: string) => new Date(value).toISOString();
  return {
    items: list.slice(0, DESK_PAGE).map((row) => ({
      id: row.id,
      title: row.title,
      startsAt: iso(row.starts_at),
      status: row.status,
      platform: row.platform,
      organizer: { id: row.organizer_id, username: row.username ?? "", name: row.name, image: row.image },
      reporters: row.reporters,
      totalAmount: row.total_amount,
      report:
        row.report_id && row.file_name && row.mime && row.size_bytes !== null
          ? { id: row.report_id, fileName: row.file_name, mime: row.mime, sizeBytes: row.size_bytes }
          : null,
      platformFee:
        row.payment_id && row.amount_inr !== null && row.provider && row.paid_at
          ? { id: row.payment_id, amountInr: row.amount_inr, provider: row.provider, paidAt: iso(row.paid_at) }
          : null,
    })),
    nextCursor: list.length > DESK_PAGE ? String(offset + DESK_PAGE) : null,
  };
}
