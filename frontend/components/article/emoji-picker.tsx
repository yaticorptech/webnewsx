"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/*
 * The comment box's emoji picker (owner 2026-10-31, in place of GIFs for now): the emojis people react to news with,
 * in a few tabs. No library — plain Unicode, so they look like the phone's own emojis.
 */
const GROUPS: { key: string; label: string; icon: string; emojis: string[] }[] = [
  {
    key: "smileys",
    label: "Smileys",
    icon: "😀",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "🙂", "😉", "😍", "🥰", "😘", "😋", "😎",
      "🤩", "🥳", "🤔", "🤨", "😐", "😑", "🙄", "😏", "😮", "😯", "😲", "😳", "🥺", "😢", "😭", "😤",
      "😠", "😡", "🤬", "😱", "😨", "😰", "😥", "😓", "🤗", "🤭", "🤫", "😴", "🤯", "😬", "🥲", "😇",
    ],
  },
  {
    key: "gestures",
    label: "Gestures",
    icon: "👍",
    emojis: [
      "👍", "👎", "👏", "🙌", "🙏", "🤝", "👌", "✌️", "🤞", "🤟", "👊", "✊", "💪", "👋", "☝️", "👉",
      "👈", "👇", "👆", "🫡", "🤲", "✍️", "🫶", "👀",
    ],
  },
  {
    key: "hearts",
    label: "Hearts",
    icon: "❤️",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "❣️", "💕", "💖", "💯", "🔥", "✨", "⭐", "🌟", "💥", "🎉", "🎊"],
  },
  {
    key: "news",
    label: "News & places",
    icon: "📰",
    emojis: [
      "📰", "🗞️", "📢", "📣", "🎤", "📷", "🎥", "📺", "📱", "💻", "🏛️", "⚖️", "🚨", "🚓", "🚑", "🚒",
      "🏏", "⚽", "🏆", "🥇", "🌧️", "⛈️", "☀️", "🌊", "🌾", "🛕", "🇮🇳", "💰", "📈", "📉",
    ],
  },
];

export function EmojiPicker({ onPick, onClose, className }: { onPick: (emoji: string) => void; onClose: () => void; className?: string }) {
  const [group, setGroup] = useState(GROUPS[0]?.key ?? "smileys");
  const current = GROUPS.find((g) => g.key === group) ?? GROUPS[0];

  return (
    <div
      role="dialog"
      aria-label="Choose an emoji"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
      className={cn("flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-pop", className)}
    >
      <div className="flex items-center gap-1 border-b border-border p-1.5">
        <div role="tablist" aria-label="Emoji groups" className="flex min-w-0 flex-1 items-center gap-1">
          {GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              role="tab"
              aria-selected={g.key === group}
              aria-label={g.label}
              title={g.label}
              onClick={() => setGroup(g.key)}
              className={cn(
                "inline-flex size-10 items-center justify-center rounded-full text-xl transition-colors",
                g.key === group ? "bg-tint" : "opacity-70 hover:bg-surface-2 hover:opacity-100",
              )}
            >
              {g.icon}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close emojis"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-tint hover:text-brand"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>
      <div role="tabpanel" aria-label={current?.label} className="max-h-56 overflow-y-auto overscroll-contain p-1.5">
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))]">
          {current?.emojis.map((emoji) => (
            <li key={emoji} className="flex">
              <button
                type="button"
                onClick={() => onPick(emoji)}
                aria-label={emoji}
                className="inline-flex aspect-square w-full items-center justify-center rounded-xl text-2xl leading-none transition-transform hover:scale-110 hover:bg-surface-2 active:scale-95"
              >
                {emoji}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
