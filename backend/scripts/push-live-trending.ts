/**
 * 15 trending stories for the LIVE site (owner 2026-11-05: "push latest 15 articles with 2 from the webnews.in account,
 * remaining all other reporters; Karnataka articles in Kannada"). News of 3–5 Nov 2026, rewritten in our own words.
 * Photo: an open-licence Wikimedia Commons photo when one is found (credited in the body); otherwise a cover made here
 * (owner: "if image is not open source … create one"). Idempotent by title. Dry run by default; `--apply` writes.
 *
 *   railway run -s Postgres -- sh -c 'LIVE_DB="$DATABASE_PUBLIC_URL" railway run -s api -- sh -c \
 *     "DATABASE_URL=\$LIVE_DB node --import tsx scripts/push-live-trending.ts --apply"'
 */
import { eq, inArray } from "drizzle-orm";
import { closeDatabase, db } from "../src/db/client.js";
import { article, user } from "../src/db/schema.js";
import { htmlToExcerptText, htmlToText, makeExcerpt, readingMinutes } from "../src/lib/format.js";
import { processImage } from "../src/lib/images.js";
import { sanitizeArticleHtml } from "../src/lib/sanitize.js";
import { isLinkCollision, makeShortCode, makeSlug } from "../src/lib/slug.js";
import { newImageKey, storage } from "../src/lib/storage.js";
import { makeCover as drawCover } from "./made-cover.js";
import type { Category, PosterTemplate } from "../src/shared/contracts.js";

const APPLY = process.argv.includes("--apply");
const COMMONS = "https://commons.wikimedia.org/w/api.php";
const HEADERS = { "User-Agent": "WebNewsX-editorial-seed/1.0 (https://www.webnewsx.com)" };
const OPEN = /^(CC BY(-SA)? [\d.]+|CC0|Public domain)/i;
const TEMPLATES: PosterTemplate[] = ["classic", "full-bleed", "red-band", "split", "slant", "magazine", "breaking"];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const escape = (text: string) => text.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

type Story = {
  by: string; // username
  language: "kn" | "en";
  category: Category;
  district?: string;
  subcategory?: string;
  title: string;
  blurb: string;
  photo: string[];
  paragraphs: string[];
};

