"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, MessageCircle, Settings2, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserHandle } from "@/components/brand/user-handle";
import { useAuthPrompt } from "@/components/layout/auth-prompt";
import { useCanMessage } from "@/components/messages/use-can-message";
import { useViewer } from "@/components/providers/viewer-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CoverBand } from "@/components/ui/cover-band";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, isApiError } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { ChatMember, CommunityDetail } from "@/lib/shared/contracts";
import { CommunityFields, type CommunityFormValue } from "./community-form";
import { VisibilityLabel } from "./communities-view";
import { InviteModal } from "./invite-modal";

/**
 * /communities/[id]: the community's card (photo, name, public / private, members, about) with what you can do —
 * Join / Accept the invitation, Open chat, Invite people, Edit, Leave, Delete — and its members (owner and admins
 * first; the owner makes admins, admins remove people).
 */
export function CommunityPage({ id }: { id: string }) {
  const viewer = useViewer();
  const signedIn = useCanMessage();
  const authPrompt = useAuthPrompt();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState(false);

  const detail = useQuery({
    queryKey: qk.community(id),
    queryFn: ({ signal }) => api.communities.detail(id, signal),
    retry: (count, error) => !(isApiError(error) && error.status === 404) && count < 2,
  });
  const members = useInfiniteQuery({
    queryKey: qk.communityMembers(id),
    queryFn: ({ pageParam, signal }) => api.communities.members(id, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    enabled: detail.isSuccess,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.communitiesAll });
    void queryClient.invalidateQueries({ queryKey: qk.messagesAll });
    void queryClient.invalidateQueries({ queryKey: qk.notifications });
  };
  const join = useMutation({
    mutationFn: () => api.communities.join(id),
    // No "You joined" popup (owner 2026-10-10): the page itself changes to the member view.
    onSuccess: () => {
      refresh();
    },
    onError: (error) => toast.error("Couldn't join", { description: errorMessage(error) }),
  });
  const decline = useMutation({
    mutationFn: (inviteId: string) => api.communities.respond(inviteId, false),
    onSuccess: () => {
      refresh();
      router.push("/communities");
    },
    onError: (error) => toast.error("Couldn't decline", { description: errorMessage(error) }),
  });
  const leave = useMutation({
    mutationFn: () => api.communities.leave(id),
    onSuccess: () => {
      refresh();
      toast("You left the community");
    },
    onError: (error) => toast.error("Couldn't leave", { description: errorMessage(error) }),
  });
  const remove = useMutation({
    mutationFn: () => api.communities.remove(id),
    onSuccess: () => {
      refresh();
      toast("Community deleted");
      router.push("/communities");
    },
    onError: (error) => toast.error("Couldn't delete it", { description: errorMessage(error) }),
  });

  if (detail.isError) {
    const gone = isApiError(detail.error) && detail.error.status === 404;
    return (
      <EmptyState
        title={gone ? "Community not found" : "Couldn't load this community"}
        description={gone ? "It may be private, or it was deleted." : "Check your connection and try again."}
        action={<Button href="/communities">All communities</Button>}
      />
    );
  }
  if (!detail.data) return <CommunitySkeleton />;
  const community = detail.data;
  const role = community.viewer.role;
  const memberList = members.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="community-name" className="overflow-hidden rounded-3xl border border-border bg-surface">
        {/* The cover band like a profile's (redesign 2026-10-07). */}
        <CoverBand className="h-24 sm:h-36" />
        <div className="flex flex-col gap-4 px-4 pb-5 sm:px-6">
          <div className="-mt-11 flex items-end justify-between gap-3 sm:-mt-12">
            <Avatar src={community.image} name={community.name} size={88} className="ring-4 ring-surface" decorative />
          </div>
          <div className="min-w-0">
            <h1 id="community-name" className="font-wide text-2xl font-black leading-tight tracking-tight text-ink wrap-anywhere sm:text-[1.75rem]">
              {community.name}
            </h1>
            <div className="mt-1">
              <VisibilityLabel visibility={community.visibility} memberCount={community.memberCount} />
            </div>
            {community.description && <p className="mt-3 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-2 wrap-anywhere">{community.description}</p>}
            {community.owner && (
              <p className="mt-3 text-[0.8125rem] text-muted">
                Created by{" "}
                <Link href={`/${community.owner.username}`} className="font-bold text-ink hover:text-brand">
                  {community.owner.name}
                </Link>
              </p>
            )}
          </div>

          {/* Actions: a full-width primary on phones, a row from 640px. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {role ? (
              <>
                <Button href={`/messages/${id}`} leftIcon={<MessageCircle aria-hidden />} className="sm:flex-none">
                  Open chat
                </Button>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <Button variant="secondary" leftIcon={<UserPlus aria-hidden />} onClick={() => setInviting(true)}>
                    Invite
                  </Button>
                  {community.can.edit ? (
                    <Button variant="outline" leftIcon={<Settings2 aria-hidden />} onClick={() => setEditing(true)}>
                      Edit
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      leftIcon={<LogOut aria-hidden />}
                      loading={leave.isPending}
                      onClick={() => {
                        if (window.confirm(`Leave ${community.name}?`)) leave.mutate();
                      }}
                    >
                      Leave
                    </Button>
                  )}
                </div>
              </>
            ) : community.viewer.inviteId ? (
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button loading={join.isPending} onClick={() => join.mutate()}>
                  Accept invite
                </Button>
                <Button variant="outline" loading={decline.isPending} onClick={() => community.viewer.inviteId && decline.mutate(community.viewer.inviteId)}>
                  Decline
                </Button>
              </div>
            ) : (
              <Button
                loading={join.isPending}
                onClick={() => (signedIn ? join.mutate() : authPrompt.open(`Log in to join ${community.name}`))}
                className="sm:px-8"
              >
                Join community
              </Button>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="community-members" className="card overflow-hidden">
        <h2 id="community-members" className="border-b border-border px-4 py-3 kicker text-brand sm:px-6">
          Members · {community.memberCount}
        </h2>
        {members.isPending ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton shape="circle" className="size-10" />
                <Skeleton className="h-4 w-1/3 rounded-sm" />
              </div>
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {memberList.map((member) => (
              <MemberRow key={member.user.id} communityId={id} member={member} viewerRole={role} self={member.user.id === viewer?.id} />
            ))}
          </ul>
        )}
        {members.hasNextPage && (
          <div className="flex justify-center border-t border-border p-3">
            <Button variant="ghost" size="sm" loading={members.isFetchingNextPage} onClick={() => void members.fetchNextPage()}>
              More members
            </Button>
          </div>
        )}
      </section>

      {role && (
        <InviteModal
          communityId={id}
          name={community.name}
          memberIds={new Set(memberList.map((m) => m.user.id))}
          open={inviting}
          onOpenChange={setInviting}
        />
      )}
      {community.can.edit && (
        <EditCommunityModal
          community={community}
          open={editing}
          onOpenChange={setEditing}
          onDelete={community.can.delete ? () => remove.mutate() : undefined}
          onLeave={role !== "owner" ? () => leave.mutate() : undefined}
        />
      )}
    </div>
  );
}

function MemberRow({ communityId, member, viewerRole, self }: { communityId: string; member: ChatMember; viewerRole: string | null; self: boolean }) {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.communityMembers(communityId) });
    void queryClient.invalidateQueries({ queryKey: qk.community(communityId) });
  };
  const setRole = useMutation({
    mutationFn: (role: "admin" | "member") => api.communities.setRole(communityId, member.user.username, role),
    onSuccess: refresh,
    onError: (error) => toast.error("Couldn't change the role", { description: errorMessage(error) }),
  });
  const remove = useMutation({
    mutationFn: () => api.communities.removeMember(communityId, member.user.username),
    onSuccess: refresh,
    onError: (error) => toast.error("Couldn't remove them", { description: errorMessage(error) }),
  });

  const owner = viewerRole === "owner";
  const manager = owner || viewerRole === "admin";
  const canRemove = manager && !self && member.role !== "owner" && (owner || member.role === "member");
  const items = [
    ...(owner && !self && member.role !== "owner"
      ? [
          member.role === "admin"
            ? { label: "Remove as admin", onSelect: () => setRole.mutate("member") }
            : { label: "Make admin", onSelect: () => setRole.mutate("admin") },
        ]
      : []),
    ...(canRemove ? [{ label: "Remove from community", danger: true, icon: <Trash2 aria-hidden />, onSelect: () => remove.mutate() }] : []),
  ];

  return (
    <li className="flex items-center gap-3 px-4 py-2.5 sm:px-6">
      <Link href={`/${member.user.username}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar src={member.user.image} name={member.user.name} size={40} decorative />
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-ink">
            {member.user.name}
            {self && <span className="font-medium text-muted"> (you)</span>}
          </span>
          <UserHandle username={member.user.username} truncate className="flex text-xs text-muted" />
        </span>
      </Link>
      {member.role !== "member" && (
        <span className="shrink-0 rounded-full bg-tint-2 px-2 py-0.5 text-[0.6875rem] font-bold text-brand-strong">
          {member.role === "owner" ? "Owner" : "Admin"}
        </span>
      )}
      {items.length > 0 && (
        <DropdownMenu
          label={`Manage ${member.user.name}`}
          trigger={<span aria-hidden className="text-lg leading-none">⋯</span>}
          triggerClassName="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-tint-2 hover:text-brand"
          items={items}
        />
      )}
    </li>
  );
}

function EditCommunityModal({
  community,
  open,
  onOpenChange,
  onDelete,
  onLeave,
}: {
  community: CommunityDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete?: () => void;
  onLeave?: () => void;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState<CommunityFormValue>({
    name: community.name,
    description: community.description ?? "",
    visibility: community.visibility,
    image: community.image,
  });
  const save = useMutation({
    mutationFn: () =>
      api.communities.update(community.id, {
        name: value.name.trim(),
        description: value.description.trim() || null,
        visibility: value.visibility,
        image: value.image,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.communitiesAll });
      void queryClient.invalidateQueries({ queryKey: qk.messagesAll });
      onOpenChange(false);
      toast.success("Community updated");
    },
    onError: (error) => toast.error("Couldn't save", { description: errorMessage(error) }),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Edit community"
      footer={
        <Button fullWidth disabled={value.name.trim().length < 3} loading={save.isPending} onClick={() => save.mutate()}>
          Save changes
        </Button>
      }
    >
      <CommunityFields value={value} onChange={setValue} />
      <div className="mt-6 flex flex-col gap-2 border-t border-border pt-5">
        {onLeave && (
          <Button variant="outline" leftIcon={<LogOut aria-hidden />} onClick={() => window.confirm(`Leave ${community.name}?`) && onLeave()}>
            Leave community
          </Button>
        )}
        {onDelete && (
          <Button
            variant="danger"
            leftIcon={<Trash2 aria-hidden />}
            onClick={() => window.confirm(`Delete ${community.name} for everyone? Its chat goes too. This can't be undone.`) && onDelete()}
          >
            Delete community
          </Button>
        )}
      </div>
    </Modal>
  );
}

function CommunitySkeleton() {
  return (
    <div role="status" aria-label="Loading community" className="card overflow-hidden">
      <Skeleton className="h-24 w-full rounded-none" />
      <div className="flex flex-col gap-3 px-6 pb-6">
        <Skeleton shape="circle" className="-mt-10 size-22 ring-4 ring-surface" />
        <Skeleton className="h-7 w-1/2 rounded-md" />
        <Skeleton className="h-3 w-1/3 rounded-sm" />
        <Skeleton className="h-10 w-full rounded-full sm:w-48" />
      </div>
    </div>
  );
}
