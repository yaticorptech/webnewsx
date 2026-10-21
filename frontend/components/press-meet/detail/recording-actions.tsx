"use client";

import { Download, Loader2, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "@/components/ui/toast";
import { localRecordingBlob, localRecordingFileName, localRecordingPieces, localRecordingType, type LocalRecording } from "@/lib/local-recordings";
import { isNativeApp, nativeSharePlugin, shareFileUriFromParts } from "@/lib/native-app";
import { cn } from "@/lib/utils";

/*
 * Download and Share for a reporter's press meet recording (owner 2026-10-05). On the website: a file download and the
 * browser's share sheet (with the video file). In the app: the phone's share sheet with the video — "Save to device" /
 * Drive / Files there is the download.
 */

function cancelled(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  return error instanceof Error && /cancel/i.test(error.message);
}

function webDownload(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** The app's share sheet with the video file. False when this build can't attach files (then the website way is used). */
async function nativeShare(recording: LocalRecording, title: string, dialogTitle: string): Promise<boolean> {
  const plugin = nativeSharePlugin();
  if (!plugin) return false;
  const uri = await shareFileUriFromParts(await localRecordingPieces(recording), localRecordingFileName(recording, title));
  if (!uri) return false;
  await plugin.share({ title, dialogTitle, files: [uri] });
  return true;
}

async function download(recording: LocalRecording, title: string): Promise<void> {
  if (isNativeApp() && (await nativeShare(recording, title, "Save the recording"))) return;
  webDownload(await localRecordingBlob(recording), localRecordingFileName(recording, title));
  toast.success("Recording downloaded");
}

async function share(recording: LocalRecording, title: string): Promise<void> {
  if (await nativeShare(recording, title, "Share the recording")) return;
  const name = localRecordingFileName(recording, title);
  const blob = await localRecordingBlob(recording);
  const file = new File([blob], name, { type: localRecordingType(recording) });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return;
  }
  webDownload(blob, name);
  toast("Downloaded instead", { description: "This browser can't share video files — send the downloaded file from your device." });
}

export function RecordingActions({ recording, title, className }: { recording: LocalRecording; title: string; className?: string }) {
  const [busy, setBusy] = useState<"download" | "share" | null>(null);
  const run = async (kind: "download" | "share") => {
    if (busy) return;
    setBusy(kind);
    try {
      await (kind === "download" ? download(recording, title) : share(recording, title));
    } catch (error) {
      if (!cancelled(error)) toast.error(kind === "download" ? "Couldn't download the recording" : "Couldn't share the recording");
    } finally {
      setBusy(null);
    }
  };
  const button = "flex size-9 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-tint hover:text-brand disabled:opacity-50";
  return (
    <span className={cn("flex items-center", className)}>
      <button type="button" onClick={() => void run("download")} disabled={busy !== null} aria-label="Download recording" className={button}>
        {busy === "download" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Download aria-hidden className="size-4" />}
      </button>
      <button type="button" onClick={() => void run("share")} disabled={busy !== null} aria-label="Share recording" className={button}>
        {busy === "share" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Share2 aria-hidden className="size-4" />}
      </button>
    </span>
  );
}
