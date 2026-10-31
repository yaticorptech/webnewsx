"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { UserHandle } from "@/components/brand/user-handle";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import { Avatar } from "@/components/ui/avatar";
import { Textarea, type TextareaProps } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { UserRow } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

type Mention = { query: string; start: number };

/** The partial "@name" right before the caret (letters and dots), or null. */
function mentionAt(text: string, caret: number): Mention | null {
  const match = /(^|[\s(])@([a-z._]{0,30})$/i.exec(text.slice(0, caret));
  if (!match) return null;
  const query = match[2] ?? "";
  return { query: query.toLowerCase(), start: caret - query.length - 1 };
}

export type MentionTextareaProps = Omit<TextareaProps, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
};

/**
 * Comment box with @mentions: typing "@" and a few letters suggests people (the site search); ↑/↓ move, Enter or
 * Tab inserts "@username ", Escape closes. A plain textarea otherwise (auto-growing, counter, Field wiring).
 */
export function MentionTextarea({ value, onValueChange, onKeyDown, onBlur, ref, ...props }: MentionTextareaProps) {
  const listId = useId();
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const [mention, setMention] = useState<Mention | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [active, setActive] = useState(0);
  const query = mention?.query ?? "";

  // Suggestions for the name being typed (debounced; stale answers are aborted).
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .search(query, controller.signal)
        .then((result) => {
          setUsers(result.users.slice(0, 5));
          setActive(0);
        })
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const open = Boolean(query) && users.length > 0;

  const pick = (user: UserRow) => {
    const el = inner.current;
    if (!mention || !el) return;
    const caret = el.selectionStart ?? value.length;
    const next = `${value.slice(0, mention.start)}@${user.username} ${value.slice(caret)}`;
    const position = mention.start + user.username.length + 2;
    onValueChange(next);
    setMention(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(position, position);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActive((i) => (i + (event.key === "ArrowDown" ? 1 : users.length - 1)) % users.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const user = users[active];
        if (user) pick(user);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMention(null);
        return;
      }
    }
    onKeyDown?.(event);
  };

  return (
    <div className="relative">
      <Textarea
        {...props}
        ref={(node) => {
          inner.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onChange={(event) => {
          onValueChange(event.target.value);
          setMention(mentionAt(event.target.value, event.target.selectionStart));
        }}
        onSelect={(event) => setMention(mentionAt(event.currentTarget.value, event.currentTarget.selectionStart))}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          setMention(null);
          onBlur?.(event);
        }}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Mention someone"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-2xl border border-border bg-surface p-1.5 shadow-pop"
        >
          {users.map((user, index) => (
            <li
              key={user.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // Keep focus in the box while picking.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(user)}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2",
                index === active ? "bg-tint" : "hover:bg-surface-2",
              )}
            >
              <Avatar src={user.image} name={user.name} size="sm" decorative />
              <span className="min-w-0">
                <span className="flex items-center gap-1 truncate text-sm font-bold text-ink">
                  {user.name}
                  {user.reporterLevel === "verified" && <VerifiedBadge size={13} animate={false} tooltip={false} label="" />}
                </span>
                <UserHandle username={user.username} className="text-xs text-muted" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
