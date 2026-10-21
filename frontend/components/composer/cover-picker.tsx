"use client";

import { ImagePlay, RefreshCw, Scissors, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type DragEvent, type ReactNode, type Ref } from "react";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { SpeedLinesSweep } from "@/components/brand/speed-lines-motion";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SpeedLinesLoader } from "@/components/ui/speed-lines-loader";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, isApiError, type UploadKind } from "@/lib/api";
import { LIMITS, type VideoRef } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { clipLength } from "@/lib/video-playback";
import type { ComposerCover, ComposerMedia } from "./composer-model";
import { ACCEPT_ATTR, assertDecodable, checkImageFile, dataTransferHasFiles, imageFromDataTransfer } from "./crop-image";
import { CropModal, type CropShape } from "./crop-modal";
import {
  VIDEO_ACCEPT,
  checkVideoFile,
  isTooLong,
  isVideoFile,
  mediaListFromDataTransfer,
  readVideoDuration,
  spokenLength,
} from "./video-file";

export type CoverMediaValue = { cover: ComposerCover | null; video: VideoRef | null };

export type CoverPickerProps = {
  /**
   * `cover` (default): the reel's 9:16 cover image or video. `article` (owner 2026-09-28): the full article's image
   * or video, any size or shape — images are cropped too (owner 2026-10-08), to their own shape or a chosen one.
   */
  slot?: CropShape;
  /** The slot's image — for a video, its poster frame. */
  cover: ComposerCover | null;
  /** The slot's clip (`cover` is then its poster frame). */
  video: VideoRef | null;
  onChange: (next: CoverMediaValue) => void;
  onUploadingChange: (uploading: ComposerMedia | null) => void;
  /** Page-level drop/paste listeners only run while this slot is on screen (its step showing: poster or article). */
  active: boolean;
  error?: string;
  /** id of the error message (aria-describedby). */
  errorId?: string;
  /** The crop dialog opened (e.g. clear stale toasts that would cover the bottom sheet's buttons). */
  onCropOpen?: () => void;
  /**
   * The cover slot (owner 2026-10-07): while it's empty, choosing gets two photos at once — the first is this slot's,
   * the second is handed here (the composer passes it to the article slot). Replace still picks one.
   */
  onExtraFile?: (file: File) => void;
  /** The article slot's handle: the composer opens the cover's second photo here, as if chosen in this slot. */
  handleRef?: Ref<CoverPickerHandle>;
  /** In the two-image popup (owner 2026-10-07): a shorter drop zone that fits a half-width column, nothing cut off. */
  compact?: boolean;
  /**
   * The cover slot: the crop was confirmed (called inside the tap, so a file chooser may open from it). The composer
   * then asks for the article's image when only one photo came back (phones' pickers often return one per tap).
   */
  onCropDone?: () => void;
  /**
   * Tapping the slot (or Replace) asks first (owner 2026-10-14): the composer shows "Camera / Browse gallery" and calls
   * the handle's `pick` for the gallery. Unset: the file chooser opens at once.
   */
  onChoose?: () => void;
};

/** `open`: use this file in the slot; `pick`: open the slot's file chooser (only from inside a tap). */
export type CoverPickerHandle = { open: (file: File) => void; pick: () => void };

type Upload = { kind: ComposerMedia; preview: string; progress: number; controller: AbortController };

/** What differs between the two slots: shape, wording, ids. */
type SlotConfig = {
  imageKind: ComposerMedia;
  videoKind: ComposerMedia;
  /** The preview / upload frame: the slot's shape (the article preview then takes the media's own shape). */
  frame: string;
  /** The server's upload kind for the slot's image. */
  uploadKind: UploadKind;
  imageTag: string;
  imageNoun: string;
  videoNoun: string;
  inputLabel: string;
  testId: string;
  zone: DropZoneCopy;
};

