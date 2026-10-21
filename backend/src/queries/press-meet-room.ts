import { sql } from "drizzle-orm";
import { db, type Executor } from "../db/client.js";
import { pressMeetSignal } from "../db/schema.js";
import { env } from "../env.js";
import { ApiError, forbidden } from "../lib/errors.js";
import { EVENTS_CHANNEL, publishEvent } from "../lib/events.js";
import type { PressMeetPeer, PressMeetRoom, PressMeetSignal } from "../shared/contracts.js";
import type { Viewer } from "../types.js";
import { getPressMeetDetail } from "./press-meets.js";

/*
 * The built-in press meet room (owner 2026-10-01): every participant's browser connects to every other one (WebRTC);
 * everyone sends camera + mic (owner 2026-10-05: every face on screen). This module keeps who is in the room (press_meet_peer, one
 * row per open tab, refreshed by a heartbeat) and relays the WebRTC handshakes through the live stream (`meet.signal`,
 * only to the person it's for). Reporters ask to speak (a raised hand); their mic counts only once the organizer accepts
 * (owner 2026-10-05) — the API keeps it off until then, and the others' browsers play only mics it says are on.
 */

/** A tab that hasn't beaten for this long has left. */
export const PEER_STALE_SECONDS = 45;
/** Postgres NOTIFY payloads must stay under 8000 bytes. */
const NOTIFY_MAX_BYTES = 7600;

/** Sends one room event to one person's open connections (big SDP payloads go through press_meet_signal). */
export async function deliverSignal(executor: Executor, userId: string, signal: PressMeetSignal): Promise<void> {
  const inline = JSON.stringify({ t: "meet", id: userId, p: signal });
  if (Buffer.byteLength(inline) <= NOTIFY_MAX_BYTES) {
    await executor.execute(sql`select pg_notify(${EVENTS_CHANNEL}, ${inline})`);
    return;
  }
  const [row] = await executor.insert(pressMeetSignal).values({ payload: signal }).returning({ id: pressMeetSignal.id });
  if (row) await publishEvent(executor, { t: "meet", id: userId, s: row.id });
}

