import type { ReactNode } from "react";
import { MessagesPanes } from "@/components/messages/messages-panes";

/** /messages and /messages/[id] share one frame: from 1024px the chat list stays on the left of every chat. */
export default function MessagesLayout({ children }: { children: ReactNode }) {
  return <MessagesPanes>{children}</MessagesPanes>;
}
