"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { CHAT_LIMITS, type ChatPerson } from "@/lib/shared/contracts";
import { PeoplePicker } from "./people-picker";

/**
 * "New message" (Instagram's pencil): pick one person → your chat with them; pick two or more → a group chat (name
 * optional).
 */
export function NewChatModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [people, setPeople] = useState<ChatPerson[]>([]);
  const [name, setName] = useState("");
  const group = people.length >= 2;

  const start = useMutation({
    mutationFn: async () => {
      if (group) return api.messages.createGroup({ name: name.trim() || undefined, usernames: people.map((p) => p.username) });
      const [person] = people;
      if (!person) throw new Error("Pick someone to message");
      return api.messages.direct(person.username);
    },
    onSuccess: ({ id }) => {
      void queryClient.invalidateQueries({ queryKey: qk.messagesAll });
      onOpenChange(false);
      setPeople([]);
      setName("");
      router.push(`/messages/${id}`);
    },
    onError: (error) => toast.error(group ? "Couldn't create the group" : "Couldn't open the chat", { description: errorMessage(error) }),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="New message"
      description="Pick one person to chat, or two or more to start a group."
      bodyClassName="flex max-h-[60dvh] min-h-80 flex-col gap-3"
      footer={
        <div className="flex w-full flex-col gap-2.5">
          {group && (
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={CHAT_LIMITS.nameMax}
              placeholder="Group name (optional)"
              aria-label="Group name"
              className="h-11 w-full rounded-xl border border-border-strong bg-surface px-3.5 text-[0.9375rem] text-ink outline-none focus:border-brand"
            />
          )}
          <Button fullWidth disabled={people.length === 0} loading={start.isPending} onClick={() => start.mutate()}>
            {group ? `Create group (${people.length + 1} people)` : "Chat"}
          </Button>
        </div>
      }
    >
      <PeoplePicker selected={people} onChange={setPeople} max={CHAT_LIMITS.groupMembersMax - 1} className="min-h-0 flex-1" />
    </Modal>
  );
}
