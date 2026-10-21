"use client";

import { ArrowRight, Camera, Check, ImagePlus, Images, Play, X } from "lucide-react";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Modal } from "@/components/ui/modal";
import type { VideoRef } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import type { ComposerCover, ComposerMedia } from "./composer-model";
import { CameraCapture } from "./camera-capture";
import { CoverPicker, type CoverMediaValue, type CoverPickerHandle } from "./cover-picker";

type Media = { cover: ComposerCover | null; video: VideoRef | null };

export type MediaUploadProps = {
  /** The reel's cover (9:16) — or its video and poster frame. */
  cover: Media;
  /** The article's own image (any shape) — or its video. */
  article: Media;
  onCoverChange: (next: CoverMediaValue) => void;
  onArticleChange: (next: CoverMediaValue) => void;
  onCoverUploading: (kind: ComposerMedia | null) => void;
  onArticleUploading: (kind: ComposerMedia | null) => void;
  coverUploading: boolean;
  articleUploading: boolean;
  coverError?: string;
  articleError?: string;
  /** The popup is open. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCropOpen?: () => void;
  /** Published (the success moment): page-level drop / paste stop. */
  done?: boolean;
};

type Slot = "cover" | "article";

/** Where the page focuses / scrolls for a missing image (composer FIELD_DOM_ID). */
export const MEDIA_FIELD_ID = "composer-media";

/**
 * Step 1 of the composer (owner 2026-10-14): two separate upload sections side by side (stacked on phones) — the Cover
 * (9:16 poster in the feed) and the Article image (top of the story). Each takes drag & drop and paste; tapping it
 * asks "Camera" (the live camera) or "Browse gallery" (an image or a video), and the file goes only to that section.
 * Choosing two photos at once in the cover's gallery still fills both.
 */
