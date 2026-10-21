/**
 * Generative demo artwork for the seed: abstract 16:9 editorial covers and round-friendly avatars in
 * the WebNEWS palette (red / black / graphite). No text, deterministic per seed number.
 */
import sharp from "sharp";

const W = 1600;
const H = 900;

const INK = "#0A0A0B";
const NIGHT = "#131315";
const GRAPHITE = ["#1B1B1E", "#26262B", "#34343A", "#4A4A52", "#6B6B74"] as const;
const RED = "#E30613";
const RED_DEEP = "#9E1B12";
const RED_BRIGHT = "#FF3B45";
const PAPER = "#F5F2EC";

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => n.toFixed(1);

/** `list[i]` with wrap-around (lists here are never empty). */
function at<T>(list: readonly T[], i: number): T {
  return list[((Math.floor(i) % list.length) + list.length) % list.length] as T;
}

function frame(defs: string, body: string, grain = 0.07): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    ${defs}
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
    <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
      <stop offset="60%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.55"/>
    </radialGradient>
  </defs>
  ${body}
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity="${grain}"/>
</svg>`;
}

/** Diagonal slices — the angled cut of the logo's "N". */
function slices(r: () => number): string {
  const angle = 18 + r() * 22;
  const bands: string[] = [];
  let x = -400 + r() * 200;
  const redIndex = 1 + Math.floor(r() * 3);
  for (let i = 0; i < 7; i++) {
    const w = 90 + r() * 260;
    const fill = i === redIndex ? RED : i === redIndex + 2 ? RED_DEEP : at(GRAPHITE, r() * GRAPHITE.length);
    const opacity = i === redIndex ? 1 : 0.55 + r() * 0.4;
    bands.push(`<rect x="${f(x)}" y="-400" width="${f(w)}" height="1800" fill="${fill}" opacity="${f(opacity)}"/>`);
    x += w + 30 + r() * 140;
  }
  const lines = Array.from({ length: 5 }, (_, i) => {
    const y = 120 + i * (18 + r() * 10);
    return `<rect x="${f(W * 0.62 + r() * 80)}" y="${f(y)}" width="${f(160 + r() * 260)}" height="6" fill="${i % 2 ? GRAPHITE[4] : RED_BRIGHT}" opacity="0.9"/>`;
  }).join("");
  return frame(
    `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${NIGHT}"/><stop offset="1" stop-color="${INK}"/></linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#bg)"/>
     <g transform="rotate(${f(angle)} ${W / 2} ${H / 2})">${bands.join("")}</g>
     ${lines}`,
  );
}

/** Concentric orbits around a red glow. */
function orbits(r: () => number): string {
  const cx = W * (0.25 + r() * 0.5);
  const cy = H * (0.3 + r() * 0.4);
  const rings = Array.from({ length: 9 }, (_, i) => {
    const radius = 60 + i * (48 + r() * 22);
    const color = i === 3 ? RED : at(GRAPHITE, (i % 3) + 2);
    const width = i === 3 ? 10 : 2 + r() * 3;
    const dash = i % 2 === 0 ? "" : ` stroke-dasharray="${f(4 + r() * 30)} ${f(8 + r() * 24)}"`;
    return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(radius)}" fill="none" stroke="${color}" stroke-width="${f(width)}"${dash} opacity="0.85"/>`;
  }).join("");
  const arcR = 300 + r() * 120;
  const start = r() * Math.PI;
  const end = start + 1.1 + r() * 0.9;
  const arc = `<path d="M ${f(cx + arcR * Math.cos(start))} ${f(cy + arcR * Math.sin(start))} A ${f(arcR)} ${f(arcR)} 0 0 1 ${f(cx + arcR * Math.cos(end))} ${f(cy + arcR * Math.sin(end))}" fill="none" stroke="${RED_BRIGHT}" stroke-width="22" stroke-linecap="round"/>`;
  return frame(
    `<radialGradient id="glow" cx="${f((cx / W) * 100)}%" cy="${f((cy / H) * 100)}%" r="45%">
       <stop offset="0" stop-color="${RED}" stop-opacity="0.95"/>
       <stop offset="0.35" stop-color="${RED_DEEP}" stop-opacity="0.55"/>
       <stop offset="1" stop-color="${INK}" stop-opacity="0"/>
     </radialGradient>`,
    `<rect width="${W}" height="${H}" fill="${INK}"/>
     <rect width="${W}" height="${H}" fill="url(#glow)"/>
     ${rings}${arc}`,
  );
}

