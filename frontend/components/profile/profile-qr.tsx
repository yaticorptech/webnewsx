"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "@/components/ui/toast";
import { hasShareToApp, isNativeApp, nativeSharePlugin, shareFileUri, shareToApp } from "@/lib/native-app";
import { SPEED_BARS, SPEED_VIEWBOX } from "@/components/brand/speed-lines";
import { cn } from "@/lib/utils";

/*
 * Profile QR (owner 2026-10-14): sharing a profile shows its QR code next to the person in the Dispatch sheet, and
 * sharing OUTSIDE WebNEWS sends a QR card image (QR + name + handle + link) instead of a bare link. Inside WebNEWS
 * (chats) the profile is still sent as before.
 */

const INK = "#16181d";
const BRAND = "#E30613";

/**
 * The address that goes into QR codes and shared links (owner 2026-10-15: a scanned QR must OPEN the profile — with
 * localhost in it, phones could only copy the text): NEXT_PUBLIC_SHARE_URL (the deployed domain; the phone relay in
 * dev), else the site URL unless it's a localhost one, else this page's own address.
 */
function shareOrigin(): string {
  const configured = (process.env.NEXT_PUBLIC_SHARE_URL ?? "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
  if (site && !/\/\/(localhost|127\.0\.0\.1)(:|$)/.test(site)) return site;
  return window.location.origin;
}

export const profileUrl = (username: string) => `${shareOrigin()}/${username}`;

/** The profile's QR as a data URL (PNG), or null while it's drawn. */
export function useProfileQr(username: string): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void QRCode.toDataURL(profileUrl(username), { margin: 1, width: 320, errorCorrectionLevel: "H", color: { dark: INK, light: "#ffffff" } }).then(
      (url) => live && setSrc(url),
      () => live && setSrc(null),
    );
    return () => {
      live = false;
    };
  }, [username]);
  return src;
}

/**
 * The profile QR with WebNEWS's three bars in a white square at its centre (owner 2026-10-15). Drawn at error
 * correction "H" (30% may be covered), so the logo never stops it scanning.
 */
