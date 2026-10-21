"use client";

import { Crop, ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { cropToBlob, type PixelArea } from "./crop-image";

export type CropModalProps = {
  /** Object URL of the chosen file (kept while the dialog animates out). */
  src: string | null;
  open: boolean;
  fileName?: string;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
  /** `cover` (default): the reel poster's 9:16. `article`: the full article's image, its own shape or a chosen one. */
  shape?: CropShape;
};

export type CropShape = "cover" | "article";

/**
 * Covers are portrait 9:16, the reel poster's shape (owner 2026-09-26). Article images (owner 2026-10-08) keep the
 * photo's own shape by default, or take one of `ARTICLE_RATIOS`. `fit`: a cover fills the frame's height, so it can be
 * dragged sideways; an article photo is shown whole, so any frame fits inside it.
 */
const SHAPES: Record<CropShape, { aspect: number; ratio: string; fit: "vertical-cover" | "contain"; title: string; description: string; noun: string }> = {
  cover: {
    aspect: 9 / 16,
    ratio: "9 : 16",
    fit: "vertical-cover",
    title: "Crop your cover",
    description: "Drag to reposition. Pinch, scroll or use the slider to zoom. Covers are 9:16, like a phone screen.",
    noun: "Cover",
  },
  article: {
    aspect: 16 / 9,
    ratio: "16 : 9",
    fit: "contain",
    title: "Crop your article image",
    description: "Drag to reposition. Pinch, scroll or use the slider to zoom. Keep the photo's own shape, or pick another.",
    noun: "Article image",
  },
};
/** The article image's shapes; `null` is the photo's own. */
const ARTICLE_RATIOS: { label: string; value: number | null }[] = [
  { label: "Original", value: null },
  { label: "16:9", value: 16 / 9 },
  { label: "4:3", value: 4 / 3 },
  { label: "1:1", value: 1 },
  { label: "4:5", value: 4 / 5 },
];
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

/** Cover (9:16) or article image (any shape) crop (drag to reposition, pinch/scroll/slider to zoom, arrow keys when focused). */
export function CropModal({ src, open, fileName, onCancel, onCropped, shape = "cover" }: CropModalProps) {
  const { title, description } = SHAPES[shape];
  return (
    <Modal
      open={open && src !== null}
      onOpenChange={(open) => !open && onCancel()}
      title={title}
      description={description}
      size="lg"
    >
      {/* Keyed by src so every new image starts centred at 1×. */}
      {src && <CropBody key={src} src={src} fileName={fileName} shape={shape} onCancel={onCancel} onCropped={onCropped} />}
    </Modal>
  );
}

function CropBody({
  src,
  fileName,
  shape,
  onCancel,
  onCropped,
}: { src: string; fileName?: string; shape: CropShape } & Pick<CropModalProps, "onCancel" | "onCropped">) {
  const { ratio, fit, noun } = SHAPES[shape];
  const isArticle = shape === "article";
  /** The article's chosen shape (`null`: the photo's own, known once it loads). */
  const [chosen, setChosen] = useState<number | null>(null);
  const [ownAspect, setOwnAspect] = useState<number | null>(null);
  const aspect = isArticle ? (chosen ?? ownAspect ?? SHAPES.article.aspect) : SHAPES[shape].aspect;
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<PixelArea | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));

  // A new shape starts centred at 1×, like a new photo.
  const choose = (value: number | null) => {
    setChosen(value);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  const confirm = async () => {
    if (!area) return;
    setWorking(true);
    setError(null);
    try {
      onCropped(await cropToBlob(src, area));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your browser couldn't crop this image.");
      setWorking(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {isArticle && (
        <div role="group" aria-label="Shape" className="-mb-1 flex flex-wrap gap-2">
          {ARTICLE_RATIOS.map(({ label, value }) => {
            const selected = chosen === value;
            return (
              <button
                key={label}
                type="button"
                aria-pressed={selected}
                onClick={() => choose(value)}
                className={cn(
                  "h-9 rounded-full border px-3.5 text-[0.8125rem] font-bold tabular-nums transition-colors",
                  selected
                    ? "border-brand bg-brand text-brand-contrast"
                    : "border-border-strong bg-surface text-ink hover:border-brand hover:text-brand",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
      {/* Sized so the whole sheet — text, crop, zoom and buttons — fits one screen without scrolling (owner 2026-10-12). */}
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-xl bg-surface-2",
          isArticle ? "h-[clamp(12rem,calc(100dvh-33rem),34rem)]" : "h-[clamp(12rem,calc(100dvh-30rem),34rem)]",
        )}
      >
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          zoomSpeed={0.6}
          showGrid
          // Cover: full-height media, landscape photos slide sideways under the 9:16 frame. Article: the whole photo,
          // the frame as large as fits inside it (the photo's own shape: all of it).
          objectFit={fit}
          onMediaLoaded={({ naturalWidth, naturalHeight }) => setOwnAspect(naturalWidth / naturalHeight)}
          onCropChange={setCrop}
          onZoomChange={(value) => setZoom(clampZoom(value))}
          onCropComplete={(_: Area, pixels: Area) => setArea(pixels)}
          style={{
            // Light veil outside the frame (the retheme has no black surfaces).
            cropAreaStyle: { border: "2px solid var(--brand)", color: "rgb(255 255 255 / 0.72)" },
            containerStyle: { background: "var(--surface-2)" },
          }}
          cropperProps={{ "aria-label": "Crop area. Use the arrow keys to move the image." }}
          mediaProps={{ alt: fileName ? `${noun}: ${fileName}` : noun }}
        />
        {!isArticle && (
          <span className="kicker pointer-events-none absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-ink shadow-card">
            {ratio}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <IconButton
          label="Zoom out"
          size="sm"
          variant="outline"
          onClick={() => setZoom((z) => clampZoom(z - 0.25))}
          disabled={zoom <= MIN_ZOOM}
        >
          <ZoomOut aria-hidden />
        </IconButton>
        <label className="flex min-w-0 flex-1 items-center gap-3">
          <span className="sr-only">Zoom</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(event) => setZoom(clampZoom(Number(event.target.value)))}
            aria-valuetext={`${Math.round(zoom * 100)}%`}
            className="h-1.5 w-full min-w-0 cursor-pointer accent-brand"
          />
        </label>
        <IconButton
          label="Zoom in"
          size="sm"
          variant="outline"
          onClick={() => setZoom((z) => clampZoom(z + 0.25))}
          disabled={zoom >= MAX_ZOOM}
        >
          <ZoomIn aria-hidden />
        </IconButton>
        <span className="w-12 shrink-0 text-right text-xs font-bold tabular-nums text-muted">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-brand">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 border-t border-border pt-4 sm:flex sm:justify-end">
        <Button variant="ghost" onClick={onCancel} disabled={working}>
          Cancel
        </Button>
        <Button onClick={confirm} loading={working} disabled={!area} leftIcon={<Crop aria-hidden />}>
          Crop &amp; upload
        </Button>
      </div>
    </div>
  );
}
