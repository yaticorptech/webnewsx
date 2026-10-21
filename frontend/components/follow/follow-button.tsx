"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, BellRing, Check, ChevronDown, Plus, UserMinus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { handleText } from "@/components/brand/user-handle";
import { askUnfollow } from "./unfollow-confirm";
import { useAuthPrompt } from "@/components/layout/auth-prompt";
import { useViewer } from "@/components/providers/viewer-provider";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, isApiError, type FollowResult } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

export type FollowButtonProps = {
  username: string;
  /** Server-known state; every FollowButton for the same username shares state after that. */
  initialFollowing: boolean;
  size?: "sm" | "md";
  /** After the server confirms: new state + the target's follower count. */
  onChange?: (following: boolean, followerCount: number) => void;
  className?: string;
};

const SIZES = {
  // Phones: an invisible ::after grows the 32px pill to a 44px touch target.
  sm: { button: "h-8 min-w-27 px-3.5 text-[0.8125rem] [&_svg]:size-3.5 max-md:after:absolute max-md:after:-inset-1.5 max-md:after:content-['']", inner: "gap-1.5" },
  md: { button: "h-10 min-w-33 px-5 text-sm [&_svg]:size-4", inner: "gap-2" },
} as const;

/**
 * Follow ↔ Following pill (crimson → pink "Following" with a check): optimistic, shared across every button for the same publisher
 * (TanStack Query cache `qk.followState`), morphing label + icon — following from this button draws the tick (owner
 * 2026-10-01). Logged-out viewers get the auth prompt; the button is hidden on the viewer's own profile/articles.
 */
/**
 * Follow state for one publisher, shared by every Follow control for them (TanStack Query cache `qk.followState`):
 * optimistic, rolled back on failure, logged-out viewers get the auth prompt. `toggle` returns false when it didn't run.
 */
export function useFollow(username: string, initialFollowing: boolean, onChange?: (following: boolean, followerCount: number) => void) {
  const viewer = useViewer();
  const authPrompt = useAuthPrompt();
  const queryClient = useQueryClient();
  const key = qk.followState(username);

  const { data: following = initialFollowing } = useQuery({
    queryKey: key,
    queryFn: () => initialFollowing,
    initialData: initialFollowing,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });

  const mutation = useMutation<FollowResult, unknown, boolean, { previous: boolean }>({
    mutationFn: (next) => (next ? api.follow(username) : api.unfollow(username)),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<boolean>(key) ?? initialFollowing;
      queryClient.setQueryData(key, next);
      return { previous };
    },
    onError: (error, _next, context) => {
      queryClient.setQueryData(key, context?.previous ?? initialFollowing);
      if (isApiError(error) && error.isUnauthorized) {
        authPrompt.open(`Log in to follow ${handleText(username)}`);
        return;
      }
      toast.error(`Couldn't update your follow of ${handleText(username)}`, { description: errorMessage(error), id: `follow-${username}` });
    },
    onSuccess: (result) => {
      queryClient.setQueryData(key, result.following);
      onChange?.(result.following, result.followerCount);
      void queryClient.invalidateQueries({ queryKey: qk.profile(username) });
      if (viewer?.username) {
        void queryClient.invalidateQueries({ queryKey: qk.following(viewer.username) });
      }
      void queryClient.invalidateQueries({ queryKey: qk.followers(username) });
      void queryClient.invalidateQueries({ queryKey: qk.feed("following") });
    },
  });

  const toggle = (): boolean => {
    if (!authPrompt.guard(`Log in to follow ${handleText(username)}`)) return false;
    if (mutation.isPending) return false;
    // Unfollowing asks first (owner 2026-10-14): "Unfollow @name?" with Unfollow / Cancel.
    if (following) {
      askUnfollow(username, () => mutation.mutate(false));
      return false;
    }
    mutation.mutate(true);
    return true;
  };

  return { following, toggle, pending: mutation.isPending, isSelf: Boolean(viewer?.username && viewer.username === username) };
}

/** The follow's bell (owner 2026-10-16): every new story (true) or none (false), loaded when needed. */
function useFollowBell(username: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const key = ["follow-notify", username] as const;
  const { data: notify = true } = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api.followNotify(username, signal).then((result) => result.notify),
    enabled,
    staleTime: 5 * 60_000,
  });
  const mutation = useMutation({
    mutationFn: (next: boolean) => api.setFollowNotify(username, next),
    onMutate: (next) => {
      const previous = queryClient.getQueryData<boolean>(key);
      queryClient.setQueryData(key, next);
      return { previous };
    },
    onError: (error, _next, context) => {
      queryClient.setQueryData(key, context?.previous ?? true);
      toast.error("Couldn't change notifications", { description: errorMessage(error) });
    },
    onSuccess: ({ notify: next }) => {
      toast.success(next ? `You'll hear about every new story from ${handleText(username)}` : `Notifications off for ${handleText(username)}`, {
        id: `bell-${username}`,
      });
    },
  });
  return { notify, setNotify: (next: boolean) => next !== notify && mutation.mutate(next) };
}

/**
 * "Following" with its bell, like YouTube's Subscribed (owner 2026-10-16): tap it for a small menu — All notifications
 * (every new story) · None · Unfollow. It opens by itself right after Follow (`openNow`), so the reader can pick at once.
 */
