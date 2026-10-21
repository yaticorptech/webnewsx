"use client";

import { CircleAlert, Move, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { SpeedLines } from "@/components/brand/speed-lines";
import { ReelCard } from "@/components/feed/reel-card";
import { Button } from "@/components/ui/button";
import {
  POSTER_TEMPLATE_LABELS,
  POSTER_ZOOM_MAX,
  isPosterTemplate,
  type ArticleCard,
  type PosterFrame,
} from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/** Shown while no template is chosen (the preview uses DEFAULT_POSTER_TEMPLATE meanwhile). */
export const CHOOSE_TEMPLATE_HINT = "Choose a template to see your story as readers will";

/** A photo nobody has moved: centred, no zoom. */
const CENTRED: PosterFrame = { x: 50, y: 50, zoom: 1 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const toPercent = (value: number) => Math.round(clamp(value, 0, 100) * 10) / 10;
const toZoom = (value: number) => Math.round(clamp(value, 1, POSTER_ZOOM_MAX) * 100) / 100;

/** While adjusting, the template's photo box gets a dashed outline, so the reporter sees what they are framing. */
const OUTLINE_PHOTO =
  "[&_[data-poster-image]]:outline-2 [&_[data-poster-image]]:-outline-offset-2 [&_[data-poster-image]]:outline-dashed [&_[data-poster-image]]:outline-white";

type Adjust = { frame: PosterFrame; onChange: (frame: PosterFrame) => void; onDone: () => void };

export type ReelPhoneProps = {
  /** The story as it stands (`buildPreviewCard`). */
  card: ArticleCard;
  priority?: boolean;
  /** "Adjust photo" is on: drags over the screen move the photo in its box (PhotoAdjuster). */
  adjust?: Adjust | null;
  /** The frame's width (the screen inside is 9:16) and placement. */
  className?: string;
};

/**
 * The story's reel as it will look once published, in a phone-like frame: the feed's own ReelCard in preview mode
 * (inert) — the poster in the chosen template (DEFAULT_POSTER_TEMPLATE until there is one) with the action rail on
 * it, zero counts. Picking another template pops the new poster in (owner rule: also under Reduce Motion).
 */
export function ReelPhone({ card, priority = false, adjust = null, className }: ReelPhoneProps) {
  return (
    <div
      className={cn(
        "rounded-[1.75rem] bg-surface p-2 shadow-pop ring-1 ring-border transition-shadow",
        adjust && "ring-2 ring-brand",
        className,
      )}
    >
      <div className={cn("relative overflow-hidden rounded-[1.25rem] bg-surface-2", adjust && OUTLINE_PHOTO)}>
        <MotionConfig reducedMotion="never">
          <motion.div
            key={card.template ?? "default"}
            initial={{ opacity: 0.4, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <ReelCard article={card} preview priority={priority} />
          </motion.div>
        </MotionConfig>
        {adjust && <PhotoAdjuster card={card} {...adjust} />}
      </div>
    </div>
  );
}

/**
 * "Adjust photo" (owner 2026-09-26): a layer over the phone's screen. Dragging it (mouse, finger or pen) moves the photo
 * inside the chosen template's photo box and the photo follows the pointer exactly — px become the frame's % from the
 * box's size, the photo's size and the zoom. Keyboard: arrow keys move it (Shift = bigger steps), + / − zoom, Enter or
 * Escape finish. Takes focus when it opens.
 */
function PhotoAdjuster({ card, frame, onChange, onDone }: { card: ArticleCard } & Adjust) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; x: number; y: number; start: PosterFrame; rate: { x: number; y: number } } | null>(null);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  /**
   * Frame % per px of pointer travel on each axis at `zoom` (negative: dragging right shows more of the left). 0 = the
   * photo exactly fills that side of the box, so there is nothing to move.
   */
  const rates = (zoom: number) => {
    const box = ref.current?.parentElement?.querySelector<HTMLElement>("[data-poster-image]");
    if (!box) return null;
    const media = box.querySelector("img, video");
    const width =
      card.coverWidth ||
      (media instanceof HTMLVideoElement ? media.videoWidth : media instanceof HTMLImageElement ? media.naturalWidth : 0);
    const height =
      card.coverHeight ||
      (media instanceof HTMLVideoElement ? media.videoHeight : media instanceof HTMLImageElement ? media.naturalHeight : 0);
    const rect = box.getBoundingClientRect();
    if (!width || !height || !rect.width || !rect.height) return null;
    const scale = zoom * Math.max(rect.width / width, rect.height / height);
    const spanX = rect.width - width * scale;
    const spanY = rect.height - height * scale;
    return { x: spanX < -0.5 ? 100 / spanX : 0, y: spanY < -0.5 ? 100 / spanY : 0 };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const rate = rates(frame.zoom);
    if (!rate) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, start: frame, rate };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== event.pointerId) return;
    onChange({
      zoom: d.start.zoom,
      x: toPercent(d.start.x + (event.clientX - d.x) * d.rate.x),
      y: toPercent(d.start.y + (event.clientY - d.y) * d.rate.y),
    });
  };

  const endDrag = () => {
    drag.current = null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 2;
    // An arrow moves the photo that way (like dragging it): → shows more of its left side.
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      onChange({ ...frame, x: toPercent(frame.x + move[0]), y: toPercent(frame.y + move[1]) });
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      onChange({ ...frame, zoom: toZoom(frame.zoom + 0.1) });
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      onChange({ ...frame, zoom: toZoom(frame.zoom - 0.1) });
    } else if (event.key === "Escape" || event.key === "Enter") {
      event.preventDefault();
      onDone();
    }
  };

  return (
    <div
      ref={ref}
      role="application"
      aria-label="Move the photo: drag it, or use the arrow keys (Shift for bigger steps). Plus and minus zoom. Enter when done."
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      className="absolute inset-0 z-40 cursor-grab touch-none select-none outline-none active:cursor-grabbing"
    >
      <span className="pointer-events-none absolute left-1/2 top-3 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-ink/80 px-3 py-1.5 text-xs font-bold text-white shadow-card backdrop-blur-sm [&_svg]:size-3.5">
        <Move aria-hidden />
        Drag to move the photo
      </span>
    </div>
  );
}

