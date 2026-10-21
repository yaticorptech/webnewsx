import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase, sql } from "../../src/db/client.js";
import { purgeUsers } from "../../src/db/purge.js";
import { adminUser, cleanupFixtures, freshApp, publishArticle, randomLetters, reporterUser, signUp, testEmail } from "../helpers.js";

const app = freshApp();

afterAll(async () => {
  await cleanupFixtures();
  await closeDatabase();
});

const exists = async (id: string) => (await sql`select 1 from "user" where id = ${id}`).length === 1;

describe("purgeUsers({ testEmailPrefix }) — one e2e run's fixtures", () => {
  it("removes only test users whose email starts with the prefix", async () => {
    const prefix = `run.${randomLetters(8)}.`;
    const a = await signUp(app, testEmail(`${prefix}${randomLetters(6)}`));
    const b = await signUp(app, testEmail(`${prefix}${randomLetters(6)}`));
    const other = await signUp(app, testEmail(`run.${randomLetters(8)}.${randomLetters(6)}`));

    const result = await purgeUsers({ testEmailPrefix: prefix });

    expect(result.users).toBe(2);
    expect(await exists(a.userId)).toBe(false);
    expect(await exists(b.userId)).toBe(false);
    expect(await exists(other.userId)).toBe(true);
  });

  it("rejects prefixes that could act as LIKE wildcards or match everything", async () => {
    for (const bad of ["%", "a_b.", "ab", "", "x%@", "Run.x"]) {
      await expect(purgeUsers({ testEmailPrefix: bad })).rejects.toThrow(/testEmailPrefix/);
    }
  });
});

describe("purgeUsers — Editor Desk audit entries", () => {
  it("removes audit entries made by or about the purged users and their stories", async () => {
    const desk = await adminUser(app);
    const rep = await reporterUser(app);
    const story = await publishArticle(rep, "A story whose audit trail goes with it");
    await desk.req(`/api/admin/stories/${story.id}/hide`, { json: { reason: "purge test" } });
    await desk.req(`/api/admin/reporters/${rep.userId}/downgrade`, { json: {} });
    const auditRows = async () =>
      (
        await sql`select count(*)::int as n from admin_audit_log
          where actor_id = ${desk.userId} or target_id in (${desk.userId}, ${rep.userId}, ${story.id})`
      )[0]?.n as number;
    expect(await auditRows()).toBeGreaterThanOrEqual(3); // auto_admin, story.hide, reporter.downgrade

    const result = await purgeUsers({ ids: [desk.userId, rep.userId] });
    expect(result.users).toBe(2);
    expect(await auditRows()).toBe(0);
  });
});
