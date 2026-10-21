/**
 * Kannada stories from Dakshina Kannada for local development (owner 2026-10-10: "add Kannada articles for Dakshina
 * Kannada, a source image is a must"). No openly licensed Kannada news covers the district, so these are features
 * about its well-known places and traditions, written for WebNEWS, each with a photo from Wikimedia Commons under an
 * open licence (CC BY / CC BY-SA / CC0 / public domain) and the credit those licences ask for: the author, the
 * licence and a link to the file. Filed by the Verified reporters who write in Kannada, in turn. Idempotent: a story
 * already there (same title) is skipped. Local development only.
 *
 *   node --import tsx scripts/seed-dk-kannada.ts
 */
import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { closeDatabase, db } from "../src/db/client.js";
import { article, pressPass, user } from "../src/db/schema.js";
import { env } from "../src/env.js";
import { htmlToExcerptText, htmlToText, makeExcerpt, readingMinutes } from "../src/lib/format.js";
import { processImage } from "../src/lib/images.js";
import { sanitizeArticleHtml } from "../src/lib/sanitize.js";
import { isLinkCollision, makeShortCode, makeSlug } from "../src/lib/slug.js";
import { newImageKey, storage } from "../src/lib/storage.js";
import { POSTER_TEMPLATE_VALUES, type Category } from "../src/shared/contracts.js";

const COMMONS = "https://commons.wikimedia.org/w/api.php";
const HEADERS = { "User-Agent": "WebNEWS-local-dev-seed/1.0" };
const OPEN = /^(CC BY(-SA)? [\d.]+|CC0|Public domain)/i;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const escape = (text: string) => text.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

type Story = { title: string; photo: string; category: Category; paragraphs: string[] };

