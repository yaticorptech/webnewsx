import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase, db } from "../../src/db/client.js";
import {
  istDateKey,
  type NotificationsResponse,
  type PlatformFeePayment,
  type PlatformFeeQuote,
  type PressMeetDetail,
  type PressMeetReportFile,
  type PressMeetListResponse,
  type PressMeetReportersResponse,
  type PressMeetRoom,
  type PressMeetSlotsResponse,
} from "../../src/shared/contracts.js";
import { adminUser, cleanupFixtures, freshApp, json, onboardedUser, reporterUser, type Client, coverOf, LONG_BODY, PUBLISH_EXTRAS } from "../helpers.js";

const app = freshApp();

afterAll(async () => {
  await cleanupFixtures();
  await closeDatabase();
});

const bellTypes = async (c: Client) => (await json<NotificationsResponse>(await c.req("/api/me/notifications"))).items.map((n) => n.type);

async function freeSlot(c: Client, daysAhead: number, duration = 30): Promise<string> {
  const date = istDateKey(Date.now() + daysAhead * 24 * 3600_000);
  const res = await c.req(`/api/press-meets/slots?date=${date}&duration=${duration}`);
  expect(res.status).toBe(200);
  const slot = (await json<PressMeetSlotsResponse>(res)).slots.find((s) => s.available);
  if (!slot) throw new Error(`no free slot on ${date}`);
  return slot.start;
}

/** A one-page PDF's first bytes — enough for the report check (the file is never rendered). */
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");

async function uploadReport(c: Client, bytes: Uint8Array = PDF, name = "briefing.pdf"): Promise<Response> {
  const form = new FormData();
  form.set("file", new File([bytes], name, { type: "application/pdf" }));
  return c.req("/api/press-meets/report", { method: "POST", body: form });
}

/** What booking needs besides the slot and reporters (owner 2026-10-05): the report and the paid platform fee. */
async function bookingItems(c: Client): Promise<{ reportId: string; platformFeePaymentId: string | null }> {
  const up = await uploadReport(c);
  expect(up.status, await up.clone().text()).toBe(201);
  const { report } = await json<{ report: PressMeetReportFile }>(up);
  const fee = await json<PlatformFeeQuote>(await c.req("/api/press-meets/platform-fee"));
  if (fee.amountInr === 0) return { reportId: report.id, platformFeePaymentId: null };
  const paid = await c.req("/api/press-meets/platform-fee/pay", { method: "POST" });
  expect(paid.status, await paid.clone().text()).toBe(201);
  return { reportId: report.id, platformFeePaymentId: (await json<{ payment: PlatformFeePayment }>(paid)).payment.id };
}

