/**
 * Fresh Kannada and English stories for local development (owner 2026-10-22: "add new articles in Kannada and
 * English"). Original features written for WebNEWS about Karnataka and India — places, seasons, transport, sport, the
 * arts — across the categories, each with a photo from Wikimedia Commons under an open licence (CC BY / CC BY-SA /
 * CC0 / public domain) and the credit those licences ask for. Filed, in turn, by the demo Verified reporters who write
 * in that language (@demo.webnews.local — never real accounts), dated over the last day and a half so they lead the
 * feeds. Idempotent: a story already there (same title) is skipped. Local development only.
 *
 *   node --import tsx scripts/seed-fresh-stories.ts
 */
import { and, eq, isNotNull, isNull, like } from "drizzle-orm";
import { closeDatabase, db } from "../src/db/client.js";
import { DEMO_EMAIL_DOMAIN } from "../src/db/purge.js";
import { article, pressPass, user } from "../src/db/schema.js";
import { env } from "../src/env.js";
import { htmlToExcerptText, htmlToText, makeExcerpt, readingMinutes } from "../src/lib/format.js";
import { processImage } from "../src/lib/images.js";
import { sanitizeArticleHtml } from "../src/lib/sanitize.js";
import { isLinkCollision, makeShortCode, makeSlug } from "../src/lib/slug.js";
import { newImageKey, storage } from "../src/lib/storage.js";
import type { Category, PosterTemplate, PressLanguage } from "../src/shared/contracts.js";

const COMMONS = "https://commons.wikimedia.org/w/api.php";
const HEADERS = { "User-Agent": "WebNEWS-local-dev-seed/1.0" };
const OPEN = /^(CC BY(-SA)? [\d.]+|CC0|Public domain)/i;
/** Designs that need nothing but the photo (no reporter's own frame). */
const TEMPLATES: PosterTemplate[] = ["classic", "full-bleed", "red-band", "split", "slant", "magazine", "breaking"];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const escape = (text: string) => text.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

type Story = {
  language: Extract<PressLanguage, "kn" | "en">;
  title: string;
  /** Commons "File:…" titles or searches, tried in turn until one has an open, landscape photo. */
  photo: string[];
  category: Category;
  /** Karnataka stories: the district (KARNATAKA_DISTRICTS spelling). */
  district?: string;
  paragraphs: string[];
};

