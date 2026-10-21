"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, ExternalLink, EyeOff } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { CategoryChip } from "@/components/feed/category-chip";
import { CommentButton } from "@/components/feed/comment-button";
import { ThumbsVote } from "./thumbs-vote";
import { seedStats, useArticleStats } from "@/components/feed/live-state";
import { ReportedMark } from "@/components/feed/reported-mark";
import { SaveButton } from "@/components/feed/save-button";
import { ShareButton } from "@/components/feed/share-button";
import { StoryLabels } from "@/components/feed/story-badges";
import { StoryCover } from "@/components/feed/story-cover";
import { useLike } from "@/components/feed/use-like";
import { useSave } from "@/components/feed/use-save";
import { hasIndicScript, INDIC_HEADLINE } from "@/components/feed/script";
import { ViewCount } from "@/components/feed/view-count";
import {
  countViewNow,
  recordArticleRead,
} from "@/components/feed/view-tracker";
import { useRealtimeEvent } from "@/components/providers/realtime-provider";
import { useViewer } from "@/components/providers/viewer-provider";
import { BackButton } from "@/components/layout/back-button";
import { PulseDot } from "@/components/ui/pulse-dot";
import { TimeAgo } from "@/components/ui/time-ago";
import { isFresh } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import type { ArticleDetail, ArticleMedia } from "@/lib/shared/contracts";
import { track } from "@/lib/track";
import { cn } from "@/lib/utils";
import { useMeterStoryPage } from "@/components/auth/read-meter";
import { AuthorCard } from "./author-card";
import { ListenBar } from "./listen-bar";
import { Paywall, PremiumBadge } from "@/components/feed/premium";

export type ArticleViewProps = {
  article: ArticleDetail;
  /** Composer preview: no navigation and no like/follow/share/view side effects (controls render inert). */
  preview?: boolean;
};

/**
 * Headline size (owner 2026-09-25: smaller than before): long headlines step down so the wide cut stays readable.
 * Indic scripts (Kannada) look larger at the same size and get open leading, so they sit one step lower.
 */
const TITLE_SIZES = {
  latin: [
    "text-[clamp(1.625rem,1.2rem+1.6vw,2.5rem)] leading-[1.06]",
    "text-[clamp(1.5rem,1.15rem+1.3vw,2.125rem)] leading-[1.08]",
    "text-[clamp(1.375rem,1.1rem+1vw,1.875rem)] leading-[1.1]",
  ],
  indic: [
    "text-[clamp(1.5rem,1.15rem+1.2vw,2.125rem)]",
    "text-[clamp(1.375rem,1.1rem+1vw,1.875rem)]",
    "text-[clamp(1.25rem,1.05rem+0.8vw,1.625rem)]",
  ],
} as const;

function titleSize(title: string): string {
  const indic = hasIndicScript(title);
  const step = title.length > 100 ? 2 : title.length > 60 ? 1 : 0;
  return cn(
    TITLE_SIZES[indic ? "indic" : "latin"][step],
    indic ? INDIC_HEADLINE : "tracking-[-0.02em]",
  );
}

/** Indic bodies: roomier headings, and no faux-italic quotes (these scripts have no italic cut). */
const INDIC_PROSE =
  "[&_h2]:leading-[1.4] [&_h3]:leading-[1.4] [&_blockquote]:not-italic";

/**
 * The drop cap is a Latin-typography device: `::first-letter` on Kannada (and other Indic scripts)
 * grabs a whole conjunct cluster and floats it awkwardly, so those bodies start plain.
 */