export type LivePreviewProps = {
  card: ArticleCard;
  /**
   * `panel`: ≥1280px, the sticky column beside the form (an `<aside>`), the phone as tall as the screen allows (at most
   * 36rem). `compact`: narrower screens, right under the template picker, the same 36rem phone shrunk to ~230px wide
   * (its rail and counts shrink with it, as on a real phone).
   */
  variant: "panel" | "compact";
  /** The photo's place in the poster (null = centred). */
  frame?: PosterFrame | null;
  /** Turns on "Adjust photo" (leave it out while there is no cover: nothing to adjust). */
  onFrameChange?: (frame: PosterFrame | null) => void;
  className?: string;
};

/**
 * The publish form's live preview (owner 2026-09-26): the reporter's story as readers will see it in the feed once
 * published — their cover, headline, name and badge in the chosen template — updated as they edit. Titled "Live
 * preview"; the caption names the template, or asks for one while none is chosen. "Adjust photo" lets the reporter
 * drag and zoom the photo to suit the template (saved with the story). Step 03 is the action bar's "Preview".
 */
export function LivePreview({ card, variant, frame = null, onFrameChange, className }: LivePreviewProps) {
  const labelId = useId();
  const [adjusting, setAdjusting] = useState(false);
  const chosen = isPosterTemplate(card.template) ? card.template : null;
  const compact = variant === "compact";
  const Root = compact ? "div" : "aside";
  // Removing the cover ends adjusting.
  const active = adjusting && Boolean(onFrameChange);
  const current = frame ?? CENTRED;

  const adjust: Adjust | null =
    active && onFrameChange ? { frame: current, onChange: onFrameChange, onDone: () => setAdjusting(false) } : null;

  return (
    <Root aria-labelledby={compact ? undefined : labelId} className={cn("flex flex-col gap-3", compact && "items-center", className)}>
      <p id={labelId} className="kicker flex items-center gap-2 text-ink">
        <SpeedLines className="text-[0.8rem]" tone="muted" />
        Live preview
      </p>
      <figure className={cn("flex flex-col gap-3", compact && "items-center")}>
        {compact ? (
          // The phone keeps its full-size layout box under the transform: this box has the shrunk size.
          <div className="h-[calc(37rem*0.68)] w-[calc(21.25rem*0.68)]">
            <ReelPhone card={card} adjust={adjust} className="w-85 origin-top-left scale-68" />
          </div>
        ) : (
          // 21.25rem = a 20.25 × 36rem screen + the bezel. Sized by the screen's height so the whole side column — this
          // title, the phone, the caption and the article row under it — fits without scrolling (owner 2026-10-08).
          <ReelPhone
            card={card}
            adjust={adjust}
            className="w-[clamp(12rem,calc((100dvh_-_var(--nav-h)_-_20rem)*9/16_+_1rem),21.25rem)]"
          />
        )}
        <figcaption className={cn("text-[0.8125rem] leading-relaxed text-muted", compact && "max-w-72 text-center")}>
          {chosen ? (
            <>
              {chosen === "plain" ? (
                <span className="font-bold text-ink">No template</span>
              ) : (
                <>
                  <span className="font-bold text-ink">{POSTER_TEMPLATE_LABELS[chosen]}</span> template
                </>
              )}
              {" · as readers will see it in the feed"}
            </>
          ) : (
            <span className="inline-flex items-start gap-1.5 text-left font-semibold text-ink-2">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
              {CHOOSE_TEMPLATE_HINT}
            </span>
          )}
        </figcaption>
      </figure>

      {adjust && onFrameChange ? (
        <div className="flex w-full max-w-85 flex-col gap-3 rounded-2xl border border-border bg-surface p-3 shadow-card">
          <label className="flex items-center gap-2.5">
            <span className="sr-only">Zoom</span>
            <ZoomOut aria-hidden className="size-4 shrink-0 text-muted" />
            <input
              type="range"
              min={1}
              max={POSTER_ZOOM_MAX}
              step={0.01}
              value={current.zoom}
              onChange={(event) => onFrameChange({ ...current, zoom: toZoom(Number(event.target.value)) })}
              aria-valuetext={`${Math.round(current.zoom * 100)}%`}
              className="h-1.5 w-full min-w-0 cursor-pointer accent-brand"
            />
            <ZoomIn aria-hidden className="size-4 shrink-0 text-muted" />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" size="sm" leftIcon={<RotateCcw aria-hidden />} onClick={() => onFrameChange(null)} disabled={!frame}>
              Reset
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setAdjusting(false)}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        onFrameChange && (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Move aria-hidden />}
            onClick={() => setAdjusting(true)}
            className={cn("self-start", compact && "self-center")}
          >
            Adjust photo
          </Button>
        )
      )}
    </Root>
  );
}
