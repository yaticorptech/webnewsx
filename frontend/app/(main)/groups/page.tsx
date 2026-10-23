import type { Metadata } from "next";
import { GroupsView } from "@/components/groups/groups-view";
import { requireOnboardedViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Group accounts", robots: { index: false } };

/** /groups (owner 2026-10-23): your group accounts, invitations, members, and applying for a new one. */
export default async function GroupsPage({ searchParams }: PageProps<"/groups">) {
  await requireOnboardedViewer("/groups");
  // ?manage=<group id> (the account menu's "Group settings"): that group opens already expanded.
  const manage = (await searchParams).manage;
  return <GroupsView manage={typeof manage === "string" ? manage : null} />;
}
