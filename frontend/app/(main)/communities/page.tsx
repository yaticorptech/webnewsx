import type { Metadata } from "next";
import { CommunitiesView } from "@/components/communities/communities-view";
import { SITE_NAME } from "@/lib/config";

export const metadata: Metadata = {
  title: "Communities",
  description: `Communities on ${SITE_NAME}: groups around places and topics, each with its own chat.`,
  alternates: { canonical: "/communities" },
};

/** /communities — discover public communities, yours, and your invitations (owner 2026-09-30). */
export default function CommunitiesPage() {
  return <CommunitiesView />;
}
