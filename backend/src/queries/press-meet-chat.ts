import { sql } from "drizzle-orm";
import { db, type Executor } from "../db/client.js";
import { ApiError, forbidden } from "../lib/errors.js";
import { EVENTS_CHANNEL } from "../lib/events.js";
import type { PressMeetChat, PressMeetChatMessage, PressMeetDetail } from "../shared/contracts.js";
import type { Viewer } from "../types.js";
import { getPressMeetDetail } from "./press-meets.js";

/*
 * The press meet room's chat (owner 2026-10-02): reporters who accepted ask questions while it's live, the organizer
 * can reply and switch the chat off for reporters (and on again). Everyone in it hears about each change as
 * `meet.chat` (only on their own connections) and fetches the chat again.
 */

/** How many of the latest messages the room shows. */
const CHAT_WINDOW = 300;

/** The organizer, or a reporter who accepted (the room's people). */
async function chatMeet(meetId: string, viewer: Viewer): Promise<PressMeetDetail> {
  const meet = await getPressMeetDetail(meetId, viewer.id);
  if (meet.role === "reporter" && meet.myInvite?.status !== "accepted") throw forbidden("Accept the invitation to join the chat");
  return meet;
}

/** Tells the organizer and every reporter who accepted that the chat changed. */
async function pingChat(executor: Executor, meetId: string): Promise<void> {
  await executor.execute(sql`
    select pg_notify(${EVENTS_CHANNEL}, json_build_object('t', 'meetq', 'id', u.id, 'm', ${meetId}::text)::text)
    from (
      select organizer_id as id from press_meet where id = ${meetId}
      union select reporter_id from press_meet_invite where press_meet_id = ${meetId} and status = 'accepted'
    ) u
  `);
}

export async function getChat(meetId: string, viewer: Viewer): Promise<PressMeetChat> {
  const meet = await chatMeet(meetId, viewer);
  const [setting] = [...(await db.execute<{ chat_enabled: boolean }>(sql`select chat_enabled from press_meet where id = ${meet.id}`))];
  const rows = await db.execute<{
    id: string;
    body: string;
    created_at: string;
    user_id: string;
    username: string | null;
    name: string;
    image: string | null;
    organizer: boolean;
  }>(sql`
    select * from (
      select m.id, m.body, m.created_at, u.id as user_id, u.username, u.name, u.image, (m.user_id = pm.organizer_id) as organizer
      from press_meet_message m
      join "user" u on u.id = m.user_id
      join press_meet pm on pm.id = m.press_meet_id
      where m.press_meet_id = ${meet.id}
      order by m.created_at desc
      limit ${CHAT_WINDOW}
    ) latest order by created_at
  `);
  const messages: PressMeetChatMessage[] = [...rows].map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
    author: { id: row.user_id, username: row.username ?? "", name: row.name, image: row.image },
    role: row.organizer ? "organizer" : "reporter",
  }));
  return { enabled: setting?.chat_enabled ?? true, messages };
}

/** A message while the press meet is live; reporters only while the organizer has the chat on. */
export async function sendChat(meetId: string, viewer: Viewer, body: string): Promise<void> {
  const meet = await chatMeet(meetId, viewer);
  if (meet.status !== "live") {
    throw new ApiError(409, "press_meet_state", meet.status === "scheduled" ? "The chat opens when the press meet starts" : "This press meet is over");
  }
  await db.transaction(async (tx) => {
    const [setting] = [...(await tx.execute<{ chat_enabled: boolean }>(sql`select chat_enabled from press_meet where id = ${meet.id}`))];
    if (meet.role === "reporter" && !setting?.chat_enabled) throw new ApiError(403, "chat_off", "The organizer has turned off the chat");
    await tx.execute(sql`insert into press_meet_message (press_meet_id, user_id, body) values (${meet.id}, ${viewer.id}, ${body})`);
    await pingChat(tx, meet.id);
  });
}

/** The organizer switches the chat on or off for reporters. */
export async function setChatEnabled(meetId: string, viewer: Viewer, enabled: boolean): Promise<boolean> {
  const meet = await chatMeet(meetId, viewer);
  if (meet.role !== "organizer") throw forbidden("Only the organizer can turn the chat on or off");
  await db.transaction(async (tx) => {
    await tx.execute(sql`update press_meet set chat_enabled = ${enabled}, updated_at = now() where id = ${meet.id}`);
    await pingChat(tx, meet.id);
  });
  return enabled;
}
