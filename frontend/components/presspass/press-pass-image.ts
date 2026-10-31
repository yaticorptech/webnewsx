import { initialsOf } from "@/lib/utils";
import QRCode from "qrcode";
import { sameOriginMediaUrl } from "@/lib/media-url";
import { toast } from "@/components/ui/toast";
import { isNativeApp, nativeSharePlugin, saveFileToDevice, shareFileUri } from "@/lib/native-app";
import { barcodeBars, languageLabels, passDate } from "./press-format";
import type { PressPassCardData } from "./press-pass-card";
import { CARD_ART, CARD_H, CARD_RADIUS, CARD_W, LAYOUT, passVerifyUrl } from "./press-pass-layout";

/*
 * Renders the Press Pass as a PNG with the Canvas 2D API (no dependencies), the same card as on screen
 * (press-pass-card.tsx): the reference artwork with the holder's details drawn over it at the spots in
 * press-pass-layout.ts. Browser-only.
 */

const SCALE = 2;

const C = {
  ink: "#16181D",
  muted: "#6B7079",
  border: "#D7D9DE",
  tint: "#FCF5F5",
  brand: "#E30613",
  badge: "#1D9BF0",
} as const;

function loadImage(src: string, crossOrigin = true): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

type Ctx = CanvasRenderingContext2D & { letterSpacing?: string; fontStretch?: string };

