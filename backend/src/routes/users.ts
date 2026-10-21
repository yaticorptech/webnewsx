import { Hono, type Context } from "hono";
import { z } from "zod";
import { ApiError, notFound } from "../lib/errors.js";
import { RATE_LIMITS } from "../lib/rate-limit.js";
import { normalizeUsername } from "../lib/username.js";
import { parseWith, readJson } from "../lib/validate.js";
import { mustViewer, requireOnboarded } from "../middleware/guards.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { listAuthorPublished, listDrafts } from "../queries/articles.js";
import { clampLimit } from "../queries/shared.js";
import { setFollow } from "../queries/social.js";
import { findProfileUser, getProfile, listFollowUsers, listTopPublishers } from "../queries/users.js";
import { followNotifySchema, USERNAME_REGEX } from "../shared/contracts.js";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { follow } from "../db/schema.js";
import type { AppEnv } from "../types.js";
import type { RouteDeps } from "./deps.js";

const GRID_PAGE_SIZE = 12;
const LIST_PAGE_SIZE = 20;
const statusSchema = z.enum(["published", "draft"]).default("published");

/** Onboarded (and, except for the Editor Desk, not suspended) profile owner for `:username`, or 404. */
async function profileOr404(c: Context<AppEnv>) {
  const username = normalizeUsername(c.req.param("username") ?? "");
  if (!USERNAME_REGEX.test(username)) throw notFound("Profile not found");
  const record = await findProfileUser(username, { includeSuspended: c.get("viewer")?.role === "admin" });
  if (!record) throw notFound("Profile not found");
  return record;
}

export function userRoutes({ limiter }: RouteDeps) {
  const app = new Hono<AppEnv>();
  const socialLimit = rateLimit(limiter, "social", RATE_LIMITS.social, "user");

  // GET /api/users/top?limit= — "Publishers to follow" (registered before /:username).
  app.get("/top", async (c) => {
    const items = await listTopPublishers(c.get("viewer")?.id ?? null, clampLimit(c.req.query("limit"), 5, 20));
    return c.json({ items });
  });

  // GET /api/users/:username — ProfileData.
  app.get("/:username", async (c) => {
    const username = normalizeUsername(c.req.param("username"));
    const profile = USERNAME_REGEX.test(username) ? await getProfile(username, c.get("viewer")) : null;
    if (!profile) throw notFound("Profile not found");
    return c.json(profile);
  });

  // POST / DELETE /api/users/:username/follow
  for (const method of ["post", "delete"] as const) {
    app[method]("/:username/follow", requireOnboarded, socialLimit, async (c) => {
      const viewer = mustViewer(c);
      const target = await profileOr404(c);
      if (target.id === viewer.id) throw new ApiError(400, "cannot_follow_self", "You can't follow yourself");
      return c.json(await setFollow(viewer.id, target.id, method === "post"));
    });
  }

  // GET /api/users/:username/follow → { following, notify } — the viewer's follow and its bell (owner 2026-10-16).
  app.get("/:username/follow", requireOnboarded, async (c) => {
    const viewer = mustViewer(c);
    const target = await profileOr404(c);
    const [row] = await db
      .select({ notify: follow.notify })
      .from(follow)
      .where(and(eq(follow.followerId, viewer.id), eq(follow.followingId, target.id)))
      .limit(1);
    return c.json({ following: Boolean(row), notify: row?.notify ?? true });
  });

  // PUT /api/users/:username/follow/notify { notify } → { notify } — the bell: every new story, or none.
  app.put("/:username/follow/notify", requireOnboarded, socialLimit, async (c) => {
    const viewer = mustViewer(c);
    const target = await profileOr404(c);
    const { notify } = await readJson(c, followNotifySchema);
    const updated = await db
      .update(follow)
      .set({ notify })
      .where(and(eq(follow.followerId, viewer.id), eq(follow.followingId, target.id)))
      .returning({ notify: follow.notify });
    if (updated.length === 0) throw new ApiError(409, "not_following", "Follow them first");
    return c.json({ notify });
  });

  // GET /api/users/:username/followers | following ?cursor=
  for (const direction of ["followers", "following"] as const) {
    app.get(`/:username/${direction}`, async (c) => {
      const target = await profileOr404(c);
      const page = await listFollowUsers({
        userId: target.id,
        direction,
        viewerId: c.get("viewer")?.id ?? null,
        cursor: c.req.query("cursor"),
        limit: clampLimit(c.req.query("limit"), LIST_PAGE_SIZE, 50),
      });
      return c.json(page);
    });
  }

  // GET /api/users/:username/articles?status=published|draft&cursor=&premium=1 (members-only stories)
  // status=draft is owner-only and returns DraftCard items (same as /drafts).
  app.get("/:username/articles", async (c) => {
    const target = await profileOr404(c);
    const status = parseWith(statusSchema, c.req.query("status") || undefined);
    const viewer = c.get("viewer");
    const limit = clampLimit(c.req.query("limit"), GRID_PAGE_SIZE, 30);
    if (status === "draft") {
      if (viewer?.id !== target.id) throw notFound("Profile not found");
      return c.json(await listDrafts({ authorId: target.id, cursor: c.req.query("cursor"), limit }));
    }
    const page = await listAuthorPublished({
      authorId: target.id,
      viewerId: viewer?.id ?? null,
      cursor: c.req.query("cursor"),
      limit,
      // The author and the Editor Desk also see stories the desk hid (marked `hidden: true`).
      includeHidden: viewer !== null && (viewer.id === target.id || viewer.role === "admin"),
      premiumOnly: c.req.query("premium") === "1",
    });
    return c.json(page);
  });

  // GET /api/users/:username/drafts?cursor= — owner only; everyone else gets 404.
  app.get("/:username/drafts", async (c) => {
    const target = await profileOr404(c);
    if (c.get("viewer")?.id !== target.id) throw notFound("Profile not found");
    const page = await listDrafts({ authorId: target.id, cursor: c.req.query("cursor"), limit: clampLimit(c.req.query("limit"), GRID_PAGE_SIZE, 30) });
    return c.json(page);
  });

  return app;
}
