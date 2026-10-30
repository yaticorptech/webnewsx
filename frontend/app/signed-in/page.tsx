import { redirect } from "next/navigation";
import { ADMIN_HOME } from "@/lib/admin-home";
import { getViewer } from "@/lib/session";
import { safeNextPath } from "@/lib/utils";

/**
 * Where "Continue with Google" returns to (owner 2026-10-30: Google opens the Editor Desk without the password):
 * an admin goes straight to the Desk, everyone else on to `next`.
 */
export default async function SignedInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { next } = await searchParams;
  const viewer = await getViewer();
  redirect(viewer?.role === "admin" ? ADMIN_HOME : safeNextPath(typeof next === "string" ? next : null));
}
