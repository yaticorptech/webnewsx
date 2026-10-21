import type { Context, MiddlewareHandler } from "hono";
import { ApiError, unauthorized } from "../lib/errors.js";
import { canPublish } from "../lib/roles.js";
import type { AppEnv, Viewer } from "../types.js";

export const pressPassRequired = () =>
  new ApiError(403, "press_pass_required", "Get your Press Pass to publish stories on WebNEWS");

/** Rejects signed-out requests with 401. */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("viewer")) throw unauthorized();
  await next();
};

/** Rejects signed-out (401) and not-yet-onboarded (403 `onboarding_required`) requests. */
export const requireOnboarded: MiddlewareHandler<AppEnv> = async (c, next) => {
  const viewer = c.get("viewer");
  if (!viewer) throw unauthorized();
  if (!viewer.onboarded) throw new ApiError(403, "onboarding_required", "Finish setting up your profile first");
  await next();
};

/** Onboarded Reporter (active Press Pass) or Editor Desk — 403 `press_pass_required` for readers. */
export const requireReporter: MiddlewareHandler<AppEnv> = async (c, next) => {
  const viewer = c.get("viewer");
  if (!viewer) throw unauthorized();
  if (!viewer.onboarded) throw new ApiError(403, "onboarding_required", "Finish setting up your profile first");
  if (!canPublish(viewer)) throw pressPassRequired();
  await next();
};

/** Editor Desk only: 401 signed out, 403 `admin_only` for everyone else, 403 `onboarding_required` until the admin's profile is done. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const viewer = c.get("viewer");
  if (!viewer) throw unauthorized();
  if (viewer.role !== "admin") throw new ApiError(403, "admin_only", "Only the Editor Desk can do that");
  if (!viewer.onboarded) throw new ApiError(403, "onboarding_required", "Finish setting up your profile first");
  await next();
};

/** The viewer inside a handler guarded by requireUser/requireOnboarded. */
export function mustViewer(c: Context<AppEnv>): Viewer {
  const viewer = c.get("viewer");
  if (!viewer) throw unauthorized();
  return viewer;
}