export function MediaUpload(props: MediaUploadProps) {
  const { cover, article, coverError, articleError, onCoverChange, onArticleChange, onCoverUploading, onArticleUploading, onCropOpen, done = false } = props;
  const coverPicker = useRef<CoverPickerHandle>(null);
  const articlePicker = useRef<CoverPickerHandle>(null);
  const [asking, setAsking] = useState<Slot | null>(null);
  const [camera, setCamera] = useState<Slot | null>(null);
  // Phones and the app (owner 2026-10-15): "Camera" opens the phone's own camera app, not the in-page camera popup.
  const nativeCamera = useRef<HTMLInputElement>(null);
  const cameraSlot = useRef<Slot | null>(null);
  const handle = (slot: Slot) => (slot === "cover" ? coverPicker : articlePicker);
  const [copying, setCopying] = useState<Slot | null>(null);
  /**
   * "Use the same image" (owner 2026-10-16): one photo for both. It goes through the empty section's own crop and upload
   * (so the cover still gets its 9:16 framing); a video, or a photo the browser can't fetch, is reused as it is.
   */
  const reuseImage = async (to: Slot) => {
    const from = to === "cover" ? article : cover;
    const change = to === "cover" ? onCoverChange : onArticleChange;
    if (!from.cover) return;
    if (from.video) return change({ cover: from.cover, video: from.video });
    setCopying(to);
    try {
      const response = await fetch(from.cover.url);
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const type = blob.type || "image/jpeg";
      handle(to).current?.open(new File([blob], `same-image.${type.split("/")[1] ?? "jpg"}`, { type }));
    } catch {
      change({ cover: from.cover, video: null });
    } finally {
      setCopying(null);
    }
  };
  /**
   * One round button between the two boxes (owner 2026-10-16), once one image is in and the other box is empty: it puts
   * the same image there too, through that box's own crop to fit its size (cover → article, or the other way).
   */
  const sameTo: Slot | null =
    done || props.coverUploading || props.articleUploading
      ? null
      : cover.cover && !article.cover
        ? "article"
        : article.cover && !cover.cover
          ? "cover"
          : null;
  const sameLabel = sameTo === "article" ? "Use the cover image for the article too" : "Use the article image as the cover too";
  return (
    <div id={MEDIA_FIELD_ID} tabIndex={-1} className="relative grid gap-4 outline-none sm:grid-cols-2 sm:gap-5">
      <SlotCard
        title="Cover image"
        size="9:16 · 1080 × 1920 px"
        note="The poster readers see in the feed and reels."
        done={Boolean(cover.cover)}
        invalid={Boolean(coverError)}
      >
        <CoverPicker
          compact
          handleRef={coverPicker}
          cover={cover.cover}
          video={cover.video}
          active={!done && !cover.cover}
          error={coverError}
          errorId="composer-media-section-error"
          onUploadingChange={onCoverUploading}
          onCropOpen={onCropOpen}
          onChoose={() => setAsking("cover")}
          onExtraFile={(file) => {
            if (!article.cover) articlePicker.current?.open(file);
          }}
          onChange={onCoverChange}
        />
      </SlotCard>
      {sameTo && (
        // Phones (stacked, owner 2026-10-19): a row of its own between the two boxes, so it never sits on the cover
        // image. From 640px (side by side): floated on the centre of the gap between them.
        <div className="flex justify-center max-sm:-my-2 sm:absolute sm:left-1/2 sm:top-1/2 sm:z-10 sm:-translate-x-1/2 sm:-translate-y-1/2">
          <button
            type="button"
            onClick={() => void reuseImage(sameTo)}
            disabled={copying !== null}
            aria-label={sameLabel}
            title={sameLabel}
            className="inline-flex size-12 items-center justify-center rounded-full bg-brand text-white shadow-[0_8px_20px_-8px_rgb(227_6_19/0.7)] ring-4 ring-bg transition-transform hover:scale-105 disabled:opacity-70"
          >
            {copying ? (
              <span aria-hidden className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              // Points from the filled box to the empty one: sideways from 640px, up / down on phones (stacked).
              <ArrowRight
                aria-hidden
                className={cn("size-5.5 transition-transform", sameTo === "article" ? "max-sm:rotate-90" : "rotate-180 max-sm:rotate-[270deg]")}
                strokeWidth={2.5}
              />
            )}
          </button>
        </div>
      )}
      <SlotCard
        title="Article image"
        size="Any shape · 16:9 works best"
        note="Shown at the top of the full story."
        done={Boolean(article.cover)}
        invalid={Boolean(articleError)}
      >
        <CoverPicker
          compact
          slot="article"
          handleRef={articlePicker}
          cover={article.cover}
          video={article.video}
          active={!done && Boolean(cover.cover) && !article.cover}
          error={articleError}
          errorId="composer-media-section-error"
          onUploadingChange={onArticleUploading}
          onCropOpen={onCropOpen}
          onChoose={() => setAsking("article")}
          onChange={onArticleChange}
        />
      </SlotCard>

      <SourceMenu
        slot={asking}
        onClose={() => setAsking(null)}
        onCamera={(slot) => {
          setAsking(null);
          if (window.matchMedia("(pointer: coarse)").matches && nativeCamera.current) {
            // Inside the tap, so the phone lets the camera open.
            cameraSlot.current = slot;
            nativeCamera.current.click();
          } else {
            setCamera(slot);
          }
        }}
        onGallery={(slot) => {
          setAsking(null);
          // Inside the tap: the file chooser may open.
          handle(slot).current?.pick();
        }}
      />
      <input
        ref={nativeCamera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          const slot = cameraSlot.current;
          event.target.value = "";
          cameraSlot.current = null;
          // The photo goes through that section's own crop + upload, like a chosen file.
          if (file && slot) handle(slot).current?.open(file);
        }}
      />
      <CameraCapture
        open={camera !== null}
        onOpenChange={(next) => !next && setCamera(null)}
        title={camera === "article" ? "Take the article photo" : "Take the cover photo"}
        // The photo goes through that section's own crop + upload, like a chosen file.
        onCapture={(file) => camera && handle(camera).current?.open(file)}
      />
    </div>
  );
}

/** One upload section: title, size and use, then its drop zone / preview. */
function SlotCard({ title, size, note, done, invalid, children }: { title: string; size: string; note: string; done: boolean; invalid: boolean; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-2xl border bg-surface p-4 shadow-[0_10px_30px_-24px_rgb(22_24_29/0.35)] transition-colors sm:p-5",
        invalid ? "border-brand" : done ? "border-tint-border" : "border-border",
      )}
    >
      {/* Phones: title, note, then the size chip on its own line, so nothing wraps awkwardly. */}
      <header className="flex flex-col items-start gap-2 sm:flex-row sm:justify-between sm:gap-3">
        <div className="min-w-0 sm:flex-1">
          <h3 className="flex items-center gap-2 font-wide text-base font-extrabold text-ink">
            {title}
            {done && (
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-success text-white">
                <Check aria-hidden className="size-3.5" strokeWidth={3} />
                <span className="sr-only">added</span>
              </span>
            )}
          </h3>
          <p className="mt-0.5 text-xs text-muted">{note}</p>
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-tint px-2.5 py-1 text-[0.6875rem] font-bold text-brand">{size}</span>
      </header>
      {children}
    </section>
  );
}