const STORIES: Story[] = [
  {
    title: "ಪಿಲಿಕುಳ ನಿಸರ್ಗಧಾಮ: ಮಂಗಳೂರಿನ ಹಸಿರು ಮಡಿಲಲ್ಲಿ ಒಂದು ದಿನ",
    photo: "Pilikula Nisargadhama",
    category: "karnataka",
    paragraphs: [
      "ಮಂಗಳೂರು ನಗರದಿಂದ ಸುಮಾರು 12 ಕಿಲೋಮೀಟರ್ ದೂರದ ವಾಮಂಜೂರು ಬಳಿ ಇರುವ ಪಿಲಿಕುಳ ನಿಸರ್ಗಧಾಮ ದಕ್ಷಿಣ ಕನ್ನಡದ ಪ್ರಮುಖ ಪ್ರವಾಸಿ ತಾಣಗಳಲ್ಲಿ ಒಂದು. ಕೆರೆ, ಕಾಡು ಮತ್ತು ಹಸಿರಿನಿಂದ ಕೂಡಿದ ಈ ವಿಶಾಲ ಪ್ರದೇಶ ಕುಟುಂಬ ಸಮೇತ ಒಂದು ದಿನ ಕಳೆಯಲು ಸೂಕ್ತ ಸ್ಥಳ.",
      "ಇಲ್ಲಿನ ಜೈವಿಕ ಉದ್ಯಾನದಲ್ಲಿ ಪಶ್ಚಿಮ ಘಟ್ಟಗಳ ಹಲವು ಪ್ರಾಣಿ ಪಕ್ಷಿಗಳನ್ನು ಕಾಣಬಹುದು. ಸಸ್ಯೋದ್ಯಾನ, ದೋಣಿ ವಿಹಾರಕ್ಕೆ ಕೆರೆ, ವಿಜ್ಞಾನ ಕೇಂದ್ರ ಹಾಗೂ ತಾರಾಲಯ ಮಕ್ಕಳಿಗೂ ದೊಡ್ಡವರಿಗೂ ಆಕರ್ಷಣೆ.",
      "ಪಿಲಿಕುಳದ ಪಾರಂಪರಿಕ ಗ್ರಾಮದಲ್ಲಿ ತುಳುನಾಡಿನ ಹಳೆಯ ಗುತ್ತು ಮನೆ, ಕುಂಬಾರಿಕೆ, ನೇಯ್ಗೆ ಮತ್ತಿತರ ಗ್ರಾಮೀಣ ಕಸುಬುಗಳನ್ನು ಹತ್ತಿರದಿಂದ ನೋಡಬಹುದು. ಕರಾವಳಿಯ ಜೀವನಶೈಲಿಯನ್ನು ಹೊಸ ತಲೆಮಾರಿಗೆ ಪರಿಚಯಿಸುವ ಪ್ರಯತ್ನ ಇದು.",
      "ವಾರಾಂತ್ಯ ಮತ್ತು ರಜಾದಿನಗಳಲ್ಲಿ ಹೆಚ್ಚು ಜನಸಂದಣಿ ಇರುತ್ತದೆ. ಬೆಳಗ್ಗೆ ಬೇಗ ತಲುಪಿದರೆ ಎಲ್ಲ ವಿಭಾಗಗಳನ್ನು ನಿಧಾನವಾಗಿ ನೋಡಬಹುದು.",
    ],
  },
  {
    title: "ಪಣಂಬೂರು ಕಡಲತೀರ: ಸಂಜೆಯ ಸೂರ್ಯಾಸ್ತಕ್ಕೆ ಮಂಗಳೂರಿನ ನೆಚ್ಚಿನ ತಾಣ",
    photo: "Panambur beach Mangalore",
    category: "karnataka",
    paragraphs: [
      "ನವ ಮಂಗಳೂರು ಬಂದರಿನ ಸಮೀಪದಲ್ಲಿರುವ ಪಣಂಬೂರು ಕಡಲತೀರ ಮಂಗಳೂರಿಗರ ಸಂಜೆಯ ನೆಚ್ಚಿನ ಸ್ಥಳ. ಅಗಲವಾದ ಮರಳ ದಂಡೆ ಮತ್ತು ಅರಬ್ಬೀ ಸಮುದ್ರದ ಸೂರ್ಯಾಸ್ತ ನೋಡಲು ದೂರದೂರಿನಿಂದಲೂ ಜನರು ಬರುತ್ತಾರೆ.",
      "ಕರಾವಳಿಯ ಹಬ್ಬಗಳ ಸಂದರ್ಭದಲ್ಲಿ ಇಲ್ಲಿ ಗಾಳಿಪಟ ಉತ್ಸವ, ಮರಳು ಶಿಲ್ಪ ಸ್ಪರ್ಧೆಗಳಂತಹ ಕಾರ್ಯಕ್ರಮಗಳು ನಡೆಯುತ್ತವೆ. ಕಡಲತೀರದ ಬದಿಯಲ್ಲಿ ತಿಂಡಿ ಅಂಗಡಿಗಳೂ ಇವೆ.",
      "ಮಳೆಗಾಲದಲ್ಲಿ ಸಮುದ್ರ ಪ್ರಕ್ಷುಬ್ಧವಾಗಿರುವುದರಿಂದ ನೀರಿಗೆ ಇಳಿಯದಂತೆ ಜೀವರಕ್ಷಕರು ಎಚ್ಚರಿಸುತ್ತಾರೆ. ಸುರಕ್ಷತಾ ಸೂಚನೆಗಳನ್ನು ಪಾಲಿಸುವುದು ಮುಖ್ಯ.",
    ],
  },
  {
    title: "ಕುದ್ರೋಳಿ ಗೋಕರ್ಣನಾಥ ಕ್ಷೇತ್ರ: ಮಂಗಳೂರು ದಸರಾದ ಕೇಂದ್ರ",
    photo: "Kudroli Gokarnanatheshwara Temple",
    category: "karnataka",
    paragraphs: [
      "ಮಂಗಳೂರಿನ ಕುದ್ರೋಳಿಯಲ್ಲಿರುವ ಶ್ರೀ ಗೋಕರ್ಣನಾಥ ಕ್ಷೇತ್ರ ನಗರದ ಪ್ರಮುಖ ದೇವಾಲಯಗಳಲ್ಲಿ ಒಂದು. 1912ರಲ್ಲಿ ಶ್ರೀ ನಾರಾಯಣ ಗುರುಗಳು ಇಲ್ಲಿ ಶಿವಲಿಂಗವನ್ನು ಪ್ರತಿಷ್ಠಾಪಿಸಿದರು.",
      "ಪ್ರತಿ ವರ್ಷ ನವರಾತ್ರಿಯಲ್ಲಿ ನಡೆಯುವ ಮಂಗಳೂರು ದಸರಾ ಕುದ್ರೋಳಿಯ ಹೆಗ್ಗುರುತು. ನವದುರ್ಗೆಯರ ಮೂರ್ತಿಗಳು, ದೀಪಾಲಂಕಾರ ಮತ್ತು ವಿಜಯದಶಮಿಯ ಭವ್ಯ ಶೋಭಾಯಾತ್ರೆ ನೋಡಲು ಸಾವಿರಾರು ಜನರು ಸೇರುತ್ತಾರೆ.",
      "ದಸರಾ ದಿನಗಳಲ್ಲಿ ನಗರದ ಸಂಚಾರದಲ್ಲಿ ಬದಲಾವಣೆಗಳಿರುತ್ತವೆ. ಭಕ್ತರು ಸಾರ್ವಜನಿಕ ಸಾರಿಗೆ ಬಳಸುವುದು ಉತ್ತಮ.",
    ],
  },
  {
    title: "ಕಂಬಳ: ಕರಾವಳಿಯ ಕೆಸರುಗದ್ದೆಯಲ್ಲಿ ಕೋಣಗಳ ಓಟದ ಸಂಭ್ರಮ",
    photo: "Kambala buffalo race",
    category: "karnataka",
    paragraphs: [
      "ಕಂಬಳ ದಕ್ಷಿಣ ಕನ್ನಡ ಮತ್ತು ಉಡುಪಿ ಜಿಲ್ಲೆಗಳ ಸಾಂಪ್ರದಾಯಿಕ ಜಾನಪದ ಕ್ರೀಡೆ. ಕೆಸರು ತುಂಬಿದ ಗದ್ದೆಯ ಜೋಡಿ ಕರೆಗಳಲ್ಲಿ ಕೋಣಗಳ ಜೋಡಿಗಳು ಓಡುತ್ತವೆ, ಅವುಗಳನ್ನು ಓಟಗಾರರು ಮುನ್ನಡೆಸುತ್ತಾರೆ.",
      "ಸಾಮಾನ್ಯವಾಗಿ ನವೆಂಬರ್‌ನಿಂದ ಮಾರ್ಚ್‌ವರೆಗೆ ಕಂಬಳ ಋತು. ಹಳ್ಳಿಗಳ ಕಂಬಳಗಳಿಂದ ಹಿಡಿದು ದೊಡ್ಡ ಸ್ಪರ್ಧಾತ್ಮಕ ಕಂಬಳಗಳವರೆಗೆ ಹಲವು ಕೂಟಗಳು ನಡೆಯುತ್ತವೆ.",
      "ಕೃಷಿ ಸಂಸ್ಕೃತಿಯಿಂದ ಹುಟ್ಟಿದ ಈ ಕ್ರೀಡೆ ತುಳುನಾಡಿನ ಅಸ್ಮಿತೆಯ ಭಾಗ. ಪ್ರಾಣಿಗಳ ಸುರಕ್ಷತೆಗೆ ಸಂಬಂಧಿಸಿದ ನಿಯಮಗಳನ್ನು ಪಾಲಿಸಿ ಕಂಬಳ ನಡೆಸಬೇಕು ಎಂಬುದು ಆಯೋಜಕರ ಮಾತು.",
    ],
  },
  {
    title: "ಯಕ್ಷಗಾನ: ಚೆಂಡೆಯ ಸದ್ದಿನಲ್ಲಿ ರಾತ್ರಿಯಿಡೀ ಕರಾವಳಿಯ ರಂಗಸ್ಥಳ",
    photo: "Yakshagana performance",
    category: "entertainment",
    paragraphs: [
      "ಯಕ್ಷಗಾನ ಕರಾವಳಿ ಕರ್ನಾಟಕದ ಹೆಮ್ಮೆಯ ರಂಗಕಲೆ. ಭಾಗವತರ ಹಾಡು, ಚೆಂಡೆ-ಮದ್ದಳೆಯ ಹಿಮ್ಮೇಳ, ವರ್ಣರಂಜಿತ ವೇಷಭೂಷಣ ಮತ್ತು ಕುಣಿತ ಸೇರಿ ಪುರಾಣದ ಕಥೆಗಳು ರಂಗದ ಮೇಲೆ ಜೀವ ಪಡೆಯುತ್ತವೆ.",
      "ದಕ್ಷಿಣ ಕನ್ನಡದಲ್ಲಿ ಹಲವು ಮೇಳಗಳು ಮಳೆಗಾಲ ಮುಗಿದ ನಂತರ ತಿರುಗಾಟ ಆರಂಭಿಸುತ್ತವೆ. ಹಳ್ಳಿ ಹಳ್ಳಿಗಳಲ್ಲಿ ರಾತ್ರಿಯಿಡೀ ಆಟಗಳು ನಡೆಯುತ್ತವೆ.",
      "ಇತ್ತೀಚಿನ ವರ್ಷಗಳಲ್ಲಿ ಯುವಜನರು ಮತ್ತು ವಿದ್ಯಾರ್ಥಿಗಳು ಯಕ್ಷಗಾನ ತರಬೇತಿಗೆ ಸೇರುತ್ತಿರುವುದು ಈ ಕಲೆಯ ಭವಿಷ್ಯದ ಬಗ್ಗೆ ಭರವಸೆ ಮೂಡಿಸಿದೆ.",
    ],
  },
  {
    title: "ಧರ್ಮಸ್ಥಳ: ನೇತ್ರಾವತಿ ತೀರದ ಶ್ರೀ ಮಂಜುನಾಥ ಕ್ಷೇತ್ರ",
    photo: "Dharmasthala temple",
    category: "karnataka",
    paragraphs: [
      "ಬೆಳ್ತಂಗಡಿ ತಾಲ್ಲೂಕಿನ ಧರ್ಮಸ್ಥಳ ನೇತ್ರಾವತಿ ನದಿಯ ತೀರದಲ್ಲಿರುವ ಪ್ರಸಿದ್ಧ ಯಾತ್ರಾ ಸ್ಥಳ. ಶ್ರೀ ಮಂಜುನಾಥ ಸ್ವಾಮಿಯ ದರ್ಶನಕ್ಕೆ ರಾಜ್ಯದ ಮೂಲೆ ಮೂಲೆಯಿಂದ ಭಕ್ತರು ಬರುತ್ತಾರೆ.",
      "ಕ್ಷೇತ್ರದಲ್ಲಿ ಪ್ರತಿದಿನ ಸಾವಿರಾರು ಭಕ್ತರಿಗೆ ಅನ್ನದಾನ ನಡೆಯುತ್ತದೆ. ಸಮೀಪದ ರತ್ನಗಿರಿ ಬೆಟ್ಟದ ಮೇಲಿನ ಬಾಹುಬಲಿ ಮೂರ್ತಿ ಮತ್ತೊಂದು ಆಕರ್ಷಣೆ.",
      "ಹಬ್ಬದ ದಿನಗಳು ಮತ್ತು ವಾರಾಂತ್ಯಗಳಲ್ಲಿ ಹೆಚ್ಚಿನ ಜನಸಂದಣಿ ಇರುವುದರಿಂದ ದರ್ಶನಕ್ಕೆ ಹೆಚ್ಚು ಸಮಯ ಹಿಡಿಯಬಹುದು.",
    ],
  },
  {
    title: "ಕುಕ್ಕೆ ಸುಬ್ರಹ್ಮಣ್ಯ: ಕುಮಾರಧಾರ ತೀರದ ಪಶ್ಚಿಮ ಘಟ್ಟದ ಕ್ಷೇತ್ರ",
    photo: "Kukke Subramanya Temple",
    category: "karnataka",
    paragraphs: [
      "ಸುಳ್ಯ ತಾಲ್ಲೂಕಿನಲ್ಲಿರುವ ಕುಕ್ಕೆ ಸುಬ್ರಹ್ಮಣ್ಯ ದೇವಸ್ಥಾನ ಪಶ್ಚಿಮ ಘಟ್ಟಗಳ ತಪ್ಪಲಿನಲ್ಲಿ ಕುಮಾರಧಾರ ನದಿಯ ಬಳಿ ಇದೆ. ಸುತ್ತಲಿನ ದಟ್ಟ ಕಾಡು ಮತ್ತು ಬೆಟ್ಟಗಳು ಈ ಸ್ಥಳಕ್ಕೆ ವಿಶೇಷ ಸೊಬಗು ನೀಡುತ್ತವೆ.",
      "ಕುಮಾರಪರ್ವತ ಚಾರಣಕ್ಕೆ ಹೋಗುವವರಿಗೂ ಸುಬ್ರಹ್ಮಣ್ಯವೇ ಆರಂಭದ ಸ್ಥಳ. ಚಾರಣಕ್ಕೆ ಅರಣ್ಯ ಇಲಾಖೆಯ ಅನುಮತಿ ಮತ್ತು ನಿಯಮಗಳು ಅನ್ವಯಿಸುತ್ತವೆ.",
      "ಮಂಗಳೂರಿನಿಂದ ರಸ್ತೆ ಮತ್ತು ರೈಲು ಮಾರ್ಗವಾಗಿ ಸುಬ್ರಹ್ಮಣ್ಯ ತಲುಪಬಹುದು.",
    ],
  },
  {
    title: "ಸುಲ್ತಾನ್ ಬತ್ತೇರಿ: ಗುರುಪುರ ನದಿ ತೀರದ ಐತಿಹಾಸಿಕ ಕಾವಲು ಗೋಪುರ",
    photo: "Sultan Battery Mangalore",
    category: "karnataka",
    paragraphs: [
      "ಮಂಗಳೂರಿನ ಬೋಳೂರು ಬಳಿ ಗುರುಪುರ ನದಿಯ ದಡದಲ್ಲಿರುವ ಸುಲ್ತಾನ್ ಬತ್ತೇರಿ ಟಿಪ್ಪು ಸುಲ್ತಾನನ ಕಾಲದ ಕಾವಲು ಗೋಪುರ. ನದಿಯ ಮೂಲಕ ಬರುವ ಹಡಗುಗಳ ಮೇಲೆ ನಿಗಾ ಇಡಲು ಇದನ್ನು ಕಟ್ಟಲಾಗಿತ್ತು ಎನ್ನಲಾಗುತ್ತದೆ.",
      "ಕಪ್ಪು ಕಲ್ಲಿನ ಈ ರಚನೆ ಕೋಟೆಯಂತೆ ಕಾಣುತ್ತದೆ. ಮೇಲಿನಿಂದ ನದಿ ಮತ್ತು ಸುತ್ತಲಿನ ಪ್ರದೇಶದ ಸುಂದರ ನೋಟ ಸಿಗುತ್ತದೆ.",
      "ಇಲ್ಲಿಂದ ತಣ್ಣೀರುಬಾವಿ ಕಡಲತೀರಕ್ಕೆ ದೋಣಿ ಸೌಲಭ್ಯವೂ ಇದೆ. ಇತಿಹಾಸ ಮತ್ತು ಪ್ರಕೃತಿ ಎರಡನ್ನೂ ಒಟ್ಟಿಗೆ ಆನಂದಿಸಲು ಇದು ಸೂಕ್ತ ಸ್ಥಳ.",
    ],
  },
  {
    title: "ಮಂಗಳೂರು ಬಂದರು: ಮೀನುಗಾರಿಕೆಯ ಬೆಳಗಿನ ಸಂತೆ",
    photo: "Mangalore harbour",
    category: "business",
    paragraphs: [
      "ಮಂಗಳೂರಿನ ಹಳೆ ಬಂದರಿನ ಮೀನುಗಾರಿಕಾ ಧಕ್ಕೆ ಬೆಳಗಿನ ಜಾವದಿಂದಲೇ ಚಟುವಟಿಕೆಯಿಂದ ತುಂಬಿರುತ್ತದೆ. ಸಮುದ್ರದಿಂದ ಮರಳಿದ ದೋಣಿಗಳಿಂದ ಮೀನು ಇಳಿಸುವುದು, ಹರಾಜು ಮತ್ತು ಸಾಗಣೆ ಒಂದೇ ಸಮಯದಲ್ಲಿ ನಡೆಯುತ್ತವೆ.",
      "ಮೀನುಗಾರಿಕೆ ದಕ್ಷಿಣ ಕನ್ನಡದ ಆರ್ಥಿಕತೆಯ ಪ್ರಮುಖ ಆಧಾರ. ಸಾವಿರಾರು ಕುಟುಂಬಗಳು ಮೀನುಗಾರಿಕೆ, ಸಂಸ್ಕರಣೆ ಮತ್ತು ಮಾರಾಟದ ಮೇಲೆ ಅವಲಂಬಿತವಾಗಿವೆ.",
      "ಮಳೆಗಾಲದಲ್ಲಿ ಮೀನಿನ ಸಂತಾನೋತ್ಪತ್ತಿಗಾಗಿ ಯಾಂತ್ರೀಕೃತ ಮೀನುಗಾರಿಕೆಗೆ ನಿಷೇಧ ಇರುತ್ತದೆ. ನಿಷೇಧ ಮುಗಿದ ನಂತರ ಬಂದರು ಮತ್ತೆ ಗಿಜಿಗುಡುತ್ತದೆ.",
    ],
  },
  {
    title: "ಉಳ್ಳಾಲ ಮತ್ತು ಸೋಮೇಶ್ವರ: ಕಲ್ಲುಬಂಡೆಗಳ ನಡುವೆ ಅಲೆಗಳ ಆಟ",
    photo: "Someshwara beach Ullal",
    category: "karnataka",
    paragraphs: [
      "ಮಂಗಳೂರು ನಗರದ ದಕ್ಷಿಣಕ್ಕಿರುವ ಉಳ್ಳಾಲ ಮತ್ತು ಸೋಮೇಶ್ವರ ಕಡಲತೀರಗಳು ಕಲ್ಲುಬಂಡೆಗಳು ಮತ್ತು ಅಬ್ಬರದ ಅಲೆಗಳಿಗೆ ಹೆಸರುವಾಸಿ.",
      "ಸೋಮೇಶ್ವರ ದೇವಸ್ಥಾನದ ಬಳಿಯ ಬಂಡೆಗಳ ಮೇಲೆ ನಿಂತು ಸೂರ್ಯಾಸ್ತ ನೋಡುವುದು ಸ್ಥಳೀಯರ ನೆಚ್ಚಿನ ಹವ್ಯಾಸ.",
      "ಕಡಲ್ಕೊರೆತ ಹೆಚ್ಚಿರುವ ಈ ಭಾಗದಲ್ಲಿ ಬಂಡೆಗಳ ಮೇಲೆ ಜಾರುವ ಅಪಾಯ ಇರುವುದರಿಂದ ಪ್ರವಾಸಿಗರು ಎಚ್ಚರಿಕೆಯಿಂದ ಇರಬೇಕು.",
    ],
  },
];