const SLOTS: Record<CropShape, SlotConfig> = {
  cover: {
    imageKind: "cover",
    videoKind: "video",
    frame: "mx-auto aspect-9/16 w-full max-w-80",
    uploadKind: "cover",
    imageTag: "Cover · 9:16",
    imageNoun: "cover",
    videoNoun: "video",
    inputLabel: "Choose a cover image or video",
    testId: "cover",
    zone: {
      id: "composer-cover",
      hintId: "composer-cover-hint",
      heading: "Add a cover image or video",
      imageHint: "Images: JPG · PNG · WebP · GIF · AVIF — cropped to 9:16",
    },
  },
  article: {
    imageKind: "articleImage",
    videoKind: "articleVideo",
    frame: "aspect-video w-full",
    uploadKind: "article",
    imageTag: "Article image",
    imageNoun: "article image",
    videoNoun: "article video",
    inputLabel: "Choose an article image or video",
    testId: "article-media",
    zone: {
      id: "composer-article-media",
      hintId: "composer-article-media-hint",
      heading: "Add an article image or video",
      imageHint: "Images: JPG · PNG · WebP · GIF · AVIF — any size or shape",
      note: "Shown at the top of the full article",
    },
  },
};

/** A clip longer than 30 s, waiting for "keep the first 30 seconds?" (`durationMs` null = only the server knew). */
type TrimAsk = { file: File; durationMs: number | null; open: boolean };

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA";
}

/**
 * The story's media: a cover image OR a video (owner rule 2026-09-25). Drop zone (click / drag & drop / paste
 * anywhere). Images → 9:16 crop → upload with progress → preview with Replace / Remove. Videos ≤ 30 s upload
 * straight away; a longer one asks first whether to keep only its first 30 seconds. The server re-encodes the clip
 * and returns its poster frame, which becomes the cover.
 *
 * `slot="article"`: the same for the full article's media; its crop keeps the photo's own shape by default, or takes
 * 16:9 · 4:3 · 1:1 · 4:5.
 */