/** Halftone dot field with a red hot-spot. */
function halftone(r: () => number): string {
  const step = 34;
  const hx = W * (0.2 + r() * 0.6);
  const hy = H * (0.2 + r() * 0.6);
  const tilt = r() * 0.8 - 0.4;
  const dots: string[] = [];
  for (let y = step / 2; y < H; y += step) {
    for (let x = step / 2; x < W; x += step) {
      const d = Math.hypot(x - hx, (y - hy) * 1.4) / 900;
      const wave = 0.5 + 0.5 * Math.sin((x * Math.cos(tilt) + y * Math.sin(tilt)) / 90);
      const radius = Math.max(0.8, (1 - d) * 13 * (0.55 + wave * 0.45));
      const hot = d < 0.28 + r() * 0.04;
      dots.push(`<circle cx="${x}" cy="${y}" r="${f(radius)}" fill="${hot ? RED : GRAPHITE[3]}" opacity="${hot ? 1 : f(0.35 + (1 - d) * 0.5)}"/>`);
    }
  }
  return frame("", `<rect width="${W}" height="${H}" fill="${NIGHT}"/>${dots.join("")}`, 0.05);
}

/** The icon's three slanted "speed line" bars, big, with motion trails. */
function speed(r: () => number): string {
  const scale = 9 + r() * 5;
  const ox = W * (0.45 + r() * 0.25);
  const oy = H * 0.5 - 32 * scale;
  const bar = (y: number, fill: string) =>
    `<polygon points="${[20, 9, 60, 9, 48, 20, 8, 20].map((v, i) => f(i % 2 === 0 ? ox + v * scale : oy + (v - 9 + y) * scale)).join(" ")}" fill="${fill}"/>`;
  const trails = Array.from({ length: 16 }, (_, i) => {
    const y = oy + (i / 15) * 50 * scale;
    const len = 200 + r() * 700;
    return `<rect x="${f(ox - len - 40)}" y="${f(y)}" width="${f(len)}" height="${f(2 + r() * 5)}" fill="${i % 5 === 2 ? RED_DEEP : GRAPHITE[2 + (i % 3)]}" opacity="${f(0.4 + r() * 0.5)}"/>`;
  }).join("");
  return frame(
    `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${INK}"/><stop offset="1" stop-color="${GRAPHITE[0]}"/></linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#bg)"/>${trails}${bar(9, RED)}${bar(26, RED)}${bar(43, RED_BRIGHT)}`,
  );
}