const STORIES: Story[] = [
  /* ───────── webnews.in (2) ───────── */
  {
    by: "webnews.in",
    language: "kn",
    category: "karnataka",
    title: "ಇಂದಿನಿಂದ ಸರ್ಕಾರಿ ಬಸ್ ಪ್ರಯಾಣ ದರ ಏರಿಕೆ: ಕೆಎಸ್‌ಆರ್‌ಟಿಸಿ, ಬಿಎಂಟಿಸಿ ಹೊಸ ದರ ಜಾರಿ",
    blurb: "ನವೆಂಬರ್ 5ರಿಂದ ರಾಜ್ಯದ ಸಾರಿಗೆ ನಿಗಮಗಳ ಪರಿಷ್ಕೃತ ದರ; ಪ್ರಯಾಣಕ್ಕೂ ಮುನ್ನ ಹೊಸ ದರ ಪರಿಶೀಲಿಸಿ.",
    photo: ["KSRTC bus Karnataka", "BMTC bus Bangalore", "Karnataka State Road Transport Corporation bus"],
    paragraphs: [
      "ರಾಜ್ಯ ಸರ್ಕಾರಿ ಸಾರಿಗೆ ಬಸ್‌ಗಳ ಪ್ರಯಾಣ ದರ ನವೆಂಬರ್ 5ರಿಂದ ಏರಿಕೆಯಾಗಿದೆ. ಸಾರಿಗೆ ಸಚಿವರು ಈ ನಿರ್ಧಾರವನ್ನು ಖಚಿತಪಡಿಸಿದ್ದು, ಕೆಎಸ್‌ಆರ್‌ಟಿಸಿ ಹಾಗೂ ಬೆಂಗಳೂರಿನ ಬಿಎಂಟಿಸಿ ಸೇರಿದಂತೆ ಸಾರಿಗೆ ನಿಗಮಗಳ ಪರಿಷ್ಕೃತ ದರಪಟ್ಟಿ ಪ್ರಕಟವಾಗಿದೆ.",
      "ನಗರ ಸಂಚಾರ, ಸಾಮಾನ್ಯ, ವೇಗದೂತ ಹಾಗೂ ಪ್ರೀಮಿಯಂ ಬಸ್‌ಗಳ ದರಗಳಲ್ಲಿ ಬದಲಾವಣೆಯಾಗಿದೆ. ದಿನನಿತ್ಯ ಕೆಲಸ, ಶಾಲೆ–ಕಾಲೇಜಿಗೆ ಬಸ್ ಅವಲಂಬಿಸಿರುವ ಲಕ್ಷಾಂತರ ಪ್ರಯಾಣಿಕರ ತಿಂಗಳ ಖರ್ಚಿನ ಮೇಲೆ ಇದರ ನೇರ ಪರಿಣಾಮ ಬೀಳಲಿದೆ.",
      "ಏರುತ್ತಿರುವ ಇಂಧನ ಹಾಗೂ ನಿರ್ವಹಣಾ ವೆಚ್ಚದ ಹಿನ್ನೆಲೆಯಲ್ಲಿ ದರ ಪರಿಷ್ಕರಣೆ ಮಾಡಲಾಗಿದೆ ಎಂದು ಸರ್ಕಾರ ಹೇಳಿದೆ. ಇದೇ ವಾರ ಬೆಂಗಳೂರಿನ ಹೋಟೆಲ್‌ಗಳೂ ಊಟ–ತಿಂಡಿ ದರ ಏರಿಸಿರುವುದರಿಂದ ನಗರವಾಸಿಗಳಿಗೆ ಎರಡು ಕಡೆಯ ಹೊರೆ ಎದುರಾಗಿದೆ.",
      "ಪಾಸ್ ಹೊಂದಿರುವವರು ಹಾಗೂ ದೂರದ ಊರಿಗೆ ಮುಂಗಡ ಟಿಕೆಟ್ ಕಾಯ್ದಿರಿಸಿದವರು ತಮ್ಮ ಟಿಕೆಟ್‌ಗೆ ಹೊಸ ದರ ಅನ್ವಯಿಸುತ್ತದೆಯೇ ಎಂಬುದನ್ನು ನಿಲ್ದಾಣದ ಕೌಂಟರ್ ಅಥವಾ ನಿಗಮಗಳ ಅಧಿಕೃತ ವೆಬ್‌ಸೈಟ್‌ನಲ್ಲಿ ಪರಿಶೀಲಿಸುವುದು ಸೂಕ್ತ.",
    ],
  },
  {
    by: "webnews.in",
    language: "kn",
    category: "karnataka",
    title: "ಕನ್ನಡ ಬಾವುಟಕ್ಕೆ ಅಧಿಕೃತ ರಾಜ್ಯ ಧ್ವಜದ ಸ್ಥಾನ: ಕಾನೂನು ಚೌಕಟ್ಟು ತರಲು ಸರ್ಕಾರ ಬದ್ಧ ಎಂದ ಸಿಎಂ ಡಿ.ಕೆ. ಶಿವಕುಮಾರ್",
    blurb: "ಚಳಿಗಾಲದ ಅಧಿವೇಶನದ ವೇಳೆಗೆ ಸರ್ಕಾರಿ ಕಟ್ಟಡಗಳ ಮೇಲೆ ಹಳದಿ–ಕೆಂಪು ಬಾವುಟ ಹಾರಿಸುವ ಗುರಿ.",
    photo: [],
    paragraphs: [
      "ಹಳದಿ–ಕೆಂಪು ಕನ್ನಡ ಬಾವುಟಕ್ಕೆ ಅಧಿಕೃತ ರಾಜ್ಯ ಧ್ವಜದ ಸ್ಥಾನ ನೀಡಲು ಕಾನೂನು ಚೌಕಟ್ಟು ರೂಪಿಸಲು ಸರ್ಕಾರ ಬದ್ಧವಾಗಿದೆ ಎಂದು ಮುಖ್ಯಮಂತ್ರಿ ಡಿ.ಕೆ. ಶಿವಕುಮಾರ್ ಕನ್ನಡ ರಾಜ್ಯೋತ್ಸವದ ದಿನ ಘೋಷಿಸಿದರು.",
      "ಮುಂಬರುವ ಚಳಿಗಾಲದ ಅಧಿವೇಶನದ ವೇಳೆಗೆ ಸರ್ಕಾರಿ ಕಟ್ಟಡಗಳ ಮೇಲೆ ರಾಷ್ಟ್ರ ಲಾಂಛನದ ಜೊತೆಯಲ್ಲೇ ಕನ್ನಡ ಬಾವುಟ ಹಾರುವಂತೆ ಮಾಡುವುದು ಸರ್ಕಾರದ ಉದ್ದೇಶ. ನಾಡಗೀತೆಯಂತೆಯೇ ಬಾವುಟವೂ ಕನ್ನಡಿಗರ ಸ್ವಾಭಿಮಾನದ ಸಂಕೇತ ಎಂದು ಮುಖ್ಯಮಂತ್ರಿ ಹೇಳಿದರು.",
      "ಕನ್ನಡ ಬಾವುಟಕ್ಕೆ ಅಧಿಕೃತ ಮಾನ್ಯತೆ ನೀಡಬೇಕೆಂಬ ಬೇಡಿಕೆ ಹಲವು ವರ್ಷಗಳಿಂದ ಕನ್ನಡಪರ ಸಂಘಟನೆಗಳಿಂದ ಕೇಳಿಬರುತ್ತಿದೆ. ಪ್ರತಿ ನವೆಂಬರ್‌ನಲ್ಲಿ ರಾಜ್ಯದ ಬೀದಿಗಳು, ವಾಹನಗಳು ಮತ್ತು ಶಾಲೆಗಳಲ್ಲಿ ಹಾರಾಡುವ ಈ ಬಾವುಟ ಈಗಾಗಲೇ ಜನಮನದಲ್ಲಿ ರಾಜ್ಯದ ಗುರುತಾಗಿ ನೆಲೆಸಿದೆ.",
      "ಘೋಷಣೆ ಸದ್ಯಕ್ಕೆ ಯೋಜನೆಯ ಹಂತದಲ್ಲಿದ್ದು, ಮಸೂದೆಯ ಕರಡು ಹಾಗೂ ಅದನ್ನು ಮಂಡಿಸುವ ದಿನಾಂಕ ಇನ್ನೂ ಪ್ರಕಟವಾಗಿಲ್ಲ. ಅಧಿವೇಶನದಲ್ಲಿ ಈ ವಿಷಯ ಹೇಗೆ ಚರ್ಚೆಗೆ ಬರಲಿದೆ ಎಂಬುದರತ್ತ ಎಲ್ಲರ ಕಣ್ಣು ನೆಟ್ಟಿದೆ.",
    ],
  },
  /* ───────── Karnataka, Kannada ───────── */
  {
    by: "gowda.saanvi",
    language: "kn",
    category: "karnataka",
    district: "Mysuru",
    title: "ರಾಜ್ಯೋತ್ಸವ ಪ್ರಶಸ್ತಿ 2026: 71 ಸಾಧಕರಿಗೆ ಗೌರವ, ಮೈಸೂರು ಜಿಲ್ಲೆಯ ಐವರಿಗೆ ಪುರಸ್ಕಾರ",
    blurb: "ಪ್ರಶಸ್ತಿ ಪುರಸ್ಕೃತರಲ್ಲಿ 12 ಮಹಿಳೆಯರು; ತಲಾ ₹5 ಲಕ್ಷ ನಗದು ಮತ್ತು 25 ಗ್ರಾಂ ಚಿನ್ನದ ಪದಕ.",
    photo: ["Mysore Palace", "Ravindra Kalakshetra Bangalore", "Mysuru"],
    paragraphs: [
      "ರಾಜ್ಯ ಸರ್ಕಾರ 2026ನೇ ಸಾಲಿನ ಕನ್ನಡ ರಾಜ್ಯೋತ್ಸವ ಪ್ರಶಸ್ತಿಗೆ ವಿವಿಧ ಕ್ಷೇತ್ರಗಳ 71 ಸಾಧಕರನ್ನು ಆಯ್ಕೆ ಮಾಡಿದೆ. ಪುರಸ್ಕೃತರಲ್ಲಿ ನಿವೃತ್ತ ಐಎಎಸ್ ಅಧಿಕಾರಿಯೊಬ್ಬರು ಸೇರಿದಂತೆ 12 ಮಹಿಳೆಯರಿದ್ದಾರೆ ಎಂದು ಕನ್ನಡ ಮತ್ತು ಸಂಸ್ಕೃತಿ ಸಚಿವ ಶಿವರಾಜ ತಂಗಡಗಿ ತಿಳಿಸಿದ್ದಾರೆ.",
      "ಪ್ರಶಸ್ತಿಯು ₹5 ಲಕ್ಷ ನಗದು ಹಾಗೂ 25 ಗ್ರಾಂ ಚಿನ್ನದ ಪದಕವನ್ನು ಒಳಗೊಂಡಿದೆ. ಸಾಹಿತ್ಯ, ಸಂಗೀತ, ರಂಗಭೂಮಿ, ಪತ್ರಿಕೋದ್ಯಮ, ಪರಿಸರ, ಸಮಾಜಸೇವೆ ಮುಂತಾದ ಕ್ಷೇತ್ರಗಳ ಸಾಧಕರು ಪಟ್ಟಿಯಲ್ಲಿದ್ದಾರೆ.",
      "ಮೈಸೂರು ಜಿಲ್ಲೆಯಿಂದ ಐವರು ಆಯ್ಕೆಯಾಗಿದ್ದಾರೆ: ಇತಿಹಾಸ ತಜ್ಞ ಪ್ರೊ. ಎನ್.ಎಸ್. ರಂಗರಾಜು, ಪತ್ರಕರ್ತರಾಗಿ ಪರಿಸರ ಹೋರಾಟಕ್ಕೆ ಹೊರಳಿದ ಆರ್. ಸ್ವಾಮಿ ಆನಂದ್, ಸಂಗೀತಗಾರ ಸಿ.ಎ. ಶ್ರೀಧರ್ ಹಾಗೂ ರಂಗಭೂಮಿ ಕಲಾವಿದರಾದ ಕೆ.ಆರ್. ಸುಮತಿ ಮತ್ತು ಹೊನ್ನ ನಾಯಕ್.",
      "ಉಡುಪಿಯ ಬಿ.ವಿ. ಆಚಾರ್ಯ ಅವರೂ ಪ್ರಶಸ್ತಿ ಪಟ್ಟಿಯಲ್ಲಿದ್ದಾರೆ. ಜಿಲ್ಲೆಗೆ ಐದು ಪ್ರಶಸ್ತಿ ಬಂದಿರುವುದು ಮೈಸೂರಿನ ಸಾಂಸ್ಕೃತಿಕ ವಲಯದಲ್ಲಿ ಸಂಭ್ರಮ ಮೂಡಿಸಿದೆ.",
    ],
  },
  {
    by: "vihaan.gowda",
    language: "kn",
    category: "karnataka",
    title: "ಬರ ಪರಿಹಾರ: ₹22,400 ಕೋಟಿ ನೆರವು ಕೋರಿ ಪ್ರಧಾನಿ ಮೋದಿಗೆ ಡಿಸಿಎಂ ಪರಮೇಶ್ವರ ಪತ್ರ",
    blurb: "ಬರದಿಂದ ಬೆಳೆ ನಷ್ಟ ಅನುಭವಿಸಿದ ರೈತರಿಗೆ ಕೇಂದ್ರದ ನೆರವು ಶೀಘ್ರ ಬಿಡುಗಡೆ ಮಾಡುವಂತೆ ರಾಜ್ಯದ ಮನವಿ.",
    photo: [],
    paragraphs: [
      "ರಾಜ್ಯದ ಬರಪೀಡಿತ ಪ್ರದೇಶಗಳಿಗೆ ₹22,400 ಕೋಟಿ ಪರಿಹಾರ ಬಿಡುಗಡೆ ಮಾಡುವಂತೆ ಕೋರಿ ಉಪಮುಖ್ಯಮಂತ್ರಿ ಡಾ. ಜಿ. ಪರಮೇಶ್ವರ ಅವರು ಪ್ರಧಾನಿ ನರೇಂದ್ರ ಮೋದಿ ಅವರಿಗೆ ಪತ್ರ ಬರೆದಿದ್ದಾರೆ.",
      "ಮಳೆಯ ಕೊರತೆಯಿಂದ ಅನೇಕ ತಾಲ್ಲೂಕುಗಳಲ್ಲಿ ಬೆಳೆ ನಷ್ಟ, ಕುಡಿಯುವ ನೀರು ಹಾಗೂ ಜಾನುವಾರು ಮೇವಿನ ಸಮಸ್ಯೆ ಎದುರಾಗಿದ್ದು, ಕೇಂದ್ರದ ನೆರವು ಇಲ್ಲದೆ ರೈತರಿಗೆ ತಕ್ಷಣದ ಪರಿಹಾರ ಒದಗಿಸುವುದು ಕಷ್ಟ ಎಂಬುದು ರಾಜ್ಯದ ವಾದ.",
      "ರಾಷ್ಟ್ರೀಯ ವಿಪತ್ತು ಪರಿಹಾರ ನಿಧಿಯಿಂದ ಹಣ ಬಿಡುಗಡೆ ವಿಚಾರದಲ್ಲಿ ರಾಜ್ಯ ಮತ್ತು ಕೇಂದ್ರದ ನಡುವೆ ಹಿಂದೆಯೂ ಜಟಾಪಟಿ ನಡೆದಿದೆ. ಹೀಗಾಗಿ ಈ ಬಾರಿಯ ಮನವಿಗೆ ಕೇಂದ್ರ ಎಷ್ಟು ಬೇಗ ಸ್ಪಂದಿಸುತ್ತದೆ ಎಂಬುದು ರೈತ ಸಂಘಟನೆಗಳ ಕುತೂಹಲ.",
      "ಕೇಂದ್ರ ತಂಡದ ಸಮೀಕ್ಷೆ ಹಾಗೂ ಮುಂದಿನ ಪ್ರಕ್ರಿಯೆಯ ಬಗ್ಗೆ ಇನ್ನೂ ಅಧಿಕೃತ ಮಾಹಿತಿ ಹೊರಬಿದ್ದಿಲ್ಲ.",
    ],
  },
  {
    by: "aadhav.shetty",
    language: "kn",
    category: "karnataka",
    district: "Bengaluru Urban",
    title: "ಬೆಂಗಳೂರು ಸ್ಕಿಲ್ ಸಮ್ಮಿಟ್ 2026: ಉದ್ಯೋಗ ಕೌಶಲಕ್ಕೆ ಮೂರು ದಿನಗಳ ವೇದಿಕೆ, ಸಿಎಂ ಚಾಲನೆ",
    blurb: "ದಿ ಲಲಿತ್ ಅಶೋಕ್‌ನಲ್ಲಿ ನವೆಂಬರ್ 3ರಿಂದ 5ರವರೆಗೆ ಎರಡನೇ ಆವೃತ್ತಿ; ಸಚಿವರು, ಉದ್ಯಮ ನಾಯಕರು ಭಾಗಿ.",
    photo: ["Bangalore skyline", "Bengaluru tech park", "Bangalore city"],
    paragraphs: [
      "ಯುವಜನರ ಉದ್ಯೋಗ ಕೌಶಲ ಹೆಚ್ಚಿಸುವ ಉದ್ದೇಶದ ‘ಬೆಂಗಳೂರು ಸ್ಕಿಲ್ ಸಮ್ಮಿಟ್ 2026’ರ ಎರಡನೇ ಆವೃತ್ತಿಗೆ ನಗರದ ದಿ ಲಲಿತ್ ಅಶೋಕ್ ಹೋಟೆಲ್‌ನಲ್ಲಿ ಚಾಲನೆ ದೊರೆಯಿತು. ಮೂರು ದಿನಗಳ ಸಮಾವೇಶ ನವೆಂಬರ್ 3ರಿಂದ 5ರವರೆಗೆ ನಡೆಯುತ್ತಿದೆ.",
      "ಉದ್ಘಾಟನಾ ಸಮಾರಂಭದಲ್ಲಿ ಮುಖ್ಯಮಂತ್ರಿ ಡಿ.ಕೆ. ಶಿವಕುಮಾರ್ ಮಾತನಾಡಿದರು. ರಾಜ್ಯದ ಸಚಿವರು, ಉದ್ಯಮ ಕ್ಷೇತ್ರದ ಪ್ರಮುಖರು ಹಾಗೂ ಶಿಕ್ಷಣ ಸಂಸ್ಥೆಗಳ ಪ್ರತಿನಿಧಿಗಳು ಸಮಾವೇಶದಲ್ಲಿ ಭಾಗವಹಿಸಿದ್ದಾರೆ.",
      "ಕೃತಕ ಬುದ್ಧಿಮತ್ತೆ, ಉತ್ಪಾದನೆ, ಆರೋಗ್ಯ ಸೇವೆ ಮುಂತಾದ ವಲಯಗಳಲ್ಲಿ ಬೇಡಿಕೆಯಲ್ಲಿರುವ ಕೌಶಲಗಳು ಹಾಗೂ ಉದ್ಯಮ–ಶಿಕ್ಷಣ ಸಂಸ್ಥೆಗಳ ಸಹಭಾಗಿತ್ವದ ಬಗ್ಗೆ ಗೋಷ್ಠಿಗಳು ನಡೆಯುತ್ತಿವೆ.",
      "ಪದವಿ ಪಡೆದರೂ ಉದ್ಯೋಗಕ್ಕೆ ಬೇಕಾದ ಕೌಶಲದ ಕೊರತೆ ಎದುರಿಸುತ್ತಿರುವ ವಿದ್ಯಾರ್ಥಿಗಳಿಗೆ ಇಂತಹ ವೇದಿಕೆಗಳು ಉದ್ಯಮದ ನಿರೀಕ್ಷೆಗಳನ್ನು ನೇರವಾಗಿ ತಿಳಿಯುವ ಅವಕಾಶ ಒದಗಿಸುತ್ತವೆ.",
    ],
  },
  {
    by: "shetty.aadhya",
    language: "kn",
    category: "karnataka",
    district: "Udupi",
    title: "ದೀಪಾವಳಿ ಹೊಸ್ತಿಲಲ್ಲಿ ಉಡುಪಿ, ಮಂಗಳೂರಿನಲ್ಲಿ ತರಕಾರಿ–ಹಣ್ಣು ದುಬಾರಿ; ಉಡುಪಿಯಲ್ಲಿ ರಾಜ್ಯದಲ್ಲೇ ಹೆಚ್ಚು ಮಳೆ",
    blurb: "ಹಬ್ಬದ ಖರೀದಿಗೆ ಬೆಲೆ ಏರಿಕೆಯ ಬಿಸಿ; 24 ಗಂಟೆಗಳಲ್ಲಿ ಉಡುಪಿಯಲ್ಲಿ 90 ಮಿ.ಮೀ, ದಕ್ಷಿಣ ಕನ್ನಡದಲ್ಲಿ 56.5 ಮಿ.ಮೀ ಮಳೆ.",
    photo: ["Vegetable market India", "Udupi market", "Indian vegetable vendor"],
    paragraphs: [
      "ದೀಪಾವಳಿ ಹಬ್ಬ ಸಮೀಪಿಸುತ್ತಿದ್ದಂತೆ ಉಡುಪಿ ಹಾಗೂ ಮಂಗಳೂರಿನ ಮಾರುಕಟ್ಟೆಗಳಲ್ಲಿ ತರಕಾರಿ ಮತ್ತು ಹಣ್ಣುಗಳ ಬೆಲೆ ಏರಿಕೆಯಾಗಿದೆ. ಹಬ್ಬದ ಅಡುಗೆ ಹಾಗೂ ಪೂಜೆಗೆ ಬೇಕಾದ ವಸ್ತುಗಳನ್ನು ಖರೀದಿಸಲು ಬಂದ ಗ್ರಾಹಕರು ಬೆಲೆ ಕೇಳಿ ಕಡಿಮೆ ಪ್ರಮಾಣದಲ್ಲಿ ಕೊಳ್ಳುತ್ತಿದ್ದಾರೆ.",
      "ಹಬ್ಬದ ಬೇಡಿಕೆ ಜೊತೆಗೆ ಹೊರ ಜಿಲ್ಲೆಗಳಿಂದ ಬರುವ ಸರಕಿನ ಪೂರೈಕೆಯಲ್ಲಿನ ಏರಿಳಿತ ಬೆಲೆ ಹೆಚ್ಚಳಕ್ಕೆ ಕಾರಣ ಎನ್ನಲಾಗಿದೆ. ಹಬ್ಬ ಮುಗಿದ ನಂತರ ಬೆಲೆ ಸ್ವಲ್ಪ ಇಳಿಯುವ ನಿರೀಕ್ಷೆ ಇದೆ.",
      "ಇದರ ನಡುವೆ ಕರಾವಳಿಯಲ್ಲಿ ಮಳೆ ಮುಂದುವರಿದಿದೆ. ಕಳೆದ 24 ಗಂಟೆಗಳಲ್ಲಿ ಉಡುಪಿ ಜಿಲ್ಲೆಯಲ್ಲಿ 90 ಮಿ.ಮೀ ಮಳೆಯಾಗಿದ್ದು ರಾಜ್ಯದಲ್ಲೇ ಅತಿ ಹೆಚ್ಚು. ದಕ್ಷಿಣ ಕನ್ನಡದಲ್ಲಿ 56.5 ಮಿ.ಮೀ ಮಳೆ ದಾಖಲಾಗಿದೆ.",
      "ಮಳೆಯಿಂದಾಗಿ ರಸ್ತೆ ಬದಿಯ ಹಬ್ಬದ ವ್ಯಾಪಾರಕ್ಕೂ ಅಡ್ಡಿಯಾಗಿದ್ದು, ಹೂ ಹಾಗೂ ಹಣತೆ ಮಾರಾಟಗಾರರು ಹವಾಮಾನ ತಿಳಿಯಾಗುವ ನಿರೀಕ್ಷೆಯಲ್ಲಿದ್ದಾರೆ.",
    ],
  },
  {
    by: "gowda.saanvi",
    language: "kn",
    category: "karnataka",
    district: "Bengaluru Urban",
    title: "ಬೆಂಗಳೂರಿನ ಹೋಟೆಲ್‌ಗಳಲ್ಲಿ ಊಟ–ತಿಂಡಿ ಶೇ 10ರಿಂದ 15ರಷ್ಟು ದುಬಾರಿ",
    blurb: "ಕಚ್ಚಾ ವಸ್ತುಗಳ ಬೆಲೆ ಏರಿಕೆಯ ಕಾರಣ ನೀಡಿದ ಹೋಟೆಲ್ ಮಾಲೀಕರು; ಇಡ್ಲಿ, ದೋಸೆ, ಕಾಫಿ ಎಲ್ಲವೂ ತುಟ್ಟಿ.",
    photo: ["Masala dosa", "South Indian breakfast idli dosa", "Bangalore darshini restaurant"],
    paragraphs: [
      "ಬೆಂಗಳೂರಿನ ಹೋಟೆಲ್‌ಗಳಲ್ಲಿ ಊಟ–ತಿಂಡಿ ದರ ಶೇ 10ರಿಂದ 15ರಷ್ಟು ಏರಿಕೆಯಾಗಿದೆ. ಕಚ್ಚಾ ವಸ್ತುಗಳ ಬೆಲೆ ನಿರಂತರವಾಗಿ ಏರುತ್ತಿರುವುದರಿಂದ ದರ ಪರಿಷ್ಕರಣೆ ಅನಿವಾರ್ಯವಾಯಿತು ಎನ್ನುತ್ತಾರೆ ಹೋಟೆಲ್ ಮಾಲೀಕರು.",
      "ಅಡುಗೆ ಎಣ್ಣೆ, ಬೇಳೆ, ತರಕಾರಿ, ಹಾಲು ಹಾಗೂ ವಾಣಿಜ್ಯ ಸಿಲಿಂಡರ್ ವೆಚ್ಚದ ಜೊತೆಗೆ ಸಿಬ್ಬಂದಿ ಸಂಬಳ ಮತ್ತು ಬಾಡಿಗೆಯೂ ಹೆಚ್ಚಿರುವುದು ಸಣ್ಣ ದರ್ಶಿನಿಗಳಿಂದ ದೊಡ್ಡ ರೆಸ್ಟೋರೆಂಟ್‌ಗಳವರೆಗೆ ಎಲ್ಲರ ಮೇಲೂ ಒತ್ತಡ ಹೇರಿದೆ.",
      "ಹೊರಗೆ ತಿಂಡಿ ತಿನ್ನುವುದು ದಿನಚರಿಯ ಭಾಗವಾಗಿರುವ ಉದ್ಯೋಗಿಗಳು, ವಿದ್ಯಾರ್ಥಿಗಳು ಹಾಗೂ ಪಿಜಿ ನಿವಾಸಿಗಳಿಗೆ ಇದು ತಿಂಗಳ ಬಜೆಟ್‌ನಲ್ಲಿ ಗಮನಾರ್ಹ ಹೆಚ್ಚಳ. ಇದೇ ವಾರ ಸರ್ಕಾರಿ ಬಸ್ ದರವೂ ಏರಿರುವುದು ಹೊರೆಯನ್ನು ಇನ್ನಷ್ಟು ಹೆಚ್ಚಿಸಿದೆ.",
      "ಕೆಲವು ಹೋಟೆಲ್‌ಗಳು ಈಗಾಗಲೇ ಹೊಸ ದರಪಟ್ಟಿ ಅಳವಡಿಸಿಕೊಂಡಿದ್ದು, ಉಳಿದವು ಹಂತ ಹಂತವಾಗಿ ಜಾರಿಗೆ ತರುತ್ತಿವೆ.",
    ],
  },
  {
    by: "vihaan.gowda",
    language: "kn",
    category: "karnataka",
    district: "Bengaluru Urban",
    title: "ಫ್ರೀಡಂ ಪಾರ್ಕ್‌ನಲ್ಲಿ ಇಂದು ‘ಇಂಡಿಯಾ’ ಒಕ್ಕೂಟದ ಪ್ರತಿಭಟನೆ: ಮತದಾರರ ಪಟ್ಟಿ ಪರಿಷ್ಕರಣೆ ವಿರುದ್ಧ ಧ್ವನಿ",
    blurb: "ಎಸ್‌ಐಆರ್ ಹಾಗೂ ಮುಖ್ಯ ಚುನಾವಣಾ ಆಯುಕ್ತರ ರಾಜೀನಾಮೆ ವಿಷಯ ಮುಂದಿಟ್ಟು ವಿರೋಧ ಪಕ್ಷಗಳ ಒಕ್ಕೂಟದ ಧರಣಿ.",
    photo: ["Freedom Park Bangalore", "Bangalore protest", "Bengaluru Freedom Park"],
    paragraphs: [
      "ಮತದಾರರ ಪಟ್ಟಿಯ ವಿಶೇಷ ತೀವ್ರ ಪರಿಷ್ಕರಣೆ (ಎಸ್‌ಐಆರ್) ಹಾಗೂ ಮುಖ್ಯ ಚುನಾವಣಾ ಆಯುಕ್ತರ ರಾಜೀನಾಮೆಗೆ ಸಂಬಂಧಿಸಿದ ವಿಷಯಗಳನ್ನು ಮುಂದಿಟ್ಟುಕೊಂಡು ‘ಇಂಡಿಯಾ’ ಒಕ್ಕೂಟದ ಪಕ್ಷಗಳು ನವೆಂಬರ್ 5ರಂದು ಬೆಂಗಳೂರಿನ ಫ್ರೀಡಂ ಪಾರ್ಕ್‌ನಲ್ಲಿ ಪ್ರತಿಭಟನೆ ನಡೆಸಲಿವೆ.",
      "ಪರಿಷ್ಕರಣೆಯ ಪ್ರಕ್ರಿಯೆಯಲ್ಲಿ ಅರ್ಹ ಮತದಾರರ ಹೆಸರು ಕೈಬಿಡುವ ಆತಂಕವಿದೆ ಎಂಬುದು ಒಕ್ಕೂಟದ ಆರೋಪ. ಪ್ರಕ್ರಿಯೆ ಪಾರದರ್ಶಕವಾಗಿರಬೇಕು ಎಂದು ಪಕ್ಷಗಳು ಒತ್ತಾಯಿಸುತ್ತಿವೆ.",
      "ಒಕ್ಕೂಟದ ಅಂಗಪಕ್ಷಗಳ ರಾಜ್ಯ ನಾಯಕರು ಹಾಗೂ ಕಾರ್ಯಕರ್ತರು ಧರಣಿಯಲ್ಲಿ ಪಾಲ್ಗೊಳ್ಳುವ ನಿರೀಕ್ಷೆ ಇದೆ. ಫ್ರೀಡಂ ಪಾರ್ಕ್ ನಗರದ ನಿಗದಿತ ಪ್ರತಿಭಟನಾ ಸ್ಥಳವಾಗಿದ್ದು, ಸುತ್ತಮುತ್ತಲಿನ ರಸ್ತೆಗಳಲ್ಲಿ ಸಂಚಾರ ನಿಧಾನವಾಗುವ ಸಾಧ್ಯತೆ ಇದೆ.",
      "ಶೇಷಾದ್ರಿ ರಸ್ತೆ ಹಾಗೂ ಗಾಂಧಿನಗರದ ಕಡೆ ಸಂಚರಿಸುವವರು ಪರ್ಯಾಯ ಮಾರ್ಗ ಬಳಸುವುದು ಉತ್ತಮ.",
    ],
  },
  /* ───────── English ───────── */
  {
    by: "kulal.kian",
    language: "en",
    category: "world",
    subcategory: "Americas",
    title: "US midterms: Democrats win the House and head for a Senate majority",
    blurb: "Maine and Texas flip as President Trump's approval sits at 38%; Mississippi is separated by a few dozen votes.",
    photo: ["United States Capitol", "US Capitol building Washington", "Capitol Hill"],
    paragraphs: [
      "Democrats have won control of the US House of Representatives in the 2026 midterm elections and are on course to hold at least 54 Senate seats, according to projections on Wednesday. The results arrived with President Donald Trump's approval rating at 38%, historically low for a president at the midterms.",
      "Among the notable Senate flips, Democrat Troy Jackson defeated Republican Senator Susan Collins in Maine, and James Talarico beat Ken Paxton in Texas despite heavy spending in that race by Elon Musk. In the House, Democrats flipped California's 48th District among other seats.",
      "Some races remain too close to call. In Mississippi, Democrat Scott Colom led Senator Cindy Hyde-Smith by just 65 votes with about 95% of the count in, per AP estimates, while Alaska was also undecided.",
      "The fallout has begun in Washington: Speaker Mike Johnson said he will not seek re-election as House Republican leader, Vice President JD Vance blamed the losses on the Iran war, and Trump reportedly said he would accept the results. Markets in India and elsewhere had been watching the outcome for its effect on the administration's policy agenda.",
    ],
  },
  {
    by: "dhruv.bhat",
    language: "en",
    category: "business",
    subcategory: "Markets",
    title: "Sensex rises for a fifth straight session, closes at 77,301 — highest since late August",
    blurb: "Foreign inflows, softer crude and solid earnings lift the index, though it is still about 7% below a year ago.",
    photo: ["Bombay Stock Exchange building", "BSE building Mumbai", "Dalal Street Mumbai"],
    paragraphs: [
      "The BSE Sensex closed about 0.5% higher at 77,301 on Wednesday, its highest level since late August, extending its winning run to five straight sessions.",
      "Inflows from foreign funds, easing crude oil prices and a solid set of quarterly earnings supported sentiment. Lower crude is particularly welcome for India, which imports most of its oil, as it eases pressure on inflation and the rupee — which also steadied on central bank support.",
      "Investors kept a close eye on the US midterm elections, where a strong Democratic showing could challenge President Trump's policy agenda, including on trade.",
      "Despite the rally, the Sensex remains roughly 7% below where it stood a year ago, a reminder of how much ground the market lost over the past twelve months.",
    ],
  },
  {
    by: "riya.nayak",
    language: "en",
    category: "sports",
    subcategory: "Cricket",
    title: "Kohli's 74 steers India to a five-wicket win over New Zealand in the first ODI at Auckland",
    blurb: "India win on DLS with 56 balls to spare; Auqib Nabi and Anshul Kamboj get their chance in the XI.",
    photo: [],
    paragraphs: [
      "India opened the ODI series in New Zealand with a five-wicket victory in Auckland on Wednesday, winning on the DLS method with 56 balls to spare. Virat Kohli anchored the chase with 74.",
      "Auqib Nabi and Anshul Kamboj earned places in the XI for the opener, as the selectors run a split squad — some players are preparing with the red ball for the Test series that follows.",
      "The win comes after a closely fought T20I series between the two sides. The ODI series runs until November 15 in Tauranga, with the fourth match at Mount Maunganui on November 13.",
      "The two-Test series starts in Wellington on November 19, followed by the second Test in Christchurch from November 27.",
    ],
  },
  {
    by: "hegde.ananya",
    language: "en",
    category: "national",
    subcategory: "Other",
    title: "Supreme Court: laws penalising families with more than two children have lost relevance",
    blurb: "The court cites India's falling fertility rate; in another order it stays a Madras HC move to take over a temple's administration.",
    photo: ["Supreme Court of India", "Supreme Court of India building", "Supreme Court New Delhi"],
    paragraphs: [
      "The Supreme Court on Tuesday observed that laws penalising families with more than two children have lost their relevance, given the steady fall in India's fertility rate.",
      "Several states have used two-child norms over the years — for example as a condition for contesting local body elections or for certain government jobs and benefits. The court's observation adds weight to the argument that such rules no longer fit India's demographic reality.",
      "India's total fertility rate has fallen below the replacement level in recent national surveys, and many states, particularly in the south, now worry more about ageing populations than about rapid growth.",
      "In a separate matter the same day, the court stayed a Madras High Court order that would have taken over the administration of a temple.",
    ],
  },
  {
    by: "bhat.ishani",
    language: "en",
    category: "business",
    subcategory: "Agriculture",
    title: "India turns net importer of cotton as shipments cross $2 billion in FY27",
    blurb: "Once a leading exporter, India now buys more cotton than it sells — a shift that matters to farmers and textile mills alike.",
    photo: [],
    paragraphs: [
      "India has become a net importer of cotton, with imports crossing $2 billion in the 2026–27 financial year, marking a significant reversal for a country that was long among the world's leading cotton exporters.",
      "Falling yields, pest damage and farmers shifting to other crops have tightened domestic supply over several seasons, while the textile and garment industry's demand for quality fibre has kept growing.",
      "For mills, imports help secure steady supplies of specific grades. For growers in states such as Gujarat, Maharashtra, Telangana and Karnataka, the trend has renewed calls for better seed technology and support to lift productivity.",
      "How quickly India can rebuild its cotton output will shape both farm incomes and the competitiveness of its textile exports in the years ahead.",
    ],
  },
  {
    by: "aarush.poojary",
    language: "en",
    category: "technology",
    subcategory: "Mobiles",
    title: "November's big launches: Motorola Signature 27, Asus Zenbook 14, Xiaomi 18 Pro and iQOO 16",
    blurb: "Two launches land today; Vivo's X500 series is reported for the end of the month.",
    photo: ["Smartphones display", "Smartphone store India", "Laptop and smartphone"],
    paragraphs: [
      "November is shaping up as a busy month for gadget buyers in India. Motorola's Signature 27 makes its global debut on November 5, after being showcased at the India Mobile Congress 2026, though its India price and availability have not been announced yet.",
      "Asus launches its Zenbook 14 (2026) series in India at 12 pm on November 5, refreshing one of its most popular thin-and-light laptop lines.",
      "Xiaomi 18 Pro and iQOO 16 have also been confirmed for India, with full dates and specifications still to come for some of them. Vivo's X500 series is reported to arrive by the end of November, although Vivo has not officially announced a date.",
      "With the festive sales season still on, buyers planning an upgrade may find it worth waiting a few weeks to compare the new flagships.",
    ],
  },
  {
    by: "acharya.rithvik",
    language: "en",
    category: "entertainment",
    subcategory: "Other",
    title: "GTA 6 countdown: pre-loads open November 10 ahead of the November 19 release",
    blurb: "The most anticipated game of the decade is two weeks away; Indian gamers are clearing storage and checking their consoles.",
    photo: ["Video game controller", "PlayStation 5 controller", "Gaming setup"],
    paragraphs: [
      "Grand Theft Auto VI is set to launch on November 19, with pre-loads opening on November 10, ending one of the longest waits in gaming.",
      "The game returns the series to a fictional take on Miami and has broken viewing records with every trailer, making it the most anticipated release of the decade.",
      "India's gaming community — among the fastest growing in the world — has been counting down on social media, with many players upgrading consoles and internet plans ahead of the large download.",
      "Pre-loading lets players download the game in advance so that it can be played the moment it unlocks on launch day.",
    ],
  },
];

