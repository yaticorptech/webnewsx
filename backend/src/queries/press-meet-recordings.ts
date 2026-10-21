import { appendFile, mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { pressMeetRecording } from "../db/schema.js";
import { env } from "../env.js";
import { ApiError, forbidden, notFound } from "../lib/errors.js";
import { transcodeRecording } from "../lib/video.js";
import type { Viewer } from "../types.js";
import { assertMeetId, getPressMeetDetail, pingMeet } from "./press-meets.js";

/*
 * Reporters' recordings of the built-in room (owner 2026-10-01: "replay it in the platform only — no download"). The
 * browser records the room (organizer's video with the WebNEWS mark + everyone's audio) and uploads a piece every few
 * seconds, so closing the tab keeps what was recorded. Once stopped (or quiet for a few minutes) the pieces become one
 * MP4 in RECORDINGS_DIR — never public: only the reporter who recorded it streams it, through the API.
 */

/** Biggest recording kept (a 90-minute press meet at the browser's ~1 Mbps is ~700 MB). */
const MAX_BYTES = 1.5 * 1024 * 1024 * 1024;
/** A recording that got no piece for this long is finished by the worker (the tab was closed). */
const QUIET_MINUTES = 3;

const partPath = (id: string) => join(env.RECORDINGS_DIR, `${id}.part`);
export const recordingPath = (id: string) => join(env.RECORDINGS_DIR, `${id}.mp4`);

function assertId(id: string): string {
  try {
    return assertMeetId(id);
  } catch {
    throw notFound("Recording not found");
  }
}

/** Starts a recording: a reporter who accepted, in a live WebNEWS Live press meet. */
export async function startRecording(meetId: string, viewer: Viewer, sourceType: string): Promise<{ id: string }> {
  const meet = await getPressMeetDetail(meetId, viewer.id);
  if (meet.role !== "reporter" || meet.myInvite?.status !== "accepted") throw forbidden("Only reporters covering this press meet can record it");
  if (meet.platform !== "webnews" || meet.status !== "live") throw new ApiError(409, "press_meet_state", "You can record while the press meet is live");
  const type = sourceType.startsWith("video/mp4") ? "video/mp4" : "video/webm";
  const [row] = await db
    .insert(pressMeetRecording)
    .values({ pressMeetId: meet.id, reporterId: viewer.id, sourceType: type })
    .returning({ id: pressMeetRecording.id });
  await mkdir(env.RECORDINGS_DIR, { recursive: true });
  if (!row) throw new ApiError(500, "recording_failed", "Couldn't start the recording");
  return { id: row.id };
}

/**
 * Appends piece number `seq` (0-based, in order). A piece already received is acknowledged again (retries); one that
 * skips ahead gets 409 with the expected number.
 */
export async function appendRecordingPiece(meetId: string, recordingId: string, viewer: Viewer, seq: number, bytes: Uint8Array): Promise<{ next: number }> {
  const id = assertId(recordingId);
  return db.transaction(async (tx) => {
    const [row] = [
      ...(await tx.execute<{ chunks: number; bytes: string; status: string }>(sql`
        select chunks, bytes, status from press_meet_recording
        where id = ${id} and press_meet_id = ${meetId} and reporter_id = ${viewer.id} for update
      `)),
    ];
    if (!row) throw notFound("Recording not found");
    if (seq < row.chunks) return { next: row.chunks };
    if (row.status !== "recording") throw new ApiError(409, "recording_closed", "This recording has already been saved");
    if (seq > row.chunks) throw new ApiError(409, "recording_gap", `Expected piece ${row.chunks}`, { seq: String(row.chunks) });
    if (Number(row.bytes) + bytes.byteLength > MAX_BYTES) throw new ApiError(413, "payload_too_large", "This recording is too long");
    await appendFile(partPath(id), bytes);
    await tx.execute(sql`
      update press_meet_recording set chunks = chunks + 1, bytes = bytes + ${bytes.byteLength}, last_chunk_at = now() where id = ${id}
    `);
    return { next: row.chunks + 1 };
  });
}

/** The reporter stopped recording: make the MP4. */
export async function finishRecording(meetId: string, recordingId: string, viewer: Viewer): Promise<void> {
  const id = assertId(recordingId);
  const done = await db
    .update(pressMeetRecording)
    .set({ status: "processing" })
    .where(
      and(
        eq(pressMeetRecording.id, id),
        eq(pressMeetRecording.pressMeetId, meetId),
        eq(pressMeetRecording.reporterId, viewer.id),
        eq(pressMeetRecording.status, "recording"),
      ),
    )
    .returning({ id: pressMeetRecording.id });
  if (done.length > 0) {
    await pingMeet(db, meetId);
    queueRecording(id);
  }
}

/** The finished MP4's path — only for the reporter who recorded it. */
export async function readableRecording(meetId: string, recordingId: string, viewer: Viewer): Promise<string> {
  const id = assertId(recordingId);
  const [row] = await db
    .select({ status: pressMeetRecording.status })
    .from(pressMeetRecording)
    .where(and(eq(pressMeetRecording.id, id), eq(pressMeetRecording.pressMeetId, meetId), eq(pressMeetRecording.reporterId, viewer.id)));
  if (!row) throw notFound("Recording not found");
  if (row.status !== "ready") throw new ApiError(409, "recording_not_ready", "This recording is still being prepared");
  return recordingPath(id);
}

export async function deleteRecording(meetId: string, recordingId: string, viewer: Viewer): Promise<void> {
  const id = assertId(recordingId);
  const gone = await db
    .delete(pressMeetRecording)
    .where(and(eq(pressMeetRecording.id, id), eq(pressMeetRecording.pressMeetId, meetId), eq(pressMeetRecording.reporterId, viewer.id)))
    .returning({ id: pressMeetRecording.id });
  if (gone.length === 0) throw notFound("Recording not found");
  await removeFiles(id);
  await pingMeet(db, meetId);
}

async function removeFiles(id: string): Promise<void> {
  await rm(partPath(id), { force: true });
  await rm(recordingPath(id), { force: true });
}

const processing = new Set<string>();

/** Turns a recording's pieces into its MP4 (in the background; ffmpeg runs a few at a time). */
export function queueRecording(id: string): void {
  if (processing.has(id)) return;
  processing.add(id);
  void (async () => {
    let status: "ready" | "failed" = "failed";
    let durationMs: number | null = null;
    try {
      const input = await stat(partPath(id)).catch(() => null);
      if (input && input.size > 0) {
        const result = await transcodeRecording(partPath(id), recordingPath(id));
        if (result) {
          status = "ready";
          durationMs = result.durationMs;
          await rm(partPath(id), { force: true });
        }
      }
    } catch (error) {
      console.warn(`[recording] ${id} failed:`, error instanceof Error ? error.message : error);
    }
    try {
      const saved = await db
        .update(pressMeetRecording)
        .set({ status, durationMs, finishedAt: new Date() })
        .where(eq(pressMeetRecording.id, id))
        .returning({ meetId: pressMeetRecording.pressMeetId });
      if (saved[0]) await pingMeet(db, saved[0].meetId);
      else await removeFiles(id); // deleted while it was being made
    } finally {
      processing.delete(id);
    }
  })();
}

/** Worker: recordings whose tab went quiet are finished; ones a restart interrupted are made again. */
export async function finishQuietRecordings(): Promise<void> {
  const quiet = await db.execute<{ id: string; press_meet_id: string }>(sql`
    update press_meet_recording set status = 'processing'
    where status = 'recording' and coalesce(last_chunk_at, created_at) < now() - make_interval(mins => ${QUIET_MINUTES})
    returning id, press_meet_id
  `);
  for (const row of quiet) {
    await pingMeet(db, row.press_meet_id);
    queueRecording(row.id);
  }
  const stuck = await db.execute<{ id: string }>(sql`select id from press_meet_recording where status = 'processing'`);
  for (const row of stuck) queueRecording(row.id);
}
