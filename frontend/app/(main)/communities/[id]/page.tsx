import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommunityPage } from "@/components/communities/community-page";

export const metadata: Metadata = {
  title: "Community",
  description: "A WebNEWS community: its chat, members and shared stories.",
  robots: { index: false, follow: true },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** /communities/[id] — one community (a private one only for its members and the people it invited). */
export default async function CommunityRoute({ params }: PageProps<"/communities/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return <CommunityPage key={id} id={id} />;
}
