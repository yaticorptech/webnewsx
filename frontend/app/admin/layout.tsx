import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { loadOverview } from "@/components/admin/server-loaders";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = {
  title: { default: "Editor Desk", template: "%s · Editor Desk · WebNEWS" },
  robots: { index: false, follow: false },
};

/**
 * Editor Desk console (SPEC §3.11) — its own shell outside the (main) app shell: sidebar on
 * desktop, top tabs on phones. Admin only: everyone else (logged out included) gets the 404 page.
 * Pages repeat `requireAdmin()` because layouts don't re-render on client navigation.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const viewer = await requireAdmin();
  // Pending counts for the navigation; a failure here must not take the console down.
  const overview = await loadOverview();
  return (
    <AdminShell viewer={{ name: viewer.name, username: viewer.username, image: viewer.image }} overview={overview}>
      {children}
    </AdminShell>
  );
}
