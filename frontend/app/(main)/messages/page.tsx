import type { Metadata } from "next";
import { Inbox } from "@/components/messages/inbox";
import { ChatPlaceholder } from "@/components/messages/messages-panes";
import { requireOnboardedViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Messages",
  description: "Your private messages and community chats on WebNEWS.",
  robots: { index: false, follow: false },
};

/**
 * /messages — your chats and message requests (owner 2026-09-30). Signed-in, onboarded accounts only. From 1024px the
 * list is the layout's left pane, so this page is just the right pane's "pick a chat" panel there.
 */
export default async function MessagesPage() {
  await requireOnboardedViewer("/messages");
  return (
    <>
      <div className="lg:hidden">
        <Inbox />
      </div>
      <ChatPlaceholder />
    </>
  );
}
