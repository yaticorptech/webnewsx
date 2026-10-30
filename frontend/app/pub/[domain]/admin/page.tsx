import type { Metadata } from "next";
import { SiteAdmin } from "@/components/publisher/site-admin";

export const metadata: Metadata = { title: { absolute: "Admin" }, robots: { index: false, follow: false } };

/** `<domain>/admin` (owner 2026-10-29): the publisher site's own admin, behind its separate email + password. */
export default async function PublisherAdminPage({ params }: { params: Promise<{ domain: string }> }) {
  return <SiteAdmin domain={decodeURIComponent((await params).domain)} />;
}
