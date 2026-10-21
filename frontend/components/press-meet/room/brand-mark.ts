/*
 * The WebNEWS mark drawn onto video (owner 2026-10-01): top right of the organizer's camera, and of reporters'
 * recordings — the red bars icon and the wordmark (white "Web", red "NEWS") on a dark see-through pill.
 */

const ICON_SRC = "/brand/icon.svg";
const WORDMARK_SRC = "/brand/logo-dark.svg";
const WORDMARK_ASPECT = 1276.8 / 148.5;

type Images = { icon: HTMLImageElement; wordmark: HTMLImageElement };
let loading: Promise<Images> | null = null;
let loaded: Images | null = null;

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(img);
    img.src = src;
  });
}

/** Loads the two images once (call early; drawing before they arrive just skips the mark). */
export function preloadBrandMark(): Promise<Images> {
  loading ??= Promise.all([load(ICON_SRC), load(WORDMARK_SRC)]).then(([icon, wordmark]) => {
    loaded = { icon, wordmark };
    return loaded;
  });
  return loading;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws the mark in the top-right corner of a W×H frame, sized to the frame. */
export function drawBrandMark(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  if (!loaded) {
    void preloadBrandMark();
    return;
  }
  const { icon, wordmark } = loaded;
  const short = Math.min(width, height);
  const h = Math.max(22, Math.round(short * 0.055));
  const pad = Math.round(h * 0.42);
  const iconSize = h;
  const wordH = Math.round(h * 0.62);
  const wordW = Math.round(wordH * WORDMARK_ASPECT);
  const pillW = pad + iconSize + Math.round(pad * 0.7) + wordW + pad;
  const pillH = h + pad;
  const margin = Math.round(short * 0.035);
  const x = width - margin - pillW;
  const y = margin;
  ctx.save();
  ctx.fillStyle = "rgba(10, 12, 16, 0.55)";
  roundRect(ctx, x, y, pillW, pillH, pillH / 2);
  ctx.fill();
  if (icon.naturalWidth > 0) ctx.drawImage(icon, x + pad, y + pad / 2, iconSize, iconSize);
  if (wordmark.naturalWidth > 0) ctx.drawImage(wordmark, x + pad + iconSize + Math.round(pad * 0.7), y + (pillH - wordH) / 2, wordW, wordH);
  ctx.restore();
}

/** The app's UI font for canvas text (next/font gives it a generated family name). */
export function uiFontFamily(): string {
  if (typeof document === "undefined") return "sans-serif";
  return getComputedStyle(document.body).fontFamily || "sans-serif";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "W";
}

/**
 * "Camera off" card in the house style: dark backdrop with faint red speed bars, the person's photo (or initials) in a
 * red ring, their name.
 */
export function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  person: { name: string; photo: HTMLImageElement | null },
  caption: string,
): void {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#14171d");
  gradient.addColorStop(1, "#0b0d11");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Speed bars, bottom right.
  const unit = Math.min(width, height) * 0.12;
  ctx.save();
  ctx.fillStyle = "rgba(227, 6, 19, 0.16)";
  for (let i = 0; i < 3; i++) {
    const y = height - unit * (3.4 - i * 1.05);
    const x = width - unit * 4.6;
    ctx.beginPath();
    ctx.moveTo(x + unit * 0.9, y);
    ctx.lineTo(x + unit * 4.6, y);
    ctx.lineTo(x + unit * 3.7, y + unit * 0.65);
    ctx.lineTo(x, y + unit * 0.65);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  const short = Math.min(width, height);
  const r = short * 0.16;
  const cx = width / 2;
  const cy = height / 2 - short * 0.06;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r + short * 0.012, 0, Math.PI * 2);
  ctx.fillStyle = "#e30613";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = "#252a32";
  ctx.fill();
  if (person.photo && person.photo.naturalWidth > 0) {
    ctx.clip();
    ctx.drawImage(person.photo, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${Math.round(r * 0.8)}px ${uiFontFamily()}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials(person.name), cx, cy + r * 0.04);
  }
  ctx.restore();

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${Math.round(short * 0.05)}px ${uiFontFamily()}`;
  ctx.fillText(person.name, cx, cy + r + short * 0.05, width * 0.9);
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.font = `600 ${Math.round(short * 0.032)}px ${uiFontFamily()}`;
  ctx.fillText(caption, cx, cy + r + short * 0.12, width * 0.9);
  ctx.restore();
}

/** Draws a video frame scaled to cover (fill, cropping) or contain (fit, bars) a W×H frame. Returns the drawn box. */
export function drawVideo(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
  mode: "cover" | "contain",
): { x: number; y: number; w: number; h: number } | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || video.readyState < 2) return null;
  const scale = mode === "cover" ? Math.max(width / vw, height / vh) : Math.min(width / vw, height / vh);
  const w = vw * scale;
  const h = vh * scale;
  const x = (width - w) / 2;
  const y = (height - h) / 2;
  ctx.drawImage(video, x, y, w, h);
  return { x, y, w, h };
}

/**
 * Loads the person's photo for the placeholder — same-origin only (a photo from another site would "taint" the canvas
 * and stop it being streamed or recorded). Null when there's none or it fails.
 */
export function loadPhoto(src: string | null): Promise<HTMLImageElement | null> {
  if (!src || !src.startsWith("/") || src.startsWith("//")) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
