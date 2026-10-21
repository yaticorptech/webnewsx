import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatView } from "@/components/messages/chat-view";
import { requireOnboardedViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Chat",
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** /messages/[id] — one chat (direct, group or community). Loaded and kept live on the client. */
export default async function ChatPage({ params }: PageProps<"/messages/[id]">) {
  const { id } = await params;
  await requireOnboardedViewer(`/messages/${id}`);
  if (!UUID.test(id)) notFound();
  return <ChatView key={id} id={id} />;
}