const STORIES: Story[] = [
  /* ─────────────── Kannada ─────────────── */
  {
    language: "kn",
    title: "ಮೈಸೂರು ಅರಮನೆಯ ದೀಪಾಲಂಕಾರ: ಲಕ್ಷ ಬಲ್ಬ್‌ಗಳ ಬೆಳಕಿನಲ್ಲಿ ಹೊಳೆಯುವ ಇತಿಹಾಸ",
    photo: ["Mysore Palace illuminated night", "Mysore Palace lights", "Mysore Palace"],
    category: "karnataka",
    district: "Mysuru",
    paragraphs: [
      "ಸಂಜೆ ಏಳು ಗಂಟೆಗೆ ಸರಿಯಾಗಿ ಮೈಸೂರು ಅರಮನೆಯ ಮೇಲೆ ಸಾವಿರಾರು ಬಲ್ಬ್‌ಗಳು ಒಟ್ಟಿಗೆ ಬೆಳಗಿದಾಗ ಅಂಗಳದಲ್ಲಿ ಸೇರಿದ ಜನರ ಬಾಯಿಂದ ಒಂದೇ ಉದ್ಗಾರ ಹೊರಡುತ್ತದೆ. ಭಾನುವಾರ ಮತ್ತು ಸರ್ಕಾರಿ ರಜಾದಿನಗಳಲ್ಲಿ, ಹಾಗೂ ದಸರಾ ಹತ್ತು ದಿನಗಳ ಕಾಲ ಪ್ರತಿದಿನ, ಅರಮನೆ ಹೀಗೆ ಬೆಳಕಿನ ಉಡುಗೆ ತೊಡುತ್ತದೆ.",
      "ಇಂಡೋ-ಸಾರ್ಸೆನಿಕ್ ಶೈಲಿಯ ಈ ಅರಮನೆಯ ಗುಮ್ಮಟಗಳು, ಕಮಾನುಗಳು ಮತ್ತು ಗೋಪುರಗಳ ಪ್ರತಿಯೊಂದು ರೇಖೆಯನ್ನೂ ಬಲ್ಬ್‌ಗಳ ಸಾಲು ಗುರುತಿಸುತ್ತದೆ. ದೂರದಿಂದ ನೋಡಿದರೆ ಕತ್ತಲಲ್ಲಿ ಚಿನ್ನದ ರೇಖಾಚಿತ್ರ ತೇಲುತ್ತಿರುವಂತೆ ಕಾಣುತ್ತದೆ. ಛಾಯಾಗ್ರಾಹಕರಿಗೆ ಇದು ವರ್ಷದ ಯಾವ ಕಾಲದಲ್ಲೂ ತಪ್ಪಿಸಿಕೊಳ್ಳಬಾರದ ದೃಶ್ಯ.",
      "ದೀಪಾಲಂಕಾರ ಸುಮಾರು ಒಂದು ಗಂಟೆ ಮಾತ್ರ ಇರುವುದರಿಂದ ಆರೂವರೆಗೆ ಮುಂಚೆಯೇ ಅಂಗಳ ತಲುಪುವುದು ಒಳ್ಳೆಯದು. ಅರಮನೆಯ ಮುಂಭಾಗದ ಹುಲ್ಲುಹಾಸಿನಿಂದ ಪೂರ್ಣ ನೋಟ ಸಿಗುತ್ತದೆ; ಉತ್ತರದ ದ್ವಾರದ ಬಳಿ ಜನಸಂದಣಿ ಕಡಿಮೆ.",
      "ವಾರಾಂತ್ಯದಲ್ಲಿ ಬೆಂಗಳೂರಿನಿಂದ ಬರುವ ಪ್ರವಾಸಿಗರ ಸಂಖ್ಯೆ ಹೆಚ್ಚುತ್ತಿದೆ ಎನ್ನುತ್ತಾರೆ ಸ್ಥಳೀಯ ವ್ಯಾಪಾರಿಗಳು. ಅರಮನೆಯ ಸುತ್ತಲಿನ ರಸ್ತೆಗಳಲ್ಲಿ ಸಂಜೆ ವಾಹನ ನಿಲುಗಡೆಗೆ ಜಾಗ ಸಿಗುವುದು ಕಷ್ಟ; ನಗರ ಬಸ್ ಅಥವಾ ಆಟೋ ಬಳಸಿ ಬರುವುದು ಸುಲಭ.",
    ],
  },
  {
    language: "kn",
    title: "ಜೋಗ ಜಲಪಾತ: ಮಳೆ ನಿಂತ ಮೇಲೂ ಧುಮ್ಮಿಕ್ಕುವ ರಾಜ, ರಾಣಿ, ರೋರರ್ ಮತ್ತು ರಾಕೆಟ್",
    photo: ["Jog Falls Karnataka monsoon", "Jog Falls", "Jog falls Shimoga"],
    category: "karnataka",
    district: "Shivamogga",
    paragraphs: [
      "ಶರಾವತಿ ನದಿ ಸುಮಾರು 250 ಮೀಟರ್ ಆಳಕ್ಕೆ ನಾಲ್ಕು ಕವಲುಗಳಾಗಿ ಧುಮುಕುವ ಜೋಗ ಜಲಪಾತ ಭಾರತದ ಅತಿ ಎತ್ತರದ ನೇರ ಜಲಪಾತಗಳಲ್ಲಿ ಒಂದು. ರಾಜ, ರಾಣಿ, ರೋರರ್ ಮತ್ತು ರಾಕೆಟ್ ಎಂಬ ಹೆಸರಿನ ನಾಲ್ಕು ಧಾರೆಗಳು ಒಂದೊಂದೂ ಒಂದೊಂದು ಸ್ವಭಾವದವು.",
      "ಮಳೆಗಾಲ ಮುಗಿದ ನಂತರದ ವಾರಗಳು ಜೋಗ ನೋಡಲು ಅತ್ಯುತ್ತಮ ಸಮಯ. ಮಳೆಯ ಮಬ್ಬು ಕಡಿಮೆಯಾಗಿ ಜಲಪಾತ ಪೂರ್ಣವಾಗಿ ಕಾಣುತ್ತದೆ, ನೀರಿನ ಹರಿವು ಇನ್ನೂ ಜೋರಾಗಿಯೇ ಇರುತ್ತದೆ. ಲಿಂಗನಮಕ್ಕಿ ಅಣೆಕಟ್ಟಿನಿಂದ ನೀರು ಬಿಟ್ಟ ದಿನಗಳಲ್ಲಿ ಜಲಪಾತ ಮಳೆಗಾಲದ ರೂಪಕ್ಕೆ ಮರಳುತ್ತದೆ.",
      "ವೀಕ್ಷಣಾ ಸ್ಥಳದಿಂದ ಕೆಳಗಿನ ಕಣಿವೆಗೆ ಇಳಿಯುವ ಮೆಟ್ಟಿಲುಗಳ ದಾರಿ ಸುಮಾರು 1,400 ಮೆಟ್ಟಿಲುಗಳದ್ದು. ಇಳಿಯುವುದು ಸುಲಭ, ಹತ್ತುವುದು ಕಷ್ಟ; ನೀರು ಮತ್ತು ಸಮಯ ಇಟ್ಟುಕೊಂಡು ಹೊರಡುವುದು ಒಳ್ಳೆಯದು.",
      "ಸಾಗರ ಪಟ್ಟಣದಿಂದ ಜೋಗಕ್ಕೆ ಸುಮಾರು 30 ಕಿಲೋಮೀಟರ್. ಶಿವಮೊಗ್ಗದಿಂದ ಬಸ್ ಸೌಕರ್ಯವಿದೆ. ಜಲಪಾತದ ಬಳಿ ವಸತಿ ಸೀಮಿತವಾಗಿರುವುದರಿಂದ ರಜಾದಿನಗಳಲ್ಲಿ ಮುಂಚಿತವಾಗಿ ಕಾಯ್ದಿರಿಸುವುದು ಸೂಕ್ತ.",
    ],
  },
  {
    language: "kn",
    title: "ಹಂಪಿಯ ಕಲ್ಲಿನ ರಥ: ವಿಜಯನಗರದ ವೈಭವಕ್ಕೆ ಇಂದಿಗೂ ನಿಂತ ಸಾಕ್ಷಿ",
    photo: ["Hampi stone chariot Vittala temple", "Vittala Temple Hampi chariot", "Hampi"],
    category: "karnataka",
    district: "Vijayanagara",
    paragraphs: [
      "ತುಂಗಭದ್ರಾ ನದಿಯ ದಂಡೆಯ ಬಂಡೆಗಳ ನಡುವೆ ಹರಡಿರುವ ಹಂಪಿಯಲ್ಲಿ ವಿಠ್ಠಲ ದೇವಾಲಯದ ಕಲ್ಲಿನ ರಥ ಅತ್ಯಂತ ಹೆಚ್ಚು ಛಾಯಾಚಿತ್ರಕ್ಕೆ ಒಳಗಾದ ಸ್ಮಾರಕ. ಐವತ್ತು ರೂಪಾಯಿ ನೋಟಿನ ಮೇಲೆ ಅಚ್ಚಾಗಿರುವ ಈ ರಥ ಇಡೀ ದೇಶಕ್ಕೆ ಪರಿಚಿತ.",
      "ಇದು ನಿಜವಾಗಿ ಗರುಡನ ಸನ್ನಿಧಿ; ರಥದ ಆಕಾರದಲ್ಲಿ ಕಟ್ಟಿದ ಗುಡಿ. ಇದರ ಕಲ್ಲಿನ ಚಕ್ರಗಳು ಒಂದು ಕಾಲದಲ್ಲಿ ತಿರುಗುತ್ತಿದ್ದವು ಎಂಬ ಮಾತಿದೆ; ಈಗ ಸಂರಕ್ಷಣೆಯ ದೃಷ್ಟಿಯಿಂದ ರಥದ ಸುತ್ತ ಬೇಲಿ ಹಾಕಲಾಗಿದೆ. ಪಕ್ಕದ ಮಹಾಮಂಟಪದ ಸಂಗೀತ ಕಂಬಗಳನ್ನು ತಟ್ಟುವುದಕ್ಕೂ ಈಗ ಅವಕಾಶವಿಲ್ಲ.",
      "ಅಕ್ಟೋಬರ್‌ನಿಂದ ಫೆಬ್ರವರಿವರೆಗಿನ ತಂಪು ತಿಂಗಳುಗಳು ಹಂಪಿ ಸುತ್ತಲು ಹಿತಕರ. ಬೆಳಗಿನ ಮೊದಲ ಬೆಳಕಿನಲ್ಲಿ ರಥದ ಕೆಂಪು ಕಲ್ಲು ಬಂಗಾರದ ಬಣ್ಣಕ್ಕೆ ತಿರುಗುತ್ತದೆ; ಆಗ ಪ್ರವಾಸಿಗರೂ ಕಡಿಮೆ.",
      "ವಿಠ್ಠಲ ದೇವಾಲಯಕ್ಕೆ ವಾಹನಗಳಿಗೆ ಪ್ರವೇಶವಿಲ್ಲ. ನಿಲುಗಡೆ ಸ್ಥಳದಿಂದ ಸುಮಾರು ಒಂದು ಕಿಲೋಮೀಟರ್ ನಡೆಯಬೇಕು ಅಥವಾ ವಿದ್ಯುತ್ ವಾಹನ ಬಳಸಬಹುದು. ಹೊಸಪೇಟೆಯಿಂದ ಹಂಪಿಗೆ ಬಸ್ ಮತ್ತು ಆಟೋ ಸೌಕರ್ಯವಿದೆ.",
    ],
  },
  {
    language: "kn",
    title: "ನಮ್ಮ ಮೆಟ್ರೋ: ದಿನಕ್ಕೆ ಲಕ್ಷಾಂತರ ಬೆಂಗಳೂರಿಗರ ಪ್ರಯಾಣವನ್ನು ಬದಲಿಸಿದ ಹಳಿಗಳು",
    photo: ["Namma Metro Bangalore train station", "Namma Metro Bengaluru", "Bangalore Metro"],
    category: "technology",
    paragraphs: [
      "ಹತ್ತು ವರ್ಷಗಳ ಹಿಂದೆ ಕೆಲವೇ ನಿಲ್ದಾಣಗಳ ನಡುವೆ ಓಡುತ್ತಿದ್ದ ನಮ್ಮ ಮೆಟ್ರೋ ಇಂದು ನಗರದ ಹಲವು ದಿಕ್ಕುಗಳನ್ನು ಬೆಸೆಯುವ ಜಾಲವಾಗಿದೆ. ಬೆಳಗಿನ ಗಡಿಬಿಡಿಯ ವೇಳೆಯಲ್ಲಿ ಮೆಜೆಸ್ಟಿಕ್ ಇಂಟರ್‌ಚೇಂಜ್‌ನಲ್ಲಿ ಹರಿಯುವ ಜನಸಾಗರ ನೋಡಿದರೆ ಈ ಬದಲಾವಣೆಯ ಪ್ರಮಾಣ ಅರ್ಥವಾಗುತ್ತದೆ.",
      "ರಸ್ತೆಯಲ್ಲಿ ಒಂದೂವರೆ ಗಂಟೆ ತೆಗೆದುಕೊಳ್ಳುತ್ತಿದ್ದ ಪ್ರಯಾಣ ಮೆಟ್ರೋದಲ್ಲಿ ಮೂವತ್ತು ನಿಮಿಷಕ್ಕೆ ಇಳಿದಿದೆ ಎನ್ನುತ್ತಾರೆ ನಿತ್ಯ ಪ್ರಯಾಣಿಕರು. ಹವಾನಿಯಂತ್ರಿತ ಬೋಗಿಗಳು, ನಿಖರ ಸಮಯ ಮತ್ತು ಮಹಿಳೆಯರಿಗೆ ಮೀಸಲು ಬೋಗಿ ಅನೇಕರಿಗೆ ಕಾರು ಬಿಟ್ಟು ಮೆಟ್ರೋ ಹಿಡಿಯಲು ಕಾರಣವಾಗಿದೆ.",
      "ಕ್ಯೂಆರ್ ಟಿಕೆಟ್ ಮತ್ತು ರಾಷ್ಟ್ರೀಯ ಸಾಮಾನ್ಯ ಸಂಚಾರ ಕಾರ್ಡ್ ಬಂದ ಮೇಲೆ ಟೋಕನ್ ಸಾಲುಗಳು ಕಡಿಮೆಯಾಗಿವೆ. ಮೊಬೈಲ್ ಆ್ಯಪ್‌ನಲ್ಲೇ ಟಿಕೆಟ್ ಖರೀದಿಸಿ ಗೇಟಿನಲ್ಲಿ ಸ್ಕ್ಯಾನ್ ಮಾಡಬಹುದು.",
      "ಹೊಸ ಮಾರ್ಗಗಳ ಕಾಮಗಾರಿ ನಡೆಯುತ್ತಿರುವ ಪ್ರದೇಶಗಳಲ್ಲಿ ಇನ್ನೂ ಸಂಚಾರ ದಟ್ಟಣೆ ಇದೆ. ಆದರೆ ಪ್ರತಿ ಹೊಸ ವಿಸ್ತರಣೆಯೂ ನಗರದ ಇನ್ನೊಂದು ಭಾಗವನ್ನು ಮೆಟ್ರೋ ನಕ್ಷೆಗೆ ಸೇರಿಸುತ್ತಿದೆ.",
    ],
  },
  {
    language: "kn",
    title: "ಕೊಡಗಿನ ಕಾಫಿ ತೋಟಗಳಲ್ಲಿ ಕೊಯ್ಲಿನ ಸಿದ್ಧತೆ: ಹಸಿರು ಹಣ್ಣು ಕೆಂಪಾಗುವ ಕಾಲ",
    photo: ["Coffee plantation Coorg Karnataka", "Coffee cherries Coorg", "Coffee plantation Kodagu"],
    category: "business",
    paragraphs: [
      "ಮಳೆಗಾಲದ ನಂತರ ಕೊಡಗಿನ ತೋಟಗಳಲ್ಲಿ ಕಾಫಿ ಗಿಡಗಳ ಹಸಿರು ಹಣ್ಣುಗಳು ನಿಧಾನವಾಗಿ ಕೆಂಪಾಗಲು ಆರಂಭಿಸಿವೆ. ಅರೇಬಿಕಾ ಕೊಯ್ಲು ನವೆಂಬರ್ ಕೊನೆಯಿಂದ, ರೋಬಸ್ಟಾ ಜನವರಿಯಿಂದ ಶುರುವಾಗುತ್ತದೆ. ಈಗ ತೋಟಗಳಲ್ಲಿ ಕಳೆ ತೆಗೆಯುವ, ನೆರಳಿನ ಮರಗಳನ್ನು ಕತ್ತರಿಸುವ ಕೆಲಸ ಭರದಿಂದ ಸಾಗಿದೆ.",
      "ಕೊಯ್ಲಿಗೆ ಕೆಲಸಗಾರರ ಕೊರತೆ ಪ್ರತಿ ವರ್ಷದ ಚಿಂತೆ. ಅಸ್ಸಾಂ ಮತ್ತು ಉತ್ತರ ಭಾರತದಿಂದ ಬರುವ ಕಾರ್ಮಿಕರನ್ನೇ ಹೆಚ್ಚಿನ ತೋಟಗಳು ಅವಲಂಬಿಸಿವೆ. ಸಣ್ಣ ಬೆಳೆಗಾರರು ಕುಟುಂಬದವರೊಂದಿಗೆ ಸೇರಿ ಕೊಯ್ಲು ಮಾಡುತ್ತಾರೆ.",
      "ಜಾಗತಿಕ ಮಾರುಕಟ್ಟೆಯಲ್ಲಿ ಕಾಫಿ ಬೆಲೆಯ ಏರಿಳಿತ ಬೆಳೆಗಾರರ ಆದಾಯವನ್ನು ನೇರವಾಗಿ ಪ್ರಭಾವಿಸುತ್ತದೆ. ಹಾಗಾಗಿ ಹಲವು ತೋಟಗಳು ಈಗ ತಮ್ಮದೇ ಬ್ರ್ಯಾಂಡಿನ ಹುರಿದ ಕಾಫಿ ಮಾರಾಟ ಮತ್ತು ಹೋಮ್‌ಸ್ಟೇ ಪ್ರವಾಸೋದ್ಯಮದತ್ತ ಹೊರಳಿವೆ.",
      "ಕೊಯ್ಲು ಋತುವಿನಲ್ಲಿ ಕೊಡಗಿಗೆ ಬರುವ ಪ್ರವಾಸಿಗರಿಗೆ ಹಣ್ಣು ಕೀಳುವುದರಿಂದ ಹಿಡಿದು ಹುರಿಯುವವರೆಗಿನ ಪ್ರಕ್ರಿಯೆ ನೋಡುವ ಅವಕಾಶ ಹಲವು ಎಸ್ಟೇಟ್‌ಗಳಲ್ಲಿ ಸಿಗುತ್ತದೆ.",
    ],
  },
  {
    language: "kn",
    title: "ಉಡುಪಿ ಶ್ರೀಕೃಷ್ಣ ಮಠ: ಕನಕನ ಕಿಂಡಿಯ ಮೂಲಕ ನಿತ್ಯ ದರ್ಶನ",
    photo: ["Udupi Sri Krishna Matha temple", "Udupi Krishna Temple", "Udupi Sri Krishna Matha"],
    category: "karnataka",
    district: "Udupi",
    paragraphs: [
      "ಉಡುಪಿಯ ರಥಬೀದಿಯ ನಡುವೆ ಇರುವ ಶ್ರೀಕೃಷ್ಣ ಮಠದಲ್ಲಿ ಕೃಷ್ಣನ ದರ್ಶನ ಒಂದು ಸಣ್ಣ ಕಿಟಕಿಯ ಮೂಲಕ. ಒಂಬತ್ತು ರಂಧ್ರಗಳ ಈ ಕಿಂಡಿಗೆ ಕನಕದಾಸರ ಹೆಸರಿದೆ; ದೇವಾಲಯದೊಳಗೆ ಪ್ರವೇಶ ಸಿಗದ ಕನಕದಾಸರಿಗಾಗಿ ಮೂರ್ತಿಯೇ ಪಶ್ಚಿಮಕ್ಕೆ ತಿರುಗಿತು ಎಂಬುದು ಐತಿಹ್ಯ.",
      "ಮಠದ ಆಡಳಿತ ಎರಡು ವರ್ಷಕ್ಕೊಮ್ಮೆ ಎಂಟು ಮಠಗಳ ನಡುವೆ ಕೈ ಬದಲಾಗುತ್ತದೆ. ಈ ಪರ್ಯಾಯ ಮಹೋತ್ಸವ ಜನವರಿಯಲ್ಲಿ ನಡೆಯುತ್ತದೆ; ಆಗ ಇಡೀ ಉಡುಪಿ ಹಬ್ಬದ ಕಳೆ ಪಡೆಯುತ್ತದೆ.",
      "ಬೆಳಗಿನ ಜಾವದ ನಿರ್ಮಾಲ್ಯ ದರ್ಶನದಿಂದ ರಾತ್ರಿಯ ಏಕಾಂತ ಸೇವೆಯವರೆಗೆ ದಿನವಿಡೀ ಪೂಜೆಗಳು ನಡೆಯುತ್ತವೆ. ಮಠದ ಭೋಜನಶಾಲೆಯಲ್ಲಿ ಪ್ರತಿದಿನ ಸಾವಿರಾರು ಭಕ್ತರಿಗೆ ಅನ್ನಪ್ರಸಾದ ಬಡಿಸಲಾಗುತ್ತದೆ.",
      "ರಥಬೀದಿಯ ಸುತ್ತ ಉಡುಪಿಯ ಪ್ರಸಿದ್ಧ ಹೋಟೆಲ್‌ಗಳು ಮತ್ತು ಅಂಗಡಿಗಳಿವೆ. ಮಲ್ಪೆ ಕಡಲತೀರ ಮತ್ತು ಸೇಂಟ್ ಮೇರಿಸ್ ದ್ವೀಪ ಇಲ್ಲಿಂದ ಅರ್ಧ ಗಂಟೆಯ ದೂರದಲ್ಲಿವೆ.",
    ],
  },
  {
    language: "kn",
    title: "ಕನ್ನಡ ರಾಜ್ಯೋತ್ಸವಕ್ಕೆ ಸಿದ್ಧತೆ: ನವೆಂಬರ್ 1ರಂದು ರಾಜ್ಯಾದ್ಯಂತ ಹಳದಿ-ಕೆಂಪು ಸಂಭ್ರಮ",
    photo: ["Kannada flag Karnataka Rajyotsava", "Karnataka flag", "Kannada Rajyotsava"],
    category: "karnataka",
    paragraphs: [
      "ಇನ್ನು ಹತ್ತು ದಿನಗಳಲ್ಲಿ ಕರ್ನಾಟಕ ತನ್ನ ಹುಟ್ಟುಹಬ್ಬ ಆಚರಿಸುತ್ತದೆ. 1956ರ ನವೆಂಬರ್ 1ರಂದು ಕನ್ನಡ ಮಾತನಾಡುವ ಪ್ರದೇಶಗಳು ಒಂದಾಗಿ ಮೈಸೂರು ರಾಜ್ಯ ರಚನೆಯಾದ ದಿನವನ್ನು ರಾಜ್ಯೋತ್ಸವವಾಗಿ ಆಚರಿಸಲಾಗುತ್ತದೆ. ಶಾಲೆಗಳು, ಕಚೇರಿಗಳು ಮತ್ತು ಬಡಾವಣೆ ಸಂಘಗಳಲ್ಲಿ ಈಗಾಗಲೇ ಸಿದ್ಧತೆ ಆರಂಭವಾಗಿದೆ.",
      "ನಗರಗಳ ರಸ್ತೆಗಳಲ್ಲಿ ಹಳದಿ-ಕೆಂಪು ಬಾವುಟಗಳು ಮತ್ತು ತೋರಣಗಳು ಈಗಲೇ ಕಾಣಿಸತೊಡಗಿವೆ. ಆಟೋ ಮತ್ತು ಬಸ್‌ಗಳ ಮೇಲೆ ಭುವನೇಶ್ವರಿಯ ಚಿತ್ರಗಳು; ಮಾರುಕಟ್ಟೆಗಳಲ್ಲಿ ಬಾವುಟ, ಬ್ಯಾಡ್ಜ್ ಮತ್ತು ಕನ್ನಡ ಘೋಷವಾಕ್ಯದ ಟೀ-ಶರ್ಟ್‌ಗಳ ಮಾರಾಟ ಜೋರಾಗಿದೆ.",
      "ರಾಜ್ಯ ಸರ್ಕಾರ ಪ್ರತಿ ವರ್ಷ ರಾಜ್ಯೋತ್ಸವ ಪ್ರಶಸ್ತಿಗಳನ್ನು ಘೋಷಿಸುತ್ತದೆ; ಸಾಹಿತ್ಯ, ಕಲೆ, ಕ್ರೀಡೆ, ಕೃಷಿ ಮುಂತಾದ ಕ್ಷೇತ್ರಗಳ ಸಾಧಕರನ್ನು ಗೌರವಿಸಲಾಗುತ್ತದೆ. ಬೆಂಗಳೂರಿನ ಕಂಠೀರವ ಕ್ರೀಡಾಂಗಣದಲ್ಲಿ ಮುಖ್ಯ ಸಮಾರಂಭ ನಡೆಯುವುದು ವಾಡಿಕೆ.",
      "ಈ ಬಾರಿ ಹಲವು ಶಾಲೆಗಳು ನವೆಂಬರ್ ಇಡೀ ತಿಂಗಳು ಕನ್ನಡ ಸಾಹಿತ್ಯ, ಜಾನಪದ ಮತ್ತು ನಾಟಕದ ಕಾರ್ಯಕ್ರಮಗಳನ್ನು ಆಯೋಜಿಸುತ್ತಿವೆ. ಮಕ್ಕಳಿಗೆ ಕನ್ನಡದ ಹಿರಿಮೆ ಪರಿಚಯಿಸುವುದು ಇದರ ಉದ್ದೇಶ.",
    ],
  },
  {
    language: "kn",
    title: "ಬಾದಾಮಿ ಗುಹಾಲಯಗಳು: ಕೆಂಪು ಬಂಡೆಯಲ್ಲಿ ಚಾಲುಕ್ಯರು ಕೆತ್ತಿದ ನಾಲ್ಕು ಅಧ್ಯಾಯಗಳು",
    photo: ["Badami cave temples", "Badami caves Karnataka", "Badami"],
    category: "karnataka",
    district: "Bagalkote",
    paragraphs: [
      "ಅಗಸ್ತ್ಯ ತೀರ್ಥ ಕೆರೆಯ ಮೇಲೆ ಎದ್ದು ನಿಂತ ಕೆಂಪು ಮರಳುಗಲ್ಲಿನ ಬೆಟ್ಟದಲ್ಲಿ ಆರನೇ ಶತಮಾನದ ಚಾಲುಕ್ಯರು ನಾಲ್ಕು ಗುಹಾಲಯಗಳನ್ನು ಕೆತ್ತಿದರು. ಮೂರು ಹಿಂದೂ, ಒಂದು ಜೈನ. ಪ್ರತಿ ಗುಹೆಯೂ ಬೆಟ್ಟದ ಮೆಟ್ಟಿಲುಗಳ ಮೇಲೆ ಒಂದರ ಮೇಲೊಂದು ಹಂತದಲ್ಲಿದೆ.",
      "ಮೂರನೇ ಗುಹೆಯ ಹದಿನೆಂಟು ಕೈಗಳ ನಟರಾಜ ಮತ್ತು ವಿಷ್ಣುವಿನ ಬೃಹತ್ ಶಿಲ್ಪಗಳು ದಕ್ಷಿಣ ಭಾರತದ ಆರಂಭಿಕ ಶಿಲ್ಪಕಲೆಯ ಶ್ರೇಷ್ಠ ಉದಾಹರಣೆಗಳು. ಛಾವಣಿಯಲ್ಲಿ ಇನ್ನೂ ಉಳಿದಿರುವ ಬಣ್ಣದ ಚಿತ್ರಗಳ ಕುರುಹುಗಳು ಒಂದು ಕಾಲದಲ್ಲಿ ಗುಹೆಗಳು ಸಂಪೂರ್ಣ ವರ್ಣಮಯವಾಗಿದ್ದವು ಎಂದು ಹೇಳುತ್ತವೆ.",
      "ಬಾದಾಮಿಯ ಜೊತೆಗೆ ಐಹೊಳೆ ಮತ್ತು ಪಟ್ಟದಕಲ್ಲು ಸೇರಿ ಒಂದು ದಿನದ ಪ್ರವಾಸ ಮಾಡಬಹುದು. ಪಟ್ಟದಕಲ್ಲು ವಿಶ್ವ ಪರಂಪರೆಯ ತಾಣ; ಐಹೊಳೆಯನ್ನು ದೇವಾಲಯ ವಾಸ್ತುಶಿಲ್ಪದ ಪ್ರಯೋಗಶಾಲೆ ಎನ್ನುತ್ತಾರೆ.",
      "ಬೇಸಿಗೆಯಲ್ಲಿ ಬಂಡೆಗಳು ಬಿಸಿಯಾಗುವುದರಿಂದ ಅಕ್ಟೋಬರ್‌ನಿಂದ ಫೆಬ್ರವರಿವರೆಗಿನ ಅವಧಿ ಭೇಟಿಗೆ ಉತ್ತಮ. ಗುಹೆಗಳ ಬಳಿ ಕೋತಿಗಳು ಹೆಚ್ಚು; ತಿಂಡಿ ಪೊಟ್ಟಣಗಳನ್ನು ಕೈಯಲ್ಲಿ ಹಿಡಿಯದಿರುವುದು ಒಳ್ಳೆಯದು.",
    ],
  },
  {
    language: "kn",
    title: "ಚಿನ್ನಸ್ವಾಮಿ ಕ್ರೀಡಾಂಗಣದಲ್ಲಿ ಹೊಸ ಋತುವಿಗೆ ಸಿದ್ಧತೆ: ಅಭಿಮಾನಿಗಳಿಗೆ ಏನು ಹೊಸದು?",
    photo: ["File:Chinnaswamy_Stadium_during_India_vs_New_Zealand_Test_Match,October_2024_2.jpg", "File:M._Chinnaswamy_Stadium_(8697937415).jpg", "Chinnaswamy Stadium"],
    category: "sports",
    paragraphs: [
      "ಕಬ್ಬನ್ ಪಾರ್ಕ್‌ನ ಪಕ್ಕದಲ್ಲಿರುವ ಎಂ. ಚಿನ್ನಸ್ವಾಮಿ ಕ್ರೀಡಾಂಗಣ ದೇಶದ ಅತ್ಯಂತ ಜನಪ್ರಿಯ ಕ್ರಿಕೆಟ್ ಮೈದಾನಗಳಲ್ಲಿ ಒಂದು. ಚಿಕ್ಕ ಬೌಂಡರಿಗಳು ಮತ್ತು ಬ್ಯಾಟಿಂಗ್‌ಗೆ ಹೊಂದುವ ಪಿಚ್ ಇಲ್ಲಿ ದೊಡ್ಡ ಮೊತ್ತದ ಪಂದ್ಯಗಳಿಗೆ ಕಾರಣ. ಹೊಸ ದೇಶೀಯ ಋತುವಿಗೆ ಮೈದಾನ ಸಜ್ಜಾಗುತ್ತಿದೆ.",
      "ಮಳೆ ಬಂದರೂ ಕೆಲವೇ ನಿಮಿಷಗಳಲ್ಲಿ ಆಟ ಮುಂದುವರಿಸಬಹುದಾದ ಉಪ-ಮೇಲ್ಮೈ ಒಳಚರಂಡಿ ವ್ಯವಸ್ಥೆ ಈ ಮೈದಾನದ ಹೆಗ್ಗಳಿಕೆ. ಛಾವಣಿಯ ಮೇಲಿನ ಸೌರ ಫಲಕಗಳು ಕ್ರೀಡಾಂಗಣದ ವಿದ್ಯುತ್ ಅಗತ್ಯದ ದೊಡ್ಡ ಭಾಗವನ್ನು ಪೂರೈಸುತ್ತವೆ.",
      "ಕರ್ನಾಟಕ ರಾಜ್ಯ ಕ್ರಿಕೆಟ್ ಸಂಸ್ಥೆಯ ಮಾಹಿತಿ ಪ್ರಕಾರ ಪ್ರೇಕ್ಷಕರ ಸುರಕ್ಷತೆ ಮತ್ತು ಪ್ರವೇಶ ವ್ಯವಸ್ಥೆಯನ್ನು ಸುಧಾರಿಸುವ ಕೆಲಸ ನಡೆದಿದೆ. ಟಿಕೆಟ್ ಆನ್‌ಲೈನ್‌ನಲ್ಲೇ ದೊರೆಯಲಿದ್ದು, ಪ್ರವೇಶ ದ್ವಾರಗಳಲ್ಲಿ ಸಾಲು ಕಡಿಮೆ ಮಾಡುವ ಪ್ರಯತ್ನ ಸಾಗಿದೆ.",
      "ಪಂದ್ಯದ ದಿನ ಎಂ.ಜಿ. ರಸ್ತೆ ಮತ್ತು ಕಬ್ಬನ್ ಪಾರ್ಕ್ ಮೆಟ್ರೋ ನಿಲ್ದಾಣಗಳು ಕ್ರೀಡಾಂಗಣಕ್ಕೆ ಹತ್ತಿರದ ದಾರಿ. ವಾಹನ ನಿಲುಗಡೆಗೆ ಜಾಗ ಅತ್ಯಂತ ಸೀಮಿತ; ಮೆಟ್ರೋ ಬಳಸುವಂತೆ ಸಂಚಾರ ಪೊಲೀಸರು ಪ್ರತಿ ಬಾರಿಯೂ ಮನವಿ ಮಾಡುತ್ತಾರೆ.",
    ],
  },
  {
    language: "kn",
    title: "ಡೊಳ್ಳು ಕುಣಿತ: ಡೊಳ್ಳಿನ ಸದ್ದಿಗೆ ಹೆಜ್ಜೆ ಹಾಕುವ ಕರ್ನಾಟಕದ ಜಾನಪದ ಹೆಮ್ಮೆ",
    photo: ["Dollu Kunitha Karnataka folk dance", "Dollu Kunitha", "Karnataka folk dance drum"],
    category: "entertainment",
    paragraphs: [
      "ಹೆಗಲಿಗೆ ದೊಡ್ಡ ಡೊಳ್ಳು ನೇತು ಹಾಕಿಕೊಂಡು, ಒಂದು ಕೈಯಲ್ಲಿ ಕೋಲು ಇನ್ನೊಂದು ಕೈಯಲ್ಲಿ ಬರಿಗೈ ಬಡಿತದೊಂದಿಗೆ ವೃತ್ತಾಕಾರದಲ್ಲಿ ಕುಣಿಯುವ ಡೊಳ್ಳು ಕುಣಿತ ಕರ್ನಾಟಕದ ಅತ್ಯಂತ ಶಕ್ತಿಶಾಲಿ ಜಾನಪದ ಕಲೆ. ಕುರುಬ ಸಮುದಾಯದ ಬೀರೇಶ್ವರ ಆರಾಧನೆಯಿಂದ ಹುಟ್ಟಿದ ಈ ಕಲೆ ಇಂದು ರಾಜ್ಯದ ಪ್ರತಿ ಮೆರವಣಿಗೆಯ ಮುಂಚೂಣಿಯಲ್ಲಿದೆ.",
      "ನಿಧಾನ ಲಯದಿಂದ ಆರಂಭವಾಗಿ ಕ್ರಮೇಣ ವೇಗ ಪಡೆಯುವ ಬಡಿತ, ತಾಳೆ ಮತ್ತು ಕೊಳಲಿನ ಜೊತೆಗೂಡಿ ನೋಡುಗರ ಎದೆಬಡಿತವನ್ನೇ ಬದಲಿಸುತ್ತದೆ. ಹತ್ತರಿಂದ ಹದಿನಾರು ಕಲಾವಿದರ ತಂಡ ಪಿರಮಿಡ್‌ನಂತಹ ರಚನೆಗಳನ್ನೂ ಮಾಡುತ್ತದೆ.",
      "ಹಿಂದೆ ಪುರುಷರಿಗೆ ಮಾತ್ರ ಸೀಮಿತವಾಗಿದ್ದ ಈ ಕಲೆಯಲ್ಲಿ ಈಗ ಮಹಿಳಾ ತಂಡಗಳೂ ಹೆಸರು ಮಾಡಿವೆ. ಶಾಲಾ-ಕಾಲೇಜುಗಳ ಸಾಂಸ್ಕೃತಿಕ ಸ್ಪರ್ಧೆಗಳಲ್ಲಿ ಡೊಳ್ಳು ಕುಣಿತದ ತಂಡಗಳು ಸಾಮಾನ್ಯವಾಗಿವೆ.",
      "ಮೈಸೂರು ದಸರಾ ಜಂಬೂ ಸವಾರಿಯಿಂದ ಹಿಡಿದು ದೆಹಲಿಯ ಗಣರಾಜ್ಯೋತ್ಸವ ಪಥಸಂಚಲನದವರೆಗೆ ಡೊಳ್ಳು ಕುಣಿತ ಕರ್ನಾಟಕವನ್ನು ಪ್ರತಿನಿಧಿಸಿದೆ. ರಾಜ್ಯೋತ್ಸವದ ತಿಂಗಳು ಈ ಕಲಾವಿದರಿಗೆ ವರ್ಷದ ಅತ್ಯಂತ ಬಿಡುವಿಲ್ಲದ ಕಾಲ.",
    ],
  },

  /* ─────────────── English ─────────────── */
  {
    language: "en",
    title: "Lalbagh's glasshouse readies for the winter flower show as the city's gardeners count down",
    photo: ["Lalbagh Glass House", "Glass House Lalbagh", "Lalbagh Botanical Garden", "Lalbagh lake Bangalore", "Lalbagh flower show"],
    category: "karnataka",
    district: "Bengaluru Urban",
    paragraphs: [
      "Inside the century-old glasshouse at Lalbagh Botanical Garden, the scaffolding is up and the first trays of seedlings have arrived. Twice a year, around Republic Day and Independence Day, the building modelled on London's Crystal Palace fills with hundreds of thousands of blooms arranged into a themed display, and the horticulture department starts its preparations months ahead.",
      "The flower show is Bengaluru's oldest public spectacle, older than most of the city's landmarks. Dahlias, chrysanthemums and roses are grown in nurseries across the garden's 240 acres, while the centrepiece, usually a floral replica of a monument or a tribute to a public figure, is built by hand over several weeks.",
      "Outside the glasshouse, Lalbagh is at its best in the cooler months. The lake draws early-morning walkers, the rock on the hill, one of the oldest exposed rock formations on earth, catches the first light, and the trees planted under Hyder Ali and Tipu Sultan still shade the main avenues.",
      "The garden opens at six in the morning, and walkers enter free before nine. For the show itself, weekday mornings are the quietest. The Lalbagh metro station sits at the west gate, which the city's traffic police recommend over driving in.",
    ],
  },
  {
    language: "en",
    title: "Gol Gumbaz: the whispering gallery that still draws crowds to Vijayapura",
    photo: ["Gol Gumbaz Bijapur", "Gol Gumbaz", "Gol Gumbaz Vijayapura dome"],
    category: "karnataka",
    district: "Vijayapura",
    paragraphs: [
      "Rising over the flat northern plains of Karnataka, the dome of Gol Gumbaz is one of the largest in the world to stand without a single supporting pillar. It was built in the seventeenth century as the mausoleum of Mohammed Adil Shah, and it remains the structure that defines the skyline of Vijayapura, the old Bijapur.",
      "What visitors come for is the whispering gallery that runs around the inside of the dome. A word spoken against the wall can be heard clearly on the far side, and a single clap returns as a run of echoes. By mid-morning the gallery is loud with people testing it, which is why guides suggest climbing the narrow stairs as soon as the gates open.",
      "The monument sits inside a walled garden with a small museum in the old gateway, and the town around it holds the rest of the Adil Shahi legacy: the unfinished Bara Kaman, the Ibrahim Rauza with its delicate minarets, and the Malik-e-Maidan, one of the largest medieval cannons ever cast.",
      "Vijayapura is on the rail line between Solapur and Hubballi, and buses connect it to Bengaluru overnight. The dry heat builds from March, so the months from October to February are the comfortable ones to explore the town on foot.",
    ],
  },
  {
    language: "en",
    title: "Vande Bharat and the changing face of a day's train travel in India",
    photo: ["Vande Bharat Express train", "Vande Bharat Express", "Indian Railways Vande Bharat"],
    category: "national",
    paragraphs: [
      "For most of its history, a long-distance train journey in India meant a night on board. The Vande Bharat Express, the semi-high-speed train designed and built at the Integral Coach Factory in Chennai, has been changing that on route after route, turning overnight trips between cities a few hundred kilometres apart into day journeys with a working morning on one end and dinner at home on the other.",
      "The trains are self-propelled, with motors spread along the rake rather than a locomotive at the front, which lets them accelerate and brake faster than conventional expresses. Inside, the sealed, air-conditioned coaches, automatic doors and rotating seats in the executive class are the features passengers mention first.",
      "The network has grown quickly, and Karnataka's share includes services linking Bengaluru with Mysuru, Dharwad and cities across the state border. Timings are set for day travellers: early departures, a return in the evening, and catering included in the fare.",
      "Fares sit above those of ordinary expresses, which keeps the trains a choice rather than a replacement. Railway officials say sleeper versions are in the works for the longer corridors, bringing the same design to the overnight routes where most Indians still travel.",
    ],
  },
  {
    language: "en",
    title: "Sriharikota: a day at India's gateway to space, where the countdown is a public event",
    photo: ["Satish Dhawan Space Centre launch", "ISRO LVM3 launch Sriharikota", "PSLV launch Sriharikota"],
    category: "technology",
    paragraphs: [
      "On launch days, the road from Sullurpeta to the Satish Dhawan Space Centre fills before dawn. Families from Chennai and the Andhra coast, students in college buses and photographers with long lenses head for the viewing gallery that ISRO opened to the public a few years ago, where the countdown is relayed over loudspeakers and the rocket is visible on its pad across the lagoon.",
      "Sriharikota is a spindle-shaped island between the Pulicat Lake and the Bay of Bengal, chosen in the late 1960s for its eastward sea horizon and its closeness to the equator. From its two launch pads have gone every Indian satellite launcher since the SLV, the Chandrayaan and Mangalyaan missions, and the Gaganyaan test flights that are preparing the way for Indian astronauts.",
      "The launch itself is over in minutes. The sound reaches the gallery several seconds after the flame, a low rumble that the crowd feels as much as hears, and then the vehicle is a bright point climbing into the haze while the commentary follows each stage separation.",
      "Registration for the gallery opens on ISRO's website a few days before each launch and fills within hours. For those who miss out, the launches are streamed live, and the space centre's visitor complex tells the story of the programme on the days in between.",
    ],
  },
  {
    language: "en",
    title: "UPI at the tea stall: how a QR code rewired everyday payments in India",
    photo: ["Tea stall India chai", "Chai wala India", "Street vendor India shop", "Indian tea shop", "Small shop India"],
    category: "business",
    paragraphs: [
      "The laminated square of black and white taped to the counter has become as much a part of an Indian shopfront as the signboard. From roadside tea stalls to vegetable carts, autorickshaws and temple donation boxes, the Unified Payments Interface has made a phone scan the default way to pay for small things, and change, the eternal shortage of Indian retail, a smaller problem than it used to be.",
      "UPI moves money directly between bank accounts in real time, with no card, no fee for the person paying and, for most small merchants, no fee for receiving either. That combination is what took it from an urban convenience to the main payment rail of the country in less than a decade, with billions of transactions a month.",
      "For small traders, the shift has brought a record of sales that did not exist before, which banks now use to extend small loans. The voice box that announces each payment, so the shopkeeper does not have to check the phone, is a small Indian invention that has travelled with the system.",
      "The system now works for travellers in several countries and for foreign visitors inside India, and its rails carry everything from toll payments to fuel. The next step, officials say, is bringing the same ease to the people still outside it, with feature-phone access and payments that work without a network.",
    ],
  },
  {
    language: "en",
    title: "Bandipur after the rains: a tiger reserve finds its rhythm as the forest turns green",
    photo: ["Bandipur National Park tiger", "Bandipur National Park", "Bandipur Tiger Reserve elephant"],
    category: "national",
    paragraphs: [
      "The dry teak forest of Bandipur spends the summer brown and bare. By late October, after the monsoon, it is a different place: the undergrowth is head-high, the waterholes are full and the herds of chital and gaur that gathered at the few remaining pools in May have scattered across the park. For visitors, the sightings get harder; for the animals, it is the easy season.",
      "Bandipur, on Karnataka's border with Tamil Nadu and Kerala, is one of the country's oldest tiger reserves and part of the Nilgiri Biosphere Reserve, the largest connected stretch of protected forest in southern India. Together with Nagarahole, Mudumalai and Wayanad it holds one of the biggest tiger populations in the world, and elephant herds that move freely across the state lines.",
      "Safaris run in the early morning and late afternoon in forest department buses and jeeps, and the guides steer by alarm calls: a langur's bark or a sambar's bell is often the first sign that a predator is moving. Leopards, wild dogs and sloth bears are seen more often than tigers, and the birdlife is rich after the rains.",
      "The highway through the park closes to traffic at night to protect animals crossing, a rule that has held for more than a decade despite pressure to lift it. The forest department asks visitors to book safaris in advance, keep windows up and leave the drones at home.",
    ],
  },
  {
    language: "en",
    title: "Kabaddi's second life: from the village ground to packed arenas and prime-time television",
    photo: ["File:Kabaddi_match.jpg", "File:Kabaddi_in_villages.jpg", "Kabaddi"],
    category: "sports",
    paragraphs: [
      "A generation ago, kabaddi was a game of school sports days and village fairs, played on dirt with a line scratched in the ground. Today it fills indoor arenas, runs a franchise league with city teams and television contracts, and its best raiders earn more in a season than their fathers did in a lifetime of farming.",
      "The rules have hardly changed. A raider crosses into the opponents' half, tags as many defenders as possible and gets back across the line in one breath, chanting to prove it; the defenders try to hold him down. What the league added was a mat, a shot clock, floodlights and commentary, and an audience that had never watched the game found it was built for television: thirty-second bursts of tension, resolved one way or the other.",
      "Karnataka, Maharashtra and Haryana remain the game's nurseries, and the state's rural tournaments in the winter months still draw crowds of thousands around a single floodlit court. Scouts from the professional teams now travel to them, and a strong showing can mean a contract.",
      "The women's game is growing alongside, with a national championship and growing interest in a league of its own. Coaches say the biggest change is in the players' preparation: fitness trainers, video analysis and diet charts in a sport that once ran on practice and instinct alone.",
    ],
  },
  {
    language: "en",
    title: "Mangaluru's old port: where the day's catch sets the city's menu",
    photo: ["File:Colorful_fishing_boats_at_Mangalore_harbor_-_India.jpg", "File:Mangalore_fishing_docks.jpg", "Mangalore fishing"],
    category: "business",
    paragraphs: [
      "Before the sun is up, the quay at Mangaluru's old port in Bunder is already loud. Purse-seiners and trawlers that went out overnight are tying up two and three deep, baskets of mackerel, sardine and pomfret are coming over the side, and the auctioneers are at work, settling prices with a shout and a hand signal before the ice has had time to melt.",
      "The port is the heart of a fishing economy that reaches far beyond the coast. Trucks leave for Bengaluru and Kerala by mid-morning, exporters pack prawn and cuttlefish for shipping, and the dried-fish yards along the shore supply markets across the interior. Thousands of families in the district depend on the trade, from boat owners to the women who sort and carry the catch.",
      "The season follows the monsoon. Mechanised boats stay in harbour during the breeding months of June and July under the annual fishing ban, and the first weeks after it reopens in August bring the year's best landings. By October the boats are venturing further out, and prices in the city's markets settle.",
      "Fishermen say the catch close to shore has thinned over the years, pushing boats further and raising diesel costs. The harbour's own problems, silting and crowded berths, come up at every meeting with the port authorities, who have promised dredging and an extension of the quay.",
    ],
  },
  {
    language: "en",
    title: "Indian Institute of Science at the heart of Bengaluru's research boom",
    photo: ["File:Main_Building,_Indian_Institute_of_Science,_Bangalore,_Karnataka,_India_(2017).jpg", "File:IISC_Bangalore_Campus.jpg", "Indian Institute of Science"],
    category: "education",
    paragraphs: [
      "The tree-lined campus in the north of the city, with its granite main building and its tower, was founded in 1909 with a gift of land from the Mysore maharaja and money from Jamsetji Tata, who did not live to see it open. More than a century later the Indian Institute of Science remains the country's top-ranked research university, and its graduates and spin-offs are woven through the city's science and technology industry.",
      "IISc is unusual among Indian institutions in that research came first and teaching followed. Its undergraduate programme is small; most of its students are doctoral candidates working in departments that range from aerospace engineering and materials science to ecology and brain research. The campus hosts the country's fastest academic supercomputer and a centre for nano science that industry uses as much as academics do.",
      "The institute's influence spreads through the companies and institutions around it. The Society for Innovation and Development on campus incubates start-ups founded by its researchers, and several of Bengaluru's deep-technology companies, from space launch to medical devices, began in its laboratories.",
      "The campus is open to visitors, and the annual open day, held on a weekend in early March, fills it with school groups touring laboratories. Its wooded grounds are also one of the city's quieter places for a walk, home to a surprising number of birds and the occasional slender loris.",
    ],
  },
  {
    language: "en",
    title: "Agumbe after the monsoon: the Western Ghats village that calls itself the Cherrapunji of the South",
    photo: ["File:Agumbe_View_point.jpg", "File:Agumbe_(16201780601).jpg", "Agumbe"],
    category: "others",
    paragraphs: [
      "The road from Udupi climbs through fourteen hairpin bends to Agumbe, a village of a few hundred people on the crest of the Western Ghats in Shivamogga district, where the monsoon dumps more rain than almost anywhere else in southern India. In October the clouds lift, the leeches thin out, and the rainforest that surrounds the village is at its lushest.",
      "Agumbe is known to a generation of Indians as the setting of the television series Malgudi Days, filmed in and around its old houses. To naturalists it is the home of the king cobra, studied for decades from a research station in the forest, and of a dense rainforest that holds lion-tailed macaques, hornbills and more species of frog than most countries.",
      "The sunset viewpoint at the edge of the village looks straight down the escarpment to the Arabian Sea, forty kilometres away, and on a clear evening the sun drops into the water in full view. A network of short trails leads to waterfalls, the best of them running strongly for weeks after the rains end.",
      "Accommodation is limited to a few homestays, and the village has no petrol pump and patchy mobile coverage, which is part of its appeal. Visitors are asked to stay on the trails, hire local guides for the forest, and leave the snakes, which are protected, to the researchers.",
    ],
  },
];

