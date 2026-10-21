import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { env } from "../env.js";
import { ApiError, notFound } from "../lib/errors.js";
import { sendMail } from "../lib/mail.js";
import type { DeskContactMessage, DeskContactStatus } from "../shared/contracts.js";
import type { Viewer } from "../types.js";

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const escape = (value: string) => value.replace(/[&<>"]/g, (ch) => HTML_ESCAPES[ch] ?? ch);

/**
 * Contact us (owner 2026-10-02): saves a signed-in member's message with the email, username and name from their
 * account (never what the page sends), then emails it to the team inbox (env.CONTACT_INBOX) — best effort: the saved
 * copy is what counts, so a mail hiccup never loses a message.
 */
export async function createContactMessage(viewer: Viewer, body: string): Promise<void> {
  const [person] = [
    ...(await db.execute<{ email: string; username: string | null; name: string }>(
      sql`select email, username, name from "user" where id = ${viewer.id}`,
    )),
  ];
  if (!person?.username) throw new ApiError(403, "onboarding_required", "Finish setting up your profile first");
  await db.execute(sql`
    insert into contact_message (user_id, email, username, name, body)
    values (${viewer.id}, ${person.email}, ${person.username}, ${person.name}, ${body})
  `);

  const text = `${person.name} (@${person.username}, ${person.email}) wrote:\n\n${body}`;
  void sendMail({
    to: env.CONTACT_INBOX,
    subject: `Contact us — @${person.username}`,
    text,
    html: `<p><strong>${escape(person.name)}</strong> (@${escape(person.username)}, <a href="mailto:${escape(person.email)}">${escape(person.email)}</a>) wrote:</p><p style="white-space:pre-wrap">${escape(body)}</p>`,
  }).catch((error) => console.warn("[contact] email failed:", error instanceof Error ? error.message : error));
}

/** The Editor Desk inbox (owner 2026-10-10): the latest Contact us messages, new ones (no reply yet) or replied ones. */
export async function listContactMessages(status: DeskContactStatus): Promise<{ items: DeskContactMessage[] }> {
  const where =
    status === "new" ? sql`where m.handled_at is null` : status === "replied" ? sql`where m.handled_at is not null` : sql``;
  const rows = await db.execute<DeskContactMessage>(sql`
    select m.id, m.name, m.username, m.email, u.image, m.body, m.reply,
      to_char(m.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
      to_char(m.handled_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "repliedAt"
    from contact_message m left join "user" u on u.id = m.user_id
    ${where}
    order by m.created_at desc
    limit 200
  `);
  return { items: [...rows] };
}

/**
 * Replies to a Contact us message from the Editor Desk (owner 2026-10-10): saves the reply, marks the message handled
 * and emails the reply to the member (best effort, like the message itself). Replying again replaces the saved reply.
 */
export async function replyContactMessage(actor: { id: string }, id: string, reply: string): Promise<DeskContactMessage> {
  const [row] = [
    ...(await db.execute<{ email: string; name: string; body: string }>(sql`
      update contact_message set reply = ${reply}, replied_by = ${actor.id}, handled_at = now()
      where id = ${id}::uuid
      returning email, name, body
    `)),
  ];
  if (!row) throw notFound("Message not found");

  const quoted = row.body
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  void sendMail({
    to: row.email,
    subject: "Reply from the WebNEWS team",
    text: `Hi ${row.name},\n\n${reply}\n\n— The WebNEWS team\n\nYou wrote:\n${quoted}`,
    html: `<p>Hi ${escape(row.name)},</p><p style="white-space:pre-wrap">${escape(reply)}</p><p>— The WebNEWS team</p><hr><p style="color:#6b7079">You wrote:</p><blockquote style="white-space:pre-wrap;color:#6b7079">${escape(row.body)}</blockquote>`,
  }).catch((error) => console.warn("[contact] reply email failed:", error instanceof Error ? error.message : error));

  const { items } = await listContactMessages("all");
  const saved = items.find((item) => item.id === id);
  if (!saved) throw notFound("Message not found");
  return saved;
}
