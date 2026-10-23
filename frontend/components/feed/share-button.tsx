"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Share2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { ExternalShareButton, SendSheet, type SendItem } from "@/components/messages/send-sheet";
import { useCanMessage } from "@/components/messages/use-can-message";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { NumberTicker } from "@/components/ui/number-ticker";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { hasShareToApp, nativeSharePlugin, shareFileUri, shareToApp } from "@/lib/native-app";
import type { ArticleCard, ShareChannel } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { setStats, statsKey, type StatCounts } from "./live-state";
import { useReelAutoplayController } from "./reel-autoscroll";
import { CopyLinkIcon, EmailIcon, FacebookIcon, InstagramIcon, LinkedInIcon, ShareViaIcon, TelegramIcon, WhatsAppIcon, XIcon } from "./share-glyphs";

/**
 * `shortCode` is always on API cards / details; a client-built preview card may lack it (then the full URL is shared).
 * The poster fields (when given — every feed card has them) draw the story's clipping in the Send sheet.
 */
type ShareSource = Pick<ArticleCard, "id" | "slug" | "shortCode" | "hidden" | "title" | "excerpt"> &
  Partial<Pick<ArticleCard, "coverUrl" | "coverBlur" | "template" | "posterFrame" | "author" | "badges">>;

/** The story's poster (a still: no clip playing), or undefined when the card lacks what it needs. */
function posterOf(article: ShareSource) {
  const author = article.author;
  if (!article.coverUrl || !author) return undefined;
  return {
    template: article.template,
    story: {
      title: article.title,
      imageUrl: article.coverUrl,
      imageBlur: article.coverBlur ?? null,
      videoUrl: null,
      imageFrame: article.posterFrame ?? null,
      author: { name: author.name, username: author.username, image: author.image, reporterLevel: article.badges?.reporterLevel ?? null },
    },
  };
}

/** The Send sheet's item: the story with its poster. */
function sendItem(article: ShareSource): SendItem {
  return { kind: "article", id: article.id, title: article.title, author: article.author?.name, poster: posterOf(article) };
}

export type ShareButtonProps = {
  article: ShareSource;
  count: number;
  size?: "sm" | "md";
  /** Composer preview: renders, does nothing. */
  inert?: boolean;
  className?: string;
};

const noopSubscribe = () => () => {};
const hasNativeShare = () =>
  nativeSharePlugin() !== null || (typeof navigator !== "undefined" && typeof navigator.share === "function");
function useNativeShare(): boolean {
  return useSyncExternalStore(noopSubscribe, hasNativeShare, () => false);
}

/**
 * The story's cover as a JPEG (owner 2026-10-02) — what a share attaches when its poster can't be drawn — or null: no
 * cover, offline, or slow (it gives up after 2.5 s and the link goes alone).
 */
