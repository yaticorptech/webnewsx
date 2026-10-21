"use client";

import { RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Modal } from "@/components/ui/modal";
import { SpeedLinesLoader } from "@/components/ui/speed-lines-loader";
import { toast } from "@/components/ui/toast";
import { cropToAvatarBlob } from "./crop-image";

export type AvatarCropModalProps = {
  open: boolean;
  /** Object URL of the picked file (kept by the parent until the modal has closed). */
  src: string | null;
  onCancel: () => void;
  onApply: (blob: Blob) => void;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
/** Wait for the dialog's scale-in to finish: the cropper measures its box on mount. */
const MOUNT_DELAY_MS = 280;

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

/** Circular 1:1 crop (react-easy-crop): drag / pinch / wheel / arrow keys, zoom slider, rotate 90°. */
export function AvatarCropModal({ open, src, onCancel, onApply }: AvatarCropModalProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [area, setArea] = useState<Area | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setReady(true), MOUNT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [open]);

  const apply = async () => {
    if (!src || !area || busy) return;
    setBusy(true);
    try {
      onApply(await cropToAvatarBlob(src, area, rotation));
    } catch (error) {
      toast.error("Couldn't use that photo", {
        description: error instanceof Error ? error.message : "Try a different image.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
      title="Crop your photo"
      description="Drag to reposition. Pinch, scroll or use the slider to zoom."
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={apply} loading={busy} disabled={!area}>
            Use photo
          </Button>
        </>
      }
    >
      <div className="relative mx-auto aspect-square w-full max-w-88 overflow-hidden rounded-2xl border border-tint-border bg-tint">
        {ready && src ? (
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={1}
            cropShape="round"
            showGrid={false}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            zoomSpeed={0.25}
            keyboardStep={8}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={(_, pixels) => setArea(pixels)}
            // Light veil outside the circle (no dark overlays in the white + crimson theme).
            style={{ cropAreaStyle: { border: "2px solid var(--brand)", color: "rgb(255 255 255 / 0.72)" } }}
            cropperProps={{ "aria-label": "Photo crop area. Drag, or use the arrow keys, to reposition." }}
            mediaProps={{ alt: "" }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <SpeedLinesLoader size="lg" label="Preparing photo" />
          </div>
        )}
      </div>

      <div className="mx-auto mt-5 flex max-w-88 items-center gap-2">
        <IconButton label="Zoom out" size="sm" variant="outline" onClick={() => setZoom((z) => clampZoom(z - 0.25))} disabled={zoom <= MIN_ZOOM}>
          <ZoomOut aria-hidden />
        </IconButton>
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(event) => setZoom(clampZoom(Number(event.target.value)))}
          aria-label="Zoom"
          aria-valuetext={`${Math.round(zoom * 100)}%`}
          className="h-11 min-w-0 flex-1 cursor-pointer accent-brand"
        />
        <IconButton label="Zoom in" size="sm" variant="outline" onClick={() => setZoom((z) => clampZoom(z + 0.25))} disabled={zoom >= MAX_ZOOM}>
          <ZoomIn aria-hidden />
        </IconButton>
        <span aria-hidden className="mx-1 h-6 w-px bg-border" />
        <IconButton label="Rotate 90 degrees" size="sm" variant="outline" onClick={() => setRotation((r) => (r + 90) % 360)}>
          <RotateCw aria-hidden />
        </IconButton>
      </div>
    </Modal>
  );
}