/** STUN for everyone; the server's TURN relay too when it has one (TURN_URLS). */
export function iceServers(): PressMeetRoom["iceServers"] {
  const servers: PressMeetRoom["iceServers"] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  const turn = (env.TURN_URLS ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  if (turn.length > 0) servers.push({ urls: turn, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL });
  return servers;
}

type PeerRow = {
  peer_id: string;
  user_id: string;
  role: "organizer" | "reporter";
  mic_on: boolean;
  camera_on: boolean;
  hand: boolean;
  can_speak: boolean;
  recording: boolean;
  username: string;
  name: string;
  image: string | null;
};

const toPeer = (row: PeerRow): PressMeetPeer => ({
  peerId: row.peer_id,
  user: { id: row.user_id, username: row.username, name: row.name, image: row.image },
  role: row.role,
  micOn: row.mic_on,
  cameraOn: row.camera_on,
  hand: row.hand,
  canSpeak: row.role === "organizer" || row.can_speak,
  recording: row.recording,
});

async function listPeers(executor: Executor, meetId: string, where = sql``): Promise<PressMeetPeer[]> {
  const rows = await executor.execute<PeerRow>(sql`
    select p.peer_id, p.user_id, p.role, p.mic_on, p.camera_on, p.hand, p.can_speak, p.recording, u.username, u.name, u.image
    from press_meet_peer p join "user" u on u.id = p.user_id
    where p.press_meet_id = ${meetId} and p.last_seen_at > now() - make_interval(secs => ${PEER_STALE_SECONDS}) ${where}
    order by p.joined_at
  `);
  return [...rows].map(toPeer);
}

/** Everyone else in the room gets the event (one NOTIFY per person). */
async function broadcast(executor: Executor, meetId: string, exceptPeerId: string, signal: PressMeetSignal): Promise<void> {
  const users = await executor.execute<{ user_id: string }>(sql`
    select distinct user_id from press_meet_peer where press_meet_id = ${meetId} and peer_id <> ${exceptPeerId}
  `);
  for (const { user_id } of users) await deliverSignal(executor, user_id, signal);
}

/** The room as its organizer or a reporter who accepted sees it, with who's in it now. */
export async function getRoom(meetId: string, viewer: Viewer): Promise<PressMeetRoom> {
  const meet = await getPressMeetDetail(meetId, viewer.id);
  return { meet, iceServers: iceServers(), peers: await listPeers(db, meet.id) };
}

/** Enters the room (a live WebNEWS Live press meet). Returns the room with everyone already in it. */
export async function joinRoom(
  meetId: string,
  viewer: Viewer,
  input: { peerId: string; micOn: boolean; cameraOn: boolean; recordingConsent?: true },
): Promise<PressMeetRoom> {
  const meet = await getPressMeetDetail(meetId, viewer.id);
  if (meet.platform !== "webnews") throw new ApiError(409, "press_meet_state", "This press meet is on Google Meet");
  if (meet.status !== "live") {
    throw new ApiError(409, "press_meet_state", meet.status === "scheduled" ? "The organizer hasn't started the press meet yet" : "This press meet is over");
  }
  const organizer = meet.role === "organizer";
  if (!organizer && meet.myInvite?.status !== "accepted") throw forbidden("Accept the invitation to join the press meet");
  if (!organizer && !input.recordingConsent) {
    throw new ApiError(400, "recording_consent_required", "Agree that the press meet is recorded to join it");
  }
  // Reporters are on camera for the whole press meet (owner 2026-10-05): no camera, no entry.
  if (!organizer && !input.cameraOn) throw new ApiError(400, "camera_required", "Turn on your camera to join the press meet");

  const peers = await db.transaction(async (tx) => {
    // One connection per person (owner 2026-10-01: a reload or a second tab showed them several times): joining
    // again — another tab, another device, a reload — takes over from their earlier connections at once.
    const earlier = [
      ...(await tx.execute<{ peer_id: string }>(sql`
        delete from press_meet_peer where press_meet_id = ${meet.id} and user_id = ${viewer.id} and peer_id <> ${input.peerId}
        returning peer_id
      `)),
    ].map((r) => r.peer_id);
    const [row] = [
      ...(await tx.execute<PeerRow>(sql`
        with saved as (
          insert into press_meet_peer (peer_id, press_meet_id, user_id, role, mic_on, camera_on)
          values (${input.peerId}, ${meet.id}, ${viewer.id}, ${organizer ? "organizer" : "reporter"}, ${organizer && input.micOn}, ${input.cameraOn})
          on conflict (peer_id) do update set last_seen_at = now(), camera_on = excluded.camera_on,
            mic_on = ${input.micOn} and (press_meet_peer.role = 'organizer' or press_meet_peer.can_speak)
          where press_meet_peer.user_id = excluded.user_id and press_meet_peer.press_meet_id = excluded.press_meet_id
          returning *
        )
        select s.peer_id, s.user_id, s.role, s.mic_on, s.camera_on, s.hand, s.can_speak, s.recording, u.username, u.name, u.image
        from saved s join "user" u on u.id = s.user_id
      `)),
    ];
    if (!row) throw forbidden("That room connection belongs to someone else");
    for (const old of earlier) {
      await broadcast(tx, meet.id, input.peerId, { meetId: meet.id, to: null, from: old, kind: "peer-left", data: null });
      await deliverSignal(tx, viewer.id, { meetId: meet.id, to: old, from: input.peerId, kind: "replaced", data: null });
    }
    if (!organizer) {
      await tx.execute(sql`
        update press_meet_invite set joined_at = coalesce(joined_at, now()), recording_consent_at = now()
        where press_meet_id = ${meet.id} and reporter_id = ${viewer.id}
      `);
    }
    await broadcast(tx, meet.id, input.peerId, { meetId: meet.id, to: null, from: input.peerId, kind: "peer-joined", data: toPeer(row) });
    return listPeers(tx, meet.id, sql`and p.peer_id <> ${input.peerId}`);
  });
  return { meet, iceServers: iceServers(), peers };
}

/** Keeps the tab in the room. `present: false` = it was swept (rejoin); `status` tells waiting tabs when it ended. */
export async function beatRoom(meetId: string, viewer: Viewer, peerId: string): Promise<{ present: boolean; status: string }> {
  const rows = await db.execute<{ status: string; present: boolean }>(sql`
    with touched as (
      update press_meet_peer set last_seen_at = now()
      where peer_id = ${peerId} and user_id = ${viewer.id} and press_meet_id = ${meetId}
      returning peer_id
    )
    select m.status, exists (select 1 from touched) as present from press_meet m where m.id = ${meetId}
  `);
  const [row] = [...rows];
  return { present: Boolean(row?.present), status: row?.status ?? "ended" };
}

/** Leaves the room (the tab closed or the person tapped Leave). */
export async function leaveRoom(meetId: string, viewer: Viewer, peerId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const gone = await tx.execute<{ peer_id: string }>(sql`
      delete from press_meet_peer where peer_id = ${peerId} and user_id = ${viewer.id} and press_meet_id = ${meetId} returning peer_id
    `);
    if ([...gone].length > 0) await broadcast(tx, meetId, peerId, { meetId, to: null, from: peerId, kind: "peer-left", data: null });
  });
}

