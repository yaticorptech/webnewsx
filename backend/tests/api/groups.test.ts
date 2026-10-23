import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase, db } from "../../src/db/client.js";
import { purgeAccount } from "../../src/db/purge.js";
import { article } from "../../src/db/schema.js";
import type {
  AdminGroupApplication,
  AdminGroupDetail,
  ApiErrorBody,
  GroupDetailResponse,
  NotificationsResponse,
  MyGroupsResponse,
  ProfileData,
  SaveArticleResponse,
  ViewerUser,
} from "../../src/shared/contracts.js";
import {
  LONG_BODY,
  PUBLISH_EXTRAS,
  adminUser,
  cleanupFixtures,
  coverOf,
  freshApp,
  json,
  onboardedUser,
  reporterUser,
  testUsername,
  upload,
  type Client,
} from "../helpers.js";

/*
 * Group accounts (owner 2026-10-23): a Press Pass holder applies, the Desk approves, the owner invites an editor and a
 * writer, they post as the group — the writer's story goes to the editors, the editor publishes it under the group's
 * name, and the story remembers who wrote it.
 */
const app = freshApp();
/** Group accounts made here: their address isn't a test one, so cleanupFixtures' safety net skips them. */
const groupIds: string[] = [];

afterAll(async () => {
  for (const id of groupIds) await purgeAccount(id);
  await cleanupFixtures();
  await closeDatabase();
});

const me = async (c: Client) => (await json<{ viewer: ViewerUser }>(await c.req("/api/me"))).viewer;

async function storyPayload(c: Client, title: string) {
  const cover = await coverOf(c);
  return { title, bodyHtml: LONG_BODY, cover, articleImage: cover, category: "national", ...PUBLISH_EXTRAS };
}