function setFont(ctx: Ctx, weight: number, size: number, family: string, options: { tracking?: number; wide?: boolean } = {}) {
  ctx.font = `${weight} ${size}px ${family}`;
  if ("fontStretch" in ctx) ctx.fontStretch = options.wide ? "expanded" : "normal";
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${options.tracking ?? 0}px`;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function ellipsis(ctx: Ctx, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

/** A flat patch over the reference's sample details, its edges blurred into the artwork like the on-screen feather. */
function patch(ctx: Ctx, r: { x: number; y: number; w: number; h: number; from: string; to: string; feather: number }) {
  const g = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
  g.addColorStop(0, r.from);
  g.addColorStop(1, r.to);
  ctx.save();
  ctx.filter = `blur(${r.feather / 2}px)`;
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

function label(ctx: Ctx, text: string, x: number, baseline: number, family: string, color = C.muted) {
  setFont(ctx, 700, LAYOUT.smallLabel, family, { tracking: LAYOUT.smallLabel * 0.2 });
  ctx.fillStyle = color;
  ctx.fillText(text, x, baseline);
}

/** Lucide's map pin and globe, drawn as paths (24-unit icon box). */
function icon(ctx: Ctx, kind: "pin" | "globe", x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(w / 24, h / 24);
  ctx.strokeStyle = C.brand;
  ctx.lineWidth = 2.25;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (kind === "pin") {
    ctx.stroke(new Path2D("M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"));
    ctx.stroke(new Path2D("M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"));
  } else {
    ctx.stroke(new Path2D("M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"));
    ctx.stroke(new Path2D("M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"));
    ctx.stroke(new Path2D("M2 12h20"));
  }
  ctx.restore();
}

/** The finished Verified badge: a blue disc with a white check (the animated badge's final look). */
function badge(ctx: Ctx, x: number, y: number, size: number) {
  ctx.fillStyle = C.badge;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 11;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(new Path2D("M29 52 L44 66 L72 36"));
  ctx.restore();
}

export async function renderPressPassPng(data: PressPassCardData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W * SCALE;
  canvas.height = CARD_H * SCALE;
  const ctx = canvas.getContext("2d") as Ctx | null;
  if (!ctx) throw new Error("Canvas is not available in this browser");
  ctx.scale(SCALE, SCALE);

  const family = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  await Promise.all(
    ["900 44px", "800 28px", "700 22px", "700 16px"].map((spec) => document.fonts?.load(`${spec} ${family}`).catch(() => undefined)),
  );
  const [art, portrait] = await Promise.all([loadImage(CARD_ART, false), data.holder.image ? loadImage(sameOriginMediaUrl(data.holder.image) ?? data.holder.image, !sameOriginMediaUrl(data.holder.image)) : Promise.resolve(null)]);
  if (!art) throw new Error("Couldn't load the card artwork");

  const revoked = data.status === "revoked";
  const preview = data.status === "preview";
  const verified = !revoked && !preview && data.level === "verified";

  roundRect(ctx, 0, 0, CARD_W, CARD_H, CARD_RADIUS);
  ctx.save();
  ctx.clip();
  ctx.drawImage(art, 0, 0, CARD_W, CARD_H);

  patch(ctx, LAYOUT.namePatch);
  patch(ctx, LAYOUT.rowPatch);
  patch(ctx, LAYOUT.passPatch);
  patch(ctx, LAYOUT.barcodePatch);

  // Portrait
  const ph = LAYOUT.photo;
  ctx.save();
  roundRect(ctx, ph.x, ph.y, ph.w, ph.h, ph.radius);
  ctx.clip();
  ctx.fillStyle = C.tint;
  ctx.fillRect(ph.x, ph.y, ph.w, ph.h);
  let drawn = false;
  if (portrait) {
    // Cover-fit, centred.
    const scale = Math.max(ph.w / portrait.naturalWidth, ph.h / portrait.naturalHeight);
    const sw = ph.w / scale;
    const sh = ph.h / scale;
    const sx = (portrait.naturalWidth - sw) / 2;
    const sy = (portrait.naturalHeight - sh) / 2;
    try {
      ctx.drawImage(portrait, sx, sy, sw, sh, ph.x, ph.y, ph.w, ph.h);
      drawn = true;
    } catch {
      // A cross-origin photo without CORS can't be drawn: the initials below.
    }
  }
  if (!drawn) {
    setFont(ctx, 900, 96, family, { wide: true });
    ctx.fillStyle = C.brand;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initialsOf(data.holder.name), ph.x + ph.w / 2, ph.y + ph.h / 2);
    ctx.textAlign = "left";
  }
  ctx.restore();

  // REPORTER · name + badge · handle
  ctx.textBaseline = "alphabetic";
  setFont(ctx, 700, LAYOUT.reporterLabel.size, family, { tracking: LAYOUT.reporterLabel.size * 0.22 });
  ctx.fillStyle = C.brand;
  ctx.fillText(data.editorDesk ? "EDITOR DESK · REPORTER" : "REPORTER", LAYOUT.reporterLabel.x, LAYOUT.reporterLabel.baseline);

  const name = data.holder.name || "Your name";
  const badgeRoom = verified ? LAYOUT.name.badge + 16 : 0;
  let nameSize = LAYOUT.name.size;
  setFont(ctx, 900, nameSize, family, { wide: true, tracking: -1 });
  while (ctx.measureText(name).width > LAYOUT.name.maxW - badgeRoom && nameSize > 24) {
    nameSize -= 2;
    setFont(ctx, 900, nameSize, family, { wide: true, tracking: -1 });
  }
  const shownName = ellipsis(ctx, name, LAYOUT.name.maxW - badgeRoom);
  ctx.fillStyle = C.ink;
  ctx.fillText(shownName, LAYOUT.name.x, LAYOUT.name.baseline);
  if (verified) {
    const nameWidth = ctx.measureText(shownName).width;
    badge(ctx, LAYOUT.name.x + nameWidth + 14, LAYOUT.name.baseline - nameSize * 0.72, LAYOUT.name.badge);
  }

  setFont(ctx, 700, LAYOUT.handle.size, family);
  ctx.fillStyle = C.brand;
  ctx.fillText(ellipsis(ctx, `@${data.holder.username}`, LAYOUT.name.maxW), LAYOUT.handle.x, LAYOUT.handle.baseline);

  // Region · languages
  icon(ctx, "pin", LAYOUT.pin.x, LAYOUT.pin.y, LAYOUT.pin.w, LAYOUT.pin.h);
  label(ctx, "REGION", LAYOUT.region.x, LAYOUT.region.labelBaseline, family);
  setFont(ctx, 700, LAYOUT.value, family);
  ctx.fillStyle = data.region ? C.ink : C.muted;
  ctx.fillText(ellipsis(ctx, data.region ?? "—", LAYOUT.region.maxW), LAYOUT.region.x, LAYOUT.region.valueBaseline);
  ctx.fillStyle = C.border;
  ctx.fillRect(LAYOUT.divider1.x, LAYOUT.divider1.y, 1.5, LAYOUT.divider1.h);
  icon(ctx, "globe", LAYOUT.globe.x, LAYOUT.globe.y, LAYOUT.globe.w, LAYOUT.globe.h);
  label(ctx, "LANGUAGES", LAYOUT.languages.x, LAYOUT.languages.labelBaseline, family);
  const langs = languageLabels(data.languages).join(", ");
  setFont(ctx, 700, LAYOUT.value, family);
  ctx.fillStyle = langs ? C.ink : C.muted;
  ctx.fillText(ellipsis(ctx, langs || "—", LAYOUT.languages.maxW), LAYOUT.languages.x, LAYOUT.languages.valueBaseline);

  // Pass number · issue date
  label(ctx, "PASS NO.", LAYOUT.passNo.x, LAYOUT.passNo.labelBaseline, family);
  setFont(ctx, 800, LAYOUT.passNo.size, family, { wide: true, tracking: 1 });
  ctx.fillStyle = C.ink;
  ctx.fillText(data.passNumber, LAYOUT.passNo.x, LAYOUT.passNo.valueBaseline);
  ctx.fillStyle = C.border;
  ctx.fillRect(LAYOUT.divider2.x, LAYOUT.divider2.y, 1.5, LAYOUT.divider2.h);
  label(ctx, "ISSUED ON", LAYOUT.issued.x, LAYOUT.passNo.labelBaseline, family);
  setFont(ctx, 800, LAYOUT.passNo.size, family, { wide: true, tracking: 1 });
  ctx.fillStyle = C.ink;
  ctx.fillText(preview ? "ON SIGNING" : passDate(data.issuedAt), LAYOUT.issued.x, LAYOUT.passNo.valueBaseline);

  // The pass's own QR → its verify page (not on the preview, which has no number yet).
  if (!preview) {
    patch(ctx, LAYOUT.qrPatch);
    const q = LAYOUT.qr;
    const size = Math.min(q.w, q.h);
    const qr = await loadImage(await QRCode.toDataURL(passVerifyUrl(data.passNumber), { margin: 0, width: size * SCALE, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" } }), false);
    if (qr) ctx.drawImage(qr, q.x + (q.w - size) / 2, q.y + (q.h - size) / 2, size, size);
  }

  // Barcode
  const bc = LAYOUT.barcode;
  ctx.fillStyle = C.ink;
  for (const bar of barcodeBars(data.passNumber)) ctx.fillRect(bc.x + (bar.x / 100) * bc.w, bc.y, Math.max(1.5, (bar.w / 100) * bc.w), bc.h);

  ctx.restore();

  if (revoked) {
    // Match the on-screen greyscale treatment.
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px8 = image.data;
    for (let i = 0; i < px8.length; i += 4) {
      const grey = 0.3 * (px8[i] ?? 0) + 0.59 * (px8[i + 1] ?? 0) + 0.11 * (px8[i + 2] ?? 0);
      px8[i] = px8[i + 1] = px8[i + 2] = grey;
    }
    ctx.putImageData(image, 0, 0);
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't create the image"))), "image/png"),
  );
}

/** Renders the pass and saves it as `webnews-press-pass-<number>.png`. */
export async function downloadPressPass(data: PressPassCardData): Promise<void> {
  const blob = await renderPressPassPng(data);
  // The phone app's web view ignores download links (owner 2026-10-31): save it straight to the phone
  // (Documents/WebNEWS); only if that fails, the share sheet (Save to Photos / Files from there).
  const fileName = `webnews-press-pass-${data.passNumber.toLowerCase()}.png`;
  if (isNativeApp()) {
    if (await saveFileToDevice(blob, fileName)) {
      toast.success("Press Pass saved", { id: "press-pass-download", description: "In your phone's Documents › WebNEWS folder." });
      return;
    }
    const plugin = nativeSharePlugin();
    const uri = plugin ? await shareFileUri(blob, fileName) : null;
    if (plugin && uri) {
      try {
        await plugin.share({ title: "Save Press Pass", files: [uri], dialogTitle: "Save Press Pass" });
      } catch (error) {
        if (!/cancel/i.test(error instanceof Error ? error.message : String(error))) throw error;
      }
      return;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `webnews-press-pass-${data.passNumber.toLowerCase()}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Shares the pass (owner 2026-10-31: "both download and share"): the card image with its verify link — the phone's share
 * sheet in the app, the browser's where it can send files, else the verify link copied.
 */
export async function sharePressPass(data: PressPassCardData): Promise<void> {
  const blob = await renderPressPassPng(data);
  const fileName = `webnews-press-pass-${data.passNumber.toLowerCase()}.png`;
  const link = passVerifyUrl(data.passNumber);
  const text = `${data.holder.name} — WebNEWS Press Pass ${data.passNumber}\n${link}`;
  const cancelled = (error: unknown) => /cancel|abort/i.test(error instanceof Error ? `${error.name} ${error.message}` : String(error));
  const plugin = nativeSharePlugin();
  if (isNativeApp() && plugin) {
    const uri = await shareFileUri(blob, fileName);
    try {
      await plugin.share(uri ? { title: "WebNEWS Press Pass", text, files: [uri], dialogTitle: "Share Press Pass" } : { title: "WebNEWS Press Pass", text, url: link, dialogTitle: "Share Press Pass" });
    } catch (error) {
      if (!cancelled(error)) throw error;
    }
    return;
  }
  const file = new File([blob], fileName, { type: "image/png" });
  if (typeof navigator.share === "function") {
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ title: "WebNEWS Press Pass", text, files: [file] });
      else await navigator.share({ title: "WebNEWS Press Pass", text, url: link });
      return;
    } catch (error) {
      if (cancelled(error)) return;
    }
  }
  await navigator.clipboard?.writeText(link).catch(() => undefined);
  toast.success("Link copied", { id: "press-pass-share", description: "Anyone with it sees your Press Pass." });
}
