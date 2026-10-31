"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  BadgeCheck,
  Building2,
  Clock3,
  ImagePlus,
  LogOut,
  PenLine,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { UserHandle } from "@/components/brand/user-handle";
import { useViewer } from "@/components/providers/viewer-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TimeAgo } from "@/components/ui/time-ago";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, isApiError, uploadImage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import {
  GROUP_LIMITS,
  GROUP_ROLE_HINTS,
  GROUP_ROLE_LABELS,
  normalizeUsername,
  type GroupApplication,
  type GroupMember,
  type GroupRole,
  type MyGroupsResponse,
} from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { useDebounced } from "@/components/messages/people-picker";
import { useSwitchAccount } from "./use-switch-account";

/*
 * /groups — group accounts (owner 2026-10-23): one public account (e.g. VK Mangalore) that several members post as.
 * Your groups (switch to "Posting as", members, stories waiting for an editor), invitations to accept, and — for Press
 * Pass holders — applying for a new one, which the Editor Desk approves.
 */

const ROLE_TONE: Record<GroupRole, string> = {
  owner: "bg-ink text-surface",
  editor: "bg-tint text-brand",
  writer: "bg-surface-2 text-ink-2",
};

function RoleChip({ role }: { role: GroupRole }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[0.6875rem] font-bold",
        ROLE_TONE[role],
      )}
    >
      {GROUP_ROLE_LABELS[role]}
    </span>
  );
}

