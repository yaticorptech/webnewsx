import { Hono } from "hono";
import { readJson } from "../lib/validate.js";
import { mustViewer, requireOnboarded } from "../middleware/guards.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { getEarnings, listMyMemberships } from "../queries/membership-dashboards.js";
import { createOrder, getCheckout, verifyPayment } from "../queries/memberships.js";
import { membershipVerifySchema } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";
import type { RouteDeps } from "./deps.js";

/** Premium membership checkout (owner 2026-10-14): price breakdown, Razorpay order, payment check. */
export function membershipRoutes({ limiter }: RouteDeps) {
  const app = new Hono<AppEnv>();
  const payLimit = rateLimit(limiter, "membership", { limit: 20, windowMs: 60 * 60_000 }, "user");

  // POST /api/memberships/verify { razorpayOrderId, razorpayPaymentId, razorpaySignature } → { activeUntil, username }
  app.post("/verify", requireOnboarded, payLimit, async (c) => {
    const input = await readJson(c, membershipVerifySchema);
    return c.json(await verifyPayment(mustViewer(c), input));
  });

  // GET /api/memberships/mine → MyMemberships (Settings → My memberships)
  app.get("/mine", requireOnboarded, async (c) => c.json(await listMyMemberships(mustViewer(c).id)));

  // GET /api/memberships/earnings → MembershipEarnings (Settings → Premium membership)
  app.get("/earnings", requireOnboarded, async (c) => c.json(await getEarnings(mustViewer(c).id)));

  // GET /api/memberships/:username → MembershipCheckout
  app.get("/:username", requireOnboarded, async (c) => c.json(await getCheckout(c.req.param("username"), mustViewer(c))));

  // POST /api/memberships/:username/orders → MembershipOrder
  app.post("/:username/orders", requireOnboarded, payLimit, async (c) => c.json(await createOrder(mustViewer(c), c.req.param("username")), 201));

  return app;
}
