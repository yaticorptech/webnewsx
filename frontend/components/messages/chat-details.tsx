"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { UserHandle } from "@/components/brand/user-handle";
import { useViewer } from "@/components/providers/viewer-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { CHAT_LIMITS, type ChatPerson, type ChatRole, type ConversationDetail } from "@/lib/shared/contracts";
import { PeoplePicker } from "./people-picker";

const ROLE_LABEL: Record<ChatRole, string | null> = {
  owner: "Owner",
  admin: "Admin",
  member: null,
};

/**
 * A chat's details: its name (groups: rename), the members (owner / admins can remove people) and add people
 * (groups). Clear chat and Delete chat / Leave live in the chat header's ⋮ menu only (owner 2026-10-02).
 */
export function ChatDetailsModal({
  chat,
  open,
  onOpenChange,
}: {
  chat: ConversationDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const viewer = useViewer();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [adding, setAdding] = useState<ChatPerson[] | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: qk.messagesAll });

  const rename = useMutation({
    mutationFn: () => api.messages.update(chat.id, { name: name.trim() }),
    onSuccess: () => {
      refresh();
      setName("");
      toast.success("Group renamed");
    },
    onError: (error) =>
      toast.error("Couldn't rename the group", {
        description: errorMessage(error),
      }),
  });
  const add = useMutation({
    mutationFn: (people: ChatPerson[]) =>
      api.messages.addMembers(
        chat.id,
        people.map((p) => p.username),
      ),
    onSuccess: ({ added }) => {
      refresh();
      setAdding(null);
      toast.success(added === 1 ? "Added 1 person" : `Added ${added} people`);
    },
    onError: (error) => toast.error("Couldn't add them", { description: errorMessage(error) }),
  });
  const remove = useMutation({
    mutationFn: (username: string) => api.messages.removeMember(chat.id, username),
    onSuccess: refresh,
    onError: (error) => toast.error("Couldn't remove them", { description: errorMessage(error) }),
  });

  const me = chat.members.find((m) => m.user.id === viewer?.id);
  const inChat = new Set(chat.members.map((m) => m.user.id));

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Details"
      description={chat.title}
      size="md"
      bodyClassName="flex flex-col gap-6"
    >
      {adding ? (
        <div className="flex max-h-[55dvh] min-h-72 flex-col gap-3">
          <PeoplePicker
            selected={adding}
            onChange={setAdding}
            exclude={inChat}
            max={CHAT_LIMITS.groupMembersMax - chat.memberCount}
            className="min-h-0 flex-1"
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAdding(null)}>
              Cancel
            </Button>
            <Button fullWidth disabled={adding.length === 0} loading={add.isPending} onClick={() => add.mutate(adding)}>
              Add {adding.length > 0 ? adding.length : ""} to group
            </Button>
          </div>
        </div>
      ) : (
        <>
          {chat.kind === "group" && chat.can.edit && (
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (name.trim()) rename.mutate();
              }}
            >
              <label htmlFor="group-name" className="kicker text-muted">
                Group name
              </label>
              <div className="flex gap-2">
                <input
                  id="group-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={CHAT_LIMITS.nameMax}
                  placeholder={chat.title}
                  className="h-10 min-w-0 flex-1 rounded-xl border border-border-strong bg-surface px-3.5 text-[0.9375rem] text-ink outline-none focus:border-brand"
                />
                <Button type="submit" size="md" variant="secondary" disabled={!name.trim()} loading={rename.isPending}>
                  Save
                </Button>
              </div>
            </form>
          )}

          {chat.kind === "direct" && chat.peer && (
            <div className="flex flex-col items-center gap-1.5 text-center">
              <Avatar src={chat.peer.image} name={chat.peer.name} size={80} decorative />
              <p className="mt-1 font-wide text-lg font-extrabold text-ink">{chat.peer.name}</p>
              <UserHandle username={chat.peer.username} className="text-sm text-muted" />
              <Button
                href={`/${chat.peer.username}`}
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => onOpenChange(false)}
              >
                View profile
              </Button>
            </div>
          )}

          {chat.kind === "community" && (
            <Button
              href={`/communities/${chat.id}`}
              variant="outline"
              leftIcon={<UsersRound aria-hidden />}
              onClick={() => onOpenChange(false)}
            >
              Community page · invite people
            </Button>
          )}

          {chat.kind !== "direct" && (
            <section aria-labelledby="chat-members" className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h3 id="chat-members" className="kicker text-muted">
                  {chat.memberCount} {chat.memberCount === 1 ? "member" : "members"}
                </h3>
                {chat.kind === "group" && chat.can.add && chat.memberCount < CHAT_LIMITS.groupMembersMax && (
                  <Button size="sm" variant="secondary" leftIcon={<UserPlus aria-hidden />} onClick={() => setAdding([])}>
                    Add people
                  </Button>
                )}
              </div>
              <ul className="-mx-2 flex flex-col">
                {chat.members.map((member) => {
                  const self = member.user.id === viewer?.id;
                  const removable =
                    chat.can.remove && !self && member.role !== "owner" && !(member.role === "admin" && me?.role !== "owner");
                  return (
                    <li key={member.user.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                      <Link
                        href={`/${member.user.username}`}
                        className="flex min-w-0 flex-1 items-center gap-3"
                        onClick={() => onOpenChange(false)}
                      >
                        <Avatar src={member.user.image} name={member.user.name} size={40} decorative />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-ink">
                            {member.user.name}
                            {self && <span className="font-medium text-muted"> (you)</span>}
                          </span>
                          <UserHandle username={member.user.username} truncate className="flex text-xs text-muted" />
                        </span>
                      </Link>
                      {ROLE_LABEL[member.role] && chat.kind !== "direct" && (
                        <span className="shrink-0 rounded-full bg-tint-2 px-2 py-0.5 text-[0.6875rem] font-bold text-brand-strong">
                          {ROLE_LABEL[member.role]}
                        </span>
                      )}
                      {removable && (
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={remove.isPending && remove.variables === member.user.username}
                          onClick={() => remove.mutate(member.user.username)}
                        >
                          Remove
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

        </>
      )}
    </Modal>
  );
}
