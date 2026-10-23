import type { MiddlewareHandler } from "hono";
import { ApiError } from "../lib/errors.js";
import { GROUP_ROLE_LABELS, type GroupRole } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";

/*
 * What a member may do while posting as a group account (owner 2026-10-23; lib/acting.ts). Reading is open to every
 * member except the private corners below; changes go by role:
 *  - writer: write and save stories (they go to the editors), upload, delete their own drafts;
 *  - editor: everything about the group's stories (publish, edit, comments, likes, follows), the bell;
 *  - owner:  everything the account can do — except what only a person does (sign-up steps, a Press Pass, push devices).
 * Group management itself (/api/groups) always acts as the real member, so it is never blocked here.
 */

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Never while switched, whatever the role. */
const PERSON_ONLY = [/^\/api\/onboarding/, /^\/api\/press-pass/, /^\/api\/me\/push-devices/];

/** Changes a writer may make. */
const WRITER_WRITES = [
  /^\/api\/articles$/, // save a story (a "publish" goes to the editors)
  /^\/api\/articles\/[^/]+$/, // DELETE: their own draft (checked in queries/article-write.ts)
  /^\/api\/articles\/[^/]+\/(read|share)$/,
  /^\/api\/upload/,
  /^\/api\/views$/,
  /^\/api\/events$/,
  /^\/api\/ai\/describe$/,
];

/** Changes an editor may make, beyond a writer's. */
const EDITOR_WRITES = [/^\/api\/articles\//, /^\/api\/users\/[^/]+\/follow/, /^\/api\/me\/(notifications|notices)\/read$/, /^\/api\/social\/poster\//];

/** Pages only the owner reads (the account's settings, its connections, its chats). */
const OWNER_READS = [/^\/api\/me\/account/, /^\/api\/social\/?$/, /^\/api\/messages/, /^\/api\/ai\/key/];

export const actingGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  const viewer = c.get("viewer");
  const role = viewer?.actor?.role;
  if (!role || c.req.path.startsWith("/api/groups")) return next();
  const path = c.req.path;
  if (UNSAFE.has(c.req.method)) {
    if (PERSON_ONLY.some((rule) => rule.test(path))) throw notAllowed(viewer.name, role, "personal");
    const allowed =
      role === "owner" ||
      WRITER_WRITES.some((rule) => rule.test(path)) ||
      (role === "editor" && EDITOR_WRITES.some((rule) => rule.test(path)));
    if (!allowed) throw notAllowed(viewer.name, role, "role");
  } else if (role !== "owner" && OWNER_READS.some((rule) => rule.test(path))) {
    throw notAllowed(viewer.name, role, "role");
  }
  return next();
};

function notAllowed(group: string, role: GroupRole, why: "personal" | "role"): ApiError {
  const message =
    why === "personal"
      ? `You're posting as ${group}. Switch back to your own account to do this.`
      : `As ${role === "writer" ? "a" : "an"} ${GROUP_ROLE_LABELS[role]} of ${group} you can't do this. Switch back to your own account, or ask the group's owner.`;
  return new ApiError(403, "group_role_forbidden", message);
}