type Photo = { url: string; page: string; author: string; licence: string; width: number; height: number };

type CommonsPage = {
  index?: number;
  imageinfo?: {
    width: number;
    height: number;
    thumburl?: string;
    descriptionurl: string;
    extmetadata?: Record<string, { value: string } | undefined>;
  }[];
};

/** Commons answers slowly and rate-limits bursts ("too many requests"): a few tries, a pause between them. */
async function commonsQuery(params: URLSearchParams): Promise<CommonsPage[]> {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await pause(6_000 * attempt);
    const response = await fetch(`${COMMONS}?${params}`, { headers: HEADERS, signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (!response?.ok) continue;
    const data = (await response.json().catch(() => null)) as { query?: { pages?: Record<string, CommonsPage> } } | null;
    if (!data) continue;
    return Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  }
  return [];
}

const IMAGE_PROPS = { prop: "imageinfo", iiprop: "url|extmetadata|size", iiurlwidth: "1600", format: "json" };

/**
 * An openly licensed, landscape photo (≥ 1200 px wide): the named file when `search` is a "File:…" title, else the
 * first such result of a Commons search.
 */
async function commonsPhoto(search: string): Promise<Photo | null> {
  const params = search.startsWith("File:")
    ? new URLSearchParams({ action: "query", titles: search, ...IMAGE_PROPS })
    : new URLSearchParams({ action: "query", generator: "search", gsrnamespace: "6", gsrsearch: `${search} filetype:bitmap`, gsrlimit: "20", ...IMAGE_PROPS });
  for (const page of await commonsQuery(params)) {
    const info = page.imageinfo?.[0];
    const licence = plain(info?.extmetadata?.LicenseShortName?.value ?? "");
    if (!info?.thumburl || !OPEN.test(licence) || info.width < 1200 || info.width < info.height) continue;
    return {
      url: info.thumburl,
      page: info.descriptionurl,
      author: plain(info.extmetadata?.Artist?.value ?? "") || "Wikimedia Commons",
      licence,
      width: info.width,
      height: info.height,
    };
  }
  return null;
}

/** The first of the story's searches with an open photo whose file downloads. */
async function findPhoto(searches: string[]): Promise<{ photo: Photo; buffer: Buffer } | null> {
  for (const search of searches) {
    await pause(2_000);
    const photo = await commonsPhoto(search);
    if (!photo) continue;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await pause(5_000);
      const image = await fetch(photo.url, { headers: HEADERS, signal: AbortSignal.timeout(60_000) }).catch(() => null);
      if (image?.ok) return { photo, buffer: Buffer.from(await image.arrayBuffer()) };
    }
  }
  return null;
}

