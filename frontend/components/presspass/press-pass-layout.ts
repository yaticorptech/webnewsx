/*
 * Where everything sits on the Press Pass card (owner's reference 2026-10-08, "same to same"): the card is the
 * reference artwork (public/brand/press-pass-card.jpg — red panel, "PRESS PASS", wordmark, globe, skyline, QR) and
 * the holder's own details are drawn over it at these spots, measured in the artwork's own pixels (1438 × 862).
 * The on-screen card (press-pass-card.tsx) turns them into percentages; the PNG (press-pass-image.ts) draws at
 * this size. Patches are the flat areas painted over the reference's sample details before ours go on.
 */

export const CARD_W = 1438;
export const CARD_H = 862;
export const CARD_RADIUS = 32;
export const CARD_ART = "/brand/press-pass-card.jpg";

export type Rect = { x: number; y: number; w: number; h: number };

export const LAYOUT = {
  photo: { x: 148, y: 222, w: 331, h: 353, radius: 24 },
  /** Over the sample's REPORTER · name · handle (its edges feather out by `feather` so no rectangle shows). */
  namePatch: { x: 505, y: 272, w: 395, h: 168, from: "#fcfafa", to: "#fbf5f5", feather: 12 },
  reporterLabel: { x: 530, top: 288, baseline: 305, size: 18 },
  name: { x: 534, top: 328, baseline: 369, size: 44, maxW: 430, badge: 44 },
  handle: { x: 530, top: 390, baseline: 412, size: 24 },
  /** Over the sample's region · languages row (icons, labels and values are all redrawn). */
  rowPatch: { x: 262, y: 592, w: 800, h: 92, from: "#fcf9f9", to: "#fbf6f6", feather: 12 },
  pin: { x: 279, y: 617, w: 26, h: 41 },
  region: { x: 344, labelTop: 612, labelBaseline: 627, valueTop: 636, valueBaseline: 657, maxW: 310 },
  divider1: { x: 660, y: 608, h: 60 },
  globe: { x: 716, y: 617, w: 44, h: 43 },
  languages: { x: 803, labelTop: 612, labelBaseline: 627, valueTop: 636, valueBaseline: 657, maxW: 240 },
  smallLabel: 16,
  value: 22,
  /** Over the sample's PASS NO. · ISSUED ON. */
  passPatch: { x: 262, y: 722, w: 630, h: 104, from: "#fcf8f8", to: "#fbf9f9", feather: 12 },
  passNo: { x: 279, labelTop: 742, labelBaseline: 757, valueTop: 772, valueBaseline: 798, size: 28 },
  divider2: { x: 560, y: 740, h: 66 },
  issued: { x: 602 },
  barcodePatch: { x: 885, y: 718, w: 335, h: 112, from: "#f9f9f9", to: "#f9f9f9", feather: 8 },
  barcode: { x: 901, y: 734, w: 297, h: 80 },
} as const;

/** Percent of the card's width / height, for the on-screen card. */
export const px = (x: number) => `${((x / CARD_W) * 100).toFixed(3)}%`;
export const py = (y: number) => `${((y / CARD_H) * 100).toFixed(3)}%`;
/**
 * Font size that scales with the card (container width). From 640px up it never goes under `minRem` (the card sets
 * `--pp-floor` to 1); on phones the floor is off (0) so every field keeps the reference's proportions, like a photo of
 * the card — the full-size viewer (press-pass-zoom.tsx) is where it's read.
 */
export const fs = (size: number, minRem = 0.5) => `max(calc(var(--pp-floor, 1) * ${minRem}rem), ${((size / CARD_W) * 100).toFixed(3)}cqw)`;
export const rect = (r: Rect) => ({ left: px(r.x), top: py(r.y), width: px(r.w), height: py(r.h) });
/** A length in the card's own pixels that scales with it (container width units). */
export const cq = (n: number) => `${((n / CARD_W) * 100).toFixed(3)}cqw`;

export type Patch = Rect & { from: string; to: string; feather: number };
