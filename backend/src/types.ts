import type { GroupRole, ReporterLevel, Role } from "./shared/contracts.js";

/** Authenticated user as seen by route handlers (from the Better Auth session). */
export type Viewer = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  username: string | null;
  bio: string | null;
  onboardedAt: Date | null;
  onboarded: boolean;
  role: Role;
  /** Level of the active Press Pass (null without one). */
  reporterLevel: ReporterLevel | null;
  /**
   * Posting as a group account (owner 2026-10-23, middleware/session.ts): this viewer is then the GROUP, and `actor` is
   * the member really signed in, with their role in the group. Undefined on your own account.
   */
  actor?: GroupActorRef;
};

export type GroupActorRef = { id: string; name: string; username: string | null; image: string | null; role: GroupRole };

export type AppEnv = {
  Variables: {
    viewer: Viewer | null;
    /** The viewer's Better Auth session (null when signed out): the live stream re-checks it (lib/presence.ts). */
    sessionId: string | null;
    clientIp: string;
  };
};
