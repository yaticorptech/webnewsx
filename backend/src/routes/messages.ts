import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import { ApiError, notFound } from "../lib/errors.js";
import { RATE_LIMITS } from "../lib/rate-limit.js";
import { readJson, parseWith } from "../lib/validate.js";
import { mustViewer, requireOnboarded } from "../middleware/guards.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { findVisibleArticle } from "../queries/articles.js";
import {
  acceptRequest,
  addGroupMembers,
  countUnreadChats,
  createGroup,
  clearChatForViewer,
  deleteChatForViewer,
  ensureDirect,
  findPeople,
  getConversationDetail,
  getMessage,
  listFollowedPeople,
  listInbox,
  listMessages,
  listRecentChats,
  markChatRead,
  postMessage,
  removeMember,
  requireMembership,
  unsendMessage,
  updateGroup,
} from "../queries/messages.js";
import { clampLimit } from "../queries/shared.js";
import { recordShare } from "../queries/social.js";
import { findProfileUser } from "../queries/users.js";
import { normalizeUsername } from "../lib/username.js";
import {
  addPeopleSchema,
  createGroupSchema,
  directChatSchema,
  sendMessageSchema,
  sendToSchema,
  updateChatSchema,
  type SendToResult,
} from "../shared/contracts.js";
import type { AppEnv } from "../types.js";
import type { RouteDeps } from "./deps.js";

const folderSchema = z.enum(["primary", "requests"]).default("primary");

type Attachment =
  | { kind: "text"; body: string }
  | { kind: "article"; articleId: string; articleTitle: string; body: string | null }
  | { kind: "profile"; profileId: string; profileUsername: string; body: string | null };

/** What a send carries: a public story, an available profile, or just text. */
async function resolveAttachment(input: { text?: string | undefined; articleId?: string | undefined; profileUsername?: string | undefined }): Promise<Attachment> {
  const text = input.text?.trim() || null;
  if (input.articleId) {
    const story = await findVisibleArticle(input.articleId);
    if (!story) throw notFound("That story isn't available any more");
    return { kind: "article", articleId: story.id, articleTitle: story.title, body: text };
  }
  if (input.profileUsername) {
    const person = await findProfileUser(normalizeUsername(input.profileUsername));
    if (!person?.username) throw notFound("That profile isn't available any more");
    return { kind: "profile", profileId: person.id, profileUsername: person.username, body: text };
  }
  if (!text) throw new ApiError(400, "validation_error", "Write a message", { text: "Write a message" });
  return { kind: "text", body: text };
}

/** A story sent in a chat counts as a share ("dm") — best effort, once per viewer per story per day. */
function countShare(attachment: Attachment, viewerId: string): void {
  if (attachment.kind !== "article") return;
  void recordShare(attachment.articleId, "dm", `u:${viewerId}`).catch(() => {});
}

/**
 * /api/messages — direct messages, group chats and community chats (owner 2026-09-30). Onboarded accounts only.
 */