async function coverImage(article: ShareSource): Promise<Blob | null> {
  if (!article.coverUrl) return null;
  try {
    const response = await fetch(`/api/articles/${encodeURIComponent(article.id)}/share-image`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

/** Posters drawn for sharing, by story + design (the last few; a share right after opening the sheet reuses its). */
const posterJobs = new Map<string, Promise<Blob | null>>();

/** The story's poster in its template, with the small WebNEWS mark on top, as a JPEG (owner 2026-10-05). */
function posterFor(article: ShareSource): Promise<Blob | null> {
  const poster = posterOf(article);
  if (!poster) return Promise.resolve(null);
  const key = `${article.id}:${article.template ?? ""}`;
  let job = posterJobs.get(key);
  if (!job) {
    job = import("@/components/poster/poster-jpeg")
      .then(({ posterJpeg }) => posterJpeg(poster.template, poster.story))
      .catch(() => null);
    posterJobs.set(key, job);
    if (posterJobs.size > 6) posterJobs.delete(posterJobs.keys().next().value ?? key);
    void job.then((blob) => {
      if (!blob) posterJobs.delete(key);
    });
  }
  return job;
}

/**
 * What a share attaches (owner 2026-10-05: the template, never the bare photo): the poster; the cover only if the
 * poster can't be drawn at all; nothing once `budgetMs` has passed (a browser's share sheet must open within a few
 * seconds of the tap — then the link goes alone).
 */
async function shareImage(article: ShareSource, budgetMs: number): Promise<Blob | null> {
  const poster = await Promise.race([posterFor(article), new Promise<undefined>((resolve) => setTimeout(resolve, budgetMs))]);
  if (poster) return poster;
  return poster === undefined ? null : coverImage(article);
}

export function storyUrl(slug: string): string {
  return `${window.location.origin}/a/${slug}`;
}

/**
 * The link every share channel sends: the story's short link (`/s/<code>`, app/s/[code]/route.ts redirects it to the
 * story) when it has a code, otherwise its full `/a/<slug>` URL. A story the Editor Desk hid always gets its full URL:
 * the short link only resolves public stories, while `/a/<slug>` still opens for its author and admins.
 */
export function shareUrl(story: Pick<ArticleCard, "slug" | "shortCode" | "hidden">): string {
  return story.shortCode && !story.hidden ? `${window.location.origin}/s/${story.shortCode}` : storyUrl(story.slug);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers/contexts without the async clipboard API.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/** In the app, these open the app itself with the cover attached (WhatsApp first, then WhatsApp Business). */
const APP_PACKAGES: Partial<Record<ShareChannel, readonly string[]>> = {
  whatsapp: ["com.whatsapp", "com.whatsapp.w4b"],
  telegram: ["org.telegram.messenger", "org.telegram.messenger.web"],
  x: ["com.twitter.android"],
  facebook: ["com.facebook.katana"],
  instagram: ["com.instagram.android"],
  linkedin: ["com.linkedin.android"],
};

function intentUrl(channel: Exclude<ShareChannel, "native" | "copy" | "dm">, url: string, title: string): string {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  switch (channel) {
    case "whatsapp":
      return `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`;
    case "x":
      return `https://x.com/intent/post?text=${t}&url=${u}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    // Instagram has no web share link (owner 2026-10-22): the link is copied first, then Instagram opens to paste it.
    case "instagram":
      return "https://www.instagram.com/";
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
    case "telegram":
      return `https://t.me/share/url?url=${u}&text=${t}`;
    case "email":
      return `mailto:?subject=${t}&body=${encodeURIComponent(`${title}\n\n${url}`)}`;
  }
}

/**
 * Every way to share a story — the Share button and Home's ⋮ menu use it: record a share, copy the link, the phone's
 * share sheet, the other apps, and (signed in) the Send sheet (`sheet`, controlled by `sheetOpen`).
 */
export function useStoryShare(article: ShareSource) {
  const queryClient = useQueryClient();
  const autoplay = useReelAutoplayController();
  const native = useNativeShare();
  const canMessage = useCanMessage();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Reel feeds: hold auto-scroll while the sheet is open.
  useEffect(() => {
    if (!sheetOpen) return;
    autoplay?.setPaused("share", true);
    return () => autoplay?.setPaused("share", false);
  }, [sheetOpen, autoplay]);
  // The poster starts drawing as the sheet opens, ready for a share from it (cached: cheap to ask again).
  useEffect(() => {
    if (sheetOpen) void posterFor(article);
  }, [sheetOpen, article]);

  const record = (channel: Exclude<ShareChannel, "dm">) => {
    const current = queryClient.getQueryData<StatCounts>(statsKey(article.id));
    if (current) setStats(queryClient, article.id, { shareCount: current.shareCount + 1 });
    api
      .share(article.id, channel)
      .then(({ shareCount }) => setStats(queryClient, article.id, { shareCount }))
      .catch(() => {
        // Counting a share is best effort; the link itself was shared.
      });
  };

  const copyLink = async () => {
    const ok = await copyText(shareUrl(article));
    if (!ok) {
      toast.error("Couldn't copy the link", { description: "Copy it from the address bar instead." });
      return;
    }
    toast.success("Link copied", { description: "Paste it anywhere to share the story.", id: "share-copied" });
    record("copy");
  };

  const shareNative = async () => {
    autoplay?.setPaused("share", true);
    const url = shareUrl(article);
    const data = { title: article.title, text: article.excerpt, url };
    const plugin = nativeSharePlugin();
    // The poster goes along as an image (owner 2026-10-05; the cover before); the link rides in the text, since many
    // apps drop the separate URL when a picture is attached.
    const withImage = { title: article.title, text: `${article.title}\n\n${url}` };
    const fileName = `webnews-${(article.slug ?? article.id).slice(0, 60)}.jpg`;
    try {
      // The WebNEWS app: its native share sheet (the Android WebView has no Web Share API).
      if (plugin) {
        const image = await shareImage(article, 10_000);
        const uri = image ? await shareFileUri(image, fileName).catch(() => null) : null;
        await plugin.share(uri ? { ...withImage, files: [uri], dialogTitle: "Share story" } : { ...data, dialogTitle: "Share story" });
      } else {
        const image = await shareImage(article, 3_000);
        const file = image ? new File([image], fileName, { type: "image/jpeg" }) : null;
        if (file && navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ ...withImage, files: [file] });
          } catch (error) {
            // Took too long for the browser (or it refused the file): the link alone.
            if (error instanceof DOMException && error.name === "AbortError") throw error;
            await navigator.share(data);
          }
        } else {
          await navigator.share(data);
        }
      }
      record("native");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (plugin && /cancel/i.test(error instanceof Error ? error.message : String(error))) return;
      await copyLink();
    } finally {
      autoplay?.setPaused("share", false);
    }
  };

  const openIntent = (channel: Exclude<ShareChannel, "native" | "copy" | "dm">) => {
    const openLink = () => {
      const url = intentUrl(channel, shareUrl(article), article.title);
      if (channel === "email") window.location.assign(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    };
    record(channel);
    // Instagram on the web can't take a link: copy it, say so, and open Instagram to paste it into a story or post.
    if (channel === "instagram" && !hasShareToApp()) {
      void navigator.clipboard?.writeText(shareUrl(article)).catch(() => {});
      toast.success("Link copied", { id: "share-instagram", description: "Paste it into your Instagram story or post." });
      openLink();
      return;
    }
    const packages = APP_PACKAGES[channel];
    // The WebNEWS app (owner 2026-10-02): straight into WhatsApp / Telegram / … with the poster attached (owner
    // 2026-10-05; the cover before) and "headline + link" as its caption — a web link can't carry a picture. Not
    // installed: the web link as before.
    if (packages && hasShareToApp()) {
      void (async () => {
        const image = await shareImage(article, 10_000);
        const file = image ? await shareFileUri(image, `webnews-${(article.slug ?? article.id).slice(0, 60)}.jpg`).catch(() => null) : null;
        if (!(await shareToApp(packages, `${article.title}\n\n${shareUrl(article)}`, file))) openLink();
      })();
      return;
    }
    openLink();
  };

  // The apps' own badges (share-glyphs.tsx), the size of the sheet's tiles.
  const badge = 24;
  const later = (run: () => void) => () => {
    setSheetOpen(false);
    run();
  };
  const sheet = canMessage ? (
    <SendSheet
      open={sheetOpen}
      onOpenChange={setSheetOpen}
      item={sendItem(article)}
      external={
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 no-scrollbar">
          <ExternalShareButton label="Copy link" icon={<CopyLinkIcon size={badge} />} onClick={() => void copyLink()} />
          {native && <ExternalShareButton label="Share via…" icon={<ShareViaIcon size={badge} />} onClick={later(() => void shareNative())} />}
          <ExternalShareButton label="WhatsApp" icon={<WhatsAppIcon size={badge} />} onClick={later(() => openIntent("whatsapp"))} />
          <ExternalShareButton label="X" icon={<XIcon size={badge} />} onClick={later(() => openIntent("x"))} />
          <ExternalShareButton label="Facebook" icon={<FacebookIcon size={badge} />} onClick={later(() => openIntent("facebook"))} />
          <ExternalShareButton label="Instagram" icon={<InstagramIcon size={badge} />} onClick={later(() => openIntent("instagram"))} />
          <ExternalShareButton label="Telegram" icon={<TelegramIcon size={badge} />} onClick={later(() => openIntent("telegram"))} />
          <ExternalShareButton label="LinkedIn" icon={<LinkedInIcon size={badge} />} onClick={later(() => openIntent("linkedin"))} />
          <ExternalShareButton label="Email" icon={<EmailIcon size={badge} />} onClick={later(() => openIntent("email"))} />
        </div>
      }
    />
  ) : null;

  /** Share from a menu: the Send sheet when signed in, else the phone's share sheet, else copy the link. */
  const share = () => {
    if (canMessage) setSheetOpen(true);
    else if (native) void shareNative();
    else void copyLink();
  };

  return { native, canMessage, sheetOpen, setSheetOpen, copyLink, shareNative, openIntent, sheet, share };
}

/**
 * Share control. Signed in (owner 2026-09-30, like Instagram): the "Send to" sheet — send the story to people and chats
 * in WebNEWS, with Copy link, the native sheet and the other apps underneath. Signed out: touch devices with the Web
 * Share API get the native sheet straight away; everywhere else a menu offers Copy link, WhatsApp, X, Facebook,
 * LinkedIn, Telegram and Email (plus the native sheet when available). Every channel sends `shareUrl` (the short link; a hidden story's full URL).
 * Every completed share is recorded (`api.share`) and the count updates optimistically, then from the server.
 * In a reel feed, auto-scroll holds while the native sheet is open (it isn't in the DOM, so nothing else pauses it).
 */
export function ShareButton({ article, count, size = "sm", inert = false, className }: ShareButtonProps) {
  const coarse = useMediaQuery("(pointer: coarse)");
  const { native, canMessage, sheetOpen, setSheetOpen, copyLink, shareNative, openIntent, sheet } = useStoryShare(article);
  const md = size === "md";

  const label = `Share · ${formatNumber(count)} ${count === 1 ? "share" : "shares"}`;
  const triggerClass = cn(
    "relative inline-flex items-center rounded-full font-bold tabular-nums text-muted transition-colors duration-150",
    "after:absolute after:-inset-1.5 after:content-[''] hover:bg-tint hover:text-brand aria-expanded:bg-tint aria-expanded:text-brand",
    "active:scale-95 motion-reduce:active:scale-100",
    md ? "h-10 gap-2 px-3.5 text-sm [&_svg]:size-5" : "h-9 gap-1.5 px-2.5 text-[0.8125rem] [&_svg]:size-4.5",
    className,
  );
  const face: ReactNode = (
    <>
      <Share2 aria-hidden strokeWidth={2.25} />
      <NumberTicker value={count} />
    </>
  );

  if (canMessage && !inert) {
    return (
      <>
        <button type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={sheetOpen} className={triggerClass} onClick={() => setSheetOpen(true)}>
          {face}
        </button>
        {sheet}
      </>
    );
  }

  if (inert || (native && coarse)) {
    return (
      <button
        type="button"
        aria-label={label}
        className={triggerClass}
        // The poster starts drawing at the touch, so it's ready (or nearly) when the share sheet opens.
        onPointerDown={inert ? undefined : () => void posterFor(article)}
        onClick={inert ? undefined : () => void shareNative()}
      >
        {face}
      </button>
    );
  }

  // The apps' own badges in the menu (share-glyphs.tsx), a little bigger than the menu's line icons.
  const menuBadge = 22;
  const items: DropdownItem[] = [
    ...(native
      ? ([{ label: "Share via…", icon: <ShareViaIcon size={menuBadge} />, onSelect: () => void shareNative() }] satisfies DropdownItem[])
      : []),
    { label: "Copy link", icon: <CopyLinkIcon size={menuBadge} />, onSelect: () => void copyLink() },
    { type: "separator" },
    { label: "WhatsApp", icon: <WhatsAppIcon size={menuBadge} />, onSelect: () => openIntent("whatsapp") },
    { label: "X", icon: <XIcon size={menuBadge} />, onSelect: () => openIntent("x") },
    { label: "Facebook", icon: <FacebookIcon size={menuBadge} />, onSelect: () => openIntent("facebook") },
    { label: "Instagram", icon: <InstagramIcon size={menuBadge} />, onSelect: () => openIntent("instagram") },
    { label: "LinkedIn", icon: <LinkedInIcon size={menuBadge} />, onSelect: () => openIntent("linkedin") },
    { label: "Telegram", icon: <TelegramIcon size={menuBadge} />, onSelect: () => openIntent("telegram") },
    { label: "Email", icon: <EmailIcon size={menuBadge} />, onSelect: () => openIntent("email") },
  ];

  return (
    <DropdownMenu
      label={label}
      trigger={face}
      triggerClassName={triggerClass}
      items={items}
      align="end"
      menuClassName="bottom-full top-auto mb-2 mt-0 min-w-52 origin-bottom-right"
      header={
        <div className="min-w-0">
          <p className="kicker text-brand">Share story</p>
          <p className="mt-1 line-clamp-2 max-w-56 text-[0.8125rem] font-semibold leading-snug text-muted">{article.title}</p>
        </div>
      }
    />
  );
}
