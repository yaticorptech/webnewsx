import type { ReporterLevel, Role } from "./shared/contracts.js";

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
};

export type AppEnv = {
  Variables: {
    viewer: Viewer | null;
    /** The viewer's Better Auth session (null when signed out): the live stream re-checks it (lib/presence.ts). */
    sessionId: string | null;
    clientIp: string;
  };
};
