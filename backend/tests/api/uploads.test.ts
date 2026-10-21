import { mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase, db } from "../../src/db/client.js";
import { article, user } from "../../src/db/schema.js";
import { LocalStorage } from "../../src/lib/storage.js";
import { ORPHAN_UPLOAD_TTL_MS, sweepOrphanUploads } from "../../src/lib/upload-sweep.js";
import { cleanupFixtures, freshApp, publishArticle, reporterUser } from "../helpers.js";

/*
 * The orphan-upload sweep runs against a private temporary folder: only this file's fixture keys exist there,
 * and the database lookups only ever match this file's fixture users / stories.
 */
const app = freshApp();
const dirs: string[] = [];

afterAll(async () => {
  await cleanupFixtures();
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
  await closeDatabase();
});

const png = Buffer.from("89504e470d0a1a0a", "hex");

describe("orphan upload sweep", () => {
  it("deletes only old uploads that no avatar or story references", async () => {
    const reporter = await reporterUser(app);
    const story = await publishArticle(reporter);
    const [row] = await db.select({ image: user.image }).from(user).where(eq(user.id, reporter.userId));
    const [cover] = await db.select({ key: article.coverKey }).from(article).where(eq(article.id, story.id));
    const avatarKey = row?.image?.replace(/^\/media\//, "");
    expect(avatarKey).toMatch(/^avatars\//);
    expect(cover?.key).toMatch(/^covers\//);

    const root = await mkdtemp(join(tmpdir(), "webnews-sweep-"));
    dirs.push(root);
    const driver = new LocalStorage(root);
    const old = new Date(Date.now() - ORPHAN_UPLOAD_TTL_MS - 60_000);
    const keys = {
      usedAvatar: avatarKey as string,
      usedCover: cover?.key as string,
      oldOrphan: `covers/${reporter.userId}/${crypto.randomUUID()}.webp`,
      oldOrphanAvatar: `avatars/${reporter.userId}/${crypto.randomUUID()}.webp`,
      freshOrphan: `covers/${reporter.userId}/${crypto.randomUUID()}.webp`,
    };
    for (const [name, key] of Object.entries(keys)) {
      await driver.put(key, png);
      if (name !== "freshOrphan") await utimes(join(root, key), old, old);
    }

    expect(await sweepOrphanUploads({ driver })).toEqual({ scanned: 5, deleted: 2 });
    const left = [];
    for await (const object of driver.list("covers/")) left.push(object.key);
    for await (const object of driver.list("avatars/")) left.push(object.key);
    expect(left.sort()).toEqual([keys.usedAvatar, keys.usedCover, keys.freshOrphan].sort());

    // A deleted account's folders go entirely (R2 and disk alike).
    await driver.deletePrefix(`covers/${reporter.userId}/`);
    const after = [];
    for await (const object of driver.list(`covers/${reporter.userId}/`)) after.push(object.key);
    expect(after).toEqual([]);
  });
});
