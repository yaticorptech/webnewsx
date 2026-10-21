"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState, type SyntheticEvent } from "react";
import { Modal } from "@/components/ui/modal";
import { localRecordingBlob, type LocalRecording } from "@/lib/local-recordings";
import { RecordingActions } from "./recording-actions";

/**
 * Replays a reporter's recording from this device's own storage (owner 2026-10-02: recordings never go to the
 * server), with Download and Share (owner 2026-10-05: reporters may keep and share it).
 */
export function RecordingPlayer({
  recording,
  title,
  onClose,
}: {
  recording: LocalRecording | null;
  title: string;
  onClose: () => void;
}) {
  const open = recording !== null;
  const [src, setSrc] = useState<{ id: string; url: string } | null>(null);

  // The video from this device's storage, as a temporary in-page address (freed on close).
  useEffect(() => {
    if (!recording) return;
    let url: string | null = null;
    let live = true;
    void localRecordingBlob(recording).then((blob) => {
      if (!live) return;
      url = URL.createObjectURL(blob);
      setSrc({ id: recording.id, url });
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [recording]);

  const ready = src && recording && src.id === recording.id ? src.url : null;

  return (
    <Modal open={open} onOpenChange={(next) => !next && onClose()} title={title} description="Your recording" size="lg" bodyClassName="p-0 sm:p-0">
      {recording && (
        <div className="flex flex-col">
          <div className="relative aspect-video w-full bg-black">
            {ready ? (
              <video
                key={recording.id}
                src={ready}
                controls
                autoPlay
                playsInline
                preload="metadata"
                onLoadedMetadata={fixDuration}
                className="absolute inset-0 size-full object-contain"
              />
            ) : (
              <Loader2 aria-label="Opening the recording" className="absolute inset-0 m-auto size-7 animate-spin text-white/60" />
            )}
          </div>
          <div className="flex items-center gap-2 px-5 py-2.5">
            <p className="min-w-0 flex-1 text-xs text-muted">Saved on this device. Download it or share it.</p>
            <RecordingActions recording={recording} title={title} />
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * A browser recording (WebM) doesn't state its length, so the player can't show it or seek well: jump to the far end
 * once so the browser works it out, then back to the start.
 */
function fixDuration(event: SyntheticEvent<HTMLVideoElement>) {
  const video = event.currentTarget;
  if (Number.isFinite(video.duration)) return;
  const back = () => {
    video.removeEventListener("timeupdate", back);
    video.currentTime = 0;
  };
  video.addEventListener("timeupdate", back);
  video.currentTime = 1e101;
}