async function ownPeer(executor: Executor, meetId: string, viewer: Viewer, peerId: string): Promise<PeerRow> {
  const [row] = [
    ...(await executor.execute<PeerRow>(sql`
      select p.peer_id, p.user_id, p.role, p.mic_on, p.camera_on, p.hand, p.can_speak, p.recording, u.username, u.name, u.image
      from press_meet_peer p join "user" u on u.id = p.user_id
      where p.peer_id = ${peerId} and p.user_id = ${viewer.id} and p.press_meet_id = ${meetId}
    `)),
  ];
  if (!row) throw new ApiError(409, "not_in_room", "You're not in the room any more — rejoin");
  return row;
}

/** Relays a WebRTC offer / answer / ICE candidate to another tab in the same room. */
export async function relaySignal(
  meetId: string,
  viewer: Viewer,
  input: { from: string; to: string; kind: "offer" | "answer" | "candidate"; data: Record<string, unknown> },
): Promise<void> {
  await ownPeer(db, meetId, viewer, input.from);
  const [target] = [
    ...(await db.execute<{ user_id: string }>(sql`
      select user_id from press_meet_peer where peer_id = ${input.to} and press_meet_id = ${meetId}
    `)),
  ];
  if (!target) return; // they left meanwhile
  await deliverSignal(db, target.user_id, { meetId, to: input.to, from: input.from, kind: input.kind, data: input.data });
}

/**
 * Mic / camera / raised hand / recording changed: everyone else's tiles update. A reporter's mic stays off until they may
 * speak, and their camera can't be turned off (owner 2026-10-05).
 */
export async function updateRoomState(
  meetId: string,
  viewer: Viewer,
  input: { peerId: string; micOn: boolean; cameraOn: boolean; hand: boolean; recording: boolean },
): Promise<void> {
  await db.transaction(async (tx) => {
    const peer = await ownPeer(tx, meetId, viewer, input.peerId);
    const organizer = peer.role === "organizer";
    const [row] = [
      ...(await tx.execute<PeerRow>(sql`
        with saved as (
          update press_meet_peer set mic_on = ${input.micOn} and (role = 'organizer' or can_speak), camera_on = ${input.cameraOn} or role = 'reporter',
            hand = ${!organizer && input.hand} and not can_speak, recording = ${!organizer && input.recording}, last_seen_at = now()
          where peer_id = ${input.peerId}
          returning *
        )
        select s.peer_id, s.user_id, s.role, s.mic_on, s.camera_on, s.hand, s.can_speak, s.recording, u.username, u.name, u.image
        from saved s join "user" u on u.id = s.user_id
      `)),
    ];
    if (row) await broadcast(tx, meetId, input.peerId, { meetId, to: null, from: input.peerId, kind: "state", data: toPeer(row) });
  });
}

