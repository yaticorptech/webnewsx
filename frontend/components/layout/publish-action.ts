import type { ViewerUser } from "@/lib/shared/contracts";

/**
 * THE place that decides what "Publish" means for the current viewer (SPEC §3.11): only Reporters
 * and the Editor Desk may publish; Readers are pointed at their Press Pass instead. The masthead and
 * the empty feed render from this, so role rules change in one spot. Server-safe (pure).
 */
export type PublishAction =
  /** Reporter / Editor Desk: straight to the composer. */
  | { kind: "publish"; href: "/publish"; label: string }
  /** Reader: publishing starts with a Press Pass (the "+" still opens the composer, which asks for one). */
  | { kind: "press-pass"; href: "/press-pass"; label: string }
  /** Signed in but the profile isn't finished. */
  | { kind: "onboard"; href: "/onboarding"; label: string }
  /** Signed out: opens the AuthPrompt with `reason`. */
  | { kind: "login"; reason: string };

export function publishActionFor(viewer: ViewerUser | null): PublishAction {
  if (!viewer) return { kind: "login", reason: "Log in to get your Press Pass" };
  if (!viewer.onboarded || !viewer.username) return { kind: "onboard", href: "/onboarding", label: "Finish profile" };
  if (viewer.role === "reporter" || viewer.role === "admin") return { kind: "publish", href: "/publish", label: "Publish" };
  return { kind: "press-pass", href: "/press-pass", label: "Get your Press Pass" };
}
