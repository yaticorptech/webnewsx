"use client";

import { Camera, ImageUp, RotateCcw, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { cn, initialsOf } from "@/lib/utils";
import { AvatarCropModal } from "./avatar-crop-modal";
import { AVATAR_ACCEPT, avatarFileProblem } from "./crop-image";

export type AvatarPickerProps = {
  /** Current avatar URL (own upload `/media/avatars/…`, or a Google photo to be re-hosted). */
  value: string | null;
  onChange: (url: string | null) => void;
  /** Display name for the initials fallback / alt text. */
  name: string;
  /** Validation error from the form. */
  error?: string | null;
  /** Upload in flight (parent disables submit / waits). */
  onBusyChange?: (busy: boolean) => void;
  /** Small badge shown while `value` is untouched, e.g. "From Google". */
  sourceBadge?: string | null;
  /** Allow clearing the photo (onboarding requires one, so it only offers "Change"). */
  removable?: boolean;
  layout?: "stacked" | "inline";
  label?: ReactNode;
  className?: string;
};

type Preview = { url: string; forValue: string | null };

const EASE = [0.2, 0.8, 0.2, 1] as const;

/**
 * Profile photo picker: choose / drag & drop / paste → circular crop → upload (kind "avatar")
 * with a progress ring. The parent receives the stored URL through `onChange`.
 */
export function AvatarPicker({
  value,
  onChange,
  name,
  error,
  onBusyChange,
  sourceBadge,
  removable = false,
  layout = "stacked",
  label = "Profile photo",
  className,
}: AvatarPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const urlsRef = useRef(new Set<string>());
  const retryBlobRef = useRef<Blob | null>(null);
  const [pick, setPick] = useState<{ src: string; key: number } | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [dragging, setDragging] = useState(false);
  const labelId = useId();
  const statusId = useId();

  const uploading = progress !== null;
  const shown = uploading ? preview?.url : preview && preview.forValue === value ? preview.url : value;
  const message = problem ?? error ?? null;

  // Abort uploads and free object URLs on unmount.
  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      abortRef.current?.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  // Object URLs are all revoked on unmount (a handful per session at most).
  const openFile = useCallback((file: File) => {
    const issue = avatarFileProblem(file);
    if (issue) {
      setProblem(issue);
      setCanRetry(false);
      return;
    }
    const src = URL.createObjectURL(file);
    urlsRef.current.add(src);
    setProblem(null);
    setPick((previous) => ({ src, key: (previous?.key ?? 0) + 1 }));
    setCropOpen(true);
  }, []);

  // Paste an image anywhere on the page while the picker is mounted.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (!file) return;
      event.preventDefault();
      openFile(file);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [openFile]);

  const upload = async (blob: Blob) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const url = URL.createObjectURL(blob);
    urlsRef.current.add(url);
    setPreview({ url, forValue: null });
    setProblem(null);
    setCanRetry(false);
    setProgress(0);
    onBusyChange?.(true);
    try {
      const result = await api.upload(blob, "avatar", (fraction) => setProgress(fraction), controller.signal);
      retryBlobRef.current = null;
      setPreview({ url, forValue: result.url });
      onChange(result.url);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      retryBlobRef.current = blob;
      setProblem(errorMessage(err, "Upload failed. Please try again."));
      setCanRetry(true);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setProgress(null);
        onBusyChange?.(false);
      }
    }
  };

  const closeCrop = () => setCropOpen(false);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = Array.from(event.dataTransfer.files).find((f) => f.type.startsWith("image/")) ?? event.dataTransfer.files[0];
    if (file) openFile(file);
  };

  const dropHandlers = {
    onDragEnter: (event: DragEvent<HTMLDivElement>) => {
      if (!Array.from(event.dataTransfer.types).includes("Files")) return;
      event.preventDefault();
      setDragging(true);
    },
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      if (!Array.from(event.dataTransfer.types).includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (event: DragEvent<HTMLDivElement>) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      setDragging(false);
    },
    onDrop,
  };

  const browse = () => inputRef.current?.click();
  const stacked = layout === "stacked";
  const circle = stacked ? 144 : 96;

  return (
    <div className={cn("flex flex-col gap-3", className)} {...dropHandlers}>
      <span id={labelId} className="text-[0.8125rem] font-bold tracking-[0.01em] text-ink">
        {label}
        <span aria-hidden className="ml-0.5 text-brand">
          *
        </span>
      </span>

      <div className={cn("flex", stacked ? "flex-col items-center gap-5 text-center" : "flex-wrap items-center gap-x-5 gap-y-3")}>
        <AvatarDisc
          size={circle}
          src={shown ?? null}
          name={name}
          dragging={dragging}
          progress={progress}
          invalid={Boolean(message)}
          onClick={browse}
        />

        {/* Inline: the controls sit beside the disc and drop under it only when narrower than 10rem (320px phones). */}
        <div className={cn("flex min-w-0 flex-col gap-2", stacked ? "items-center" : "flex-1 basis-40 items-start")}>
          <AnimatePresence initial={false}>
            {sourceBadge && value && !preview && (
              <motion.span
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="kicker rounded-full border border-tint-border bg-tint px-2.5 py-1 text-brand"
              >
                {sourceBadge}
              </motion.span>
            )}
          </AnimatePresence>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="outline"
              size="md"
              onClick={browse}
              disabled={uploading}
              leftIcon={shown ? <Camera aria-hidden /> : <ImageUp aria-hidden />}
              aria-describedby={statusId}
            >
              {shown ? "Change photo" : "Upload photo"}
            </Button>
            {removable && value && !uploading && (
              <Button variant="ghost" size="md" onClick={() => onChange(null)} leftIcon={<Trash2 aria-hidden />}>
                Remove
              </Button>
            )}
          </div>
          <p className="text-xs leading-relaxed text-muted">
            JPG, PNG, WebP, GIF or AVIF · drag &amp; drop or paste
          </p>
        </div>
      </div>

      <div id={statusId} aria-live="polite" className="text-[0.8125rem]">
        {uploading ? (
          <p className={cn("font-semibold text-muted", stacked && "text-center")}>Uploading photo… {Math.round((progress ?? 0) * 100)}%</p>
        ) : message ? (
          <p className={cn("flex items-center gap-2 font-semibold text-brand", stacked && "justify-center")}>
            <span>{message}</span>
            {canRetry && (
              <button
                type="button"
                onClick={() => {
                  const blob = retryBlobRef.current;
                  if (blob) void upload(blob);
                }}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-ink underline underline-offset-2 hover:text-brand"
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Retry
              </button>
            )}
          </p>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={AVATAR_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-labelledby={labelId}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) openFile(file);
        }}
      />

      {pick && (
        <AvatarCropModal
          key={pick.key}
          open={cropOpen}
          src={pick.src}
          onCancel={closeCrop}
          onApply={(blob) => {
            closeCrop();
            void upload(blob);
          }}
        />
      )}
    </div>
  );
}