export function CoverPicker({
  slot = "cover",
  cover,
  video,
  onChange,
  onUploadingChange,
  active,
  error,
  errorId,
  onCropOpen,
  onExtraFile,
  handleRef,
  onCropDone,
  compact = false,
  onChoose,
}: CoverPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [crop, setCrop] = useState<{ src: string; name: string; open: boolean } | null>(null);
  const [trimAsk, setTrimAsk] = useState<TrimAsk | null>(null);
  const [upload, setUpload] = useState<Upload | null>(null);
  /** Local object URL of the uploaded crop, shown instead of the network copy (no flash). */
  const [localPreview, setLocalPreview] = useState<{ key: string; url: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sweep, setSweep] = useState(0);
  const dragTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const config = SLOTS[slot];
  const isArticle = slot === "article";

  const busy = Boolean(crop?.open || trimAsk?.open || upload);

  // Revoke object URLs that are no longer displayed.
  useEffect(() => {
    if (!localPreview) return;
    return () => URL.revokeObjectURL(localPreview.url);
  }, [localPreview]);

  useEffect(() => {
    return () => {
      if (dragTimer.current) clearTimeout(dragTimer.current);
    };
  }, []);

  /** Opens a chosen file; true when a dialog came up for it (the crop, or "keep the first 30 seconds?"). */
  const openFile = async (file: File): Promise<boolean> => {
    if (busy) return false;
    if (isVideoFile(file)) return openVideo(file);
    const problem = checkImageFile(file);
    if (problem) {
      toast.error(problem.title, { description: problem.description, id: `${slot}-file` });
      return false;
    }
    const src = URL.createObjectURL(file);
    try {
      await assertDecodable(src);
    } catch {
      URL.revokeObjectURL(src);
      toast.error("We couldn't read that image", { description: "Try a different file.", id: `${slot}-file` });
      return false;
    }
    setCrop({ src, name: file.name, open: true });
    onCropOpen?.();
    return true;
  };

  const openVideo = async (file: File): Promise<boolean> => {
    const problem = checkVideoFile(file);
    if (problem) {
      toast.error(problem.title, { description: problem.description, id: `${slot}-file` });
      return false;
    }
    const durationMs = await readVideoDuration(file);
    if (durationMs !== null && isTooLong(durationMs)) {
      setTrimAsk({ file, durationMs, open: true });
      onCropOpen?.();
      return true;
    }
    void startVideoUpload(file, false);
    return false;
  };

  /**
   * The second of a two-photo pick waits here until this slot's dialog closes, then goes to `onExtraFile` — the
   * article's crop (owner 2026-10-08) opens after the cover's, never on top of it.
   */
  const pendingExtra = useRef<File | null>(null);
  const handOnExtra = () => {
    const extra = pendingExtra.current;
    pendingExtra.current = null;
    if (extra) onExtraFile?.(extra);
  };
  const openPicked = async (file: File | undefined, extra: File | undefined) => {
    if (extra && onExtraFile) pendingExtra.current = extra;
    const asked = file ? await openFile(file) : false;
    if (!asked) handOnExtra();
  };

  // Keep the image mounted while the dialog animates out; it is revoked when the next one opens or on unmount.
  const closeCrop = () => {
    setCrop((current) => (current ? { ...current, open: false } : current));
    handOnExtra();
  };
  const closeTrim = () => {
    setTrimAsk((current) => (current ? { ...current, open: false } : current));
    handOnExtra();
  };

  const cropSrc = crop?.src;
  useEffect(() => {
    if (!cropSrc) return;
    return () => URL.revokeObjectURL(cropSrc);
  }, [cropSrc]);

  const begin = (kind: ComposerMedia, preview: string): AbortController => {
    const controller = new AbortController();
    setUpload({ kind, preview, progress: 0, controller });
    onUploadingChange(kind);
    return controller;
  };
  const onProgress = (progress: number) => setUpload((current) => (current ? { ...current, progress } : current));
  const finish = () => {
    setUpload(null);
    onUploadingChange(null);
  };

  const startUpload = async (blob: Blob) => {
    closeCrop();
    const preview = URL.createObjectURL(blob);
    const controller = begin(config.imageKind, preview);
    try {
      // Article images are stored like covers (same processing and folder), minus the covers' shape limit.
      const file = new File([blob], `${slot}.jpg`, { type: blob.type || "image/jpeg" });
      const image = await api.upload(file, config.uploadKind, onProgress, controller.signal);
      setLocalPreview({ key: image.key, url: preview });
      onChange({
        cover: { url: image.url, key: image.key, width: image.width, height: image.height, blurDataUrl: image.blurDataUrl },
        video: null,
      });
      setSweep((n) => n + 1);
    } catch (e) {
      URL.revokeObjectURL(preview);
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        toast.error(`Couldn't upload the ${config.imageNoun}`, { description: errorMessage(e), id: `${slot}-upload` });
      }
    } finally {
      finish();
    }
  };

  const startVideoUpload = async (file: File, trim: boolean) => {
    closeTrim();
    const preview = URL.createObjectURL(file);
    const controller = begin(config.videoKind, preview);
    try {
      const result = await api.uploadVideo(file, { trim }, onProgress, controller.signal);
      const { poster } = result;
      onChange({
        cover: { url: poster.url, key: poster.key, width: poster.width, height: poster.height, blurDataUrl: poster.blurDataUrl },
        video: result.video,
      });
      setSweep((n) => n + 1);
      if (result.trimmed) {
        toast(`We kept the first ${LIMITS.videoMaxSeconds} seconds`, {
          id: `${slot}-trimmed`,
          description: `Your ${spokenLength(result.originalDurationMs)} video was cut to ${LIMITS.videoMaxSeconds} seconds.`,
        });
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      // This browser couldn't read the length, the server could: ask now.
      if (!trim && isApiError(e) && e.code === "video_too_long") {
        setTrimAsk({ file, durationMs: null, open: true });
        return;
      }
      toast.error(`Couldn't upload the ${config.videoNoun}`, { description: errorMessage(e), id: `${slot}-upload` });
    } finally {
      URL.revokeObjectURL(preview);
      finish();
    }
  };

  // The second of the cover's two-photo pick lands here (the article slot), as if chosen here.
  useImperativeHandle(handleRef, () => ({ open: (file: File) => void openFile(file), pick: () => inputRef.current?.click() }));

  // Page-level drag & drop and paste (only while this slot is on screen).
  useEffect(() => {
    if (!active) return;
    const endDrag = () => {
      if (dragTimer.current) clearTimeout(dragTimer.current);
      dragTimer.current = setTimeout(() => setDragging(false), 120);
    };
    const onDragOver = (event: globalThis.DragEvent) => {
      if (!dataTransferHasFiles(event.dataTransfer)) return;
      event.preventDefault(); // never let the browser navigate to a dropped file
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      setDragging(true);
      endDrag();
    };
    const onDrop = (event: globalThis.DragEvent) => {
      if (!dataTransferHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      setDragging(false);
      const [file, extra] = mediaListFromDataTransfer(event.dataTransfer);
      void openPicked(file, cover ? undefined : extra);
    };
    const onPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || document.querySelector("[role=dialog]")) return;
      const file = imageFromDataTransfer(event.clipboardData);
      if (!file) return;
      // Pasting text into a field keeps working; an image-only clipboard becomes the cover.
      if (isEditable(event.target) && event.clipboardData?.types.includes("text/plain")) return;
      event.preventDefault();
      void openFile(file);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
  });

  const pick = () => (onChoose ? onChoose() : inputRef.current?.click());
  const remove = () => onChange({ cover: null, video: null });
  const displayUrl = cover ? (localPreview?.key === cover.key ? localPreview.url : cover.url) : null;
  // The article preview takes the media's own shape. A portrait one is centred and no bigger than the cover's preview
  // beside it (owner 2026-10-16: "same image, why does the article one look big") — 20rem wide, 70% of the screen tall.
  const ratio = isArticle ? ownRatio(video ?? cover) : null;
  const frame = ratio ? "w-full" : config.frame;
  const shape: CSSProperties | undefined = ratio
    ? { aspectRatio: String(ratio), ...(ratio < 1 ? { maxWidth: `min(20rem, calc(70dvh * ${ratio}))`, marginInline: "auto" } : {}) }
    : undefined;

  const dropOverlay = (
    <AnimatePresence>
      {dragging && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 flex items-center justify-center bg-white/85 text-lg font-extrabold text-brand font-wide backdrop-blur-[2px]"
        >
          Drop to replace
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept={`${ACCEPT_ATTR},${VIDEO_ACCEPT}`}
        className="sr-only"
        tabIndex={-1}
        aria-label={config.inputLabel}
        data-testid={`${config.testId}-input`}
        // Two photos at once while the cover is empty (owner 2026-10-07): the first is the cover, the second the article's.
        multiple={Boolean(onExtraFile) && !cover}
        onChange={(event) => {
          const [file, extra] = Array.from(event.target.files ?? []);
          event.target.value = "";
          void openPicked(file, extra);
        }}
      />

      {/* Grid stack: the outgoing and incoming states cross-fade in the same cell. */}
      <div className="grid *:col-start-1 *:row-start-1">
        <AnimatePresence initial={false}>
          {upload ? (
            <UploadingFrame key="uploading" upload={upload} frame={config.frame} noun={upload.kind === config.videoKind ? config.videoNoun : config.imageNoun} />
          ) : cover && video ? (
            <motion.figure
              key={`video-${video.key}`}
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
              // The clip as readers get it: the reel's 9:16 frame, filled; an article clip in its own shape.
              className={cn("group relative overflow-hidden rounded-2xl bg-ink", frame)}
              style={shape}
              data-testid={`${config.testId}-video`}
            >
              <PreviewVideo video={video} poster={cover.url} />
              {sweep > 0 && <SpeedLinesSweep key={sweep} duration={0.8} className="opacity-75" />}
              <span className="kicker absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-ink shadow-card">
                {isArticle ? "Article video" : "Video"} · {clipLength(video.durationMs)}
              </span>
              <div className="absolute bottom-3 right-3 flex gap-2">
                <CoverAction onClick={pick} icon={<RefreshCw aria-hidden />} label="Replace" />
                <CoverAction onClick={remove} icon={<Trash2 aria-hidden />} label="Remove" />
              </div>
              {dropOverlay}
            </motion.figure>
          ) : cover && displayUrl ? (
            <motion.figure
              key={`cover-${cover.key}`}
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
              className={cn("group relative overflow-hidden rounded-2xl bg-surface-2", frame)}
              style={{
                ...shape,
                ...(cover.blurDataUrl ? { backgroundImage: `url(${cover.blurDataUrl})`, backgroundSize: "cover" } : {}),
              }}
            >
              <img
                src={displayUrl}
                alt={`${isArticle ? "Article" : "Cover"} image preview`}
                width={cover.width ?? (isArticle ? 1600 : 900)}
                height={cover.height ?? (isArticle ? 900 : 1600)}
                className="absolute inset-0 size-full object-cover"
                draggable={false}
              />
              {sweep > 0 && <SpeedLinesSweep key={sweep} duration={0.8} className="opacity-75" />}
              <span className="kicker absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-ink shadow-card">
                {config.imageTag}
              </span>
              <div className="absolute bottom-3 right-3 flex gap-2">
                <CoverAction onClick={pick} icon={<RefreshCw aria-hidden />} label="Replace" />
                <CoverAction onClick={remove} icon={<Trash2 aria-hidden />} label="Remove" />
              </div>
              {dropOverlay}
            </motion.figure>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <DropZone
                compact={compact}
                copy={config.zone}
                dragging={dragging}
                invalid={Boolean(error)}
                errorId={errorId}
                onPick={pick}
                onDropFiles={([file, extra]) => void openPicked(file, extra)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <CropModal
        shape={slot}
        src={crop?.src ?? null}
        open={Boolean(crop?.open)}
        fileName={crop?.name}
        onCancel={closeCrop}
        onCropped={(blob) => {
          onCropDone?.();
          void startUpload(blob);
        }}
      />

      <TrimDialog
        ask={trimAsk}
        onCancel={closeTrim}
        onTrim={(file) => void startVideoUpload(file, true)}
        onPickAnother={() => {
          closeTrim();
          pick();
        }}
      />
    </div>
  );
}

/** Width ÷ height of an uploaded image or clip, or null when its size is unknown. */
function ownRatio(media: { width: number | null; height: number | null } | null): number | null {
  return media?.width && media.height ? media.width / media.height : null;
}

/** The uploaded clip, muted and looping (the author sees exactly what readers get). */
function PreviewVideo({ video, poster }: { video: VideoRef; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.muted = true;
    void element.play().catch(() => {});
  }, [video.url]);
  return (
    <video
      ref={ref}
      src={video.url}
      poster={poster}
      muted
      loop
      playsInline
      aria-label="Video preview"
      className="absolute inset-0 size-full object-cover"
    />
  );
}

function CoverAction({ onClick, icon, label }: { onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-white/95 px-3.5 text-[0.8125rem] font-bold text-ink shadow-card transition-colors hover:border-brand hover:bg-brand hover:text-brand-contrast [&_svg]:size-4"
    >
      {icon}
      {label}
    </button>
  );
}

type DropZoneCopy = {
  /** The button's id (the field id the composer focuses). */
  id: string;
  hintId: string;
  heading: string;
  imageHint: string;
  /** An extra line under the formats. */
  note?: string;
};

function DropZone({
  copy,
  dragging,
  invalid,
  errorId,
  onPick,
  onDropFiles,
  compact = false,
}: {
  compact?: boolean;
  copy: DropZoneCopy;
  dragging: boolean;
  invalid: boolean;
  errorId?: string;
  onPick: () => void;
  /** Every image / video dropped, in order. */
  onDropFiles: (files: File[]) => void;
}) {
  const onDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const files = mediaListFromDataTransfer(event.dataTransfer);
    if (files.length > 0) onDropFiles(files);
  };

  return (
    <motion.button
      type="button"
      id={copy.id}
      onClick={onPick}
      onDrop={onDrop}
      aria-describedby={[invalid ? errorId : null, copy.hintId].filter(Boolean).join(" ")}
      aria-invalid={invalid || undefined}
      animate={dragging ? { scale: 1.012 } : { scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      data-dragging={dragging || undefined}
      className={cn(
        "group relative flex w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed text-center",
        // Compact (the two-image popup): no fixed shape — as tall as its text needs, at least 16rem — so nothing is cut off.
        compact ? "min-h-64 gap-2.5 px-4 py-6" : "aspect-video gap-3 px-6",
        "transition-[border-color,background-color] duration-200 focus-visible:border-brand focus-visible:outline-none",
        dragging
          ? "border-solid border-brand bg-tint-3"
          : invalid
            ? "border-brand bg-tint"
            : "border-tint-border bg-tint hover:border-brand/60 hover:bg-tint-2",
      )}
    >
      <SpeedBarsSvg className="pointer-events-none absolute -bottom-8 -right-10 w-44 text-brand opacity-[0.06] sm:w-56" />
      {dragging && <SpeedLinesSweep duration={0.7} className="opacity-20" />}
      <motion.span
        aria-hidden
        animate={dragging ? { scale: 1.14, y: -4 } : { scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 18 }}
        className={cn(
          "relative flex items-center justify-center rounded-full bg-brand text-brand-contrast shadow-[0_10px_24px_-10px_var(--brand-glow)] transition-transform group-hover:scale-105 motion-reduce:transition-none",
          compact ? "size-12" : "size-14 sm:size-16",
        )}
      >
        <ImagePlay className={compact ? "size-5.5" : "size-6 sm:size-7"} />
      </motion.span>
      <span className={cn("relative font-wide font-extrabold text-ink", compact ? "text-[0.9375rem] leading-snug" : "text-base sm:text-lg")}>
        {dragging ? "Drop to use it" : copy.heading}
      </span>
      {compact ? (
        <span id={copy.hintId} className="relative flex max-w-64 flex-col gap-1 text-xs leading-relaxed text-muted">
          <span>
            Drag &amp; drop, or{" "}
            <span className="font-bold text-brand underline decoration-brand/40 underline-offset-4">browse</span>
          </span>
          <span>JPG · PNG · WebP · GIF, or a video up to {LIMITS.videoMaxSeconds} s</span>
          {copy.note && <span className="pt-1 font-semibold text-ink-2">{copy.note}</span>}
        </span>
      ) : (
        <span id={copy.hintId} className="relative max-w-xs text-[0.8125rem] leading-relaxed text-muted">
          <span className="hidden sm:inline">Drag &amp; drop, paste, or </span>
          <span className="font-bold text-brand underline decoration-brand/40 underline-offset-4">
            <span className="sm:hidden">Choose</span>
            <span className="hidden sm:inline">browse</span>
          </span>
          <span className="sm:hidden"> a photo or video</span>
          <span className="block pt-1 text-xs text-muted">{copy.imageHint}</span>
          <span className="block text-xs text-muted">Videos: MP4 · MOV · WebM — up to {LIMITS.videoMaxSeconds} seconds</span>
          {copy.note && <span className="block pt-1 text-xs font-semibold text-ink-2">{copy.note}</span>}
        </span>
      )}
    </motion.button>
  );
}

/** "This video is 48 seconds long" → keep its first 30 seconds, or pick another one. */
function TrimDialog({
  ask,
  onCancel,
  onTrim,
  onPickAnother,
}: {
  ask: TrimAsk | null;
  onCancel: () => void;
  onTrim: (file: File) => void;
  onPickAnother: () => void;
}) {
  const trimRef = useRef<HTMLButtonElement>(null);
  const max = LIMITS.videoMaxSeconds;
  const length = ask?.durationMs ?? null;
  const keptShare = length ? Math.min(1, (max * 1000) / length) : 0.6;
  return (
    <Modal
      open={Boolean(ask?.open)}
      onOpenChange={(open) => !open && onCancel()}
      title={length ? `This video is ${spokenLength(length)} long` : `This video is longer than ${max} seconds`}
      description={`Story videos can be ${max} seconds at most. We can keep the first ${max} seconds and cut the rest.`}
      initialFocus={trimRef}
      footer={
        <>
          <Button variant="ghost" onClick={onPickAnother} className="sm:mr-auto">
            Choose another video
          </Button>
          <Button ref={trimRef} leftIcon={<Scissors aria-hidden />} onClick={() => ask && onTrim(ask.file)}>
            Use the first {max} seconds
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2" aria-hidden>
        <div className="flex h-3 overflow-hidden rounded-full bg-border">
          <div className="h-full bg-brand" style={{ width: `${keptShare * 100}%` }} />
          <div className="h-full flex-1 bg-[repeating-linear-gradient(135deg,var(--border-strong)_0_4px,transparent_4px_8px)]" />
        </div>
        <div className="flex justify-between text-xs font-semibold text-muted">
          <span className="text-brand-strong">Kept: 0:00 – 0:{String(max).padStart(2, "0")}</span>
          <span>{length ? `Cut: ${clipLength(max * 1000)} – ${clipLength(length)}` : "Cut: the rest"}</span>
        </div>
      </div>
    </Modal>
  );
}

/** The crop / clip, veiled, with the upload progress bar (a video then shows "Processing video…" while it's re-encoded). */
function UploadingFrame({ upload, frame, noun }: { upload: Upload; frame: string; noun: string }) {
  const percent = Math.round(upload.progress * 100);
  const processing = upload.progress >= 1;
  const isVideo = upload.kind === "video" || upload.kind === "articleVideo";
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn("relative overflow-hidden rounded-2xl bg-surface-2", frame)}
    >
      {isVideo ? (
        <video src={upload.preview} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover opacity-30" />
      ) : (
        <img src={upload.preview} alt="" className="absolute inset-0 size-full object-cover opacity-30" />
      )}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-ink"
        role="status"
        aria-live="polite"
      >
        <SpeedLinesLoader size="lg" label={null} />
        <p className="kicker">{processing ? `Processing ${noun}…` : `Uploading ${noun} · ${percent}%`}</p>
      </div>
      <button
        type="button"
        onClick={() => upload.controller.abort()}
        className="absolute right-3 top-3 inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-white/95 px-3.5 text-[0.8125rem] font-bold text-ink shadow-card transition-colors hover:border-brand hover:text-brand [&_svg]:size-4"
      >
        <X aria-hidden />
        Cancel
      </button>
      <div
        className="absolute inset-x-0 bottom-0 h-1.5 bg-border"
        role="progressbar"
        aria-label={`${noun.charAt(0).toUpperCase()}${noun.slice(1)} upload`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <motion.div
          className="h-full origin-left bg-brand"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: Math.max(0.04, upload.progress) }}
          transition={{ ease: [0.2, 0.8, 0.2, 1], duration: 0.3 }}
        />
      </div>
    </motion.div>
  );
}