describe("Group accounts", () => {
  it("apply → approve → invite → post as the group by role", async () => {
    const owner = await reporterUser(app);
    const editor = await onboardedUser(app);
    const writer = await onboardedUser(app);
    const desk = await adminUser(app);

    // A reader can't apply; the Press Pass holder can.
    const reader = await onboardedUser(app);
    const avatar = await json<{ url: string }>(await upload(reader, "avatar"));
    const noPass = await reader.req("/api/groups/applications", {
      json: { name: "Test Group", username: testUsername("g"), about: "Civic news from the test suite.", image: avatar.url },
    });
    expect(noPass.status).toBe(403);

    const groupUsername = testUsername("g");
    const logo = await json<{ url: string }>(await upload(owner, "avatar"));
    const applied = await owner.req("/api/groups/applications", {
      json: { name: "VK Test Mangaluru", username: groupUsername, about: "Civic news from the test suite.", image: logo.url, link: "https://www.example.com" },
    });
    expect(applied.status, await applied.clone().text()).toBe(201);
    const appId = (await json<{ application: { id: string } }>(applied)).application.id;

    // The Desk approves: the group's account exists, verified, with the applicant as owner.
    const approve = await desk.req(`/api/admin/groups/${appId}/approve`, { json: {} });
    expect(approve.status, await approve.clone().text()).toBe(200);
    const approved = (await json<{ items: AdminGroupApplication[] }>(approve)).items.find((a) => a.id === appId);
    expect(approved?.status).toBe("approved");
    const profile = await json<ProfileData>(await owner.req(`/api/users/${groupUsername}`));
    expect(profile.user.accountType).toBe("group");
    const groupId = profile.user.id;
    groupIds.push(groupId);

    const page = await json<MyGroupsResponse>(await owner.req("/api/groups"));
    expect(page.groups.map((g) => [g.id, g.role])).toContainEqual([groupId, "owner"]);

    // Invites: editor + writer accept.
    for (const [member, role] of [
      [editor, "editor"],
      [writer, "writer"],
    ] as const) {
      const invited = await owner.req(`/api/groups/${groupId}/members`, { json: { username: member.username, role } });
      expect(invited.status, await invited.clone().text()).toBe(201);
      expect((await member.req(`/api/groups/${groupId}/invite/accept`, { method: "POST" })).status).toBe(200);
    }
    // The invitation reached the bell, from the group.
    const bell = await json<NotificationsResponse>(await writer.req("/api/me/notifications"));
    expect(bell.items.find((n) => n.type === "outlet_invite")).toMatchObject({ actor: { id: groupId }, note: "writer" });

    // One group per person: the owner can't start another.
    const second = await owner.req("/api/groups/applications", {
      json: { name: "Second Group", username: testUsername("g"), about: "Civic news from the test suite.", image: logo.url },
    });
    expect(second.status).toBe(409);

    // Only the owner invites.
    expect((await editor.req(`/api/groups/${groupId}/members`, { json: { username: owner.username, role: "writer" } })).status).toBe(403);

    // The writer switches: /api/me is the group, acting as the writer.
    expect((await writer.req(`/api/groups/${groupId}/switch`, { method: "POST" })).status).toBe(200);
    const asGroup = await me(writer);
    expect(asGroup.id).toBe(groupId);
    expect(asGroup.actingAs).toMatchObject({ groupId, role: "writer", member: { id: writer.userId } });

    // A writer can't edit the group's profile…
    const profileEdit = await writer.req("/api/me", { method: "PATCH", json: { bio: "Changed by a writer" } });
    expect(profileEdit.status).toBe(403);
    expect((await json<ApiErrorBody>(profileEdit)).error.code).toBe("group_role_forbidden");

    // …and "publish" sends the story to the editors.
    const payload = await storyPayload(writer, "Writer's story for the group");
    const sent = await writer.req("/api/articles", { json: { ...payload, action: "publish" } });
    expect(sent.status, await sent.clone().text()).toBe(201);
    const sentBody = await json<SaveArticleResponse>(sent);
    expect(sentBody.status).toBe("group_review");
    const storyId = sentBody.article.id;

    const detail = await json<GroupDetailResponse>(await editor.req(`/api/groups/${groupId}`));
    expect(detail.pendingStories.map((s) => [s.id, s.writer?.id])).toContainEqual([storyId, writer.userId]);

    // The editor switches and publishes it under the group's name.
    expect((await editor.req(`/api/groups/${groupId}/switch`, { method: "POST" })).status).toBe(200);
    const live = await editor.req("/api/articles", { json: { ...payload, id: storyId, action: "publish" } });
    expect(live.status, await live.clone().text()).toBe(200);
    expect((await json<SaveArticleResponse>(live)).status).toBe("published");
    const [row] = await db.select({ authorId: article.authorId, postedById: article.postedById, groupSubmittedAt: article.groupSubmittedAt }).from(article).where(eq(article.id, storyId));
    expect(row).toEqual({ authorId: groupId, postedById: writer.userId, groupSubmittedAt: null });

    // The Desk sees the group: owner first, who wrote what.
    const deskView = await json<AdminGroupDetail>(await desk.req(`/api/admin/groups/${appId}/detail`));
    expect(deskView.members[0]?.user.id).toBe(owner.userId);
    expect(deskView.stories.published).toBe(1);
    expect(deskView.members.find((m) => m.user.id === writer.userId)?.storiesPosted).toBe(1);
    expect(deskView.recent[0]?.writer?.id).toBe(writer.userId);

    // The writer can't change it now that it's live.
    const late = await writer.req("/api/articles", { json: { ...payload, id: storyId, action: "publish" } });
    expect(late.status).toBe(403);

    // Switching back: your own account again.
    expect((await writer.req("/api/groups/switch-back", { method: "POST" })).status).toBe(200);
    expect((await me(writer)).id).toBe(writer.userId);

    // The owner can't leave; a member can.
    expect((await owner.req(`/api/groups/${groupId}/members/${owner.userId}`, { method: "DELETE" })).status).toBe(409);
    expect((await writer.req(`/api/groups/${groupId}/members/${writer.userId}`, { method: "DELETE" })).status).toBe(200);
    expect((await writer.req(`/api/groups/${groupId}/switch`, { method: "POST" })).status).toBe(404);

    // The owner deactivates it: hidden, nobody can switch to it; reactivating brings it back.
    expect((await editor.req(`/api/groups/${groupId}/deactivate`, { method: "POST" })).status).toBe(403);
    expect((await owner.req(`/api/groups/${groupId}/deactivate`, { method: "POST" })).status).toBe(200);
    expect((await owner.req(`/api/users/${groupUsername}`)).status).toBe(404);
    expect((await editor.req(`/api/groups/${groupId}/switch`, { method: "POST" })).status).toBe(404);
    const listed = await json<MyGroupsResponse>(await owner.req("/api/groups"));
    expect(listed.groups.find((g) => g.id === groupId)?.deactivated).toBe(true);
    expect((await owner.req(`/api/groups/${groupId}/reactivate`, { method: "POST" })).status).toBe(200);
    expect((await owner.req(`/api/users/${groupUsername}`)).status).toBe(200);

    // Only the owner deletes the group — then it's gone.
    expect((await editor.req(`/api/groups/${groupId}`, { method: "DELETE" })).status).toBe(403);
    expect((await owner.req(`/api/groups/${groupId}`, { method: "DELETE" })).status).toBe(200);
    expect((await owner.req(`/api/users/${groupUsername}`)).status).toBe(404);
  });
});
