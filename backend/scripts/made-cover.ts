/**
 * A WebNEWSX-made cover (owner 2026-11-05: "if image is not open source … create one"): a deep tone per category, a
 * fine grid, the category kicker, the headline and the WebNEWSX mark. 1600×900 JPEG.
 */
import sharp from "sharp";
import type { Category } from "../src/shared/contracts.js";

const escape = (text: string) => text.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
const TONES: Partial<Record<Category, [string, string]>> = {
  karnataka: ["#3b0a0d", "#9e1b1f"],
  world: ["#0d1b2a", "#274060"],
  business: ["#10231c", "#2f5d4a"],
  sports: ["#1d1a10", "#6b5a1e"],
  national: ["#1f1410", "#5a3a2a"],
  technology: ["#141626", "#3a3f6b"],
  entertainment: ["#22121f", "#5d2a55"],
  cinema: ["#1e1022", "#4e2a5d"],
  education: ["#0f1f24", "#2a5560"],
  politics: ["#241413", "#6a2f2a"],
  crime: ["#161616", "#3d3d46"],
  "press-releases": ["#14202a", "#36566e"],
  jobs: ["#1a2414", "#46613a"],
  astrology: ["#1b1430", "#463a78"],
  others: ["#201b14", "#5a4a32"],
};
const KICKER: Partial<Record<Category, string>> = { karnataka: "ಕರ್ನಾಟಕ" };

function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if ((line + " " + word).trim().length > max && line) {
      lines.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

export async function makeCover(story: { title: string; language: string; category: Category | string }): Promise<Buffer> {
  const [from, to] = TONES[story.category as Category] ?? ["#1a1a1a", "#4a4a4a"];
  const font = story.language === "kn" ? "Kannada Sangam MN, Noto Sans Kannada" : "Georgia, Times New Roman";
  const lines = wrap(story.title, story.language === "kn" ? 30 : 34);
  const kicker = KICKER[story.category as Category] ?? story.category.replace(/-/g, " ").toUpperCase();
  const text = lines
    .map((l, i) => `<text x="96" y="${430 + i * 92}" font-family="${font}" font-size="68" font-weight="700" fill="#fff">${escape(l)}</text>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>
    <pattern id="p" width="64" height="64" patternUnits="userSpaceOnUse"><path d="M64 0H0V64" fill="none" stroke="#fff" stroke-opacity=".05"/></pattern></defs>
    <rect width="1600" height="900" fill="url(#g)"/><rect width="1600" height="900" fill="url(#p)"/>
    <circle cx="1380" cy="180" r="320" fill="#fff" fill-opacity=".04"/><circle cx="1380" cy="180" r="200" fill="#fff" fill-opacity=".04"/>
    <rect x="96" y="300" width="8" height="56" fill="#E30613"/>
    <text x="124" y="342" font-family="${font}" font-size="34" font-weight="700" fill="#fff" fill-opacity=".85" letter-spacing="4">${escape(kicker)}</text>
    ${text}
    <text x="96" y="830" font-family="Helvetica, Arial" font-size="30" font-weight="700" fill="#fff"><tspan fill="#E30613">Web</tspan>NEWSX</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

