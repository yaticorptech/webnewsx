import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase } from "../../src/db/client.js";
import { cleanupFixtures, freshApp, logIn, onboardedUser } from "../helpers.js";

/* Leaving WebNEWS (owner 2026-10-23): deactivate hides you until you log in again; delete removes the account. */
const app = freshApp();

afterAll(async () => {
  await cleanupFixtures();
  await closeDatabase();
});

describe("Deactivate / delete your account", () => {
  it("deactivate hides the profile until the next log in; delete removes it", async () => {
    const person = await onboardedUser(app);
    const viewer = await onboardedUser(app);
    const email = (await (await person.req("/api/me/account")).json()) as { email: string };

    expect((await person.req("/api/me/deactivate", { json: { confirm: "someone.else" } })).status).toBe(400);
    expect((await person.req("/api/me/deactivate", { json: { confirm: person.username } })).status).toBe(200);
    expect((await viewer.req(`/api/users/${person.username}`)).status).toBe(404);
    expect(((await (await person.req("/api/me")).json()) as { viewer: unknown }).viewer).toBeNull();

    // Logging in again brings it back.
    const back = await logIn(app, email.email, person.userId);
    expect((await viewer.req(`/api/users/${person.username}`)).status).toBe(200);

    expect((await back.req("/api/me/delete", { json: { confirm: person.username } })).status).toBe(200);
    expect((await viewer.req(`/api/users/${person.username}`)).status).toBe(404);
  });
});