type Photo = { url: string; page: string; author: string; licence: string; width: number; height: number };

/** The first openly licensed, landscape photo Commons finds for the search (≥ 1200 px wide). */
async function commonsPhoto(search: string): Promise<Photo | null> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrnamespace: "6",
    gsrsearch: `${search} filetype:bitmap`,
    gsrlimit: "15",
    prop: "imageinfo",
    iiprop: "url|extmetadata|size",
    iiurlwidth: "1600",
    format: "json",
  });
  const response = await fetch(`${COMMONS}?${params}`, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          index: number;
          imageinfo?: {
            width: number;
            height: number;
            thumburl?: string;
            descriptionurl: string;
            extmetadata?: Record<string, { value: string } | undefined>;
          }[];
        }
      >;
    };
  };
  const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => a.index - b.index);
  for (const page of pages) {
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

async function main() {
  if (env.isProduction || !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(env.FRONTEND_URL)) {
    throw new Error("Demo news is for local development only");
  }
  const reporters = (
    await db
      .select({ id: user.id, languages: pressPass.languages })
      .from(user)
      .innerJoin(pressPass, eq(pressPass.userId, user.id))
      .where(and(eq(pressPass.level, "verified"), isNull(pressPass.revokedAt), isNotNull(user.username), ne(user.role, "admin")))
  ).filter((r) => r.languages.includes("kn"));
  if (reporters.length === 0) throw new Error("No Verified reporters who write in Kannada");

  let created = 0;
  let skipped = 0;
  let noPhoto = 0;
  for (const [index, story] of STORIES.entries()) {
    const [existing] = await db.select({ id: article.id }).from(article).where(eq(article.title, story.title)).limit(1);
    if (existing) {
      skipped++;
      continue;
    }
    await pause(1000);
    const photo = await commonsPhoto(story.photo);
    const image = photo ? await fetch(photo.url, { headers: HEADERS, signal: AbortSignal.timeout(60_000) }) : null;
    const cover = image?.ok ? await processImage(Buffer.from(await image.arrayBuffer()), "cover").catch(() => null) : null;
    if (!photo || !cover) {
      console.warn(`[seed-dk-kannada] no open photo for “${story.photo}” — skipped`);
      noPhoto++;
      continue;
    }
    const reporter = reporters[index % reporters.length] as (typeof reporters)[number];
    const coverKey = newImageKey("cover", reporter.id);
    const coverUrl = await storage.put(coverKey, cover.buffer, cover.contentType);
    const bodyHtml = sanitizeArticleHtml(
      story.paragraphs.map((p) => `<p>${escape(p)}</p>`).join("") +
        `<p><em>ಚಿತ್ರ: ${escape(photo.author)} · <a href="${escape(photo.page)}">Wikimedia Commons</a> · ${escape(photo.licence)}</em></p>`,
    );
    const bodyText = htmlToText(bodyHtml);
    // Spread over the last few days so they don't all sit at the top of the feed.
    const publishedAt = new Date(Date.now() - (index * 7 + 2) * 60 * 60_000);
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
      category: story.category,
      district: story.category === "karnataka" ? "Dakshina Kannada" : null,
      language: "kn" as const,
      template: POSTER_TEMPLATE_VALUES[index % POSTER_TEMPLATE_VALUES.length],
      createdAt: publishedAt,
      updatedAt: publishedAt,
      publishedAt,
    };
    for (let attempt = 0; ; attempt++) {
      try {
        await db.insert(article).values({ ...values, slug: makeSlug(story.title), shortCode: makeShortCode() });
        created++;
        console.log(`[seed-dk-kannada] ${story.title} — photo: ${photo.page}`);
        break;
      } catch (error) {
        if (attempt < 3 && isLinkCollision(error)) continue;
        throw error;
      }
    }
  }
  console.log(`[seed-dk-kannada] ${created} new stories, ${skipped} already there, ${noPhoto} without an open photo`);
}

try {
  await main();
} catch (error) {
  console.error("[seed-dk-kannada] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
