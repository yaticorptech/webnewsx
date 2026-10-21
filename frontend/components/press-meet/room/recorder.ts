import { finishLocalRecording, localRecordingSupported, saveLocalPiece, startLocalRecording } from "@/lib/local-recordings";
import { PRESS_MEET } from "@/lib/shared/contracts";
import { drawBrandMark, drawPlaceholder, drawVideo, loadPhoto, preloadBrandMark, uiFontFamily } from "./brand-mark";
import { startTicker } from "./ticker";

const FPS = 24;
const WIDTH = 1280;
const HEIGHT = 720;

/** MP4 first where the browser records it (owner 2026-10-05: reporters share recordings — WhatsApp and Instagram take MP4). */
const MIME_TYPES = [
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9,opus",
  "video/webm",
  "video/mp4;codecs=avc1,mp4a",
  "video/mp4",
];

export function recordingSupported(): boolean {
  return localRecordingSupported() && typeof MediaRecorder !== "undefined" && MIME_TYPES.some((type) => MediaRecorder.isTypeSupported(type));
}

export type RecorderSources = {
  /** The organizer's <video> on the stage (null while they're not there). */
  organizerVideo: () => HTMLVideoElement | null;
  organizer: { name: string; image: string | null };
  title: string;
};

/**
 * A reporter's recording of the room (owner 2026-10-01): the organizer's picture (with the WebNEWS mark top right —
 * also drawn for "camera off" and letterboxed frames) and a title strip, plus everyone's audio mixed together (the
 * organizer, the other reporters and their own mic). The pieces are saved on this device every few seconds, in order
 * (lib/local-recordings.ts, owner 2026-10-02: nothing goes to the server), so a closed tab keeps what was recorded; it
 * replays only inside WebNEWS.
 */
export class RoomRecorder {
  private readonly canvas = document.createElement("canvas");
  private readonly ctx: CanvasRenderingContext2D;
  private readonly audio: AudioContext;
  private readonly mix: MediaStreamAudioDestinationNode;
  private readonly inputs = new Map<string, MediaStreamAudioSourceNode>();
  private recorder: MediaRecorder | null = null;
  private stopTicker: (() => void) | null = null;
  private recordingId: string | null = null;
  private seq = 0;
  private queue: Promise<void> = Promise.resolve();
  private photo: HTMLImageElement | null = null;
  private failed = false;
  startedAt = 0;

  constructor(
    private readonly meetId: string,
    /** Whose recording it is (several accounts can use one device). */
    private readonly userId: string,
    private readonly sources: RecorderSources,
    private readonly onError: (message: string) => void,
  ) {
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    this.ctx = this.canvas.getContext("2d", { alpha: false })!;
    this.audio = new AudioContext();
    this.mix = this.audio.createMediaStreamDestination();
    void preloadBrandMark();
    void loadPhoto(sources.organizer.image).then((photo) => {
      this.photo = photo;
    });
  }

  /** Adds (or replaces) one person's audio in the mix. */
  setAudio(key: string, stream: MediaStream | null): void {
    this.inputs.get(key)?.disconnect();
    this.inputs.delete(key);
    if (!stream || stream.getAudioTracks().length === 0) return;
    try {
      const node = this.audio.createMediaStreamSource(stream);
      node.connect(this.mix);
      this.inputs.set(key, node);
    } catch {
      // a stream without live audio yet
    }
  }

  async start(): Promise<void> {
    await this.audio.resume();
    const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
    this.recordingId = await startLocalRecording(this.meetId, this.userId, mimeType || "video/webm");
    this.seq = 0;
    this.draw();
    this.stopTicker = startTicker(FPS, () => this.draw());
    const video = this.canvas.captureStream(FPS).getVideoTracks()[0]!;
    const stream = new MediaStream([video, ...this.mix.stream.getAudioTracks()]);
    const recorder = new MediaRecorder(stream, { mimeType: mimeType || undefined, videoBitsPerSecond: 1_000_000, audioBitsPerSecond: 96_000 });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.enqueue(event.data);
    };
    recorder.start(PRESS_MEET.chunkMs);
    this.recorder = recorder;
    this.startedAt = Date.now();
  }

  /** Stops and saves what's left on this device. */
  async stop(): Promise<void> {
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });
    }
    recorder?.stream.getTracks().forEach((track) => track.stop());
    this.stopTicker?.();
    this.stopTicker = null;
    await this.queue;
    if (this.recordingId) await finishLocalRecording(this.recordingId, Date.now() - this.startedAt).catch(() => {});
    this.recordingId = null;
    this.dispose();
  }

  /** Leaving the page: stop without waiting (the pieces saved so far stay on the device). */
  abandon(): void {
    try {
      this.recorder?.stop();
    } catch {
      // already stopped
    }
    this.recorder = null;
    this.stopTicker?.();
    void this.audio.close().catch(() => {});
  }

  dispose(): void {
    this.abandon();
    for (const node of this.inputs.values()) node.disconnect();
    this.inputs.clear();
  }

  private enqueue(piece: Blob): void {
    const id = this.recordingId;
    if (!id) return;
    const seq = this.seq++;
    this.queue = this.queue.then(() => this.save(id, seq, piece));
  }

  private async save(id: string, seq: number, piece: Blob): Promise<void> {
    try {
      await saveLocalPiece(id, seq, piece);
    } catch (error) {
      if (this.failed) return;
      this.failed = true;
      const full = error instanceof DOMException && error.name === "QuotaExceededError";
      this.onError(full ? "Your device is out of space — the recording stopped saving." : "Part of your recording couldn't be saved on this device.");
    }
  }

  private draw(): void {
    const { ctx } = this;
    ctx.fillStyle = "#0b0d11";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const video = this.sources.organizerVideo();
    const box = video ? drawVideo(ctx, video, WIDTH, HEIGHT, "contain") : null;
    if (!box) {
      drawPlaceholder(ctx, WIDTH, HEIGHT, { name: this.sources.organizer.name, photo: this.photo }, "Press meet in progress");
    }
    // The organizer's picture carries the mark already when it fills the frame; otherwise draw it on the frame.
    const fills = box !== null && box.w >= WIDTH - 2 && box.h >= HEIGHT - 2;
    if (!fills) drawBrandMark(ctx, WIDTH, HEIGHT);
    this.drawTitle();
  }

  /** A slim lower-third: red bar, "PRESS MEET", the title. */
  private drawTitle(): void {
    const { ctx } = this;
    const h = 46;
    const y = HEIGHT - h - 22;
    const x = 22;
    const font = uiFontFamily();
    ctx.save();
    ctx.font = `800 20px ${font}`;
    const title = this.sources.title.length > 70 ? `${this.sources.title.slice(0, 69)}…` : this.sources.title;
    const w = Math.min(WIDTH - 44, ctx.measureText(title).width + 150);
    ctx.fillStyle = "rgba(10, 12, 16, 0.62)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#e30613";
    ctx.fillRect(x, y, 6, h);
    ctx.fillStyle = "#e30613";
    ctx.font = `800 13px ${font}`;
    ctx.textBaseline = "middle";
    ctx.fillText("PRESS MEET", x + 18, y + h / 2);
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 20px ${font}`;
    ctx.fillText(title, x + 122, y + h / 2, w - 136);
    ctx.restore();
  }
}
