import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase } from "../../src/db/client.js";
import type { PressPass, PublicPressPass } from "../../src/shared/contracts.js";
import { cleanupFixtures, client, freshApp, json, reporterUser } from "../helpers.js";

const app = freshApp();
afterAll(async () => {
  await cleanupFixtures();
  await closeDatabase();
});

describe("Press Pass QR verify page", () => {
  it("shows the card's details to anyone, never the private application", async () => {
    const reporter = await reporterUser(app);
    const mine = await json<{ pressPass: PressPass }>(await reporter.req("/api/press-pass"));
    const res = await client(app).req(`/api/press-pass/verify/${mine.pressPass.passNumber}`);
    expect(res.status, await res.clone().text()).toBe(200);
    const text = await res.clone().text();
    const { pressPass } = await json<{ pressPass: PublicPressPass }>(res);
    expect(pressPass).toMatchObject({ passNumber: mine.pressPass.passNumber, status: "active", level: "verified" });
    expect(text).not.toContain(mine.pressPass.mobile ?? "no-mobile");
    expect((await client(app).req("/api/press-pass/verify/WN-KA-000000")).status).toBe(404);
  });
});