/** Topographic contour lines. */
function contours(r: () => number): string {
  const lines: string[] = [];
  const phase = r() * Math.PI * 2;
  const freq = 0.004 + r() * 0.003;
  const redLines = new Set([Math.floor(4 + r() * 6), Math.floor(12 + r() * 6)]);
  for (let i = 0; i < 22; i++) {
    const base = -60 + i * 46;
    const pts: string[] = [];
    for (let x = -20; x <= W + 20; x += 40) {
      // Small per-line phase/amplitude drift so neighbouring contours never cross.
      const y = base + Math.sin(x * freq + phase + i * 0.12) * (46 + i * 1.5) + Math.cos(x * freq * 2.3 + i * 0.2) * 18;
      pts.push(`${x},${f(y)}`);
    }
    const red = redLines.has(i);
    lines.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="${red ? RED : GRAPHITE[3]}" stroke-width="${red ? 7 : 2.5}" opacity="${red ? 1 : 0.8}" stroke-linejoin="round"/>`);
  }
  return frame(
    `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${GRAPHITE[0]}"/><stop offset="1" stop-color="${INK}"/></linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#bg)"/>${lines.join("")}`,
  );
}

/** Editorial block composition with hairline rules. */
function blocks(r: () => number): string {
  const cols = [0, 0.22 + r() * 0.1, 0.5 + r() * 0.12, 0.78 + r() * 0.08, 1].map((c) => c * W);
  const rows = [0, 0.3 + r() * 0.15, 0.62 + r() * 0.15, 1].map((c) => c * H);
  const redCell = Math.floor(r() * 12);
  const paperCell = (redCell + 5 + Math.floor(r() * 4)) % 12;
  const cells: string[] = [];
  let n = 0;
  for (let ri = 0; ri < 3; ri++) {
    for (let ci = 0; ci < 4; ci++, n++) {
      const x = at(cols, ci);
      const y = at(rows, ri);
      const w = at(cols, ci + 1) - x;
      const h = at(rows, ri + 1) - y;
      const fill = n === redCell ? RED : n === paperCell ? PAPER : at(GRAPHITE, r() * 3);
      cells.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}" opacity="${n === paperCell ? 0.9 : 1}"/>`);
      if (n === redCell) cells.push(`<circle cx="${f(x + w * 0.62)}" cy="${f(y + h * 0.5)}" r="${f(Math.min(w, h) * 0.28)}" fill="${INK}"/>`);
    }
  }
  const rules = [...cols.slice(1, -1).map((x) => `<rect x="${f(x - 4)}" y="0" width="8" height="${H}" fill="${INK}"/>`), ...rows.slice(1, -1).map((y) => `<rect x="0" y="${f(y - 4)}" width="${W}" height="8" fill="${INK}"/>`)];
  const slash = `<polygon points="${f(W * 0.55)},${H} ${f(W * 0.7)},0 ${f(W * 0.74)},0 ${f(W * 0.59)},${H}" fill="${RED_BRIGHT}" opacity="0.9"/>`;
  return frame("", `${cells.join("")}${rules.join("")}${slash}`, 0.06);
}

const COVER_STYLES = [slices, orbits, speed, contours, halftone, blocks] as const;

/** PNG bytes of an abstract 1600×900 cover. `style` picks the composition, `seed` its variation. */
export async function renderCover(style: number, seed: number): Promise<Buffer> {
  const draw = at(COVER_STYLES, style);
  return sharp(Buffer.from(draw(rng(seed * 7919 + style)))).png().toBuffer();
}

const AVATAR_BACKGROUNDS = [RED, INK, GRAPHITE[2], PAPER, RED_DEEP, NIGHT] as const;

/** PNG bytes of a 512×512 abstract avatar mark (distinct per index). */
export async function renderAvatar(index: number): Promise<Buffer> {
  const r = rng(index * 104729 + 17);
  const bg = at(AVATAR_BACKGROUNDS, index);
  const fg = bg === RED || bg === RED_DEEP ? INK : RED;
  const alt = bg === PAPER ? INK : PAPER;
  const marks = [
    // speed bars
    `<g transform="translate(96 96) scale(5)"><polygon points="20,9 60,9 48,20 8,20" fill="${fg}"/><polygon points="20,26 60,26 48,37 8,37" fill="${fg}"/><polygon points="20,43 60,43 48,54 8,54" fill="${alt}"/></g>`,
    // ring + dot
    `<circle cx="256" cy="256" r="150" fill="none" stroke="${fg}" stroke-width="44"/><circle cx="256" cy="256" r="46" fill="${alt}"/>`,
    // diagonal slice
    `<polygon points="120,420 300,92 392,92 212,420" fill="${fg}"/><circle cx="360" cy="360" r="40" fill="${alt}"/>`,
    // stacked rules
    `${[0, 1, 2, 3].map((i) => `<rect x="${110 + i * 20}" y="${140 + i * 64}" width="${260 - i * 30}" height="34" fill="${i === 1 ? alt : fg}"/>`).join("")}`,
    // quarter circles
    `<path d="M256 96 A160 160 0 0 1 416 256 L256 256 Z" fill="${fg}"/><path d="M256 416 A160 160 0 0 1 96 256 L256 256 Z" fill="${alt}"/>`,
    // pulse dot + arc
    `<circle cx="256" cy="256" r="64" fill="${fg}"/><path d="M120 256 A136 136 0 0 1 392 256" fill="none" stroke="${alt}" stroke-width="26" stroke-linecap="round"/>`,
  ];
  const mark = at(marks, index);
  const tilt = f(r() * 16 - 8);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="${bg}"/>
    <g transform="rotate(${tilt} 256 256)">${mark}</g>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
