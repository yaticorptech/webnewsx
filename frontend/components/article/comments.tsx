"use client";

import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { Heart, MessageCircle, Reply, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { UserHandle } from "@/components/brand/user-handle";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import { setStats, useArticleStats } from "@/components/feed/live-state";
import { useAuthPrompt } from "@/components/layout/auth-prompt";
import { useRealtimeEvent, useRealtimeReconnect } from "@/components/providers/realtime-provider";
import { useViewer } from "@/components/providers/viewer-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { TimeAgo } from "@/components/ui/time-ago";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, isApiError } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { COMMENT_MAX, MENTION_REGEX, type ArticleCard, type ArticleComment, type Page } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { MentionTextarea } from "./mention-textarea";

type CommentPages = InfiniteData<Page<ArticleComment>, string | null>;

/** What the comments need of a story: its id and live counts (a feed card or the full story). */
export type CommentsSource = Pick<ArticleCard, "id" | "viewCount" | "likeCount" | "shareCount" | "commentCount">;

/**
 * Comments on a story (owner 2026-09-26): on wide screens a sticky panel beside the story (the page places it),
 * below the story elsewhere. Newest first, 20 at a time. Each comment can be liked and replied to (one level of
 * threading: "View N replies"); replying pre-fills "@name". "@username" mentions are suggested while typing and
 * link to real profiles. The comment's author, the story's author and the Editor Desk can delete a comment
 * (with its replies). The count is the live story stat.
 * `sheet` (owner 2026-10-05, like Instagram): for the comments sheet opened from a feed / Newsy card — no heading
 * (the sheet has the title), the list scrolls and the composer stays pinned at the bottom.
 */
export function Comments({ article, sheet = false, className }: { article: CommentsSource; sheet?: boolean; className?: string }) {
  const queryClient = useQueryClient();
  const stats = useArticleStats(article);
  const key = qk.comments(article.id);

  const list = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam, signal }) => api.comments(article.id, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const comments = list.data?.pages.flatMap((page) => page.items) ?? [];

  // Live: someone commented / replied / deleted here → refetch the list and any open replies (bursts collapse).
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshLive = () => {
    if (liveTimer.current) clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: qk.allReplies });
    }, 400);
  };
  useRealtimeEvent("comments.changed", ({ articleId }) => {
    if (articleId === article.id) refreshLive();
  });
  // Catch up on anything missed while the stream was down (phone asleep, network change).
  useRealtimeReconnect(refreshLive);
  useEffect(
    () => () => {
      if (liveTimer.current) clearTimeout(liveTimer.current);
    },
    [],
  );


  /** Patch one top-level comment in the list cache. */
  const patchTop = (id: string, patch: (comment: ArticleComment) => ArticleComment | null) =>
    queryClient.setQueryData<CommentPages>(key, (prev) =>
      prev
        ? {
            ...prev,
            pages: prev.pages.map((page) => ({
              ...page,
              items: page.items.flatMap((c) => {
                if (c.id !== id) return [c];
                const next = patch(c);
                return next ? [next] : [];
              }),
            })),
          }
        : prev,
    );

  const addTop = (comment: ArticleComment) => {
    queryClient.setQueryData<CommentPages>(key, (prev) =>
      prev?.pages.length
        ? { ...prev, pages: [{ ...prev.pages[0]!, items: [comment, ...prev.pages[0]!.items] }, ...prev.pages.slice(1)] }
        : { pages: [{ items: [comment], nextCursor: null }], pageParams: [null] },
    );
  };

  const composer = (
    <CommentComposer
      articleId={article.id}
      className={sheet ? "shrink-0 border-t border-border bg-surface px-5 py-3 sm:px-6" : "mt-4 shrink-0"}
      onPosted={addTop}
    />
  );

  const threads = (
    <div className={sheet ? "min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 sm:px-6" : "xl:-mx-5 xl:mt-2 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:px-5"}>
      {list.isPending ? (
        <p className="mt-6 text-sm text-muted">Loading comments…</p>
      ) : list.isError ? (
        <div className="mt-6 flex items-center gap-3 text-sm text-muted">
          Comments didn&apos;t load.
          <Button variant="ghost" size="sm" onClick={() => void list.refetch()} className="text-brand">
            Try again
          </Button>
        </div>
      ) : comments.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted sm:mt-6">
          <MessageCircle aria-hidden className="size-4 text-brand" />
          No comments yet — start the conversation.
        </p>
      ) : (
        <ul className="mt-4">
          {comments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              articleId={article.id}
              onRemoved={() => patchTop(comment.id, () => null)}
              onReplyAdded={() => patchTop(comment.id, (c) => ({ ...c, replyCount: c.replyCount + 1 }))}
              onReplyRemoved={() => patchTop(comment.id, (c) => ({ ...c, replyCount: Math.max(0, c.replyCount - 1) }))}
            />
          ))}
        </ul>
      )}

      {list.hasNextPage && (
        <Button variant="outline" size="sm" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} className="my-4">
          Show more comments
        </Button>
      )}
    </div>
  );

  if (sheet) {
    return (
      <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
        {threads}
        {composer}
      </div>
    );
  }

  return (
    <section
      id="comments"
      aria-labelledby="comments-heading"
      className={cn(
        // Phones closer to the story (owner 2026-10-10: less white space).
        "mt-6 scroll-mt-[calc(var(--nav-h)+1rem)] sm:mt-12",
        // Wide screens: a card beside the story whose list scrolls on its own.
        "xl:mt-0 xl:flex xl:max-h-[calc(100dvh-var(--nav-h)-2.5rem)] xl:flex-col xl:rounded-[1.25rem] xl:border xl:border-border xl:bg-surface xl:p-5",
        className,
      )}
    >
      {/* Redesign 2026-10-07: a plain title with the count beside it, like Instagram / YouTube. */}
      <h2 id="comments-heading" className="flex shrink-0 items-baseline gap-2 font-wide text-lg font-black text-ink">
        Comments
        <span className="text-base font-bold tabular-nums text-muted">{formatNumber(stats.commentCount)}</span>
      </h2>

      {composer}
      {threads}
    </section>
  );
}

