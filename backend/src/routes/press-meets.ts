import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { Hono } from "hono";
import { ApiError, notFound } from "../lib/errors.js";
import { RATE_LIMITS } from "../lib/rate-limit.js";
import { readJson } from "../lib/validate.js";
import { mustViewer, requireOnboarded } from "../middleware/guards.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { payPlatformFee, platformFeeQuote, readableReport, saveReport } from "../queries/press-meet-booking.js";
import { getChat, sendChat, setChatEnabled } from "../queries/press-meet-chat.js";
import { answerSpeakRequest, beatRoom, getRoom, joinRoom, leaveRoom, muteReporter, relaySignal, updateRoomState } from "../queries/press-meet-room.js";
import { deleteRecording, finishRecording, readableRecording } from "../queries/press-meet-recordings.js";
import {
  assertMeetId,
  cancelPressMeet,
  confirmReceived,
  createPressMeet,
  daySlots,
  endOwnPressMeet,
  getNotes,
  getPressMeetDetail,
  inviteMoreReporters,
  joinPublicMeet,
  listInvitableReporters,
  listPressMeets,
  monthAvailability,
  releasePayment,
  respondToInvite,
  reviewStory,
  saveNotes,
  startPressMeet,
  storyPreview,
} from "../queries/press-meets.js";
import {
  PRESS_MEET_DURATIONS,
  createPressMeetSchema,
  startPressMeetSchema,
  inviteMoreReportersSchema,
  joinPressMeetRoomSchema,
  pressMeetMuteSchema,
  pressMeetSpeakSchema,
  pressMeetChatSendSchema,
  pressMeetChatSettingSchema,
  pressMeetNotesSchema,
  pressMeetPeerSchema,
  pressMeetSignalSchema,
  pressMeetStateSchema,
  releasePressMeetPaymentSchema,
  respondPressMeetSchema,
  reviewPressMeetStorySchema,
  type PressMeetDuration,
} from "../shared/contracts.js";
import type { AppEnv } from "../types.js";
import { parseRange } from "./media.js";
import type { RouteDeps } from "./deps.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

function durationOf(raw: string | undefined): PressMeetDuration {
  const value = Number(raw ?? 60);
  return (PRESS_MEET_DURATIONS as readonly number[]).includes(value) ? (value as PressMeetDuration) : 60;
}

/**
 * /api/press-meets (owner 2026-10-01) — booking (calendar, slots, reporters), the organizer's and reporters' lists, one
 * press meet's page (invitations, stories, payments), the built-in room and reporters' recordings. Signed-in,
 * onboarded members only; each press meet is visible to its organizer and the reporters it invited.
 */
