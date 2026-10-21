"use client";

import { Camera, RefreshCcw, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

/*
 * "Take photo" (owner 2026-10-14, step 1 of the composer): the camera live in a window — shoot, check, use it or retake.
 * The photo then goes through the same crop and upload as a picked file. Where the browser has no camera access, the
 * phone's own camera opens instead (a file input with `capture`).
 */

type Facing = "environment" | "user";

export function CameraCapture({
  open,
  onOpenChange,
  title,
  onCapture,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onCapture: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fallbackRef = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [shot, setShot] = useState<{ url: string; blob: Blob } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // No camera API at all (old browsers, some app WebViews): straight to the device's own camera.
  const noApi = typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia;
  const error = noApi ? "no-camera-api" : failure;

  // The live camera while the window is open and nothing is shot yet.
  useEffect(() => {
    if (!open || shot || noApi) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play().catch(() => {});
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setFailure(err instanceof DOMException && err.name === "NotAllowedError" ? "denied" : "unavailable");
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, shot, facing, noApi]);

  /** Closing clears the shot and any camera error, so the next open starts fresh. */
  const close = (next: boolean) => {
    if (!next) {
      if (shot) URL.revokeObjectURL(shot.url);
      setShot(null);
      setFailure(null);
    }
    onOpenChange(next);
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // The front camera is shown mirrored; the photo is saved the right way round.
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => blob && setShot({ url: URL.createObjectURL(blob), blob }), "image/jpeg", 0.92);
  };

  const use = (blob: Blob) => {
    onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
    close(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title={title}
      description="Point, shoot, then use the photo — you can crop it next."
      size="lg"
      footer={
        shot ? (
          <div className="flex w-full gap-2 sm:justify-end">
            <Button variant="ghost" leftIcon={<RotateCcw aria-hidden />} onClick={() => setShot(null)}>
              Retake
            </Button>
            <Button onClick={() => use(shot.blob)} className="max-sm:flex-1">
              Use photo
            </Button>
          </div>
        ) : error ? null : (
          <div className="flex w-full items-center gap-2 sm:justify-end">
            <Button variant="ghost" leftIcon={<RefreshCcw aria-hidden />} onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}>
              Switch camera
            </Button>
            <Button leftIcon={<Camera aria-hidden />} onClick={capture} className="max-sm:flex-1">
              Take photo
            </Button>
          </div>
        )
      }
    >
      {/* A fixed-size frame from the first moment (owner 2026-10-14: it opened small, then grew once the camera started). */}
      <div className="relative aspect-[3/4] max-h-[60vh] w-full overflow-hidden rounded-2xl bg-ink sm:aspect-video">
        {shot ? (
           
          <img src={shot.url} alt="The photo you took" className="absolute inset-0 size-full object-contain" />
        ) : error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white">
            <Camera aria-hidden className="size-8 opacity-80" />
            <p className="text-sm">
              {error === "denied"
                ? "Camera access is blocked. Allow the camera for this site in your browser settings, or use your phone's camera:"
                : "The live camera isn't available here. Use your device's camera instead:"}
            </p>
            <Button onClick={() => fallbackRef.current?.click()} leftIcon={<Camera aria-hidden />}>
              Open camera
            </Button>
          </div>
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="absolute inset-0 size-full object-contain"
            style={facing === "user" ? { transform: "scaleX(-1)" } : undefined}
          />
        )}
      </div>
      <input
        ref={fallbackRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            onCapture(file);
            close(false);
          }
        }}
      />
    </Modal>
  );
}