const CREDIT: Record<Story["language"], string> = { kn: "ಚಿತ್ರ", en: "Photo" };

async function main() {
  if (env.isProduction || !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(env.FRONTEND_URL)) {
    throw new Error("Demo news is for local development only");
  }
  // Demo Verified reporters only (never the owner's or any real account), each filing in a language they write.
  const reporters = await db
    .select({ id: user.id, languages: pressPass.languages })
    .from(user)
    .innerJoin(pressPass, eq(pressPass.userId, user.id))
    .where(
      and(
        like(user.email, `%@${DEMO_EMAIL_DOMAIN}`),
        eq(pressPass.level, "verified"),
        isNull(pressPass.revokedAt),
        isNotNull(user.username),
        eq(user.role, "reporter"),
      ),
    );
  const pools = {
    kn: reporters.filter((r) => r.languages.includes("kn")),
    en: reporters.filter((r) => r.languages.includes("en")),
  };
  for (const language of ["kn", "en"] as const) {
    if (pools[language].length === 0) throw new Error(`No demo Verified reporters who write in ${language}`);
  }
  const turns = { kn: 0, en: 0 };

  // Newest first, Kannada and English taking turns (the list keeps each language together).
  const slots = new Map<Story, number>();
  for (const language of ["kn", "en"] as const) {
    STORIES.filter((story) => story.language === language).forEach((story, rank) => slots.set(story, rank * 2 + (language === "kn" ? 0 : 1)));
  }

  let created = 0;
  let skipped = 0;
  let noPhoto = 0;
  for (const [index, story] of STORIES.entries()) {
    const [existing] = await db.select({ id: article.id }).from(article).where(eq(article.title, story.title)).limit(1);
    if (existing) {
      skipped++;
      continue;
    }
    const found = await findPhoto(story.photo);
    const cover = found ? await processImage(found.buffer, "cover").catch(() => null) : null;
    const articleImage = found ? await processImage(found.buffer, "article").catch(() => null) : null;
    if (!found || !cover || !articleImage) {
      console.warn(`[seed-fresh-stories] no open photo for “${story.title}” — skipped`);
      noPhoto++;
      continue;
    }
    const pool = pools[story.language];
    const reporter = pool[turns[story.language]++ % pool.length] as (typeof pool)[number];
    const coverKey = newImageKey("cover", reporter.id);
    const coverUrl = await storage.put(coverKey, cover.buffer, cover.contentType);
    const articleImageKey = newImageKey("cover", reporter.id);
    const articleImageUrl = await storage.put(articleImageKey, articleImage.buffer, articleImage.contentType);
    const bodyHtml = sanitizeArticleHtml(
      story.paragraphs.map((p) => `<p>${escape(p)}</p>`).join("") +
        `<p><em>${CREDIT[story.language]}: ${escape(found.photo.author)} · <a href="${escape(found.photo.page)}">Wikimedia Commons</a> · ${escape(found.photo.licence)}</em></p>`,
    );
    const bodyText = htmlToText(bodyHtml);
    // Spread over the last day and a half.
    const publishedAt = new Date(Date.now() - ((slots.get(story) ?? index) * 95 + 20) * 60_000);
    const values = {
      authorId: reporter.id,
      status: "published" as const,
      title: story.title,
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
        console.log(`[seed-fresh-stories] (${story.language}) ${story.title} — photo: ${found.photo.page}`);
        break;
      } catch (error) {
        if (attempt < 3 && isLinkCollision(error)) continue;
        throw error;
      }
    }
  }
  console.log(`[seed-fresh-stories] ${created} new stories, ${skipped} already there, ${noPhoto} without an open photo`);
}

try {
  await main();
} catch (error) {
  console.error("[seed-fresh-stories] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