function FollowingMenu({
  username,
  toggle,
  openNow,
  onSettled,
  triggerClassName,
  iconClassName = "size-3.5",
}: {
  username: string;
  toggle: () => boolean;
  openNow: boolean;
  onSettled: () => void;
  triggerClassName: string;
  iconClassName?: string;
}) {
  const [open, setOpen] = useState(openNow);
  const { notify, setNotify } = useFollowBell(username, true);
  const BellIcon = notify ? BellRing : BellOff;
  // Small and quiet (owner 2026-10-16: "a small dropdown is enough").
  const choice = (title: string, on: boolean) => (
    <span className="flex items-center gap-2">
      <span className="min-w-0 flex-1">{title}</span>
      <Check aria-hidden className={cn("size-3.5 shrink-0 text-brand", on ? "opacity-100" : "opacity-0")} strokeWidth={3} />
    </span>
  );
  return (
    <DropdownMenu
      label={`Following ${handleText(username)} — notifications`}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) onSettled();
      }}
      triggerClassName={triggerClassName}
      trigger={
        <span className="inline-flex items-center gap-1.5">
          <BellIcon aria-hidden className={cn(iconClassName, notify && "text-brand")} />
          <span>Following</span>
          <ChevronDown aria-hidden className={cn(iconClassName, "opacity-60")} />
        </span>
      }
      menuClassName="min-w-40 rounded-xl p-1 [&_[role=menuitem]]:min-h-0 [&_[role=menuitem]]:h-9 [&_[role=menuitem]]:gap-2 [&_[role=menuitem]]:px-2.5 [&_[role=menuitem]]:text-[0.8125rem] [&_[role=menuitem]_svg]:size-4 [&_[role=separator]]:my-1"
      items={[
        { label: choice("All notifications", notify), icon: <Bell aria-hidden />, onSelect: () => setNotify(true) },
        { label: choice("None", !notify), icon: <BellOff aria-hidden />, onSelect: () => setNotify(false) },
        { type: "separator" },
        { label: "Unfollow", icon: <UserMinus aria-hidden />, danger: true, onSelect: () => void toggle() },
      ]}
    />
  );
}

/**
 * Follow → Following with the bell (owner 2026-10-16): the small pill on cards and the bigger button on profiles share
 * this. Not following: one tap follows and opens the bell menu straight away.
 */
export function FollowControl({
  username,
  initialFollowing,
  followClassName,
  followingClassName,
  iconClassName,
  onChange,
  followContent,
}: {
  username: string;
  initialFollowing: boolean;
  followClassName: string;
  followingClassName: string;
  iconClassName?: string;
  onChange?: (following: boolean, followerCount: number) => void;
  followContent?: ReactNode;
}) {
  const { following, toggle, pending, isSelf } = useFollow(username, initialFollowing, onChange);
  const [justFollowed, setJustFollowed] = useState(false);
  if (isSelf) return null;
  if (following) {
    return (
      <FollowingMenu
        // A fresh menu (open at once) right after following from here.
        key={justFollowed ? "new" : "old"}
        username={username}
        toggle={toggle}
        openNow={justFollowed}
        onSettled={() => setJustFollowed(false)}
        triggerClassName={followingClassName}
        iconClassName={iconClassName}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        if (toggle()) setJustFollowed(true);
      }}
      aria-busy={pending || undefined}
      className={followClassName}
    >
      {followContent ?? "Follow"}
      <span className="sr-only"> {handleText(username)}</span>
    </button>
  );
}

export function FollowButton({ username, initialFollowing, size = "md", onChange, className }: FollowButtonProps) {
  const [drawTick, setDrawTick] = useState(false);
  const { following, toggle, pending, isSelf } = useFollow(username, initialFollowing, onChange);

  if (isSelf) return null;

  // Following: the bell menu (owner 2026-10-16) — it opens by itself right after following from here.
  if (following) {
    return (
      <FollowingMenu
        key={drawTick ? "new" : "old"}
        username={username}
        toggle={toggle}
        openNow={drawTick}
        onSettled={() => setDrawTick(false)}
        triggerClassName={cn(
          "btn-slant relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-bold font-wide text-brand-strong",
          "[--btn-bg:var(--tint)] [--btn-border:var(--tint-border)] hover:[--btn-bg:var(--surface)] hover:[--btn-border:var(--brand)]",
          SIZES[size].button,
          className,
        )}
        iconClassName={size === "sm" ? "size-3.5" : "size-4"}
      />
    );
  }

  const onClick = () => {
    const next = !following;
    if (toggle()) setDrawTick(next);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={following}
      aria-busy={pending || undefined}
      className={cn(
        "btn-slant relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-bold font-wide",
        "transition-[color,transform] duration-150 ease-snap active:scale-[0.96] motion-reduce:active:scale-100",
        following
          ? "text-brand-strong [--btn-bg:var(--tint)] [--btn-border:var(--tint-border)] hover:[--btn-bg:var(--surface)] hover:[--btn-border:var(--brand)]"
          : "text-brand-contrast [--btn-bg:var(--brand)] hover:[--btn-bg:var(--brand-hover)]",
        SIZES[size].button,
        className,
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={following ? "on" : "off"}
          initial={{ opacity: 0, y: 8, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.9 }}
          transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          className={cn("inline-flex items-center", SIZES[size].inner)}
        >
          {following ? <Tick draw={drawTick} /> : <Plus aria-hidden strokeWidth={3} />}
          <span>{following ? "Following" : "Follow"}</span>
        </motion.span>
      </AnimatePresence>
      <span className="sr-only"> {handleText(username)}</span>
    </button>
  );
}

/** The "Following" check (Lucide's, drawn left to right): `draw` strokes it in, as when the reader just followed. */
function Tick({ draw }: { draw: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <motion.path
        d="M4 12l5 5L20 6"
        initial={draw ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.38, delay: 0.1, ease: [0.65, 0, 0.35, 1] }}
      />
    </svg>
  );
}
