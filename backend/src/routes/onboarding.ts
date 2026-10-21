import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { user } from "../db/schema.js";
import { resolveAvatarImage } from "../lib/avatar.js";
import { ApiError, isUniqueViolation, notFound } from "../lib/errors.js";
import { RATE_LIMITS } from "../lib/rate-limit.js";
import { readJson } from "../lib/validate.js";
import { mustViewer, requireUser } from "../middleware/guards.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { isUsernameTaken } from "../queries/users.js";
import { TERMS_VERSION, onboardingSchema } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";
import type { RouteDeps } from "./deps.js";
import { cleanupOldAvatar, usernameTaken, viewerUserOr404 } from "./me.js";

export function onboardingRoutes({ limiter }: RouteDeps) {
  const app = new Hono<AppEnv>();

  // POST /api/onboarding — completes the required profile; unlocks the rest of the API.
  app.post("/", requireUser, rateLimit(limiter, "onboarding", RATE_LIMITS.onboarding, "user"), async (c) => {
    const viewer = mustViewer(c);
    if (viewer.onboarded) throw new ApiError(409, "already_onboarded", "Your profile is already set up");
    const input = await readJson(c, onboardingSchema);

    if (await isUsernameTaken(input.username, viewer.id)) throw usernameTaken();
    const image = await resolveAvatarImage(input.image, viewer.id, viewer.image);
    const now = new Date();

    let updated;
    try {
      [updated] = await db
        .update(user)
        .set({
          username: input.username,
          name: input.name,
          bio: input.bio,
          image,
          ...(input.languages?.length ? { preferredLanguages: input.languages } : {}),
          onboardedAt: now,
          termsAcceptedAt: now,
          termsVersion: TERMS_VERSION,
          updatedAt: now,
        })
        .where(eq(user.id, viewer.id))
        .returning();
    } catch (error) {
      if (isUniqueViolation(error, "user_username_unique")) throw usernameTaken();
      throw error;
    }
    if (!updated) throw notFound("Account not found");
    await cleanupOldAvatar(viewer.image, image, viewer.id);
    return c.json({ user: await viewerUserOr404(updated.id) });
  });

  return app;
}
