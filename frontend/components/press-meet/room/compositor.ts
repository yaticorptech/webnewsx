import { drawBrandMark, drawPlaceholder, drawVideo, loadPhoto, preloadBrandMark } from "./brand-mark";
import { startTicker } from "./ticker";

const FPS = 24;

/**
 * The organizer's outgoing picture (owner 2026-10-01): their camera with the WebNEWS mark at the top right, drawn on a
 * canvas whose stream is what reporters receive — so the mark is part of the video itself (and of every recording).
 * Camera off shows their photo card instead; switching cameras swaps the source without renegotiating. The canvas
 * follows the camera's orientation (portrait on a phone held upright).
 */
export class Compositor {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly video: HTMLVideoElement;
  private readonly stopTicker: () => void;
  private photo: HTMLImageElement | null = null;
  private cameraOn = true;
  readonly track: MediaStreamTrack;

  constructor(
    camera: MediaStream | null,
    private readonly person: { name: string; image: string | null },
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 1280;
    this.canvas.height = 720;
    this.ctx = this.canvas.getContext("2d", { alpha: false })!;
    this.video = document.createElement("video");
    this.video.muted = true;
    this.video.playsInline = true;
    this.setCamera(camera);
    void preloadBrandMark();
    void loadPhoto(person.image).then((photo) => {
      this.photo = photo;
    });
    this.draw();
    this.track = this.canvas.captureStream(FPS).getVideoTracks()[0]!;
    this.stopTicker = startTicker(FPS, () => this.draw());
  }

  /** A new camera stream (switched front/back) — or null for none. */
  setCamera(camera: MediaStream | null): void {
    this.video.srcObject = camera;
    if (camera) void this.video.play().catch(() => {});
  }

  setCameraOn(on: boolean): void {
    this.cameraOn = on;
  }

  private draw(): void {
    const { video, canvas, ctx } = this;
    const live = this.cameraOn && video.srcObject !== null && video.videoWidth > 0;
    if (live) {
      const portrait = video.videoHeight > video.videoWidth;
      const [w, h] = portrait ? [720, 1280] : [1280, 720];
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }
    const { width, height } = canvas;
    if (!live || !drawVideo(ctx, video, width, height, "cover")) {
      drawPlaceholder(ctx, width, height, { name: this.person.name, photo: this.photo }, "Camera is off");
    }
    drawBrandMark(ctx, width, height);
  }

  stop(): void {
    this.stopTicker();
    this.track.stop();
    this.video.srcObject = null;
  }
}