export function pressMeetRoutes({ limiter }: RouteDeps) {
  const app = new Hono<AppEnv>();
  app.use("*", requireOnboarded);

  /* ─── Booking ─── */

  // GET /api/press-meets/calendar?month=2026-10&duration=60 — free start times per day.
  app.get("/calendar", async (c) => {
    const month = c.req.query("month") ?? "";
    if (!MONTH.test(month)) throw new ApiError(400, "invalid_month", "Month must look like 2026-10");
    return c.json(await monthAvailability(mustViewer(c).id, month, durationOf(c.req.query("duration"))));
  });

  // GET /api/press-meets/slots?date=2026-10-04&duration=60 — every start time that day, free or not.
  app.get("/slots", async (c) => {
    const date = c.req.query("date") ?? "";
    if (!DATE.test(date) || Number.isNaN(Date.parse(date))) throw new ApiError(400, "invalid_date", "Date must look like 2026-10-04");
    return c.json(await daySlots(mustViewer(c).id, date, durationOf(c.req.query("duration"))));
  });

  // GET /api/press-meets/reporters?q=&language=&state=&district=&city=&cursor= — Verified reporters with their advertorial price.
  app.get("/reporters", async (c) => {
    const viewer = mustViewer(c);
    return c.json(
      await listInvitableReporters(viewer.id, {
        q: c.req.query("q"),
        language: c.req.query("language")?.slice(0, 16) || undefined,
        state: c.req.query("state")?.slice(0, 8) || undefined,
        district: c.req.query("district")?.slice(0, 60) || undefined,
        city: c.req.query("city")?.slice(0, 60) || undefined,
        cursor: c.req.query("cursor"),
      }),
    );
  });

  // GET /api/press-meets/platform-fee — what booking costs now (the Editor Desk sets it) → { amountInr, provider }.
  app.get("/platform-fee", async (c) => c.json(await platformFeeQuote()));

  // POST /api/press-meets/platform-fee/pay — pays it (a `test` payment until online payments are connected) → { payment }.
  app.post("/platform-fee/pay", rateLimit(limiter, "press-meet-fee", RATE_LIMITS.upload, "user"), async (c) =>
    c.json({ payment: await payPlatformFee(mustViewer(c)) }, 201),
  );

  // POST /api/press-meets/report — multipart `file`: the press meet report (PDF / Word / JPG / PNG, ≤ 10 MB) → { report }.
  app.post("/report", rateLimit(limiter, "upload", RATE_LIMITS.upload, "user"), async (c) => {
    if (!(c.req.header("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
      throw new ApiError(400, "invalid_upload", "Send the report as multipart/form-data");
    }
    let form: Record<string, string | File | (string | File)[]>;
    try {
      form = await c.req.parseBody({ all: false });
    } catch {
      throw new ApiError(400, "invalid_upload", "Could not read the upload");
    }
    return c.json({ report: await saveReport(mustViewer(c), form.file) }, 201);
  });

  // POST /api/press-meets — book the slot and invite the reporters → { id }.
  app.post("/", rateLimit(limiter, "press-meet-create", RATE_LIMITS.pressMeetCreate, "user"), async (c) => {
    const viewer = mustViewer(c);
    const input = await readJson(c, createPressMeetSchema);
    return c.json({ id: await createPressMeet(viewer, input) }, 201);
  });

  // GET /api/press-meets?scope=organizing|invited|public (public: upcoming and live public press meets, owner 2026-10-07)
  app.get("/", async (c) => {
    const viewer = mustViewer(c);
    const scope = c.req.query("scope");
    return c.json(await listPressMeets(viewer.id, scope === "invited" ? "invited" : scope === "public" ? "public" : "organizing"));
  });

  /* ─── One press meet ─── */

  app.get("/:id", async (c) => c.json(await getPressMeetDetail(c.req.param("id"), mustViewer(c).id)));

  // POST /api/press-meets/:id/join — a reporter takes a seat in a public press meet (leave: /respond { accept: false }).
  app.post("/:id/join", rateLimit(limiter, "press-meet-join", RATE_LIMITS.invite, "user"), async (c) => {
    await joinPublicMeet(c.req.param("id"), mustViewer(c));
    return c.json({ ok: true });
  });

  app.post("/:id/respond", async (c) => {
    const { accept } = await readJson(c, respondPressMeetSchema);
    await respondToInvite(c.req.param("id"), mustViewer(c), accept);
    return c.json({ ok: true });
  });

  // POST /api/press-meets/:id/invites { reporterIds } — the organizer invites more reporters → { invited }.
  app.post("/:id/invites", rateLimit(limiter, "press-meet-invite", RATE_LIMITS.invite, "user"), async (c) => {
    const { reporterIds } = await readJson(c, inviteMoreReportersSchema);
    return c.json({ invited: await inviteMoreReporters(c.req.param("id"), mustViewer(c), reporterIds) });
  });

  app.post("/:id/cancel", async (c) => {
    await cancelPressMeet(c.req.param("id"), mustViewer(c));
    return c.json({ ok: true });
  });

  // POST /api/press-meets/:id/start { recordingConsent: true } — the organizer goes live (consent required).
  app.post("/:id/start", async (c) => {
    await readJson(c, startPressMeetSchema);
    await startPressMeet(c.req.param("id"), mustViewer(c));
    return c.json({ ok: true });
  });

  app.post("/:id/end", async (c) => {
    await endOwnPressMeet(c.req.param("id"), mustViewer(c));
    return c.json({ ok: true });
  });

  // GET / PUT /api/press-meets/:id/notes — the viewer's private notepad for this press meet.
  app.get("/:id/notes", async (c) => c.json(await getNotes(c.req.param("id"), mustViewer(c))));
  app.put("/:id/notes", async (c) => {
    const { body } = await readJson(c, pressMeetNotesSchema);
    return c.json(await saveNotes(c.req.param("id"), mustViewer(c), body));
  });

  // GET /api/press-meets/:id/chat — the room's chat (owner 2026-10-02): the switch and the latest messages.
  app.get("/:id/chat", async (c) => c.json(await getChat(c.req.param("id"), mustViewer(c))));
  // POST /api/press-meets/:id/chat { body } — a question (reporters, while the chat is on) or a reply (organizer).
  app.post("/:id/chat", rateLimit(limiter, "meet-chat", RATE_LIMITS.message, "user"), async (c) => {
    const { body } = await readJson(c, pressMeetChatSendSchema);
    await sendChat(c.req.param("id"), mustViewer(c), body);
    return c.body(null, 204);
  });
  // PUT /api/press-meets/:id/chat { enabled } — the organizer turns the chat on or off for reporters.
  app.put("/:id/chat", async (c) => {
    const { enabled } = await readJson(c, pressMeetChatSettingSchema);
    return c.json({ enabled: await setChatEnabled(c.req.param("id"), mustViewer(c), enabled) });
  });

  // GET /api/press-meets/:id/invites/:inviteId/story — the organizer reads a reporter's story before verifying it
  // (stories are sent from the composer: POST /api/articles with pressMeetId — owner 2026-10-07).
  app.get("/:id/invites/:inviteId/story", async (c) =>
    c.json(await storyPreview(c.req.param("id"), c.req.param("inviteId"), mustViewer(c))),
  );

  app.post("/:id/invites/:inviteId/review", async (c) => {
    const { approve, note } = await readJson(c, reviewPressMeetStorySchema);
    await reviewStory(c.req.param("id"), c.req.param("inviteId"), mustViewer(c), approve, note);
    return c.json({ ok: true });
  });

  app.post("/:id/invites/:inviteId/release", async (c) => {
    const { reference } = await readJson(c, releasePressMeetPaymentSchema);
    await releasePayment(c.req.param("id"), c.req.param("inviteId"), mustViewer(c), reference);
    return c.json({ ok: true });
  });

  app.post("/:id/received", async (c) => {
    await confirmReceived(c.req.param("id"), mustViewer(c));
    return c.json({ ok: true });
  });

  /* ─── The built-in room ─── */

  app.get("/:id/room", async (c) => c.json(await getRoom(c.req.param("id"), mustViewer(c))));

  app.post("/:id/room/join", async (c) => {
    const input = await readJson(c, joinPressMeetRoomSchema);
    return c.json(await joinRoom(c.req.param("id"), mustViewer(c), input));
  });

  app.post("/:id/room/beat", async (c) => {
    const { peerId } = await readJson(c, pressMeetPeerSchema);
    return c.json(await beatRoom(assertMeetId(c.req.param("id")), mustViewer(c), peerId));
  });

  app.post("/:id/room/leave", async (c) => {
    const { peerId } = await readJson(c, pressMeetPeerSchema);
    await leaveRoom(assertMeetId(c.req.param("id")), mustViewer(c), peerId);
    return c.json({ ok: true });
  });

  app.post("/:id/room/signal", async (c) => {
    const input = await readJson(c, pressMeetSignalSchema);
    await relaySignal(assertMeetId(c.req.param("id")), mustViewer(c), input);
    return c.json({ ok: true });
  });

  app.post("/:id/room/state", async (c) => {
    const input = await readJson(c, pressMeetStateSchema);
    await updateRoomState(assertMeetId(c.req.param("id")), mustViewer(c), input);
    return c.json({ ok: true });
  });

  app.post("/:id/room/mute", async (c) => {
    const { peerId } = await readJson(c, pressMeetMuteSchema);
    await muteReporter(assertMeetId(c.req.param("id")), mustViewer(c), peerId);
    return c.json({ ok: true });
  });

  app.post("/:id/room/speak", async (c) => {
    const input = await readJson(c, pressMeetSpeakSchema);
    await answerSpeakRequest(assertMeetId(c.req.param("id")), mustViewer(c), input);
    return c.json({ ok: true });
  });

  /* ─── Recordings (reporters; replayed only here) ─── */

  // Recordings stay on the reporter's own device (owner 2026-10-02: no copy on the server, frontend
  // lib/local-recordings.ts) — new recordings and their pieces are refused here, so nothing can be stored.
  const deviceOnly = () => new ApiError(410, "recordings_on_device", "Recordings are saved on your device now, not on WebNEWS.");
  app.post("/:id/recordings", () => {
    throw deviceOnly();
  });
  app.post("/:id/recordings/:rid/pieces", () => {
    throw deviceOnly();
  });

  // GET /api/press-meets/:id/report — the press meet report (organizer, invited reporters, Editor Desk); never cached.
  app.get("/:id/report", async (c) => {
    const report = await readableReport(c.req.param("id"), mustViewer(c));
    let size: number;
    try {
      size = (await stat(report.path)).size;
    } catch {
      throw notFound("Report not found");
    }
    // PDFs and images open in the browser; Word files download.
    const inline = report.mime === "application/pdf" || report.mime.startsWith("image/");
    const stream = Readable.toWeb(createReadStream(report.path)) as ReadableStream<Uint8Array>;
    return c.body(stream, 200, {
      "Content-Type": report.mime,
      "Content-Length": String(size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(report.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
  });

  app.post("/:id/recordings/:rid/finish", async (c) => {
    await finishRecording(assertMeetId(c.req.param("id")), c.req.param("rid"), mustViewer(c));
    return c.json({ ok: true });
  });

  // GET /api/press-meets/:id/recordings/:rid/video — the MP4 for WebNEWS's own player (inline, ranges, never cached).
  app.get("/:id/recordings/:rid/video", async (c) => {
    const path = await readableRecording(assertMeetId(c.req.param("id")), c.req.param("rid"), mustViewer(c));
    let size: number;
    try {
      size = (await stat(path)).size;
    } catch {
      throw notFound("Recording not found");
    }
    const headers: Record<string, string> = {
      "Content-Type": "video/mp4",
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
      "Accept-Ranges": "bytes",
    };
    const range = parseRange(c.req.header("range"), size);
    if (range === "invalid") return c.body(null, 416, { ...headers, "Content-Range": `bytes */${size}` });
    const { start, end } = range ?? { start: 0, end: size - 1 };
    const stream = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream<Uint8Array>;
    return c.body(stream, range ? 206 : 200, {
      ...headers,
      "Content-Length": String(end - start + 1),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    });
  });

  app.delete("/:id/recordings/:rid", async (c) => {
    await deleteRecording(assertMeetId(c.req.param("id")), c.req.param("rid"), mustViewer(c));
    return c.json({ ok: true });
  });

  return app;
}