/* ─────────────────────────── Composer ─────────────────────────── */

type ComposerProps = {
  articleId: string;
  /** A reply: the thread's top-level comment. */
  parentId?: string;
  /** Pre-filled text ("@name " when replying). */
  initial?: string;
  compact?: boolean;
  autoFocus?: boolean;
  onPosted: (comment: ArticleComment) => void;
  onCancel?: () => void;
  className?: string;
};

function CommentComposer({ articleId, parentId, initial = "", compact = false, autoFocus = false, onPosted, onCancel, className }: ComposerProps) {
  const viewer = useViewer();
  const queryClient = useQueryClient();
  const authPrompt = useAuthPrompt();
  const inputId = useId();
  const [body, setBody] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const send = async () => {
    if (posting || !authPrompt.guard("Log in to comment")) return;
    const text = body.trim();
    if (!text) {
      setError("Write a comment first");
      return;
    }
    setPosting(true);
    setError(null);
    try {
      const { comment, commentCount } = await api.addComment(articleId, { body: text, parentId: parentId ?? null });
      // The story's count as the server has it (owner 2026-10-05: adding 1 here as well as the live count showed 2 for 1).
      setStats(queryClient, articleId, { commentCount });
      onPosted(comment);
      setBody("");
    } catch (err) {
      if (isApiError(err) && err.fields?.body) setError(err.fields.body);
      else toast.error("Couldn't post your comment", { id: "comment-error", description: errorMessage(err) });
    } finally {
      setPosting(false);
    }
  };

  // Logged out: a button, not a text box — focusing a box that opens the prompt would reopen it every time the
  // prompt closes and hands focus back.
  if (!viewer) {
    return (
      <button
        type="button"
        onClick={() => authPrompt.guard("Log in to comment")}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl border border-border-strong bg-surface px-3.5 py-3 text-left text-[0.9375rem] text-muted transition-colors hover:border-brand hover:text-brand",
          className,
        )}
      >
        <MessageCircle aria-hidden className="size-4.5 shrink-0 text-brand" />
        Log in to comment
      </button>
    );
  }

  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void send();
      }}
      className={cn("flex gap-3", className)}
      noValidate
    >
      {!compact && <Avatar src={viewer.image} name={viewer.name} size="md" decorative className="mt-0.5 hidden sm:block xl:hidden" />}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <label htmlFor={inputId} className="sr-only">
          {parentId ? "Write a reply" : "Add a comment"}
        </label>
        <MentionTextarea
          id={inputId}
          value={body}
          onValueChange={(value) => {
            setBody(value);
            if (error) setError(null);
          }}
          maxLength={COMMENT_MAX}
          showCount={body.length > COMMENT_MAX * 0.8}
          rows={compact ? 1 : 2}
          autoGrow
          maxRows={8}
          autoFocus={autoFocus}
          invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          textareaClassName={compact ? "min-h-11 py-2.5" : undefined}
          // Enter sends, Shift+Enter starts a new line (the @mention list handles Enter first while it's open).
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder={parentId ? "Write a reply…" : "Add a comment…"}
        />
        <div className="flex items-center justify-between gap-3">
          <p id={`${inputId}-error`} aria-live="polite" className="text-xs font-semibold text-brand">
            {error}
          </p>
          <div className="flex items-center gap-1.5">
            {onCancel && (
              <Button variant="ghost" size="sm" onClick={onCancel} disabled={posting}>
                Cancel
              </Button>
            )}
            <Button type="submit" size="sm" loading={posting} leftIcon={<Send aria-hidden />} disabled={!body.trim()}>
              {parentId ? "Reply" : "Post"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

/* ─────────────────────────── Threads ─────────────────────────── */

type ThreadProps = {
  comment: ArticleComment;
  articleId: string;
  onRemoved: () => void;
  onReplyAdded: () => void;
  onReplyRemoved: () => void;
};

/** A top-level comment, its replies (loaded on demand) and the reply box. */
function CommentThread({ comment, articleId, onRemoved, onReplyAdded, onReplyRemoved }: ThreadProps) {
  const queryClient = useQueryClient();
  const authPrompt = useAuthPrompt();
  const [showReplies, setShowReplies] = useState(false);
  /** Open reply box, pre-filled with "@name " of whoever is being answered. */
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const repliesKey = qk.replies(comment.id);
  const replies = useQuery({
    queryKey: repliesKey,
    queryFn: ({ signal }) => api.replies(articleId, comment.id, signal).then((result) => result.items),
    enabled: showReplies,
  });

  const openReply = (username: string) => {
    if (!authPrompt.guard("Log in to reply")) return;
    setReplyTo(username);
  };

  return (
    <li className="border-t border-border py-4 first:border-t-0 xl:first:pt-2">
      <CommentItem
        comment={comment}
        articleId={articleId}
        onReply={() => openReply(comment.author.username)}
        onDeleted={onRemoved}
      />
      <div className="ml-11 flex flex-col">
        {comment.replyCount > 0 && (
          <button
            type="button"
            onClick={() => setShowReplies((v) => !v)}
            aria-expanded={showReplies}
            className="mt-2 inline-flex items-center gap-2 self-start text-xs font-bold text-brand hover:underline"
          >
            <span aria-hidden className="h-px w-6 bg-border-strong" />
            {showReplies ? "Hide replies" : `View ${comment.replyCount} ${comment.replyCount === 1 ? "reply" : "replies"}`}
          </button>
        )}
        {showReplies && replies.isPending && <p className="mt-2 text-xs text-muted">Loading replies…</p>}
        {showReplies && replies.data && replies.data.length > 0 && (
          <ul className="mt-1">
            {replies.data.map((reply) => (
              <li key={reply.id} className="pt-3">
                <CommentItem
                  comment={reply}
                  articleId={articleId}
                  small
                  onReply={() => openReply(reply.author.username)}
                  onDeleted={() => {
                    queryClient.setQueryData<ArticleComment[]>(repliesKey, (prev) => prev?.filter((r) => r.id !== reply.id));
                    onReplyRemoved();
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        {replyTo !== null && (
          <CommentComposer
            key={replyTo}
            articleId={articleId}
            parentId={comment.id}
            initial={`@${replyTo} `}
            compact
            autoFocus
            className="mt-3"
            onCancel={() => setReplyTo(null)}
            onPosted={(reply) => {
              queryClient.setQueryData<ArticleComment[]>(repliesKey, (prev) => [...(prev ?? []), reply]);
              setShowReplies(true);
              setReplyTo(null);
              onReplyAdded();
            }}
          />
        )}
      </div>
    </li>
  );
}

/* ─────────────────────────── One comment ─────────────────────────── */

type ItemProps = {
  comment: ArticleComment;
  articleId: string;
  /** A reply (smaller avatar). */
  small?: boolean;
  onReply: () => void;
  onDeleted: () => void;
};

function CommentItem({ comment, articleId, small = false, onReply, onDeleted }: ItemProps) {
  const authPrompt = useAuthPrompt();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  /** Local like state after the viewer's own clicks (the server's answer wins). */
  const [like, setLike] = useState<{ liked: boolean; count: number } | null>(null);
  const liked = like?.liked ?? comment.liked;
  const likeCount = like?.count ?? comment.likeCount;
  const profile = `/${comment.author.username}`;

  // "Delete" asks once; the question goes away on its own after a few seconds.
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const toggleLike = async () => {
    if (!authPrompt.guard("Log in to like comments")) return;
    const next = !liked;
    setLike({ liked: next, count: Math.max(0, likeCount + (next ? 1 : -1)) });
    try {
      const result = await api.likeComment(articleId, comment.id, next);
      setLike({ liked: result.liked, count: result.likeCount });
    } catch (err) {
      setLike({ liked: !next, count: likeCount });
      toast.error("Couldn't update the like", { id: "comment-like-error", description: errorMessage(err) });
    }
  };

  const remove = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setDeleting(true);
    try {
      const { commentCount } = await api.deleteComment(articleId, comment.id);
      setStats(queryClient, articleId, { commentCount });
      toast.success("Comment deleted", { id: "comment-deleted" });
      onDeleted();
    } catch (err) {
      toast.error("Couldn't delete the comment", { id: "comment-error", description: errorMessage(err) });
      setDeleting(false);
      setConfirming(false);
    }
  };

  const action = "inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-xs font-bold transition-colors";

  return (
    <div className="flex gap-3">
      <Link href={profile} className="shrink-0 rounded-full outline-offset-2" tabIndex={-1} aria-hidden>
        <Avatar src={comment.author.image} name={comment.author.name} size={small ? "sm" : "md"} decorative />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
          <Link href={profile} className="truncate font-bold text-ink hover:text-brand">
            {comment.author.name}
          </Link>
          {comment.author.reporterLevel === "verified" && <VerifiedBadge size={14} focusable={false} />}
          <UserHandle username={comment.author.username} className="text-xs text-muted" />
          <span aria-hidden className="text-faint">
            ·
          </span>
          <TimeAgo date={comment.createdAt} className="text-xs text-muted" />
        </p>
        <CommentBody body={comment.body} mentions={comment.mentions} />
        <div className="-ml-2 mt-1 flex flex-wrap items-center gap-0.5">
          <button
            type="button"
            onClick={toggleLike}
            aria-pressed={liked}
            aria-label={`Like comment · ${formatNumber(likeCount)} ${likeCount === 1 ? "like" : "likes"}`}
            className={cn(action, liked ? "text-brand" : "text-muted hover:bg-tint hover:text-brand")}
          >
            <Heart aria-hidden strokeWidth={2.25} className={cn("size-3.5", liked && "fill-brand")} />
            {likeCount > 0 && <span className="tabular-nums">{formatNumber(likeCount)}</span>}
          </button>
          <button type="button" onClick={onReply} className={cn(action, "text-muted hover:bg-tint hover:text-brand")}>
            <Reply aria-hidden className="size-3.5" />
            Reply
          </button>
          {comment.canDelete && (
            <button
              type="button"
              disabled={deleting}
              onClick={remove}
              className={cn(action, confirming ? "bg-brand text-brand-contrast" : "text-muted hover:bg-tint hover:text-brand")}
            >
              <Trash2 aria-hidden className="size-3.5" />
              {deleting ? "Deleting…" : confirming ? "Tap again to delete" : "Delete"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Comment text with its @mentions of real accounts linked to their profiles. */
function CommentBody({ body, mentions }: { body: string; mentions: string[] }) {
  const known = new Set(mentions);
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of body.matchAll(MENTION_REGEX)) {
    const name = match[2] ?? "";
    const at = (match.index ?? 0) + (match[1]?.length ?? 0);
    if (!known.has(name.toLowerCase())) continue;
    parts.push(body.slice(last, at));
    parts.push(
      <Link key={at} href={`/${name.toLowerCase()}`} className="font-semibold text-brand hover:underline">
        @{name}
      </Link>,
    );
    last = at + 1 + name.length;
  }
  parts.push(body.slice(last));
  return (
    <p dir="auto" className="mt-1 whitespace-pre-line break-words text-[0.9375rem] leading-relaxed text-ink-2">
      {parts}
    </p>
  );
}
