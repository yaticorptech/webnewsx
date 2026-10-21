import { Send } from "lucide-react";
import type { ReactNode } from "react";
import { Inbox } from "./inbox";

/**
 * Messages from 1024px (owner 2026-10-01, like WhatsApp Web): one box that fills the screen under the sticky bar —
 * your chats on the left, the open chat on the right (or the "pick a chat" panel on /messages). Each pane scrolls on
 * its own. Below 1024px the list and each chat stay their own full-screen pages (only the right-hand slot shows).
 * `data-messages-page` widens the shell's column (app/(main)/layout.tsx) and drops the big masthead row (globals.css).
 */
export function MessagesPanes({ children }: { children: ReactNode }) {
  return (
    <div
      data-messages-page=""
      className="lg:grid lg:h-[calc(100dvh-var(--nav-h)-2rem)] lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)] lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border lg:bg-surface lg:shadow-card"
    >
      <aside aria-label="Chats" className="hidden min-h-0 overflow-y-auto overscroll-contain border-r border-border lg:block">
        <Inbox pane />
      </aside>
      <div data-chat-pane="" className="min-w-0 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain">
        {children}
      </div>
    </div>
  );
}

/** /messages ≥1024px: the right pane until a chat is picked. */
export function ChatPlaceholder() {
  return (
    <div className="hidden h-full flex-col items-center justify-center gap-3 p-8 text-center lg:flex">
      <span aria-hidden className="flex size-16 items-center justify-center rounded-full bg-tint text-brand">
        <Send className="size-7" />
      </span>
      <p className="font-wide text-lg font-extrabold text-ink">Your messages</p>
      <p className="max-w-xs text-sm text-muted">Pick a chat on the left to read and reply, or start a new one with New.</p>
    </div>
  );
}