export function messageRoutes({ limiter }: RouteDeps) {
  const app = new Hono<AppEnv>();
  const sendLimit = rateLimit(limiter, "message", RATE_LIMITS.message, "user");
  const createLimit = rateLimit(limiter, "chat-create", RATE_LIMITS.chatCreate, "user");
  app.use("*", requireOnboarded);

  // GET /api/messages?folder=primary|requests&cursor= — the inbox, latest activity first (+ unread / request counts).
  app.get("/", async (c) => {
    const folder = parseWith(folderSchema, c.req.query("folder") || undefined);
    return c.json(await listInbox(mustViewer(c).id, folder, c.req.query("cursor"), clampLimit(c.req.query("limit"), 20, 50)));
  });

  // GET /api/messages/unread — `{ unread, requests }` for the masthead badge.
  app.get("/unread", async (c) => c.json(await countUnreadChats(mustViewer(c).id)));

  // GET /api/messages/suggested — the "Send to" sheet: recent chats, then people you follow.
  app.get("/suggested", async (c) => {
    const viewerId = mustViewer(c).id;
    const [chats, people] = await Promise.all([listRecentChats(viewerId, 12), listFollowedPeople(viewerId, 30)]);
    return c.json({ chats, people });
  });

  // POST /api/messages/direct { username } — open (or start) your chat with someone → `{ id }`.
  app.post("/direct", createLimit, async (c) => {
    const viewer = mustViewer(c);
    const { username } = await readJson(c, directChatSchema);
    const [person] = await findPeople([username], viewer.id);
    if (!person) throw new ApiError(400, "cannot_message_self", "You can't message yourself");
    const conv = await db.transaction((tx) => ensureDirect(tx, viewer.id, person.id));
    return c.json({ id: conv.id });
  });

  // POST /api/messages/groups { name?, usernames, image? } → 201 `{ id }`.
  app.post("/groups", createLimit, async (c) => {
    const input = await readJson(c, createGroupSchema);
    return c.json({ id: await createGroup(mustViewer(c).id, input) }, 201);
  });

  // POST /api/messages/send — the share sheet: a story / profile / text to people (their direct chat) and chats.
  app.post("/send", sendLimit, async (c) => {
    const viewer = mustViewer(c);
    const input = await readJson(c, sendToSchema);
    const attachment = await resolveAttachment(input);
    const people = await findPeople(input.usernames, viewer.id);
    const ids = await db.transaction(async (tx) => {
      const targets = new Map<string, { id: string; kind: "direct" | "group" | "community" }>();
      for (const person of people) {
        const conv = await ensureDirect(tx, viewer.id, person.id);
        targets.set(conv.id, conv);
      }
      for (const id of input.conversationIds) {
        const { conv } = await requireMembership(id, viewer.id, tx);
        targets.set(conv.id, conv);
      }
      for (const conv of targets.values()) await postMessage(tx, conv, viewer.id, attachment);
      return [...targets.keys()];
    });
    countShare(attachment, viewer.id);
    return c.json({ sent: ids.length, conversationIds: ids } satisfies SendToResult);
  });

  // GET /api/messages/:id — the chat's details (members, permissions, "Seen").
  app.get("/:id", async (c) => c.json(await getConversationDetail(c.req.param("id"), mustViewer(c).id)));

  // PATCH /api/messages/:id { name?, image? } — rename a group / change its photo.
  app.patch("/:id", async (c) => {
    const viewerId = mustViewer(c).id;
    await updateGroup(c.req.param("id"), viewerId, await readJson(c, updateChatSchema));
    return c.json(await getConversationDetail(c.req.param("id"), viewerId));
  });

  // POST /api/messages/:id/clear — every message so far gone for you; the chat stays in your inbox.
  app.post("/:id/clear", async (c) => {
    await clearChatForViewer(c.req.param("id"), mustViewer(c).id);
    return c.body(null, 204);
  });

  // DELETE /api/messages/:id — delete a direct chat (for you) / decline a request / leave a group or community chat.
  app.delete("/:id", async (c) => {
    await deleteChatForViewer(c.req.param("id"), mustViewer(c).id);
    return c.body(null, 204);
  });

  // GET /api/messages/:id/messages?cursor= — newest first, 30 a page.
  app.get("/:id/messages", async (c) =>
    c.json(await listMessages(c.req.param("id"), mustViewer(c).id, c.req.query("cursor"), clampLimit(c.req.query("limit"), 30, 100))),
  );

  // POST /api/messages/:id/messages { text?, articleId?, profileUsername? } → 201 `{ message }`.
  app.post("/:id/messages", sendLimit, async (c) => {
    const viewer = mustViewer(c);
    const input = await readJson(c, sendMessageSchema);
    const attachment = await resolveAttachment(input);
    const id = await db.transaction(async (tx) => {
      const { conv } = await requireMembership(c.req.param("id"), viewer.id, tx);
      return postMessage(tx, conv, viewer.id, attachment);
    });
    countShare(attachment, viewer.id);
    return c.json({ message: await getMessage(id, viewer.id) }, 201);
  });

  // DELETE /api/messages/:id/messages/:messageId — unsend your message.
  app.delete("/:id/messages/:messageId", async (c) => {
    await unsendMessage(c.req.param("id"), c.req.param("messageId"), mustViewer(c).id);
    return c.body(null, 204);
  });

  // POST /api/messages/:id/read — you've seen the chat.
  app.post("/:id/read", async (c) => {
    const viewerId = mustViewer(c).id;
    await markChatRead(c.req.param("id"), viewerId);
    return c.json(await countUnreadChats(viewerId));
  });

  // POST /api/messages/:id/accept — accept a message request.
  app.post("/:id/accept", async (c) => {
    await acceptRequest(c.req.param("id"), mustViewer(c).id);
    return c.json({ accepted: true });
  });

  // POST /api/messages/:id/members { usernames } — add people to a group.
  app.post("/:id/members", createLimit, async (c) => {
    const { usernames } = await readJson(c, addPeopleSchema);
    return c.json({ added: await addGroupMembers(c.req.param("id"), mustViewer(c).id, usernames) });
  });

  // DELETE /api/messages/:id/members/:username — remove someone (owner / admins).
  app.delete("/:id/members/:username", async (c) => {
    await removeMember(c.req.param("id"), mustViewer(c).id, c.req.param("username"));
    return c.body(null, 204);
  });

  return app;
}