type AvatarDiscProps = {
  size: number;
  src: string | null;
  name: string;
  dragging: boolean;
  progress: number | null;
  invalid: boolean;
  onClick: () => void;
};

/** The big round target: photo (or an empty slot), progress ring while uploading, drop highlight. */
function AvatarDisc({ size, src, name, dragging, progress, invalid, onClick }: AvatarDiscProps) {
  const ring = 4;
  const radius = size / 2 - ring / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <motion.div
      aria-hidden
      onClick={onClick}
      animate={{ scale: dragging ? 1.05 : 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 24 }}
      // Just the circle (owner 2026-09-26: no plate behind it); m-1 leaves room for the ring.
      className="group relative m-1 shrink-0 cursor-pointer"
      style={{ width: size, height: size }}
    >
      <span
        className={cn(
          "absolute inset-0 overflow-hidden rounded-full border-2 bg-surface-2 transition-colors duration-200",
          src ? "border-brand" : "border-dashed",
          !src && (dragging ? "border-brand bg-tint-3" : invalid ? "border-brand bg-tint" : "border-tint-border bg-tint group-hover:border-brand"),
        )}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {src ? (
            <motion.img
              key={src}
              src={src}
              alt=""
              width={size}
              height={size}
              draggable={false}
              referrerPolicy="no-referrer"
              initial={{ opacity: 0, scale: 1.08 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <motion.span
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-brand"
            >
              {dragging ? (
                <span className="text-xs font-bold tracking-[0.14em] text-brand uppercase">Drop it</span>
              ) : (
                <>
                  <Camera className="size-7 transition-transform duration-200 ease-snap group-hover:scale-110" />
                  <span className="font-wide text-sm font-extrabold text-faint">{initialsOf(name)}</span>
                </>
              )}
            </motion.span>
          )}
        </AnimatePresence>
        {progress !== null && <span className="absolute inset-0 bg-white/60" />}
      </span>

      {progress !== null && (
        <svg className="absolute inset-0 -rotate-90" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--tint-3)" strokeWidth={ring} />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--brand)"
            strokeWidth={ring}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - Math.max(0.04, progress)) }}
            transition={{ duration: 0.25, ease: "linear" }}
          />
        </svg>
      )}

      {src && progress === null && (
        <span className="absolute bottom-1 right-1 flex size-9 items-center justify-center rounded-full border-2 border-bg bg-brand text-brand-contrast shadow-pop transition-transform duration-200 ease-snap group-hover:scale-110">
          <Camera className="size-4" />
        </span>
      )}
    </motion.div>
  );
}
