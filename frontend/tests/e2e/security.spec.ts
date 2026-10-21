import { expect, randomLetters, test } from "./fixtures";

/*
 * Abuse checks that deliberately use up the per-IP rate limits of the e2e servers (every browser here is
 * 127.0.0.1). They run in their own Playwright project AFTER the desktop and mobile projects (see
 * playwright.config.ts), so no other test is waiting on those budgets.
 */

/** A different made-up client address per request — what an attacker would rotate. */
const spoofed = (i: number) => ({ "x-forwarded-for": `198.51.${i % 250}.${(i * 7) % 250}`, "x-real-ip": `203.0.113.${i % 250}` });

test("a spoofed X-Forwarded-For through the Next proxy doesn't buy a fresh rate-limit budget", async ({ request }) => {
  // GET /api/username/check allows 30 requests per minute per client IP.
  const statuses: number[] = [];
  for (let i = 0; i < 36; i++) {
    const res = await request.get(`/api/username/check?u=t.${randomLetters(10)}`, { headers: spoofed(i) });
    statuses.push(res.status());
  }
  expect(statuses).toContain(429);
  expect(statuses.slice(-3)).toEqual([429, 429, 429]);
});

test("rotating X-Forwarded-For doesn't get around Better Auth's sign-in limit", async ({ request, baseURL }) => {
  // Outside production the e2e backend allows 100 sign-in attempts per 10 s per client IP. Send 130 in quick
  // parallel batches (well inside one window), each claiming a different address.
  const statuses: number[] = [];
  for (let batch = 0; batch < 5; batch++) {
    const responses = await Promise.all(
      Array.from({ length: 26 }, (_, j) =>
        request.post("/api/auth/sign-in/email", {
          data: { email: `nobody.${randomLetters(8)}@test.webnews.local`, password: "wrong-password-123" },
          headers: { ...spoofed(batch * 26 + j), origin: baseURL! },
        }),
      ),
    );
    statuses.push(...responses.map((res) => res.status()));
  }
  expect(statuses.filter((status) => status === 429).length).toBeGreaterThanOrEqual(20);
});