describe("press meets", () => {
  it("book → invite → accept → live room → end → story → verify → pay → confirm", async () => {
    const organizer = await onboardedUser(app);
    const reporter = await reporterUser(app, { level: "verified" });
    const unpriced = await reporterUser(app, { level: "verified" });
    const stranger = await onboardedUser(app);
    expect((await reporter.req("/api/me/press-meet-price", { method: "PUT", json: { price: 1500 } })).status).toBe(200);

    // The reporter shows up with their price; one without a price can't be invited.
    const listed = await json<PressMeetReportersResponse>(await organizer.req(`/api/press-meets/reporters?q=${reporter.username}`));
    expect(listed.items.find((r) => r.id === reporter.userId)?.price).toBe(1500);

    const startsAt = await freeSlot(organizer, 3);
    const base = {
      title: "Launch of the city cycling plan",
      agenda: "Plan details and Q&A",
      startsAt,
      durationMinutes: 30,
      platform: "webnews",
      ...(await bookingItems(organizer)),
    };
    const refused = await organizer.req("/api/press-meets", { json: { ...base, reporterIds: [reporter.userId, unpriced.userId] } });
    expect(refused.status).toBe(422);

    const created = await organizer.req("/api/press-meets", { json: { ...base, reporterIds: [reporter.userId] } });
    expect(created.status, await created.clone().text()).toBe(201);
    const { id } = await json<{ id: string }>(created);

    // One press meet at a time per organizer (migration 0027): the same slot is now booked for them.
    const clash = await organizer.req("/api/press-meets", { json: { ...base, ...(await bookingItems(organizer)), reporterIds: [reporter.userId] } });
    expect(clash.status).toBe(409);
    const date = istDateKey(startsAt);
    const slots = await json<PressMeetSlotsResponse>(await organizer.req(`/api/press-meets/slots?date=${date}&duration=30`));
    expect(slots.slots.find((s) => s.start === startsAt)?.reason).toBe("booked");

    // Each person's notepad is private to them.
    expect(await json(await reporter.req(`/api/press-meets/${id}/notes`))).toEqual({ body: "", updatedAt: null });
    expect((await reporter.req(`/api/press-meets/${id}/notes`, { method: "PUT", json: { body: "Mayor: 40 km of lanes" } })).status).toBe(200);
    expect((await json<{ body: string }>(await reporter.req(`/api/press-meets/${id}/notes`))).body).toBe("Mayor: 40 km of lanes");
    expect((await json<{ body: string }>(await organizer.req(`/api/press-meets/${id}/notes`))).body).toBe("");
    expect((await stranger.req(`/api/press-meets/${id}/notes`)).status).toBe(404);

    // Only the organizer and invited reporters can see it.
    expect((await stranger.req(`/api/press-meets/${id}`)).status).toBe(404);
    expect(await bellTypes(reporter)).toContain("press_meet_invited");
    const invited = await json<PressMeetListResponse>(await reporter.req("/api/press-meets?scope=invited"));
    expect(invited.items[0]?.myInvite?.price).toBe(1500);

    expect((await reporter.req(`/api/press-meets/${id}/respond`, { json: { accept: true } })).status).toBe(200);
    expect(await bellTypes(organizer)).toContain("press_meet_accepted");

    // Too early to start; then pretend it's time.
    expect((await organizer.req(`/api/press-meets/${id}/start`, { json: { recordingConsent: true } })).status).toBe(409);
    await db.execute(sql`update press_meet set starts_at = now() - interval '1 minute', ends_at = now() + interval '29 minutes' where id = ${id}`);
    // No start without the recording consent (owner 2026-10-05).
    expect((await organizer.req(`/api/press-meets/${id}/start`, { json: {} })).status).toBe(400);
    expect((await organizer.req(`/api/press-meets/${id}/start`, { json: { recordingConsent: true } })).status).toBe(200);
    expect((await json<PressMeetDetail>(await reporter.req(`/api/press-meets/${id}`))).recordingConsentAt).not.toBeNull();
    expect(await bellTypes(reporter)).toContain("press_meet_live");

    // The room: both join, a signal is relayed, state and heartbeat work.
    const orgRoom = await json<PressMeetRoom>(
      await organizer.req(`/api/press-meets/${id}/room/join`, { json: { peerId: "organizer-tab-1", micOn: true, cameraOn: true } }),
    );
    expect(orgRoom.peers).toHaveLength(0);
    // Reporters agree that the press meet is recorded before they join (owner 2026-10-05).
    expect((await reporter.req(`/api/press-meets/${id}/room/join`, { json: { peerId: "reporter-tab-1", micOn: false, cameraOn: true } })).status).toBe(400);
    const repRoom = await json<PressMeetRoom>(
      await reporter.req(`/api/press-meets/${id}/room/join`, {
        json: { peerId: "reporter-tab-1", micOn: false, cameraOn: true, recordingConsent: true },
      }),
    );
    expect(repRoom.peers.map((p) => p.role)).toEqual(["organizer"]);
    expect(
      (await reporter.req(`/api/press-meets/${id}/room/signal`, {
        json: { from: "reporter-tab-1", to: "organizer-tab-1", kind: "offer", data: { type: "offer", sdp: "v=0" } },
      })).status,
    ).toBe(200);
    // Someone else's tab can't be used.
    expect(
      (await organizer.req(`/api/press-meets/${id}/room/signal`, {
        json: { from: "reporter-tab-1", to: "organizer-tab-1", kind: "offer", data: {} },
      })).status,
    ).toBe(409);
    expect(
      (await reporter.req(`/api/press-meets/${id}/room/state`, {
        json: { peerId: "reporter-tab-1", micOn: true, cameraOn: true, hand: true, recording: false },
      })).status,
    ).toBe(200);
    const reporterTile = async () =>
      (await json<PressMeetRoom>(await organizer.req(`/api/press-meets/${id}/room`))).peers.find((p) => p.peerId === "reporter-tab-1");
    // Reporters' cameras show too; their mic stays off until the organizer accepts their request to speak (owner 2026-10-05).
    expect(await reporterTile()).toMatchObject({ micOn: false, cameraOn: true, hand: true, canSpeak: false });
    const speak = (allow: boolean, as = organizer) => as.req(`/api/press-meets/${id}/room/speak`, { json: { peerId: "reporter-tab-1", allow } });
    expect((await speak(true, reporter)).status).toBe(403);
    expect((await speak(false)).status).toBe(200);
    expect(await reporterTile()).toMatchObject({ hand: false, canSpeak: false });
    expect((await speak(true)).status).toBe(200);
    await reporter.req(`/api/press-meets/${id}/room/state`, { json: { peerId: "reporter-tab-1", micOn: true, cameraOn: true, hand: false, recording: false } });
    expect(await reporterTile()).toMatchObject({ micOn: true, hand: false, canSpeak: true });
    // A reporter can end their own turn.
    expect((await speak(false, reporter)).status).toBe(200);
    expect(await reporterTile()).toMatchObject({ micOn: false, canSpeak: false });
    expect((await speak(true)).status).toBe(200);
    expect((await organizer.req(`/api/press-meets/${id}/room/mute`, { json: { peerId: "reporter-tab-1" } })).status).toBe(200);
    expect(await reporterTile()).toMatchObject({ micOn: false, canSpeak: false });
    expect(await json(await reporter.req(`/api/press-meets/${id}/room/beat`, { json: { peerId: "reporter-tab-1" } }))).toEqual({
      present: true,
      status: "live",
    });

    // Joining again (reload / another tab or device) replaces the earlier connection: one tile per person.
    // Reporters join on camera (owner 2026-10-05).
    expect(
      (await reporter.req(`/api/press-meets/${id}/room/join`, { json: { peerId: "reporter-tab-2", micOn: false, cameraOn: false, recordingConsent: true } })).status,
    ).toBe(400);
    await reporter.req(`/api/press-meets/${id}/room/join`, { json: { peerId: "reporter-tab-2", micOn: false, cameraOn: true, recordingConsent: true } });
    const after = await json<PressMeetRoom>(await organizer.req(`/api/press-meets/${id}/room`));
    expect(after.peers.filter((p) => p.role === "reporter").map((p) => p.peerId)).toEqual(["reporter-tab-2"]);
    expect(await json(await reporter.req(`/api/press-meets/${id}/room/beat`, { json: { peerId: "reporter-tab-1" } }))).toEqual({
      present: false,
      status: "live",
    });

    // Recordings stay on each person's device (owner 2026-10-02): the server takes none.
    expect((await reporter.req(`/api/press-meets/${id}/recordings`, { json: { sourceType: "video/webm" } })).status).toBe(410);

    expect((await organizer.req(`/api/press-meets/${id}/end`, { json: {} })).status).toBe(200);

    // After: the reporter writes the story from the composer for this press meet (owner 2026-10-07: POST /api/articles
    // with pressMeetId — "publish" sends it to the organizer instead of going live), the organizer verifies it and
    // releases the fee, the reporter confirms.
    const cover = await coverOf(reporter);
    const sent = await reporter.req("/api/articles", {
      json: { title: "Water board press meet: new pipeline", bodyHtml: LONG_BODY, cover, articleImage: cover, category: "national", ...PUBLISH_EXTRAS, pressMeetId: id, action: "publish" },
    });
    expect(sent.status, await sent.clone().text()).toBeLessThan(300);
    expect(await bellTypes(organizer)).toContain("press_meet_submitted");

    const detail = await json<PressMeetDetail>(await organizer.req(`/api/press-meets/${id}`));
    const invite = detail.invites[0]!;
    expect(invite.review).toBe("pending");
    expect((await organizer.req(`/api/press-meets/${id}/invites/${invite.id}/release`, { json: {} })).status).toBe(409);
    expect((await organizer.req(`/api/press-meets/${id}/invites/${invite.id}/review`, { json: { approve: true } })).status).toBe(200);
    expect((await organizer.req(`/api/press-meets/${id}/invites/${invite.id}/release`, { json: { reference: "UTR123" } })).status).toBe(200);
    const paid = (await json<NotificationsResponse>(await reporter.req("/api/me/notifications"))).items.find((n) => n.type === "press_meet_paid");
    expect(paid).toMatchObject({ amount: 1500, note: "UTR123" });
    expect(paid?.pressMeet?.id).toBe(id);

    expect((await reporter.req(`/api/press-meets/${id}/received`, { json: {} })).status).toBe(200);
    const done = await json<PressMeetDetail>(await organizer.req(`/api/press-meets/${id}`));
    expect(done.invites[0]).toMatchObject({ review: "approved", payment: "received", paymentRef: "UTR123" });
    expect(await bellTypes(organizer)).toContain("press_meet_received");
  });

  it("the organizer can cancel an upcoming press meet and the slot opens again", async () => {
    const organizer = await onboardedUser(app);
    const reporter = await reporterUser(app, { level: "verified" });
    await reporter.req("/api/me/press-meet-price", { method: "PUT", json: { price: 0 } });
    const startsAt = await freeSlot(organizer, 4, 60);
    const { id } = await json<{ id: string }>(
      await organizer.req("/api/press-meets", {
        json: {
          title: "Quarterly results briefing",
          startsAt,
          durationMinutes: 60,
          platform: "google_meet",
          meetUrl: "https://meet.google.com/abc-defg-hij",
          reporterIds: [reporter.userId],
          ...(await bookingItems(organizer)),
        },
      }),
    );
    // The Meet link is only for reporters who accepted.
    expect((await json<PressMeetDetail>(await reporter.req(`/api/press-meets/${id}`))).meetUrl).toBeNull();

    // Inviting more after booking: new people are invited (once); someone who declined can be asked again.
    const later = await reporterUser(app, { level: "verified" });
    await later.req("/api/me/press-meet-price", { method: "PUT", json: { price: 700 } });
    expect(await json(await organizer.req(`/api/press-meets/${id}/invites`, { json: { reporterIds: [later.userId, reporter.userId] } }))).toEqual({ invited: 1 });
    expect(await bellTypes(later)).toContain("press_meet_invited");
    expect((await later.req(`/api/press-meets/${id}/respond`, { json: { accept: false } })).status).toBe(200);
    expect(await json(await organizer.req(`/api/press-meets/${id}/invites`, { json: { reporterIds: [later.userId] } }))).toEqual({ invited: 1 });
    const again = await json<PressMeetDetail>(await organizer.req(`/api/press-meets/${id}`));
    expect(again.invites.find((i) => i.reporter.id === later.userId)).toMatchObject({ status: "invited", price: 700 });
    // Only the organizer can invite.
    expect((await reporter.req(`/api/press-meets/${id}/invites`, { json: { reporterIds: [later.userId] } })).status).toBe(404);
    expect((await organizer.req(`/api/press-meets/${id}/cancel`, { json: {} })).status).toBe(200);
    expect(await bellTypes(reporter)).toContain("press_meet_cancelled");
    const slots = await json<PressMeetSlotsResponse>(await organizer.req(`/api/press-meets/slots?date=${istDateKey(startsAt)}&duration=60`));
    expect(slots.slots.find((s) => s.start === startsAt)?.available).toBe(true);
  });
  it("booking needs the report and the paid platform fee; the report is private to the meet (owner 2026-10-05)", async () => {
    const admin = await adminUser(app);
    const organizer = await onboardedUser(app);
    const reporter = await reporterUser(app, { level: "verified" });
    const stranger = await onboardedUser(app);
    await reporter.req("/api/me/press-meet-price", { method: "PUT", json: { price: 800 } });
    const before = await json<{ amountInr: number }>(await admin.req("/api/admin/press-meets/platform-fee"));
    try {
      // The Editor Desk sets the fee; organizers see it.
      expect((await organizer.req("/api/admin/press-meets/platform-fee", { method: "PUT", json: { amountInr: 250 } })).status).toBe(403);
      expect((await admin.req("/api/admin/press-meets/platform-fee", { method: "PUT", json: { amountInr: -1 } })).status).toBe(400);
      expect(await json(await admin.req("/api/admin/press-meets/platform-fee", { method: "PUT", json: { amountInr: 250 } }))).toMatchObject({ amountInr: 250 });
      expect(await json(await organizer.req("/api/press-meets/platform-fee"))).toEqual({ amountInr: 250, provider: "test" });

      // Only PDF / Word / JPG / PNG reports, whatever the browser claims.
      expect((await uploadReport(organizer, new TextEncoder().encode("just text"), "notes.pdf")).status).toBe(415);

      const startsAt = await freeSlot(organizer, 5);
      const base = { title: "Dasara cultural programme launch", startsAt, durationMinutes: 30, platform: "webnews", reporterIds: [reporter.userId] };
      const { reportId } = await json<{ report: PressMeetReportFile }>(await uploadReport(organizer)).then((r) => ({ reportId: r.report.id }));
      // No fee paid yet → refused; someone else's report → refused.
      const unpaid = await organizer.req("/api/press-meets", { json: { ...base, reportId } });
      expect(unpaid.status).toBe(422);
      expect(((await json<{ error: { code: string } }>(unpaid)).error.code)).toBe("platform_fee_required");
      const strangerItems = await bookingItems(stranger);
      const notMine = await organizer.req("/api/press-meets", { json: { ...base, reportId: strangerItems.reportId } });
      expect((await json<{ error: { code: string } }>(notMine)).error.code).toBe("report_required");

      // Paying twice hands back the same unused payment.
      const pay = async () => (await json<{ payment: PlatformFeePayment }>(await organizer.req("/api/press-meets/platform-fee/pay", { method: "POST" }))).payment;
      const payment = await pay();
      expect(payment).toMatchObject({ amountInr: 250, provider: "test" });
      expect((await pay()).id).toBe(payment.id);

      const created = await organizer.req("/api/press-meets", { json: { ...base, reportId, platformFeePaymentId: payment.id } });
      expect(created.status, await created.clone().text()).toBe(201);
      const { id } = await json<{ id: string }>(created);

      // The organizer sees the report and the fee; the invited reporter the report only; strangers nothing.
      const mine = await json<PressMeetDetail>(await organizer.req(`/api/press-meets/${id}`));
      expect(mine.report).toMatchObject({ id: reportId, fileName: "briefing.pdf", mime: "application/pdf" });
      expect(mine.platformFee).toMatchObject({ id: payment.id, amountInr: 250 });
      const theirs = await json<PressMeetDetail>(await reporter.req(`/api/press-meets/${id}`));
      expect(theirs.report?.fileName).toBe("briefing.pdf");
      expect(theirs.platformFee).toBeNull();
      const file = await reporter.req(`/api/press-meets/${id}/report`);
      expect(file.status).toBe(200);
      expect(file.headers.get("content-type")).toBe("application/pdf");
      expect(new TextDecoder().decode(await file.arrayBuffer()).startsWith("%PDF-")).toBe(true);
      expect((await stranger.req(`/api/press-meets/${id}/report`)).status).toBe(404);
      expect((await admin.req(`/api/press-meets/${id}/report`)).status).toBe(200);

      // A used report or payment can't book a second press meet.
      const again = await organizer.req("/api/press-meets", { json: { ...base, startsAt: await freeSlot(organizer, 6), reportId, platformFeePaymentId: payment.id } });
      expect((await json<{ error: { code: string } }>(again)).error.code).toBe("report_required");

      // The Editor Desk's list shows it with its report and fee.
      const desk = await json<{ items: { id: string; report: unknown; platformFee: unknown }[] }>(await admin.req("/api/admin/press-meets"));
      expect(desk.items.find((m) => m.id === id)).toMatchObject({ report: { id: reportId }, platformFee: { id: payment.id } });

      // A ₹0 fee: no payment step.
      await admin.req("/api/admin/press-meets/platform-fee", { method: "PUT", json: { amountInr: 0 } });
      expect((await organizer.req("/api/press-meets/platform-fee/pay", { method: "POST" })).status).toBe(409);
      const free = await bookingItems(organizer);
      expect(free.platformFeePaymentId).toBeNull();
      const freeMeet = await organizer.req("/api/press-meets", { json: { ...base, startsAt: await freeSlot(organizer, 7), ...free } });
      expect(freeMeet.status, await freeMeet.clone().text()).toBe(201);
    } finally {
      await admin.req("/api/admin/press-meets/platform-fee", { method: "PUT", json: { amountInr: before.amountInr } });
    }
  });
});
