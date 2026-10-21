"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eraser, Info, LogOut, MoreVertical, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useViewer } from "@/components/providers/viewer-provider";
import { Button } from "@/components/ui/button";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { ConversationDetail } from "@/lib/shared/contracts";

/**
 * A chat's two clean-up actions (owner 2026-10-01): **Clear chat** — every message so far gone for you, the chat stays
 * in your list (any kind of chat) — and **Delete chat** — a direct chat leaves your list with its history (it comes
 * back with the next message); in a group / community it's leaving. A community's owner can't leave its chat.
 */
export function useChatActions(chat: ConversationDetail) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const viewer = useViewer();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: qk.messagesAll });

  const clear = useMutation({
    mutationFn: () => api.messages.clear(chat.id),
    onSuccess: () => {
      refresh();
      toast.success("Chat cleared", { description: "Its messages are gone for you." });
    },
    onError: (error) => toast.error("Couldn't clear the chat", { description: errorMessage(error) }),
  });
  const remove = useMutation({
    mutationFn: () => api.messages.remove(chat.id),
    onSuccess: () => {
      refresh();
      router.push("/messages");
      toast.success(chat.kind === "direct" ? "Chat deleted" : "You left the chat");
    },
    onError: (error) => toast.error("Couldn't do that", { description: errorMessage(error) }),
  });

  const ownsCommunity = chat.kind === "community" && chat.members.some((m) => m.user.id === viewer?.id && m.role === "owner");
  const removeLabel = chat.kind === "direct" ? "Delete chat" : chat.kind === "group" ? "Leave group" : "Leave community chat";
  return { clear, remove, removeLabel, canRemove: !ownsCommunity };
}

type Confirm = "clear" | "remove" | null;

/** The chat header's ⋮: Details · Clear chat · Delete chat (or Leave), each confirmed first. */
export function ChatMenu({ chat, onInfo }: { chat: ConversationDetail; onInfo: () => void }) {
  const { clear, remove, removeLabel, canRemove } = useChatActions(chat);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const direct = chat.kind === "direct";

  const items: DropdownItem[] = [
    { label: "Details", icon: <Info aria-hidden />, onSelect: onInfo },
    { type: "separator" },
    { label: "Clear chat", icon: <Eraser aria-hidden />, onSelect: () => setConfirm("clear") },
  ];
  if (canRemove) {
    items.push({ label: removeLabel, icon: direct ? <Trash2 aria-hidden /> : <LogOut aria-hidden />, danger: true, onSelect: () => setConfirm("remove") });
  }

  const busy = clear.isPending || remove.isPending;
  const copy =
    confirm === "clear"
      ? {
          title: "Clear this chat?",
          description: `All messages so far disappear for you — ${direct ? "they" : "the others"} still see them. The chat stays in your list.`,
          action: "Clear chat",
          icon: <Eraser aria-hidden />,
        }
      : direct
        ? {
            title: "Delete this chat?",
            description: "It leaves your messages along with its history (for you only). It comes back if they message you again.",
            action: "Delete chat",
            icon: <Trash2 aria-hidden />,
          }
        : {
            title: `Leave ${chat.title}?`,
            description: "You won't get its messages any more, and it leaves your list.",
            action: removeLabel,
            icon: <LogOut aria-hidden />,
          };

  return (
    <>
      <DropdownMenu
        label="Chat options"
        align="end"
        items={items}
        className="shrink-0"
        triggerClassName="relative inline-flex size-10 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-tint hover:text-brand aria-expanded:bg-tint aria-expanded:text-brand after:absolute after:-inset-0.5 after:content-[''] [&_svg]:size-5"
        trigger={<MoreVertical aria-hidden strokeWidth={2.25} />}
        menuClassName="min-w-52"
      />
      <Modal
        open={confirm !== null}
        onOpenChange={(open) => !busy && !open && setConfirm(null)}
        title={copy.title}
        description={copy.description}
        size="sm"
        dismissible={!busy}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              leftIcon={copy.icon}
              loading={busy}
              onClick={() => (confirm === "clear" ? clear : remove).mutate(undefined, { onSettled: () => setConfirm(null) })}
            >
              {copy.action}
            </Button>
          </>
        }
      />
    </>
  );
}