type CommonsPage = { title: string; imageinfo?: { thumburl?: string; descriptionurl: string; width: number; height: number; extmetadata?: Record<string, { value?: string }> }[] };

type Photo = { url: string; page: string; author: string; licence: string };
const IMAGE_PROPS = { prop: "imageinfo", iiprop: "url|extmetadata|size", iiurlwidth: "1600", format: "json", formatversion: "2" };

async function commonsPhoto(search: string): Promise<Photo | null> {
  const params = new URLSearchParams({ action: "query", generator: "search", gsrnamespace: "6", gsrsearch: `${search} filetype:bitmap`, gsrlimit: "20", ...IMAGE_PROPS });
  const res = await fetch(`${COMMONS}?${params}`, { headers: HEADERS, signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!res?.ok) return null;
  const pages = ((await res.json()) as { query?: { pages?: CommonsPage[] } }).query?.pages ?? [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    const licence = plain(info?.extmetadata?.LicenseShortName?.value ?? "");
    if (!info?.thumburl || !OPEN.test(licence) || info.width < 1200 || info.width < info.height) continue;
    return { url: info.thumburl, page: info.descriptionurl, author: plain(info.extmetadata?.Artist?.value ?? "") || "Wikimedia Commons", licence };
  }
  return null;
}

async function findPhoto(searches: string[]): Promise<{ photo: Photo; buffer: Buffer } | null> {
  for (const search of searches) {
    await pause(1_500);
    const photo = await commonsPhoto(search);
    if (!photo) continue;
    const image = await fetch(photo.url, { headers: HEADERS, signal: AbortSignal.timeout(60_000) }).catch(() => null);
    if (image?.ok) return { photo, buffer: Buffer.from(await image.arrayBuffer()) };
  }
  return null;
}

const CREDIT = { kn: "ಚಿತ್ರ", en: "Photo" } as const;
const MADE = { kn: "ಚಿತ್ರ: WebNEWSX ವಿನ್ಯಾಸ", en: "Image: WebNEWSX graphic" } as const;

async function main() {
  const usernames = [...new Set(STORIES.map((s) => s.by))];
  const authors = await db.select({ id: user.id, username: user.username }).from(user).where(inArray(user.username, usernames));
  const idOf = new Map(authors.map((a) => [a.username, a.id]));
  const missing = usernames.filter((u) => !idOf.has(u));
  if (missing.length) throw new Error(`Accounts not found: ${missing.join(", ")}`);

  let created = 0;
  for (const [index, story] of STORIES.entries()) {
    const [existing] = await db.select({ id: article.id }).from(article).where(eq(article.title, story.title)).limit(1);
    if (existing) {
      console.log(`· already there: ${story.title}`);
      continue;
    }
    const found = await findPhoto(story.photo);
    const source = found?.buffer ?? (await drawCover(story));
    console.log(`${index + 1}. [@${story.by} · ${story.language} · ${story.category}${story.district ? `/${story.district}` : ""}] ${story.title}\n   image: ${found ? `${found.photo.licence} ${found.photo.page}` : "made here (no open photo)"}`);
    if (!APPLY) continue;

    const authorId = idOf.get(story.by);
    if (!authorId) continue;
    const cover = await processImage(source, "cover");
    const articleImage = await processImage(source, "article");
    const coverKey = newImageKey("cover", authorId);
    const coverUrl = await storage.put(coverKey, cover.buffer, cover.contentType);
    const articleImageKey = newImageKey("cover", authorId);
    const articleImageUrl = await storage.put(articleImageKey, articleImage.buffer, articleImage.contentType);
    const credit = found
      ? `<p><em>${CREDIT[story.language]}: ${escape(found.photo.author)} · <a href="${escape(found.photo.page)}">Wikimedia Commons</a> · ${escape(found.photo.licence)}</em></p>`
      : `<p><em>${MADE[story.language]}</em></p>`;
    const bodyHtml = sanitizeArticleHtml(story.paragraphs.map((p) => `<p>${escape(p)}</p>`).join("") + credit);
    const bodyText = htmlToText(bodyHtml);
    // Newest first, 18 minutes apart, the latest a few minutes ago.
    const publishedAt = new Date(Date.now() - (index * 18 + 3) * 60_000);
    const values = {
      authorId,
      status: "published" as const,
      title: story.title,
      blurb: story.blurb,
      bodyHtml,
      bodyText,
      excerpt: makeExcerpt(htmlToExcerptText(bodyHtml)),
      readingMinutes: readingMinutes(bodyText),
      coverUrl,
      coverKey,
      coverWidth: cover.width,
      coverHeight: cover.height,
      coverBlur: cover.blurDataUrl,
      articleImageUrl,
      articleImageKey,
      articleImageWidth: articleImage.width,
      articleImageHeight: articleImage.height,
      articleImageBlur: articleImage.blurDataUrl,
      category: story.category,
      district: story.category === "karnataka" ? (story.district ?? null) : null,
      subcategory: story.category === "karnataka" ? null : (story.subcategory ?? null),
      language: story.language,
      template: TEMPLATES[index % TEMPLATES.length],
      createdAt: publishedAt,
      updatedAt: publishedAt,
      publishedAt,
    };
    for (let attempt = 0; ; attempt++) {
      try {
        await db.insert(article).values({ ...values, slug: makeSlug(story.title), shortCode: makeShortCode() });
        created++;
        break;
      } catch (error) {
        if (attempt < 3 && isLinkCollision(error)) continue;
        throw error;
      }
    }
  }
  console.log(APPLY ? `${created} stories published` : "dry run — nothing written (add --apply)");
}

try {
  await main();
} catch (error) {
  console.error("[push-live-trending] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