function startsWithLatin(html: string): boolean {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .trimStart();
  return /^[\p{Script=Latin}\d"'“‘(]/u.test(text);
}

/** The article media's own width ÷ height (its clip's, for a video); 16:9 when the size is unknown. */
function articleMediaRatio(media: ArticleMedia): number {
  const { width, height } = media.video ?? media;
  return width && height ? width / height : 16 / 9;
}

/**
 * Full article (SPEC §3.5), shared by /a/[slug] and the composer preview: full-bleed hero on phones (rounded, sliced on
 * larger screens; double-tap likes; on tablets and computers the back arrow sits on its top left — owner 2026-10-09),
 * the section · time · reading time, wide headline, then "Listen" (owner 2026-09-29: the story read aloud, pinned under
 * the masthead while it plays), the Source Serif body, then the publisher with Follow (owner 2026-10-09: moved here from
 * under the headline) and the action bar (live views / likes / comments / shares, Save, ⋯ — owner 2026-10-07: as it was
 * before the redesign). Opening it counts a view (not for the author).
 */
export function ArticleView({ article, preview = false }: ArticleViewProps) {
  const viewer = useViewer();
  const queryClient = useQueryClient();
  const now = useNow();
  const titleId = useId();
  const live = !preview;
  const stats = useArticleStats(article, live);
  const like = useLike(article, live);
  const save = useSave(article, live);
  const isOwn =
    article.viewer.isAuthor ||
    (viewer !== null && viewer.id === article.author.id);
  const [removed, setRemoved] = useState(false);
  // Visitors (logged out): one of their free stories; past them, the sign-up wall (read-wall.tsx, owner 2026-10-08).
  useMeterStoryPage(article.id, live && !isOwn);

  useEffect(() => {
    if (!live) return;
    // The page data is fresh from the server: it beats whatever counts a feed cached earlier.
    seedStats(queryClient, [article]);
    if (isOwn) return;
    // The view first (it may issue the anonymous viewer cookie the read is then filed under), then the read.
    void countViewNow(article.id).finally(() => recordArticleRead(article.id));
  }, [live, isOwn, article, queryClient]);

  // Reading time (owner 2026-10-16): seconds the page was open and on screen, sent when the reader leaves it.
  useEffect(() => {
    if (!live || isOwn) return;
    let seconds = 0;
    let since = document.visibilityState === "visible" ? Date.now() : null;
    const pause = () => {
      if (since !== null) seconds += (Date.now() - since) / 1000;
      since = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? (since = Date.now()) : pause());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      pause();
      if (seconds >= 1) track("read", { articleId: article.id, props: { seconds: Math.min(Math.round(seconds), 3600) } });
    };
  }, [live, isOwn, article.id]);

  useRealtimeEvent("article.deleted", ({ id }) => {
    if (live && !isOwn && id === article.id) setRemoved(true);
  });

  const fresh = now !== null && isFresh(article.publishedAt, undefined, now);
  const media = article.articleMedia ?? null;
  const level = article.badges?.reporterLevel ?? null;

  return (
    // data-own-back: the story has its own back arrow, on its photo (the shell's row above the page is hidden).
    <article
      // Taps on this page are filed under the story (lib/track.ts).
      data-article-id={article.id}
      aria-labelledby={titleId}
      data-own-back={live ? "" : undefined}
      className="pb-4"
    >
      {removed && (
        <div
          role="status"
          className="mb-5 flex items-start gap-3 rounded-xl border border-brand bg-brand-soft px-4 py-3 text-sm font-semibold text-ink"
        >
          <CircleAlert
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-brand"
          />
          The publisher just removed this story. It&apos;s no longer on the
          wire.
        </div>
      )}

      {article.hidden && live && (
        <div
          role="status"
          className="mb-5 flex items-start gap-3 rounded-xl border border-border-strong bg-surface-2 px-4 py-3 text-sm font-semibold text-ink"
        >
          <EyeOff aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-2" />
          The Editor Desk hid this story. Only you and the desk can see it —
          it&apos;s off every feed.
        </div>
      )}

      {/*
        The article's own image or video (owner 2026-09-28) in its own shape, uncropped (owner 2026-09-29: any size);
        stories from before it existed show their cover.
      */}
      {/* Phones on the website (owner 2026-10-10: "above the image, how it was before"): the back arrow in its own row,
          tight under the masthead. Not in the Android app (the phone's own back; data-app-no-back hides the row). */}
      {live && (
        <div data-app-no-back="" className="-mt-1.5 mb-1.5 flex sm:hidden">
          <BackButton fallback="/" />
        </div>
      )}
      <div className="relative">
        <StoryCover
          src={media?.url ?? article.coverUrl}
          blur={media ? media.blur : article.coverBlur}
          width={media ? media.width : article.coverWidth}
          height={media ? media.height : article.coverHeight}
          onDoubleActivate={live ? like.like : undefined}
          video={media ? media.video : article.video}
          aspect={media ? articleMediaRatio(media) : undefined}
          priority
          className={cn(
            "w-auto sm:w-full sm:rounded-2xl",
            // Full-bleed on phones (the shell column has a 1rem side gutter). In the app (no back row) right under the
            // masthead (owner 2026-10-09: no white strip above the photo).
            !preview && "-mx-4 rounded-none max-sm:[html[data-app=android]_&]:-mt-3 sm:mx-0",
          )}
        />
        {/* Tablets and computers: the back arrow on the photo's top left (owner 2026-10-09). Phones have the row above. */}
        {live && (
          <span className="absolute left-4 top-4 z-10 max-sm:hidden">
            <BackButton
              fallback="/"
              className="size-10 border-white/60 bg-white/90 text-[#16181d] shadow-pop backdrop-blur-sm hover:text-brand [&_svg]:size-5"
            />
          </span>
        )}
      </div>

      <header className="mt-3.5 sm:mt-8">
        <div className="kicker flex min-h-6 flex-wrap items-center gap-x-2.5 gap-y-2 text-muted">
          {fresh ? (
            // Old-platform style live pill: crimson, white bold text, beating dot.
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-brand pl-2 pr-2.5 text-brand-contrast">
              <PulseDot size="xs" tone="white" />
              Just in
            </span>
          ) : null}
          {/* The section only, never the district (owner 2026-10-09). */}
          {article.category && (
            <CategoryChip category={article.category} inert={preview} />
          )}
          {article.premium && <PremiumBadge locked={article.locked} />}
          <StoryLabels
            badges={article.badges}
            className="normal-case tracking-normal"
          />
          <TimeAgo
            date={article.publishedAt}
            className="normal-case tracking-normal text-ink-2"
          />
          {article.editedAt && (
            <span className="normal-case tracking-normal text-muted">
              · Updated <TimeAgo date={article.editedAt} />
            </span>
          )}
        </div>

        <h1
          id={titleId}
          dir="auto"
          className={cn(
            "mt-2.5 font-wide font-black text-ink sm:mt-4",
            titleSize(article.title),
          )}
        >
          {article.title}
        </h1>
        {/* The blurb (owner 2026-10-14): the story's 2-line summary under the headline. */}
        {article.blurb && (
          <p dir="auto" className="mt-3 text-[1.0625rem] font-semibold leading-relaxed text-ink-2 sm:mt-4 sm:text-lg">
            {article.blurb}
          </p>
        )}
      </header>

      {/* Only for the reader who reported it (owner 2026-09-30). */}
      {live && <ReportedMark article={article} className="mt-4 sm:mt-6" />}

      {live && !article.locked && (
        <ListenBar
          title={article.title}
          bodyHtml={article.bodyHtml}
          className="mt-4 sm:mt-6"
        />
      )}

      {/* Premium (owner 2026-10-14): not a member → the start of the story fades into "Buy premium". */}
      {article.locked ? (
        <Paywall
          author={article.author}
          priceInr={article.paywall?.priceInr ?? null}
          next={`/a/${article.slug}`}
          className="mt-5 sm:mt-8"
        />
      ) : (
      /* Sanitized server-side (allow-list, links forced to rel="noopener noreferrer nofollow ugc"). */
      <div
        // Any language: right-to-left scripts (Urdu, Sindhi, Kashmiri) lay out right-to-left.
        dir="auto"
        className={cn(
          "prose-news mt-5 sm:mt-8",
          startsWithLatin(article.bodyHtml) && "prose-news-dropcap",
          hasIndicScript(article.bodyHtml) && INDIC_PROSE,
        )}
        dangerouslySetInnerHTML={{ __html: article.bodyHtml }}
      />
      )}

      {/* "Read more link" stories (owner 2026-10-14): the story is at its source — open it in a new tab. */}
      {article.linkUrl && !article.locked && (
        <a
          href={article.linkUrl}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
          className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-tint-border bg-tint px-5 py-4 transition-colors hover:border-brand sm:mt-8"
        >
          <span className="min-w-0">
            <span className="block font-wide text-lg font-extrabold text-ink">Read more</span>
            {article.linkDomain && <span className="block truncate text-sm text-muted">{article.linkDomain}</span>}
          </span>
          <span className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-bold text-brand-contrast">
            Open <ExternalLink aria-hidden className="size-4" />
          </span>
        </a>
      )}

      {/* After the story (owner 2026-10-09; before: under the headline): who wrote it, with Follow, then the actions. */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-border pt-4 pb-3 sm:mt-10">
        <AuthorCard
          author={article.author}
          reporterLevel={level}
          following={article.viewer.followingAuthor}
          isOwn={isOwn}
          preview={preview}
          className="min-w-0"
        />
      </div>
      <div
        className="flex flex-wrap items-center justify-between gap-y-2 border-y border-border py-1.5"
        inert={preview || undefined}
      >
        {/* Owner 2026-10-10: the author sees views · like · comment · share and nothing else; everyone else like ·
            comment · share and Save (no view count, Report or ⋯ here). */}
        <div className="-ml-3.5 flex items-center gap-0.5">
          {isOwn && <ViewCount count={stats.viewCount} size="md" />}
          {/* 👍 / 👎 in place of the heart, only here inside the story (owner 2026-10-16). */}
          <ThumbsVote
            articleId={article.id}
            like={like}
            likeCount={stats.likeCount}
            initialDislikes={article.dislikeCount ?? 0}
            initialDisliked={article.disliked ?? false}
          />
          <CommentButton
            article={article}
            count={stats.commentCount}
            size="md"
            onPage
            inert={preview}
          />
          <ShareButton
            article={article}
            count={stats.shareCount}
            size="md"
            inert={preview}
          />
        </div>
        {!isOwn && (
          <div className="-mr-2 flex items-center gap-1">
            <SaveButton save={save} size="md" showLabel />
          </div>
        )}
      </div>
    </article>
  );
}