/** The organizer mutes a reporter: their turn to speak ends (they ask again for another question). */
export async function muteReporter(meetId: string, viewer: Viewer, targetPeerId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [meet] = [...(await tx.execute<{ organizer_id: string }>(sql`select organizer_id from press_meet where id = ${meetId}`))];
    if (meet?.organizer_id !== viewer.id) throw forbidden("Only the organizer can mute reporters");
    const [row] = [
      ...(await tx.execute<PeerRow>(sql`
        with saved as (
          update press_meet_peer set mic_on = false, hand = false, can_speak = false
          where peer_id = ${targetPeerId} and press_meet_id = ${meetId} and role = 'reporter'
          returning *
        )
        select s.peer_id, s.user_id, s.role, s.mic_on, s.camera_on, s.hand, s.can_speak, s.recording, u.username, u.name, u.image
        from saved s join "user" u on u.id = s.user_id
      `)),
    ];
    if (!row) return;
    await deliverSignal(tx, row.user_id, { meetId, to: targetPeerId, from: "organizer", kind: "mute", data: null });
    await broadcast(tx, meetId, targetPeerId, { meetId, to: null, from: targetPeerId, kind: "state", data: toPeer(row) });
  });
}

/**
 * The organizer accepts a reporter's request to speak (their mic may go on) or declines it (the hand goes down). A
 * reporter can end their own turn (allow: false on their own tab).
 */
export async function answerSpeakRequest(meetId: string, viewer: Viewer, input: { peerId: string; allow: boolean }): Promise<void> {
  await db.transaction(async (tx) => {
    const [meet] = [...(await tx.execute<{ organizer_id: string }>(sql`select organizer_id from press_meet where id = ${meetId}`))];
    const organizer = meet?.organizer_id === viewer.id;
    if (!organizer) {
      if (input.allow) throw forbidden("Only the organizer can let reporters speak");
      await ownPeer(tx, meetId, viewer, input.peerId);
    }
    const [row] = [
      ...(await tx.execute<PeerRow>(sql`
        with saved as (
          update press_meet_peer set can_speak = ${input.allow}, hand = false, mic_on = mic_on and ${input.allow}
          where peer_id = ${input.peerId} and press_meet_id = ${meetId} and role = 'reporter'
          returning *
        )
        select s.peer_id, s.user_id, s.role, s.mic_on, s.camera_on, s.hand, s.can_speak, s.recording, u.username, u.name, u.image
        from saved s join "user" u on u.id = s.user_id
      `)),
    ];
    if (!row) return; // they left meanwhile
    if (organizer) await deliverSignal(tx, row.user_id, { meetId, to: input.peerId, from: "organizer", kind: "speak", data: { allowed: input.allow } });
    await broadcast(tx, meetId, input.peerId, { meetId, to: null, from: input.peerId, kind: "state", data: toPeer(row) });
  });
}

/** Worker: tabs that stopped beating have left (the others are told); old stored signals go. */
export async function sweepRoom(): Promise<void> {
  const gone = await db.execute<{ peer_id: string; press_meet_id: string }>(sql`
    delete from press_meet_peer where last_seen_at < now() - make_interval(secs => ${PEER_STALE_SECONDS})
    returning peer_id, press_meet_id
  `);
  for (const peer of gone) {
    await broadcast(db, peer.press_meet_id, peer.peer_id, { meetId: peer.press_meet_id, to: null, from: peer.peer_id, kind: "peer-left", data: null });
  }
  await db.execute(sql`delete from press_meet_signal where created_at < now() - interval '2 minutes'`);
}
