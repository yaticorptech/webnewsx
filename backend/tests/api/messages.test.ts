import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase } from "../../src/db/client.js";
import type {
  AppNotification,
  ChatMessage,
  CommunityDetail,
  ConversationDetail,
  InboxResponse,
  NotificationsResponse,
  Page,
  UnreadMessages,
} from "../../src/shared/contracts.js";
import { cleanupFixtures, freshApp, json, onboardedUser, publishArticle, reporterUser, type Client } from "../helpers.js";

const app = freshApp();

afterAll(async () => {
  await cleanupFixtures();
  await closeDatabase();
});

const bell = async (c: Client) => (await json<NotificationsResponse>(await c.req("/api/me/notifications"))).items;
const find = (items: AppNotification[], type: AppNotification["type"]) => items.find((n) => n.type === type);

describe("direct messages", () => {
  it("a DM from someone you don't follow is a request; sharing a story and a profile works; the bell and badge update", async () => {
    const author = await reporterUser(app);
    const story = await publishArticle(author);
    const asha = await onboardedUser(app);
    const ravi = await onboardedUser(app);

    const { id } = await json<{ id: string }>(await asha.req("/api/messages/direct", { json: { username: ravi.username } }));
    // Same pair → same chat.
    expect((await json<{ id: string }>(await ravi.req("/api/messages/direct", { json: { username: asha.username } }))).id).toBe(id);

    const sent = await asha.req(`/api/messages/${id}/messages`, { json: { text: "Hi Ravi" } });
    expect(sent.status).toBe(201);
    const shared = await json<{ sent: number }>(
      await asha.req("/api/messages/send", { json: { usernames: [ravi.username], articleId: story.id, text: "Read this" } }),
    );
    expect(shared.sent).toBe(1);
    await asha.req(`/api/messages/${id}/messages`, { json: { profileUsername: author.username } });

    // Ravi doesn't follow Asha: it's a request, not in his chats or badge.
    const requests = await json<InboxResponse>(await ravi.req("/api/messages?folder=requests"));
    expect(requests.items.map((c) => c.id)).toContain(id);
    expect(requests.requests).toBeGreaterThanOrEqual(1);
    expect((await json<UnreadMessages>(await ravi.req("/api/messages/unread"))).unread).toBe(0);
    const note = find(await bell(ravi), "message");
    expect(note?.conversation).toMatchObject({ id, kind: "direct", request: true });
    expect(note?.count).toBe(3);

    const thread = await json<Page<ChatMessage>>(await ravi.req(`/api/messages/${id}/messages`));
    expect(thread.items.map((m) => m.kind)).toEqual(["profile", "article", "text"]);
    expect(thread.items[1]?.article?.id).toBe(story.id);
    expect(thread.items[1]?.text).toBe("Read this");
    expect(thread.items[0]?.profile?.username).toBe(author.username);

    // Accept → it's a chat with 1 unread; reading it clears the badge and shows "Seen" to Asha.
    await ravi.req(`/api/messages/${id}/accept`, { method: "POST" });
    expect((await json<UnreadMessages>(await ravi.req("/api/messages/unread"))).unread).toBe(1);
    expect((await json<UnreadMessages>(await ravi.req(`/api/messages/${id}/read`, { method: "POST" }))).unread).toBe(0);
    const detail = await json<ConversationDetail>(await asha.req(`/api/messages/${id}`));
    expect(detail.peer?.username).toBe(ravi.username);
    expect(new Date(detail.peerReadAt ?? 0).getTime()).toBeGreaterThanOrEqual(new Date(thread.items[0]?.createdAt ?? 0).getTime());

    // Outsiders can't see it.
    const outsider = await onboardedUser(app);
    expect((await outsider.req(`/api/messages/${id}`)).status).toBe(404);
  });
});

describe("groups", () => {
  it("creates a group, notifies the people added, and members can leave", async () => {
    const [owner, a, b, c] = await Promise.all([onboardedUser(app), onboardedUser(app), onboardedUser(app), onboardedUser(app)]);
    const res = await owner.req("/api/messages/groups", { json: { name: "Desk team", usernames: [a.username, b.username] } });
    expect(res.status).toBe(201);
    const { id } = await json<{ id: string }>(res);
    expect(find(await bell(a), "group_added")?.conversation).toMatchObject({ id, kind: "group", name: "Desk team" });

    await owner.req(`/api/messages/${id}/members`, { json: { usernames: [c.username] } });
    await owner.req(`/api/messages/${id}/messages`, { json: { text: "Welcome" } });
    const detail = await json<ConversationDetail>(await c.req(`/api/messages/${id}`));
    expect(detail.memberCount).toBe(4);
    expect(detail.title).toBe("Desk team");

    expect((await b.req(`/api/messages/${id}`, { method: "DELETE" })).status).toBe(204);
    expect((await b.req(`/api/messages/${id}`)).status).toBe(404);
  });
});

describe("communities", () => {
  it("public join, private invite → accept, and the owner hears about it", async () => {
    const [owner, joiner, guest] = await Promise.all([onboardedUser(app), onboardedUser(app), onboardedUser(app)]);
    const { id: pub } = await json<{ id: string }>(await owner.req("/api/communities", { json: { name: "Mysuru Local", visibility: "public" } }));
    const joined = await json<CommunityDetail>(await joiner.req(`/api/communities/${pub}/join`, { method: "POST" }));
    expect(joined.viewer.role).toBe("member");
    expect(joined.memberCount).toBe(2);
    expect(find(await bell(owner), "community_joined")?.conversation?.id).toBe(pub);

    const { id: priv } = await json<{ id: string }>(await owner.req("/api/communities", { json: { name: "Night Desk", visibility: "private" } }));
    expect((await guest.req(`/api/communities/${priv}`)).status).toBe(404);
    expect((await guest.req(`/api/communities/${priv}/join`, { method: "POST" })).status).toBe(404);

    expect((await json<{ invited: number }>(await owner.req(`/api/communities/${priv}/invites`, { json: { usernames: [guest.username] } }))).invited).toBe(1);
    const invite = find(await bell(guest), "community_invite");
    expect(invite?.invite?.status).toBe("pending");
    const answer = await json<{ status: string }>(await guest.req(`/api/communities/invites/${invite?.invite?.id}/accept`, { method: "POST" }));
    expect(answer.status).toBe("accepted");
    expect((await json<CommunityDetail>(await guest.req(`/api/communities/${priv}`))).viewer.role).toBe("member");

    // The community chat works like any chat.
    expect((await guest.req(`/api/messages/${priv}/messages`, { json: { text: "Thanks for the invite" } })).status).toBe(201);
    expect(find(await bell(owner), "message")?.conversation).toMatchObject({ id: priv, kind: "community" });
  });
});