export function GroupsView({ manage = null }: { manage?: string | null }) {
  const query = useQuery({
    queryKey: qk.groups,
    queryFn: ({ signal }) => api.groups.mine(signal),
  });
  const data = query.data;
  const pendingApplication = data?.applications.find(
    (a) => a.status === "pending",
  );

  return (
    // Full screen (owner 2026-10-23): `data-grid-page` lifts the shell's column limit; ≥1024px your groups on the left,
    // starting a new one on the right.
    <div data-grid-page="" className="flex flex-col gap-6 pb-8">
      <header className="max-w-3xl">
        <p className="kicker text-brand">Group accounts</p>
        <h1 className="mt-1 font-wide text-2xl font-black text-ink">
          One account, a whole team
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          A news outlet like{" "}
          <span className="font-semibold text-ink">VK Mangalore</span> posts as
          one account, while several members write for it. Readers see only the
          group&apos;s name.
        </p>
      </header>

      {query.isPending ? (
        <div aria-hidden className="flex flex-col gap-3">
          <div className="skeleton h-24 rounded-2xl" />
          <div className="skeleton h-24 rounded-2xl" />
        </div>
      ) : query.isError || !data ? (
        <div className="card px-5 py-6 text-center text-sm text-muted">
          Couldn&rsquo;t load your groups. {errorMessage(query.error)}{" "}
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="font-bold text-brand hover:underline"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] xl:gap-10">
          <div className="flex min-w-0 flex-col gap-6">
            {data.invites.length > 0 && <Invites invites={data.invites} />}

            <section
              aria-labelledby="your-groups"
              className="flex flex-col gap-3"
            >
              <h2 id="your-groups" className="text-base font-bold text-ink">
                Your groups
              </h2>
              {data.groups.length === 0 ? (
                <p className="card px-5 py-5 text-sm text-muted">
                  You&apos;re not in a group yet. Accept an invitation, or apply
                  for your outlet below.
                </p>
              ) : (
                data.groups.map((group) => (
                  <GroupCard key={group.id} group={group} initiallyOpen={group.id === manage} />
                ))
              )}
            </section>

            {data.applications.length > 0 && (
              <Applications applications={data.applications} />
            )}
          </div>

          <section
            aria-labelledby="apply"
            className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-[calc(var(--nav-h)+1rem)]"
          >
            <h2 id="apply" className="text-base font-bold text-ink">
              Start a group account
            </h2>
            {!data.canApply ? (
              <div className="card flex flex-col items-start gap-3 px-5 py-5 text-sm text-muted">
                <p>
                  Applying needs your own Press Pass. The group then gets a
                  Press Pass of its own that covers its members.
                </p>
                <Button
                  href="/press-pass"
                  size="sm"
                  leftIcon={<BadgeCheck aria-hidden />}
                >
                  Get your Press Pass
                </Button>
              </div>
            ) : data.ownsGroup ? (
              // One group per person (owner 2026-10-23).
              <p className="card px-5 py-5 text-sm text-muted">
                You already run a group account. One account can start only one group — delete it first if you want to
                start a different one.
              </p>
            ) : pendingApplication ? (
              <p className="card px-5 py-5 text-sm text-muted">
                Your application for{" "}
                <span className="font-semibold text-ink">
                  {pendingApplication.name}
                </span>{" "}
                is with the Editor Desk. We&apos;ll set the group up as soon as
                it&apos;s approved.
              </p>
            ) : (
              <ApplyForm />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Invites({ invites }: { invites: MyGroupsResponse["invites"] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const answer = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      api.groups.answer(id, accept),
    onSuccess: (data, { accept }) => {
      queryClient.setQueryData(qk.groups, data);
      toast.success(accept ? "You joined the group" : "Invitation declined", {
        description: accept
          ? "Switch to it from here or your profile menu to post as the group."
          : undefined,
      });
      // The account switcher (the viewer's `groups`) lists the new group.
      if (accept) router.refresh();
    },
    onError: (error) =>
      toast.error("Couldn't answer the invitation", {
        description: errorMessage(error),
      }),
  });
  return (
    <section aria-labelledby="invites" className="flex flex-col gap-3">
      <h2 id="invites" className="text-base font-bold text-ink">
        Invitations
      </h2>
      {invites.map((invite) => (
        <div
          key={invite.id}
          className="card flex flex-wrap items-center gap-3 px-4 py-4"
        >
          <Avatar src={invite.image} name={invite.name} size="md" decorative />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-ink">{invite.name}</p>
            <p className="text-xs text-muted">
              {invite.invitedBy
                ? `${invite.invitedBy.name} invited you`
                : "You're invited"}{" "}
              as <RoleChip role={invite.role} />
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={answer.isPending}
              onClick={() => answer.mutate({ id: invite.id, accept: false })}
            >
              Decline
            </Button>
            <Button
              size="sm"
              loading={answer.isPending && answer.variables?.id === invite.id}
              onClick={() => answer.mutate({ id: invite.id, accept: true })}
            >
              Join
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}

function GroupCard({ group, initiallyOpen = false }: { group: MyGroupsResponse["groups"][number]; initiallyOpen?: boolean }) {
  const viewer = useViewer();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { switchTo, pending } = useSwitchAccount();
  const [open, setOpen] = useState(initiallyOpen);
  const active = viewer?.id === group.id;
  /** Deactivated by its owner (owner 2026-10-23): only the owner can bring it back. */
  const reactivate = useMutation({
    mutationFn: () => api.groups.reactivate(group.id),
    onSuccess: (data) => {
      queryClient.setQueryData(qk.groups, data);
      toast.success(`${group.name} is back`, { description: "Its profile and stories are visible again." });
      router.refresh();
    },
    onError: (error) => toast.error("Couldn't reactivate the group", { description: errorMessage(error) }),
  });
  return (
    <div className={cn("card overflow-hidden", active && "ring-2 ring-brand")}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-4">
        <Avatar src={group.image} name={group.name} size="lg" decorative />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-2">
            <Link
              href={`/${group.username}`}
              className="min-w-0 truncate font-bold text-ink hover:underline"
            >
              {group.name}
            </Link>
            <RoleChip role={group.role} />
            {group.deactivated && (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.6875rem] font-bold text-muted">Deactivated</span>
            )}
          </p>
          <UserHandle
            username={group.username}
            className="text-xs text-muted"
          />
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <Users aria-hidden className="size-3.5" />
              {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
            </span>
            {group.pendingStories > 0 && (
              <span className="inline-flex items-center gap-1 font-bold text-brand">
                <Clock3 aria-hidden className="size-3.5" />
                {group.pendingStories} waiting for approval
              </span>
            )}
          </p>
        </div>
        {/* Phones: the buttons get their own full-width row under the name (owner 2026-10-23). */}
        <div className="flex w-full gap-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? "Close" : group.role === "owner" ? "Manage" : "Members"}
          </Button>
          {group.deactivated ? (
            group.role === "owner" && (
              <Button size="sm" loading={reactivate.isPending} onClick={() => reactivate.mutate()}>
                Reactivate
              </Button>
            )
          ) : active ? (
            <Button
              size="sm"
              variant="secondary"
              loading={pending === "me"}
              leftIcon={<ArrowLeftRight aria-hidden />}
              onClick={() => void switchTo(null)}
            >
              Switch back
            </Button>
          ) : (
            <Button
              size="sm"
              loading={pending === group.id}
              leftIcon={<PenLine aria-hidden />}
              onClick={() => void switchTo(group)}
            >
              Post as
            </Button>
          )}
        </div>
      </div>
      {open && <GroupPanel groupId={group.id} role={group.role} />}
    </div>
  );
}

/** One group's members (the owner manages them) and the writers' stories waiting for an editor. */
function GroupPanel({ groupId, role }: { groupId: string; role: GroupRole }) {
  const viewer = useViewer();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { switchTo } = useSwitchAccount();
  const detail = useQuery({
    queryKey: qk.group(groupId),
    queryFn: ({ signal }) => api.groups.detail(groupId, signal),
  });
  const me = viewer?.actingAs?.member.id ?? viewer?.id;
  const owner = role === "owner";
  const refresh = (data?: unknown) => {
    if (data && typeof data === "object" && "members" in data)
      queryClient.setQueryData(qk.group(groupId), data);
    else void queryClient.invalidateQueries({ queryKey: qk.group(groupId) });
    void queryClient.invalidateQueries({ queryKey: qk.groups, exact: true });
  };
  const setRole = useMutation({
    mutationFn: ({
      userId,
      next,
    }: {
      userId: string;
      next: "editor" | "writer";
    }) => api.groups.setRole(groupId, userId, next),
    onSuccess: refresh,
    onError: (error) =>
      toast.error("Couldn't change the role", {
        description: errorMessage(error),
      }),
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api.groups.remove(groupId, userId),
    onSuccess: (data, userId) => {
      if (userId === me) {
        toast.success("You left the group");
        queryClient.clear();
        router.refresh();
        return;
      }
      refresh(data);
    },
    onError: (error) =>
      toast.error("Couldn't remove them", { description: errorMessage(error) }),
  });
  /** The owner deletes the group for good (owner 2026-10-23). */
  const deleteGroup = useMutation({
    mutationFn: () => api.groups.delete(groupId),
    onSuccess: (data) => {
      toast.success("Group deleted");
      queryClient.clear();
      queryClient.setQueryData(qk.groups, data);
      router.refresh();
    },
    onError: (error) =>
      toast.error("Couldn't delete the group", { description: errorMessage(error) }),
  });

  if (detail.isPending)
    return <div aria-hidden className="skeleton mx-4 mb-4 h-32 rounded-xl" />;
  if (detail.isError || !detail.data)
    return (
      <p className="px-4 pb-4 text-sm text-muted">
        Couldn&rsquo;t load the group. {errorMessage(detail.error)}
      </p>
    );
  const { members, pendingStories, group } = detail.data;

  return (
    <div className="flex flex-col gap-5 border-t border-border bg-surface-2/50 px-4 py-4">
      {pendingStories.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">
            {role === "writer"
              ? "Your stories with the editors"
              : "Waiting for approval"}
          </p>
          {pendingStories.map((story) => (
            <div
              key={story.id}
              className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5"
            >
              {story.coverUrl ? (
                <img
                  src={story.coverUrl}
                  alt=""
                  className="h-12 w-9 shrink-0 rounded-md object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="h-12 w-9 shrink-0 rounded-md bg-surface-2"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {story.title || "Untitled story"}
                </p>
                <p className="text-xs text-muted">
                  {story.writer ? `${story.writer.name} · ` : ""}
                  <TimeAgo date={story.submittedAt} />
                </p>
              </div>
              {role !== "writer" && (
                <Button
                  size="sm"
                  onClick={() =>
                    void switchTo(
                      { id: group.id, name: group.name },
                      `/publish/${story.id}`,
                    )
                  }
                >
                  Review
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">
          Members
        </p>
        <ul className="flex flex-col gap-1.5">
          {members.map((member) => (
            <MemberRow
              key={member.user.id}
              member={member}
              owner={owner}
              self={member.user.id === me}
              busy={setRole.isPending || remove.isPending}
              onRole={(next) =>
                setRole.mutate({ userId: member.user.id, next })
              }
              onRemove={() => remove.mutate(member.user.id)}
            />
          ))}
        </ul>
      </div>

      {owner && (
        <InviteForm
          groupId={groupId}
          exclude={new Set([group.id, ...members.map((m) => m.user.id)])}
          onInvited={refresh}
        />
      )}

      {owner && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-tint-border bg-surface px-4 py-3">
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">Delete this group</span> — its profile, stories and members go
            for good. Members keep their own accounts.
          </p>
          <Button
            variant="danger"
            size="sm"
            loading={deleteGroup.isPending}
            leftIcon={<Trash2 aria-hidden />}
            onClick={() => {
              const typed = window.prompt(`This deletes @${group.username} and all its stories for good. Type the group's username to confirm.`);
              if (typed === null) return;
              if (typed.trim().replace(/^@/, "").toLowerCase() !== group.username.toLowerCase()) {
                toast.error("That's not the group's username", { description: "Nothing was deleted." });
                return;
              }
              deleteGroup.mutate();
            }}
          >
            Delete group
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Writer | Editor as a two-way toggle in the site's style (owner 2026-10-23: the browser's own dropdown looked out of
 * place, a dark system menu).
 */
function RoleToggle({
  label,
  value,
  onChange,
  disabled = false,
  size = "md",
  className,
}: {
  label: string;
  value: "editor" | "writer";
  onChange: (role: "editor" | "writer") => void;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 rounded-full border border-border bg-surface-2 p-0.5",
        size === "sm" ? "h-8" : "h-10",
        className,
      )}
    >
      {(["writer", "editor"] as const).map((option) => {
        const on = value === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => !on && onChange(option)}
            className={cn(
              "flex-1 rounded-full font-bold transition-colors disabled:opacity-60",
              size === "sm" ? "px-2.5 text-xs" : "px-4 text-sm",
              on ? "bg-surface text-ink shadow-[0_1px_2px_rgb(16_24_40/0.12)]" : "text-muted hover:text-ink",
            )}
          >
            {GROUP_ROLE_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}

function MemberRow({
  member,
  owner,
  self,
  busy,
  onRole,
  onRemove,
}: {
  member: GroupMember;
  owner: boolean;
  self: boolean;
  busy: boolean;
  onRole: (role: "editor" | "writer") => void;
  onRemove: () => void;
}) {
  const isOwner = member.role === "owner";
  return (
    <li className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2">
      <Avatar
        src={member.user.image}
        name={member.user.name}
        size="sm"
        decorative
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">
          {member.user.name}
          {self && <span className="font-normal text-muted"> (you)</span>}
        </p>
        <p className="text-xs text-muted">
          {member.status === "invited" ? (
            "Invited — hasn't joined yet"
          ) : (
            <UserHandle username={member.user.username} />
          )}
        </p>
      </div>
      {owner && !isOwner ? (
        <RoleToggle
          label={`${member.user.name}'s role`}
          value={member.role as "editor" | "writer"}
          disabled={busy}
          onChange={onRole}
          size="sm"
        />
      ) : (
        <RoleChip role={member.role} />
      )}
      {((owner && !isOwner) || (self && !isOwner)) && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const question = self
              ? "Leave this group? Your stories stay with the group."
              : `Remove ${member.user.name} from the group? Their stories stay with the group.`;
            if (window.confirm(question)) onRemove();
          }}
          aria-label={self ? "Leave the group" : `Remove ${member.user.name}`}
          className="inline-flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-brand"
        >
          {self ? (
            <LogOut aria-hidden className="size-4" />
          ) : (
            <X aria-hidden className="size-4" />
          )}
        </button>
      )}
    </li>
  );
}

function InviteForm({
  groupId,
  exclude,
  onInvited,
}: {
  groupId: string;
  /** Already in the group (or invited), and the group itself: never suggested. */
  exclude: ReadonlySet<string>;
  onInvited: (data: unknown) => void;
}) {
  const [username, setUsername] = useState("");
  /** Suggestions as you type (owner 2026-10-23: "from the first letter"), from the site's people search. */
  const [suggesting, setSuggesting] = useState(false);
  const q = useDebounced(username.trim().replace(/^@+/, ""), 200);
  const search = useQuery({
    queryKey: qk.search(q),
    queryFn: ({ signal }) => api.search(q, signal),
    enabled: q.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const people = q ? (search.data?.users ?? []).filter((u) => !exclude.has(u.id)) : [];
  const [role, setRole] = useState<"editor" | "writer">("writer");
  const [error, setError] = useState<string | null>(null);
  const invite = useMutation({
    mutationFn: () =>
      api.groups.invite(
        groupId,
        normalizeUsername(username.replace(/^@/, "")),
        role,
      ),
    onSuccess: (data) => {
      onInvited(data);
      toast.success(
        `Invited @${normalizeUsername(username.replace(/^@/, ""))}`,
        { description: "They'll see it on their Groups page." },
      );
      setUsername("");
    },
    onError: (failed) =>
      setError(
        isApiError(failed)
          ? (failed.fields?.username ?? failed.message)
          : errorMessage(failed),
      ),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!username.trim()) return setError("Enter their @username");
    invite.mutate();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <p className="text-xs font-bold uppercase tracking-wide text-muted">
        Invite a member
      </p>
      <div className="flex flex-wrap gap-2">
        <div className="relative basis-full sm:min-w-48 sm:flex-1 sm:basis-auto">
          <Field label="Their username" hideLabel error={error}>
            <Input
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setSuggesting(true);
                if (error) setError(null);
              }}
              onFocus={() => setSuggesting(true)}
              onBlur={() => setSuggesting(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSuggesting(false);
              }}
              placeholder="Search by name or @username"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              role="combobox"
              aria-expanded={suggesting && people.length > 0}
              aria-autocomplete="list"
            />
          </Field>
          {suggesting && q.length > 0 && (
            <ul
              role="listbox"
              aria-label="People"
              className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto rounded-2xl border border-border bg-surface p-1.5 shadow-pop"
            >
              {people.length === 0 ? (
                <li className="px-3 py-2.5 text-sm text-muted">
                  {search.isFetching ? "Searching…" : "No one found"}
                </li>
              ) : (
                people.map((person) => (
                  <li key={person.id} role="option" aria-selected={false}>
                    <button
                      type="button"
                      // Before the input's blur closes the list.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setUsername(person.username);
                        setSuggesting(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-surface-2"
                    >
                      <Avatar src={person.image} name={person.name} size="sm" decorative />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{person.name}</span>
                        <UserHandle username={person.username} className="text-xs text-muted" />
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
        <RoleToggle label="Role" value={role} onChange={setRole} className="flex-1 sm:flex-none" />
        <Button
          type="submit"
          loading={invite.isPending}
          leftIcon={<UserPlus aria-hidden />}
          className="flex-1 sm:flex-none"
        >
          Invite
        </Button>
      </div>
      <p className="text-xs text-muted">
        <span className="font-semibold text-ink-2">
          {GROUP_ROLE_LABELS[role]}:
        </span>{" "}
        {GROUP_ROLE_HINTS[role]}. Up to {GROUP_LIMITS.membersMax} members.
      </p>
    </form>
  );
}

const STATUS_TEXT: Record<GroupApplication["status"], string> = {
  pending: "With the Editor Desk",
  approved: "Approved",
  rejected: "Not approved",
};

function Applications({ applications }: { applications: GroupApplication[] }) {
  return (
    <section aria-labelledby="applications" className="flex flex-col gap-2">
      <h2 id="applications" className="text-base font-bold text-ink">
        Your applications
      </h2>
      {applications.map((app) => (
        <div key={app.id} className="card flex items-center gap-3 px-4 py-3">
          <Avatar src={app.image} name={app.name} size="sm" decorative />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">
              {app.name}{" "}
              <span className="font-normal text-muted">@{app.username}</span>
            </p>
            {app.deskNote && (
              <p className="text-xs text-muted">Editor Desk: {app.deskNote}</p>
            )}
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[0.6875rem] font-bold",
              app.status === "approved"
                ? "bg-success-soft text-success-strong"
                : app.status === "rejected"
                  ? "bg-tint text-brand"
                  : "bg-surface-2 text-ink-2",
            )}
          >
            {STATUS_TEXT[app.status]}
          </span>
        </div>
      ))}
    </section>
  );
}

type ApplyErrors = Partial<
  Record<"name" | "username" | "about" | "image" | "link", string>
>;

function ApplyForm() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [about, setAbout] = useState("");
  const [link, setLink] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<ApplyErrors>({});

  const apply = useMutation({
    mutationFn: () =>
      api.groups.apply({
        name: name.trim(),
        username: normalizeUsername(username.replace(/^@/, "")),
        about: about.trim(),
        image: logo ?? "",
        link: link.trim() || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.groups, exact: true });
      toast.success("Application sent", {
        description:
          "The Editor Desk will check your outlet and set the group up.",
      });
    },
    onError: (failed) => {
      if (isApiError(failed) && failed.fields)
        setErrors(failed.fields as ApplyErrors);
      toast.error("Couldn't send the application", {
        description: errorMessage(failed),
      });
    },
  });

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadImage(file, "avatar");
      setLogo(uploaded.url);
      setErrors((e) => ({ ...e, image: undefined }));
    } catch (failed) {
      toast.error("Couldn't upload the logo", {
        description: errorMessage(failed),
      });
    } finally {
      setUploading(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: ApplyErrors = {};
    if (name.trim().length < 2) found.name = "Enter the group's name";
    if (!username.trim()) found.username = "Pick a username for the group";
    if (about.trim().length < 10)
      found.about = "Tell readers what the group covers";
    if (!logo) found.image = "Add the group's logo";
    setErrors(found);
    if (Object.keys(found).length === 0) apply.mutate();
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      className="card flex flex-col gap-4 px-5 py-5"
    >
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={cn(
            "relative inline-flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed bg-surface-2 text-muted transition-colors hover:text-brand",
            errors.image ? "border-brand" : "border-border-strong",
          )}
          aria-label={logo ? "Change the logo" : "Add the group's logo"}
        >
          {logo ? (
            <img src={logo} alt="" className="size-full object-cover" />
          ) : (
            <ImagePlus aria-hidden className="size-6" />
          )}
          {uploading && (
            <span className="absolute inset-0 animate-pulse bg-surface/60" />
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => void pickLogo(e.target.files?.[0])}
        />
        <div className="text-sm text-muted">
          <p className="font-semibold text-ink">Logo</p>
          <p>{errors.image ?? "A square logo works best."}</p>
        </div>
      </div>
      <Field label="Group name" error={errors.name}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="VK Mangalore"
          maxLength={60}
        />
      </Field>
      <Field
        label="Username"
        hint="The group's @handle — letters, dots and underscores."
        error={errors.username}
      >
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="vk.mangalore"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </Field>
      <Field
        label="About"
        hint="Shown on the group's profile."
        error={errors.about}
      >
        <Textarea
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          maxLength={GROUP_LIMITS.aboutMax}
          showCount
          rows={3}
          placeholder="Local news from Mangaluru and Dakshina Kannada."
        />
      </Field>
      <Field label="Website or page (optional)" error={errors.link}>
        <Input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://"
          inputMode="url"
        />
      </Field>
      <Button
        type="submit"
        loading={apply.isPending}
        disabled={uploading}
        leftIcon={<Building2 aria-hidden />}
        className="self-start"
      >
        Send to the Editor Desk
      </Button>
    </form>
  );
}