export function ProfileQr({ username, size = 56, className }: { username: string; size?: number; className?: string }) {
  const src = useProfileQr(username);
  const pad = size >= 120 ? 10 : 4;
  return (
    <span
      className={cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-border", className)}
      style={{ width: size, height: size, padding: pad }}
    >
      {src ? (
        <>
          <img src={src} alt={`QR code for @${username}'s profile`} width={size - pad * 2} height={size - pad * 2} className="size-full" />
          {/* The WebNEWS app logo (owner 2026-10-15): white bars on a red rounded square, a white gap around it. */}
          <span
            aria-hidden
            className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[24%] bg-brand ring-white"
            style={{ width: size * 0.22, height: size * 0.22, boxShadow: `0 0 0 ${Math.max(2, size * 0.02)}px #fff` }}
          >
            <svg viewBox={SPEED_VIEWBOX} className="w-[64%]">
              {SPEED_BARS.map((points) => (
                <polygon key={points} points={points} fill="#ffffff" />
              ))}
            </svg>
          </span>
        </>
      ) : (
        <span aria-hidden className="size-full animate-pulse rounded bg-surface-2" />
      )}
    </span>
  );
}

/** The WebNEWS app logo (white bars on a red rounded square, a white gap around it) at the centre of a canvas QR. */
function drawQrLogo(ctx: CanvasRenderingContext2D, x: number, y: number, box: number) {
  const tile = box * 0.22;
  const gap = box * 0.02;
  const tx = x + (box - tile) / 2;
  const ty = y + (box - tile) / 2;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(tx - gap, ty - gap, tile + gap * 2, tile + gap * 2, (tile + gap * 2) * 0.24);
  ctx.fill();
  ctx.fillStyle = BRAND;
  ctx.beginPath();
  ctx.roundRect(tx, ty, tile, tile, tile * 0.24);
  ctx.fill();
  // The bars' box is x 8–60, y 9–54 (SPEED_VIEWBOX): 64% of the tile wide, centred.
  const w = tile * 0.64;
  const scale = w / 52;
  const ox = tx + (tile - w) / 2 - 8 * scale;
  const oy = ty + (tile - 45 * scale) / 2 - 9 * scale;
  ctx.fillStyle = "#ffffff";
  for (const points of SPEED_BARS) {
    const pts = points.split(" ").map((pair) => pair.split(",").map(Number) as [number, number]);
    ctx.beginPath();
    pts.forEach(([px, py], index) => (index === 0 ? ctx.moveTo(ox + px * scale, oy + py * scale) : ctx.lineTo(ox + px * scale, oy + py * scale)));
    ctx.closePath();
    ctx.fill();
  }
}

/** Loads an image for the canvas; null when it can't be used (missing, or a host without CORS — never taints). */
function loadImage(src: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** The three bars as a canvas path at (x, y), `w` wide. */
function barsPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  const scale = w / 52;
  for (const points of SPEED_BARS) {
    const pts = points.split(" ").map((pair) => pair.split(",").map(Number) as [number, number]);
    ctx.beginPath();
    pts.forEach(([px, py], index) => {
      const cx = x + (px - 8) * scale;
      const cy = y + (py - 9) * scale;
      if (index === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.closePath();
    ctx.fill();
  }
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > max) out = out.slice(0, -1);
  return `${out}…`;
}

/**
 * The 1080×1350 share card (owner 2026-10-15: "more attractive and professional, with the logo"): the WebNEWS logo and
 * tagline on a soft brand fade, the person's photo in a red ring, name and @handle, the QR in a white panel with red
 * scanner corners (the black bars at its centre), and a dark footer with "Scan to open the profile" and the link.
 */
async function qrCard(name: string, username: string, image?: string | null): Promise<Blob> {
  const url = profileUrl(username);
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const font = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  const [logo, photo] = await Promise.all([loadImage("/brand/logo-light.svg"), loadImage(image)]);

  // Background: white, a soft brand fade at the top, faint big bars in the corner.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  const fade = ctx.createLinearGradient(0, 0, 0, 520);
  fade.addColorStop(0, "#fdecec");
  fade.addColorStop(1, "#ffffff");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, 520);
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = BRAND;
  barsPath(ctx, W - 330, -30, 420);
  ctx.globalAlpha = 1;
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, W, 12);

  // The logo and "• PULSE OF THE PUBLIC".
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (logo) {
    const lw = 430;
    const lh = (lw * 148.5) / 1276.8;
    ctx.drawImage(logo, (W - lw) / 2, 62, lw, lh);
  } else {
    ctx.fillStyle = INK;
    ctx.font = `900 64px ${font}`;
    ctx.fillText("WebNEWS", W / 2, 92);
  }
  ctx.font = `800 20px ${font}`;
  ctx.fillStyle = "#3a3f4b";
  const tagline = "P U L S E   O F   T H E   P U B L I C";
  const tw = ctx.measureText(tagline).width;
  ctx.fillText(tagline, W / 2 + 10, 148);
  ctx.fillStyle = BRAND;
  ctx.beginPath();
  ctx.arc(W / 2 - tw / 2 - 8, 148, 6, 0, Math.PI * 2);
  ctx.fill();

  // The person: photo in a red ring (initial when there's none), name, @handle.
  const cx = W / 2;
  const cy = 278;
  const r = 78;
  ctx.fillStyle = BRAND;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (photo) {
    const side = Math.min(photo.naturalWidth, photo.naturalHeight);
    ctx.drawImage(photo, (photo.naturalWidth - side) / 2, (photo.naturalHeight - side) / 2, side, side, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = "#fbe3e3";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = BRAND;
    ctx.font = `800 72px ${font}`;
    ctx.fillText((name.trim()[0] ?? "W").toUpperCase(), cx, cy + 4);
  }
  ctx.restore();

  ctx.fillStyle = INK;
  ctx.font = `800 56px ${font}`;
  ctx.fillText(fitText(ctx, name, W - 160), W / 2, 418);
  ctx.fillStyle = "#6b7079";
  ctx.font = `600 34px ${font}`;
  ctx.fillText(`@${username}`, W / 2, 470);

  // The QR in a white panel with a soft shadow and red scanner corners.
  const panel = 560;
  const px = (W - panel) / 2;
  const py = 528;
  ctx.save();
  ctx.shadowColor = "rgba(22, 24, 29, 0.14)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(px, py, panel, panel, 36);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#ececf0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(px, py, panel, panel, 36);
  ctx.stroke();

  const corner = 64;
  const gap = 22;
  ctx.strokeStyle = BRAND;
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  const [l, t, rr, b] = [px - gap, py - gap, px + panel + gap, py + panel + gap];
  for (const [x0, y0, dx, dy] of [
    [l, t, 1, 1],
    [rr, t, -1, 1],
    [l, b, 1, -1],
    [rr, b, -1, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x0, y0 + dy * corner);
    ctx.lineTo(x0, y0);
    ctx.lineTo(x0 + dx * corner, y0);
    ctx.stroke();
  }

  const qrSize = 480;
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, url, { margin: 0, width: qrSize, errorCorrectionLevel: "H", color: { dark: INK, light: "#ffffff" } });
  const qx = (W - qrSize) / 2;
  const qy = py + (panel - qrSize) / 2;
  ctx.drawImage(qr, qx, qy, qrSize, qrSize);
  drawQrLogo(ctx, qx, qy, qrSize);

  // Footer: dark band, red bars, the call to action and the link.
  const fy = 1170;
  ctx.fillStyle = INK;
  ctx.fillRect(0, fy, W, H - fy);
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, fy, W, 6);
  ctx.fillStyle = BRAND;
  barsPath(ctx, 84, fy + 54, 78);
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 40px ${font}`;
  ctx.fillText("Scan to open the profile on WebNEWS", 196, fy + 70);
  ctx.fillStyle = "#a7acb8";
  ctx.font = `500 28px ${font}`;
  ctx.fillText(fitText(ctx, url.replace(/^https?:\/\//, ""), W - 260), 196, fy + 122);

  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't draw the QR"))), "image/png"));
}

const fileName = (username: string) => `webnews-${username.replace(/[^a-z0-9._-]/gi, "")}-qr.png`;

function download(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

/**
 * Outside WebNEWS: share the QR card image (with the link as text) — the app's share sheet, a phone browser's, or
 * (computers) download the image and copy the link.
 */
export async function shareProfileQr(name: string, username: string, image?: string | null): Promise<void> {
  const url = profileUrl(username);
  const title = `${name} (@${username}) on WebNEWS`;
  const text = `${title}\n${url}`;
  try {
    const blob = await qrCard(name, username, image);
    const plugin = nativeSharePlugin();
    if (isNativeApp() && plugin) {
      const uri = await shareFileUri(blob, fileName(username));
      if (uri) {
        await plugin.share({ title, text, files: [uri], dialogTitle: "Share profile QR" });
        return;
      }
    }
    const file = new File([blob], fileName(username), { type: "image/png" });
    if (window.matchMedia("(pointer: coarse)").matches && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title, text });
      return;
    }
    // Computers: never a download here (owner 2026-10-14: only "Download QR" downloads) — the QR goes on the clipboard.
    if (await copyQrImage(blob)) {
      toast.success("Profile QR copied", { description: "Paste it (Ctrl/⌘ + V) in any chat or post.", id: "share-profile" });
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success("Profile link copied", { description: url.replace(/^https?:\/\//, ""), id: "share-profile" });
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    if (/cancel/i.test(error instanceof Error ? error.message : String(error))) return;
    toast.error("Couldn't share the QR", { description: url, id: "share-profile" });
  }
}

/** The QR card on the clipboard as an image (computers), so it can be pasted into a chat. False where not supported. */
async function copyQrImage(blob: Blob): Promise<boolean> {
  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

/** Download only (the "Download QR" button). */
export async function downloadProfileQr(name: string, username: string, image?: string | null): Promise<void> {
  try {
    const blob = await qrCard(name, username, image);
    const plugin = nativeSharePlugin();
    if (isNativeApp() && plugin) {
      const uri = await shareFileUri(blob, fileName(username));
      if (uri) {
        await plugin.share({ title: "Save profile QR", files: [uri], dialogTitle: "Save profile QR" });
        return;
      }
    }
    download(blob, fileName(username));
    toast.success("Profile QR downloaded", { id: "share-profile" });
  } catch (error) {
    if (/cancel/i.test(error instanceof Error ? error.message : String(error))) return;
    toast.error("Couldn't make the QR", { id: "share-profile" });
  }
}

/** The apps under "Outside WebNEWS" (owner 2026-10-14): the profile goes there as its QR card. */
export type QrApp = "whatsapp" | "instagram" | "facebook";

const APP_PACKAGES: Record<QrApp, readonly string[]> = {
  whatsapp: ["com.whatsapp", "com.whatsapp.w4b"],
  instagram: ["com.instagram.android"],
  facebook: ["com.facebook.katana"],
};
const APP_NAMES: Record<QrApp, string> = { whatsapp: "WhatsApp", instagram: "Instagram", facebook: "Facebook" };

/**
 * Share the QR card to one app (owner 2026-10-14: straight to that app's chat / new message, where the user picks who
 * gets it — never a download):
 * - the WebNEWS app: opens WhatsApp / Instagram / Facebook itself with the QR card attached;
 * - a phone browser: the share sheet with the QR card (pick the app there; a browser can't attach a picture to one app);
 * - a computer: the QR card goes on the clipboard and the app's chat opens (WhatsApp with the link written in) — paste
 *   the QR there with Ctrl/⌘ + V.
 */
export async function shareProfileQrTo(app: QrApp, name: string, username: string, image?: string | null): Promise<void> {
  const url = profileUrl(username);
  const text = `${name} (@${username}) on WebNEWS\n${url}`;
  const chat =
    app === "whatsapp"
      ? `https://wa.me/?text=${encodeURIComponent(text)}`
      : app === "instagram"
        ? "https://www.instagram.com/direct/new/"
        : "https://www.facebook.com/messages/new/";
  try {
    const blob = await qrCard(name, username, image);
    if (hasShareToApp()) {
      const uri = await shareFileUri(blob, fileName(username)).catch(() => null);
      if (await shareToApp(APP_PACKAGES[app], text, uri)) return;
      toast.error(`${APP_NAMES[app]} isn't installed`, { id: "share-profile" });
      return;
    }
    const file = new File([blob], fileName(username), { type: "image/png" });
    if (window.matchMedia("(pointer: coarse)").matches && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text });
      return;
    }
    const copied = await copyQrImage(blob);
    // No "noopener" feature here: with it window.open always returns null, so a blocked pop-up couldn't be told apart.
    const opened = window.open(chat, "_blank");
    if (opened) opened.opener = null;
    toast.success(copied ? `QR copied — paste it in ${APP_NAMES[app]}` : `Opening ${APP_NAMES[app]}`, {
      description: copied ? "Pick who gets it, then press Ctrl/⌘ + V to send the QR." : "Pick who gets it and send the link.",
      id: "share-profile",
      ...(opened ? {} : { action: { label: `Open ${APP_NAMES[app]}`, href: chat } }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    if (/cancel/i.test(error instanceof Error ? error.message : String(error))) return;
    toast.error("Couldn't share the QR", { id: "share-profile" });
  }
}