/** "Add your image": Camera or Browse gallery for the tapped section (owner 2026-10-14 reference: two centred cards, ✕ on top). */
function SourceMenu({
  slot,
  onClose,
  onCamera,
  onGallery,
}: {
  slot: Slot | null;
  onClose: () => void;
  onCamera: (slot: Slot) => void;
  onGallery: (slot: Slot) => void;
}) {
  const card =
    "group flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-6 text-center transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-card sm:py-7";
  return (
    <Modal
      open={slot !== null}
      onOpenChange={(next) => !next && onClose()}
      size="md"
      hideHeader
      title={slot === "article" ? "Add your article image" : "Add your cover image"}
      description="Choose how you want to upload"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <X aria-hidden className="size-5" />
      </button>
      <div className="pt-2 text-center">
        <p className="font-wide text-xl font-extrabold text-ink">Add your image</p>
        <p className="mt-1 text-sm text-muted">Choose how you want to upload</p>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4">
        <button type="button" className={card} onClick={() => slot && onCamera(slot)}>
          <span className="flex size-14 items-center justify-center rounded-full bg-brand text-brand-contrast shadow-[0_8px_20px_-10px_rgb(227_6_19/0.7)] sm:size-16">
            <Camera aria-hidden className="size-6 sm:size-7" />
          </span>
          <span className="mt-2 font-bold text-ink sm:text-lg">Camera</span>
          <span className="text-xs text-muted sm:text-sm">Take a new photo</span>
        </button>
        <button type="button" className={card} onClick={() => slot && onGallery(slot)}>
          <span className="flex size-14 items-center justify-center rounded-full bg-tint text-brand sm:size-16">
            <Images aria-hidden className="size-6 sm:size-7" />
          </span>
          <span className="mt-2 font-bold text-ink sm:text-lg">Browse Gallery</span>
          <span className="text-xs text-muted sm:text-sm">Choose an existing image</span>
        </button>
      </div>
    </Modal>
  );
}


/** The popup: both pickers side by side (stacked on phones), each exactly as before. */
/**
 * The live preview of the article image (owner 2026-10-07: "preview of both cover image and article image"): the top
 * of the story as readers will open it — the image (or the video's frame) in its own shape, then the headline.
 */
export function ArticleMediaPreview({
  media,
  title,
  compact = false,
  className,
}: {
  media: Media;
  title: string;
  /**
   * The desktop side column (owner 2026-10-08: the whole column must fit the screen, no scrolling): one short row —
   * a small 16:9 thumbnail beside the headline.
   */
  compact?: boolean;
  className?: string;
}) {
  const image = media.cover;
  const ratio = image?.width && image.height ? image.width / image.height : 16 / 9;
  const shape: CSSProperties = compact ? { aspectRatio: "16 / 9" } : { aspectRatio: String(ratio), maxHeight: "16rem" };
  return (
    <section aria-label="Article preview" className={cn("flex flex-col", compact ? "gap-2" : "gap-3", className)}>
      <p className="kicker text-ink">Top of your story</p>
      <div
        className={cn(
          "overflow-hidden rounded-2xl border border-border bg-surface shadow-card",
          compact && "flex items-center gap-3 rounded-xl p-2",
        )}
      >
        <div
          className={cn(
            "relative flex items-center justify-center overflow-hidden bg-surface-2",
            compact ? "w-28 shrink-0 rounded-lg" : "w-full",
          )}
          style={shape}
        >
          {image ? (
            <img src={image.url} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1.5 text-xs font-semibold text-muted">
              <ImagePlus aria-hidden className="size-5" />
              {!compact && "Article image"}
            </span>
          )}
          {media.video && (
            <span aria-hidden className="absolute inset-0 flex items-center justify-center bg-ink/20 text-white">
              <Play className="size-6 fill-current" />
            </span>
          )}
        </div>
        <p
          className={cn(
            "font-wide font-extrabold leading-snug",
            compact ? "line-clamp-3 min-w-0 pr-1 text-[0.8125rem]" : "line-clamp-3 px-4 py-3 text-[0.9375rem]",
            title.trim() ? "text-ink" : "text-muted",
          )}
        >
          {title.trim() || "Your headline"}
        </p>
      </div>
    </section>
  );
}
