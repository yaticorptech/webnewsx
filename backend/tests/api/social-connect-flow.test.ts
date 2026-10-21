import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase } from "../../src/db/client.js";
import { env } from "../../src/env.js";
import { cleanupFixtures, client, freshApp, reporterUser } from "../helpers.js";

/*
 * The website's Connect round trip (Edit profile → Meta's login → back), with test keys: run as
 * `META_APP_ID=test META_APP_SECRET=test INSTAGRAM_APP_ID=test INSTAGRAM_APP_SECRET=test npx vitest run tests/api/social-connect-flow.test.ts`.
 * Skipped without keys (the real ones are never in tests).
 */
const app = freshApp();

afterAll(async () => {
  await cleanupFixtures();
  await closeDatabase();
});

describe.skipIf(!env.facebookEnabled || !env.instagramEnabled)("Connect on the website", () => {
  for (const provider of ["facebook", "instagram"] as const) {
    it(`${provider}: sends the reporter to Meta's login and back to Edit profile`, async () => {
      const reporter = await reporterUser(app);
      const res = await reporter.req(`/api/social/${provider}/connect`);
      expect(res.status).toBe(302);
      const login = new URL(res.headers.get("location") ?? "");
      expect(login.origin).toBe(provider === "facebook" ? "https://www.facebook.com" : "https://www.instagram.com");
      expect(login.searchParams.get("redirect_uri")).toBe(`${env.FRONTEND_URL}/api/social/${provider}/callback`);
      const state = login.searchParams.get("state") ?? "";
      expect(reporter.cookie).toMatch(/wn_social=/);
      const callback = `/api/social/${provider}/callback?state=${encodeURIComponent(state)}&code=abc`;

      // Another browser — same WebNEWS login, but not the one that started it (no nonce): refused before Meta is asked.
      const session = reporter.cookie
        .split(/;\s*/)
        .filter((pair) => !pair.startsWith("wn_social="))
        .join("; ");
      const forged = await client(app, session).req(callback);
      const forgedTo = new URL(forged.headers.get("location") ?? "");
      expect(forgedTo.searchParams.get("result")).toBe("error");
      expect(forgedTo.searchParams.get("reason")).toContain("expired");

      // The same browser: Meta rejects our test keys, and the reporter lands back on Edit profile with Meta's reason.
      const back = await reporter.req(callback);
      expect(back.status).toBe(302);
      const to = new URL(back.headers.get("location") ?? "");
      expect(to.pathname).toBe("/settings/profile");
      expect(to.searchParams.get("social")).toBe(provider);
      expect(to.searchParams.get("result")).toBe("error");
      expect(to.searchParams.get("reason")).toBeTruthy();
      expect(to.searchParams.get("reason")).not.toContain("expired");

      // Cancelled on Meta's page.
      const connect2 = await reporter.req(`/api/social/${provider}/connect`);
      const state2 = new URL(connect2.headers.get("location") ?? "").searchParams.get("state") ?? "";
      const cancelled = await reporter.req(`/api/social/${provider}/callback?state=${encodeURIComponent(state2)}&error=access_denied`);
      expect(new URL(cancelled.headers.get("location") ?? "").searchParams.get("result")).toBe("cancelled");
    });
  }
});
