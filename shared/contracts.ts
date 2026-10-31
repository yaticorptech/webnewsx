/**
 * WebNEWS shared contract — SOURCE OF TRUTH.
 *
 * Copied verbatim into backend/src/shared/contracts.ts and frontend/lib/shared/contracts.ts
 * by `node scripts/sync-shared.mjs` so each app deploys on its own. Edit ONLY this file,
 * then run `npm run sync:shared` from the repo root.
 *
 * Must stay dependency-free except for `zod` (installed in both apps).
 */
import { z } from "zod";

/* ─────────────────────────── Username rules ─────────────────────────── */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

/** Lowercase letters and dots only; 3–30 chars; no leading/trailing dot; no "..". */
export const USERNAME_REGEX = /^(?=.{3,30}$)(?!\.)(?!.*\.\.)(?!.*\.$)[a-z.]+$/;

export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "a", "about", "admin", "api", "auth", "brand", "dev", "drafts", "edit", "explore", "favicon",
  "feed", "help", "home", "icon", "live", "login", "logout", "manifest", "me", "media", "messages",
  "new", "news", "notifications", "null", "official", "onboarding", "privacy", "publish", "register",
  "robots", "root", "search", "settings", "signin", "signup", "sitemap", "staff", "static", "support",
  "terms", "top", "trending", "undefined", "web.news", "webnews", "you",
  // Roles (SPEC §3.11): newsroom routes and titles.
  "desk", "editor", "editors", "newsroom", "press", "press.pass", "presspass", "reporter", "reporters",
  "review", "saved", "spotlight",
  // Story categories (/category/…).
  "categories", "category",
  // Messages, groups and communities (owner 2026-09-30).
  "chat", "chats", "communities", "community", "direct", "group", "groups", "inbox", "invites",
  // Newsy — the 9:16 feed, first called Reels (owner 2026-09-30).
  "newsy", "reel", "reels",
  // Publisher websites (owner 2026-10-29).
  "pub", "site-setup",
]);

export type UsernameIssue =
  | "too_short"
  | "too_long"
  | "invalid_chars"
  | "leading_dot"
  | "trailing_dot"
  | "double_dot"
  | "pattern"
  | "reserved"
  | "taken";

export const USERNAME_MESSAGES: Record<UsernameIssue, string> = {
  too_short: `Username must be at least ${USERNAME_MIN} characters`,
  too_long: `Username can be at most ${USERNAME_MAX} characters`,
  invalid_chars: "Only letters and dots allowed",
  leading_dot: "Can't start with a dot",
  trailing_dot: "Can't end with a dot",
  double_dot: "No consecutive dots",
  pattern: "Use at least 4 letters, a dot, then at least 2 letters — like hari.ap",
  reserved: "Username is not available",
  taken: "Username is not available",
};

/** Canonical form used for storage and lookups: trimmed, lowercase, leading "@" removed. */
export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@+/, "").toLowerCase();
}

/** For live typing: lowercase and drop every character that can never be valid. */
export function sanitizeUsernameInput(input: string): string {
  return input.toLowerCase().replace(/[^a-z.]/g, "").slice(0, USERNAME_MAX);
}

export type UsernameFormatResult = { ok: true } | { ok: false; code: UsernameIssue; message: string };

/** Format + reserved-word check (no database lookup). Expects a normalized username. */
export function validateUsernameFormat(username: string): UsernameFormatResult {
  const fail = (code: UsernameIssue): UsernameFormatResult => ({ ok: false, code, message: USERNAME_MESSAGES[code] });
  if (/[^a-z.]/.test(username)) return fail("invalid_chars");
  if (username.length < USERNAME_MIN) return fail("too_short");
  if (username.length > USERNAME_MAX) return fail("too_long");
  if (username.startsWith(".")) return fail("leading_dot");
  if (username.endsWith(".")) return fail("trailing_dot");
  if (username.includes("..")) return fail("double_dot");
  if (RESERVED_USERNAMES.has(username)) return fail("reserved");
  return { ok: true };
}

/**
 * New usernames (owner 2026-10-15; 4 letters since 2026-10-23): at least 4 letters, a dot, then at least 2 letters — "hari.ap", "ravi.kumar".
 * Checked when an account picks or changes its username; accounts that already have an older, shorter one keep it
 * (USERNAME_REGEX, the database rule and profile links stay as they were).
 */
export const NEW_USERNAME_REGEX = /^[a-z]{4,}(\.[a-z]+)*\.[a-z]{2,}$/;

/** validateUsernameFormat + the new-username pattern. */
export function validateNewUsername(username: string): UsernameFormatResult {
  const base = validateUsernameFormat(username);
  if (!base.ok) return base;
  if (!NEW_USERNAME_REGEX.test(username)) return { ok: false, code: "pattern", message: USERNAME_MESSAGES.pattern };
  return { ok: true };
}

/* ─────────────────────────── Notices (Editor Desk → reporter) ─────────────────────────── */

/**
 * Owner rule (2026-09-25): when the Editor Desk warns a reporter about a reported story — or hides one of their
 * stories — the reporter is told: a banner on every page until they acknowledge it, and the list in their Newsroom.
 */
export const NOTICE_KINDS = ["warning", "story_hidden"] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

export type UserNotice = {
  id: string;
  kind: NoticeKind;
  /** The desk's message (the note written when warning / hiding); null when none was given. */
  message: string | null;
  /** The story it's about (title kept even if the story was deleted since). */
  story: { id: string | null; slug: string | null; title: string | null } | null;
  /** Sent by the automatic report rules (REPORT_RULES), not by an editor. */
  automatic: boolean;
  createdAt: string;
  read: boolean;
};

export type NoticesResponse = { items: UserNotice[]; unread: number };

export const readNoticesSchema = z.object({ ids: z.array(z.string().uuid()).max(100).optional() });
export type ReadNoticesInput = z.input<typeof readNoticesSchema>;

/* ─────────────────────────── Password strength ─────────────────────────── */

/**
 * Owner rule (2026-09-25): an account is only created with a password the meter rates at least "Good" — checked on
 * the sign-up form and again by the API (`WEAK_PASSWORD`). Good = 8+ characters with 3 of the 4 kinds (lower case,
 * upper case, numbers, symbols), or a 16+ character passphrase with 2 kinds; common words, runs like "12345",
 * one repeated character and the name from your own email address always make it Weak.
 */
export const PASSWORD_RULES = { min: 8, max: 128, minScore: 3 } as const;

export type PasswordScore = 0 | 1 | 2 | 3 | 4;
export type PasswordStrength = { score: PasswordScore; label: string; tip: string };

export const WEAK_PASSWORD_MESSAGE =
  "Choose a stronger password: at least 8 characters mixing 3 kinds — upper-case and lower-case letters, numbers or symbols.";

const COMMON_PASSWORD_WORDS = [
  "password", "passw0rd", "qwerty", "asdf", "letmein", "welcome", "iloveyou", "admin", "webnews", "abc123",
  "monkey", "dragon", "football", "cricket", "india", "sunshine", "princess", "login",
];

function hasSequentialRun(value: string): boolean {
  const chars = value.toLowerCase();
  let run = 1;
  for (let i = 1; i < chars.length; i++) {
    const step = chars.charCodeAt(i) - chars.charCodeAt(i - 1);
    run = step === 1 || step === -1 ? run + 1 : 1;
    if (run >= 5) return true;
  }
  return false;
}

/** Scores a password; `avoid` = personal words it must not contain (e.g. the email's name part). */
export function scorePassword(value: string, avoid: readonly string[] = []): PasswordStrength {
  const min = PASSWORD_RULES.min;
  if (!value) return { score: 0, label: "", tip: `Use at least ${min} characters, mixing letters, numbers and symbols.` };
  if (value.length < min) {
    const left = min - value.length;
    return { score: 0, label: "Too short", tip: `${left} more character${left === 1 ? "" : "s"} to go.` };
  }
  const lower = value.toLowerCase();
  if (avoid.some((word) => word.length >= 4 && lower.includes(word.toLowerCase()))) {
    return { score: 1, label: "Weak", tip: "Don't use your email address or name in your password." };
  }
  if (/^(.)\1+$/.test(value) || hasSequentialRun(value) || COMMON_PASSWORD_WORDS.some((word) => lower.includes(word))) {
    return { score: 1, label: "Weak", tip: "Avoid common words and runs like 12345 or abcde." };
  }
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
  const long = value.length >= 16;
  if (kinds >= 4 && value.length >= 12) return { score: 4, label: "Strong", tip: "Strong password." };
  if (kinds >= 3) return long ? { score: 4, label: "Strong", tip: "Strong password." } : { score: 3, label: "Good", tip: "Good password." };
  if (kinds === 2) {
    return long
      ? { score: 3, label: "Good", tip: "Good password." }
      : { score: 2, label: "Fair", tip: "Add a capital letter, a number or a symbol." };
  }
  return long
    ? { score: 2, label: "Fair", tip: "Add a capital letter, a number or a symbol." }
    : { score: 1, label: "Weak", tip: "Mix capital and small letters, numbers and symbols." };
}

/** The name part of an email address ("asha.rao@x.com" → ["asha.rao", "asha", "rao"]), for `scorePassword`'s `avoid`. */
export function emailWords(email: string): string[] {
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  return [local, ...local.split(/[._+-]+/)].filter((word) => word.length >= 4);
}

export function isPasswordStrongEnough(value: string, avoid: readonly string[] = []): boolean {
  return scorePassword(value, avoid).score >= PASSWORD_RULES.minScore;
}

/* ─────────────────────────── Search ─────────────────────────── */

/** `GET /api/search?q=` — the masthead's instant search: people (username / name) and public stories (headline). */
export type SearchResults = { query: string; users: UserRow[]; stories: ArticleCard[] };

export const SEARCH_LIMITS = { queryMax: 80, users: 5, stories: 6 } as const;

/* ─────────────────────────── SEO ─────────────────────────── */

/** `GET /api/sitemap` — every public story and publisher, for sitemap.xml and the Google News sitemap. */
export type SitemapData = {
  articles: Array<{ slug: string; title: string; publishedAt: string; updatedAt: string; coverUrl: string | null }>;
  publishers: Array<{ username: string; updatedAt: string }>;
};

/* ─────────────────────────── Field limits ─────────────────────────── */

export const LIMITS = {
  nameMax: 50,
  bioMax: 160,
  titleMax: 150,
  bodyTextMin: 30,
  bodyTextMax: 20_000,
  linkMax: 2048,
  excerptMax: 280,
  uploadMaxBytes: 8 * 1024 * 1024,
  /** Story videos (owner rule 2026-09-25): at most 30 seconds; a longer clip may be cut to its first 30 seconds. */
  videoMaxSeconds: 30,
  videoUploadMaxBytes: 200 * 1024 * 1024,
} as const;

export const TERMS_VERSION = "2026-09-24";

/* ─────────────────────────── DTOs ─────────────────────────── */

/**
 * Phone accounts (owner 2026-10-22: readers sign up with their WhatsApp number) have no email of their own: Better Auth
 * needs one, so they get `<digits>@phone.webnews.local` — never shown, never mailed.
 */
export const PHONE_ACCOUNT_EMAIL_DOMAIN = "phone.webnews.local";
export const isPhoneAccountEmail = (email: string | null | undefined): boolean => Boolean(email?.endsWith(`@${PHONE_ACCOUNT_EMAIL_DOMAIN}`));

export type ViewerUser = {
  id: string;
  username: string | null;
  name: string;
  image: string | null;
  email: string;
  /** The WhatsApp-verified number the account signs in with (E.164); null for social / Editor Desk accounts. */
  phoneNumber: string | null;
  bio: string | null;
  onboarded: boolean;
  /** SPEC §3.11: every account starts as a Reader; a Press Pass makes it a Reporter; admins are the Editor Desk. */
  role: Role;
  /** Level of the viewer's active Press Pass (null without one — admins may also hold a pass). */
  reporterLevel: ReporterLevel | null;
  pressPass: PressPassSummary | null;
  /** Suspended accounts can't sign in; kept for completeness (their sessions are revoked). */
  suspended: boolean;
  /** Languages they read (sign-up / Settings): their feeds show these first. */
  languages: PressLanguage[];
  /** Their own poster frame (owner 2026-10-08: the "Your frame" template) — a 9:16 image with a see-through middle; null = none yet. */
  posterOverlayUrl: string | null;
  /** Unread notices from the Editor Desk (warnings, hidden stories) — `GET /api/me/notices`. */
  unreadNotices?: number;
  /** Unread bell notifications (new stories from followed publishers, reports on your stories) — `GET /api/me/notifications`. */
  unreadNotifications?: number;
  /** Chats with unread messages (message requests not included) — `GET /api/messages/unread`. */
  unreadMessages?: number;
  /** "group" = a group account (owner 2026-10-23); always sent by the API. */
  accountType?: AccountType;
  /** Stories live on WebNEWS (owner 2026-10-23: "post your first article" popup until the first one). */
  publishedStories?: number;
  /**
   * Posting as a group account: then this whole object is the GROUP, and `actingAs` says who is really signed in and
   * their role in it. Null on your own account. Always sent by the API.
   */
  actingAs?: GroupActor | null;
  /** The group accounts you belong to (to switch into), always listed from your own account. Always sent by the API. */
  groups?: GroupMembershipSummary[];
};

export type AuthorSummary = { id: string; username: string; name: string; image: string | null };

/* ─────────────────────────── Story categories (owner 2026-09-26) ─────────────────────────── */

/**
 * Every published story has exactly one category, chosen in the composer; Karnataka stories also name
 * their district (`KARNATAKA_DISTRICTS`). The values double as URL segments: `/category/<value>` and
 * `/category/karnataka/<district slug>`. Order = the nav's order (main row, then "More").
 */
export const CATEGORY_VALUES = [
  "national",
  "world",
  "sports",
  "entertainment",
  "technology",
  "karnataka",
  "astrology",
  "business",
  "crime",
  "education",
  "cinema",
  "others",
  "politics",
  "press-releases",
  "jobs",
] as const;
export type Category = (typeof CATEGORY_VALUES)[number];
export const CATEGORY_LABELS: Record<Category, string> = {
  national: "National",
  world: "World",
  sports: "Sports",
  entertainment: "Entertainment",
  technology: "Technology",
  karnataka: "Karnataka",
  astrology: "Astrology",
  business: "Business & Economy",
  crime: "Crime & Law",
  education: "Education",
  cinema: "Cinema",
  others: "Others",
  politics: "Politics & Governance",
  "press-releases": "Press Releases",
  jobs: "Job Vacancies",
};
/** Kannada names (webnews.in's own, its prisma/seed.ts; owner 2026-10-30) — publisher sites' Kannada menu. */
export const CATEGORY_LABELS_KN: Record<Category, string> = {
  national: "ರಾಷ್ಟ್ರೀಯ",
  world: "ವಿಶ್ವ",
  sports: "ಕ್ರೀಡೆ",
  entertainment: "ಮನರಂಜನೆ",
  technology: "ತಂತ್ರಜ್ಞಾನ",
  karnataka: "ಕರ್ನಾಟಕ",
  astrology: "ಜ್ಯೋತಿಷ್ಯ",
  business: "ವ್ಯಾಪಾರ ಮತ್ತು ಆರ್ಥಿಕತೆ",
  crime: "ಅಪರಾಧ ಮತ್ತು ಕಾನೂನು",
  education: "ಶಿಕ್ಷಣ",
  cinema: "ಸಿನಿಮಾ",
  others: "ಇತರೆ",
  politics: "ರಾಜಕೀಯ ಮತ್ತು ಆಡಳಿತ",
  "press-releases": "ಪತ್ರಿಕಾ ಪ್ರಕಟಣೆಗಳು",
  jobs: "ಉದ್ಯೋಗಾವಕಾಶಗಳು",
};
/** Stories published before categories existed were filed here (migration 0008). */
export const DEFAULT_CATEGORY: Category = "others";
/** The one category whose stories also carry a district. */
export const DISTRICT_CATEGORY: Category = "karnataka";

/**
 * Sub categories (owner 2026-10-14, approved list): every story picks one when it goes live. Karnataka's are its
 * districts (KARNATAKA_DISTRICTS, stored in `district`); every other category's are below (stored in `subcategory`).
 */
export const SUBCATEGORIES: Record<Exclude<Category, "karnataka">, readonly string[]> = {
  national: ["Politics", "Economy", "Defence", "Infrastructure", "Environment", "Health", "Other"],
  world: ["Asia", "Middle East", "Europe", "Americas", "Africa", "Other"],
  sports: ["Cricket", "Football", "Kabaddi", "Tennis", "Badminton", "Hockey", "Athletics", "Other"],
  entertainment: ["TV", "Music", "OTT & Web", "Celebrity", "Events", "Other"],
  technology: ["Mobiles", "AI", "Internet & Apps", "Gadgets", "Startups", "Science", "Other"],
  astrology: ["Daily", "Weekly", "Festivals", "Vastu", "Other"],
  business: ["Markets", "Banking", "Agriculture", "Industry", "Real Estate", "Other"],
  crime: ["Crime", "Courts", "Police", "Cyber Crime", "Other"],
  education: ["Exams & Results", "Schools", "Colleges", "Admissions", "Scholarships", "Other"],
  cinema: ["Kannada", "Tamil", "Telugu", "Malayalam", "Hindi", "English", "Reviews", "Other"],
  others: ["Lifestyle", "Health", "Food", "Travel", "Other"],
  politics: ["Elections", "Government", "Parties", "Policy", "Other"],
  "press-releases": ["Corporate", "Government", "Events", "Other"],
  jobs: ["Government Jobs", "Private Jobs", "Bank Jobs", "Internships", "Other"],
};

/** The sub category rule for every category but Karnataka (whose district is checked by `districtError`). */
export function subcategoryError(category: Category | null | undefined, subcategory: string | null | undefined): string | null {
  if (!category || category === "karnataka") return null;
  if (!subcategory) return "Choose a sub category";
  return SUBCATEGORIES[category].includes(subcategory) ? null : "Choose a sub category from the list";
}

/** The blurb (owner 2026-10-14): the 2-line summary under the headline, also the feed cards' text. */
/**
 * Blurb length in characters (owner 2026-10-15): at least 50; aim for at most 100 — longer is allowed (the composer shows
 * the part past 100 in red) up to `hardMax`, the cards' text limit (LIMITS.excerptMax).
 */
export const BLURB = { min: 50, max: 100, hardMax: 280 } as const;

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORY_VALUES as readonly string[]).includes(value);
}

/** "Ramanagara (Bengaluru South)" → "ramanagara-bengaluru-south" (URL segment). */
export function districtSlug(district: string): string {
  return district
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A Karnataka district from its URL segment, or null. */
export function districtFromSlug(slug: string): string | null {
  return KARNATAKA_DISTRICTS.find((district) => districtSlug(district) === slug) ?? null;
}

/** Public path of a category page (a Karnataka story with a district: that district's page). */
export function categoryPath(category: Category, district?: string | null): string {
  return category === DISTRICT_CATEGORY && district ? `/category/karnataka/${districtSlug(district)}` : `/category/${category}`;
}

/* ─────────────────────────── Poster templates (owner 2026-09-26) ─────────────────────────── */

/**
 * How a story looks in the reel: a 9:16 poster = WebNEWS logo + the story's image + its title (+ a small author line).
 * The reporter picks one when publishing; stories without one use DEFAULT_POSTER_TEMPLATE. Designs live in
 * frontend/components/poster/ (the owner will refine them).
 */
export const POSTER_TEMPLATE_VALUES = [
  // No template (owner 2026-10-07): the cover as uploaded (a photo, or the reporter's own finished poster) + the author
  // line. Listed first; a story published without a pick gets it.
  "plain",
  "classic",
  "full-bleed",
  "red-band",
  // "newspaper" was removed (owner 2026-10-05); its stories (and Polaroid's) moved to "red-band" (migration 0040).
  "split",
  "slant",
  // More designs (owner 2026-10-02).
  "breaking",
  "magazine",
  "broadcast",
  "bold-type",
  // "duotone" was removed (owner 2026-10-07); its stories moved to "full-bleed" (migration 0044).
  // "polaroid" was removed (owner 2026-10-05); its stories moved to "newspaper" (migration 0039), then "red-band".
  // Made for tall 9:16 photos: the photo fills the whole poster (owner 2026-10-02).
  "top-line",
  "card",
  // "story" was removed (owner 2026-10-05); its stories moved to "card" (migration 0038).
  "red-frame",
  "ticker",
  "quote",
  // More designs for tall 9:16 photos (owner 2026-10-07).
  "highlight",
  "glass",
  "red-fade",
  // "exclusive" was removed (owner 2026-10-07, its ribbon with it); its stories moved to "full-bleed" (migration 0047).
  // The reporter's own frame (owner 2026-10-08): their uploaded image (any; a PNG's see-through middle shows the cover)
  // over the cover, saved to their account and reused; each story keeps the frame it was published with
  // (`ArticleCard.posterOverlayUrl`).
  "own-frame",
] as const;
export type PosterTemplate = (typeof POSTER_TEMPLATE_VALUES)[number];
export const POSTER_TEMPLATE_LABELS: Record<PosterTemplate, string> = {
  plain: "No template",
  classic: "Classic",
  "full-bleed": "Full bleed",
  "red-band": "Red band",
  split: "Split",
  slant: "Slant",
  breaking: "Dark box",
  magazine: "Magazine",
  broadcast: "Broadcast",
  "bold-type": "Big headline",
  "top-line": "Red line",
  card: "Floating card",
  "red-frame": "Red frame",
  ticker: "Ticker",
  quote: "Quote",
  highlight: "Highlight",
  glass: "Glass",
  "red-fade": "Red fade",
  "own-frame": "Your frame",
};
export const DEFAULT_POSTER_TEMPLATE: PosterTemplate = "classic";

export function isPosterTemplate(value: unknown): value is PosterTemplate {
  return typeof value === "string" && (POSTER_TEMPLATE_VALUES as readonly string[]).includes(value);
}

/**
 * Where the story's photo (or clip) sits in its poster's photo box, set by the reporter in the live preview (owner
 * 2026-09-26): `x`/`y` (0–100 %) = the point of the photo that stays on the same point of the box (CSS
 * object-position), `zoom` (1–POSTER_ZOOM_MAX) = how far it is enlarged around that point. null = centred, no zoom.
 */
export type PosterFrame = { x: number; y: number; zoom: number };
export const POSTER_ZOOM_MAX = 3;
export const posterFrameSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  zoom: z.number().min(1).max(POSTER_ZOOM_MAX),
});

/** The district rule: Karnataka stories need one from the list (null = fine; other categories never carry one). */
export function districtError(category: Category | null | undefined, district: string | null | undefined): string | null {
  if (category !== DISTRICT_CATEGORY) return null;
  if (!district) return "Choose the district";
  return KARNATAKA_DISTRICTS.includes(district) ? null : "Choose a district from the list";
}

/** "Sports" · "Mysuru, Karnataka" (district stories) — the label printed on cards. */
export function categoryLabel(category: Category, district?: string | null): string {
  return category === DISTRICT_CATEGORY && district ? `${district}, ${CATEGORY_LABELS.karnataka}` : CATEGORY_LABELS[category];
}

/** Transparency labels on a story card (SPEC §3.11). */
export type ArticleBadges = {
  /** Paid Spotlight boost currently active. */
  spotlight: boolean;
  /** Pinned by the Editor Desk. */
  editorsPick: boolean;
  /**
   * The author's badge level: "verified" for Verified reporters AND Editor Desk accounts (admins carry the
   * Verified badge, SPEC §3.11), "trainee" for trainees, null for readers / revoked reporters.
   */
  reporterLevel: ReporterLevel | null;
};

/**
 * Report rules (owner 2026-09-30, replacing 2026-09-28's automatic warn-at-5 / hide-after-5):
 * - every report warns the story's author: the bell (reason + note) and a warning banner — never who reported it;
 * - from `reviewAt` open reports the story is "Needs decision" for the Editor Desk (its Flags badge counts these),
 *   and the desk decides: dismiss, hide the story, warn or suspend the reporter. Nothing is hidden automatically;
 * - the readers who reported a story see it marked on the story ("You reported this · <reason> · under review").
 */
export const REPORT_RULES = { reviewAt: 2 } as const;

/** A story's video (≤ LIMITS.videoMaxSeconds, H.264 MP4). The cover fields then hold its poster frame. */
export type ArticleVideo = { url: string; width: number; height: number; durationMs: number };

export type ArticleCard = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  /** For a video story: the video's poster frame (so every thumbnail keeps working). */
  coverUrl: string;
  coverWidth: number | null;
  coverHeight: number | null;
  coverBlur: string | null;
  linkUrl: string | null;
  linkDomain: string | null;
  readingMinutes: number;
  viewCount: number;
  likeCount: number;
  shareCount: number;
  commentCount: number;
  publishedAt: string; // ISO
  author: AuthorSummary;
  /** `saved` = in the viewer's "Saved" list (always sent by the API; optional for client-built preview cards). */
  viewer: {
    liked: boolean;
    followingAuthor: boolean;
    isAuthor: boolean;
    saved?: boolean;
    /** The viewer's open report on this story (its reason), shown to them on the story; null / missing = none. */
    reported?: FlagReason | null;
  };
  /** Always sent by the API (optional so client-built preview cards stay valid). */
  badges?: ArticleBadges;
  /** The story's video, when its media is a video instead of an image (always sent by the API; null = image story). */
  video?: ArticleVideo | null;
  /** Only on the author's / an admin's own view of a story the Editor Desk hid (the public never sees it). */
  hidden?: boolean;
  /** Always sent by the API (optional so client-built preview cards stay valid). null = never categorised. */
  category?: Category | null;
  /** Karnataka stories: the district (from `KARNATAKA_DISTRICTS`). */
  district?: string | null;
  /** The story's language (always sent by the API; null = never set). */
  language?: PressLanguage | null;
  /**
   * The short share link's code (`/s/<code>` → `/a/<slug>`): given when the story first goes live and kept for good,
   * so shared links survive an unpublish + re-publish (which changes the slug). Always sent by the API (optional so
   * client-built preview cards stay valid); null only for a story published before codes existed and never backfilled.
   */
  shortCode?: string | null;
  /** Reel poster design (always sent by the API; null/missing = DEFAULT_POSTER_TEMPLATE). */
  template?: PosterTemplate | null;
  /** The photo's place in the poster (always sent by the API; null/missing = centred). */
  posterFrame?: PosterFrame | null;
  /** "own-frame" stories: the reporter's frame image laid over the cover (always sent by the API; null = none). */
  posterOverlayUrl?: string | null;
  /**
   * The full article's image (for a video article, its poster frame) — Home's 16:9 thumbnail (owner 2026-09-30,
   * "like YouTube"), cropped to 16:9 whatever its size. Always sent by the API; null = none (older stories: the cover).
   */
  articleImage?: { url: string; width: number | null; height: number | null; blur: string | null } | null;
  /** Members-only story (owner 2026-10-14): only the author's premium members read it in full. Always sent by the API. */
  premium?: boolean;
  /** A premium story this viewer can't read yet (not the author, not a member): the page shows "Buy premium". */
  locked?: boolean;
};

/** Short share-link codes the API resolves (checked after lowercasing; stories get SHORT_CODE_LENGTH chars). */
export const SHORT_CODE_REGEX = /^[a-z0-9]{4,12}$/;
export const SHORT_CODE_LENGTH = 7;

/** `GET /api/articles/by-code/:code` — where a short share link points (a publicly visible story's slug). */
export type ShortLinkTarget = { slug: string };

/**
 * A story's article media (owner 2026-09-28): the 16:9 image — for a video, its poster frame — shown at the top of the
 * full article (the cover stays the 9:16 reel poster). Required to publish; older stories have none.
 */
export type ArticleMedia = { url: string; width: number | null; height: number | null; blur: string | null; video: ArticleVideo | null };

export type ArticleDetail = Omit<ArticleCard, "author"> & {
  bodyHtml: string;
  /** When the author last edited it while live (shown as "Updated"); null = never. Optional for client-built previews. */
  editedAt?: string | null;
  author: AuthorSummary & { bio: string | null };
  /** Always sent by the API (optional so client-built previews stay valid). null = none: the page shows the cover. */
  articleMedia?: ArticleMedia | null;
  /** The 2-line summary under the headline (owner 2026-10-14); null for older stories and locked premium ones. */
  blurb?: string | null;
  /** Sub category label (SUBCATEGORIES) — null for older stories and Karnataka (its district). */
  subcategory?: string | null;
  /** 👎 inside the story (owner 2026-10-16): how many, and whether this viewer is one (the page's own request only). */
  dislikeCount?: number;
  disliked?: boolean;
  /** Locked premium stories only (`bodyHtml` is then empty): the author's monthly membership price (null = not set). */
  paywall?: { priceInr: number | null } | null;
};

export type UploadedImage = {
  url: string;
  key: string;
  width: number;
  height: number;
  blurDataUrl: string | null;
};

/** A story video as the composer keeps it (the key proves it is the author's own upload). */
export type VideoRef = ArticleVideo & { key: string };

/**
 * `POST /api/upload` with `kind=video`: the transcoded clip plus its poster frame (used as the story's cover).
 * `trimmed` = the original was longer than LIMITS.videoMaxSeconds and only its first 30 seconds were kept.
 */
export type UploadedVideo = { video: VideoRef; poster: UploadedImage; trimmed: boolean; originalDurationMs: number };

export type DraftCard = {
  id: string;
  title: string | null;
  excerpt: string | null;
  coverUrl: string | null;
  coverBlur: string | null;
  updatedAt: string;
  /** "in_review" = a Trainee story waiting at the Review Desk (listed with the owner's drafts). */
  status?: "draft" | "in_review";
  /** Returned by the Review Desk (or unpublished by the Editor Desk) with a note. */
  returned?: boolean;
  reviewNote?: string | null;
};

/** Review Desk state of one of your own stories (SPEC §3.11). */
export type ArticleReview = {
  state: "in_review" | "returned";
  /** Editor's note (always present for "returned"). */
  note: string | null;
  submittedAt: string | null;
  returnedAt: string | null;
  reviewedAt: string | null;
};

export type DraftDetail = {
  id: string;
  title: string | null;
  bodyHtml: string | null;
  linkUrl: string | null;
  cover: { url: string; key: string; width: number | null; height: number | null; blurDataUrl: string | null } | null;
  /** Video stories: the clip (the cover is its poster frame). */
  video: VideoRef | null;
  /** The full article's 16:9 image, or its video's poster frame (required to publish). */
  articleImage: { url: string; key: string; width: number | null; height: number | null; blurDataUrl: string | null } | null;
  /** The full article's video (`articleImage` is then its poster frame). */
  articleVideo: VideoRef | null;
  /** Required to publish; drafts may not have one yet. */
  category: Category | null;
  district: string | null;
  /** The story's language (null = not set yet; read from the headline when saved). */
  language: PressLanguage | null;
  /** Reel poster design (null = not chosen yet → DEFAULT_POSTER_TEMPLATE when published). */
  template: PosterTemplate | null;
  /** The photo's place in the poster (null = centred). */
  posterFrame: PosterFrame | null;
  /** Members-only story (owner 2026-10-14). */
  premium: boolean;
  /** Sub category and blurb (owner 2026-10-14). */
  subcategory: string | null;
  blurb: string | null;
  updatedAt: string;
};

/**
 * `GET /api/articles/:id` (owner only): the composer's view of one of your own articles.
 * `in_review` stories can still be edited: saving as a draft withdraws them, publishing resubmits them.
 */
export type OwnedArticle = DraftDetail & {
  status: "draft" | "published" | "in_review";
  slug: string | null;
  /** Review Desk feedback / state (null when the story never went through review or was approved). */
  review?: ArticleReview | null;
  /** Hidden by the Editor Desk (published stories only). */
  hidden?: { at: string; reason: string | null } | null;
  /** Written for a press meet: it goes live when the organizer verifies it, and is locked from then on. */
  pressMeet?: ArticlePressMeet | null;
};

/**
 * The press meet a story was written for (owner 2026-10-07) and where it stands with the organizer: `review` null =
 * not sent yet (or taken back by saving it as a draft), "pending" = waiting for them, "changes" = they asked for
 * changes (`reviewNote`), "approved" = verified and live (locked).
 */
export type ArticlePressMeet = {
  id: string;
  title: string;
  organizer: AuthorSummary;
  review: PressMeetReview | null;
  reviewNote: string | null;
};

/**
 * `POST /api/articles` response. `status` tells which shape `article` has; `article.id`,
 * `article.status` and `article.slug` (null for drafts) are always present.
 * `in_review`: a Trainee's story went to the Review Desk instead of going live (`message` explains it).
 */
export type SaveArticleResponse =
  | { status: "draft"; article: DraftDetail & { status: "draft"; slug: null } }
  | { status: "published"; article: ArticleDetail & { status: "published" } }
  | { status: "in_review"; article: DraftDetail & { status: "in_review"; slug: null }; message: string }
  /** A press meet story went to its organizer (it stays a draft until they verify it); `message` explains it. */
  | { status: "sent"; article: DraftDetail & { status: "draft"; slug: null }; pressMeetId: string; message: string }
  /** A group Writer's story went to the group's Editors (it stays a draft until one publishes it); `message` explains it. */
  | { status: "group_review"; article: DraftDetail & { status: "draft"; slug: null }; message: string };

export type UserRow = {
  id: string;
  username: string;
  name: string;
  image: string | null;
  bio: string | null;
  viewerFollows: boolean;
  isViewer: boolean;
  /** Press badge next to the name (null for readers; admins count as "verified"). Always sent by the API. */
  reporterLevel?: ReporterLevel | null;
};

/** Public Press Pass details on a reporter's profile (region + language chips, SPEC §3.11). Never the verification details. */
export type ProfilePress = {
  level: ReporterLevel;
  state: string | null;
  stateName: string | null;
  district: string | null;
  city: string | null;
  languages: PressLanguage[];
};

export type ProfileData = {
  user: {
    id: string;
    username: string;
    name: string;
    image: string | null;
    bio: string | null;
    createdAt: string;
    /** Always sent by the API. */
    role?: Role;
    /** "group" = a news outlet run by several members (owner 2026-10-23). Always sent by the API. */
    accountType?: AccountType;
  };
  counts: { articles: number; followers: number; following: number };
  viewer: { isSelf: boolean; follows: boolean };
  /** Active Press Pass (null for readers). Always sent by the API. */
  press?: ProfilePress | null;
  /**
   * Premium membership (owner 2026-10-14, "like YouTube"): their monthly price (null = not offered), how many
   * members-only stories they have, and until when the viewer is a member (null = not one). Always sent by the API.
   */
  membership?: { priceInr: number | null; premiumCount: number; activeUntil: string | null };
};

export type Headline = {
  id: string;
  slug: string;
  title: string;
  publishedAt: string;
  /** `reporterLevel` drives the Verified badge next to the handle (admins count as verified). Always sent by the API. */
  author: { username: string; reporterLevel?: ReporterLevel | null };
};

/**
 * `GET /api/feed/trending` item ("Trending now" rail, SPEC §3.4b): a Headline plus live counts.
 * `score` = engagement in the last 24h (views + 4·likes, + 6·shares for stories published in that window).
 */
/* ─────────────────────────── Market (owner 2026-10-22) ─────────────────────────── */

/** One live quote on the Market page (`GET /api/market`): an index, a commodity, a currency pair or a coin. */
export type MarketQuote = {
  /** Our id: "nifty50", "sensex", "gold"… */
  id: string;
  group: "indices" | "commodities" | "currency" | "crypto";
  name: string;
  /** What the number is: "NSE", "₹ per 10 g", "$ per barrel"… */
  unit: string;
  currency: "INR" | "USD";
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  dayHigh: number | null;
  dayLow: number | null;
  /** The last 52 weeks' extremes (the details panel); null when the source doesn't say. */
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  /** Today's path so far (closes at intervals) for the chart; oldest first. */
  trend: number[];
  /** When each `trend` point was (epoch seconds), one per point. */
  times: number[];
  /** The exchange is trading right now. */
  open: boolean;
  /** When the source last updated this quote (ISO). */
  updatedAt: string;
};
export type MarketResponse = { quotes: MarketQuote[]; fetchedAt: string };

/** The Market page's chart ranges: today (5-minute points), the week (30-minute), the month (daily). */
export const MARKET_RANGE_VALUES = ["1d", "5d", "1mo"] as const;
export type MarketRange = (typeof MARKET_RANGE_VALUES)[number];
/** `GET /api/market/history?id=&range=`: one quote's path over a range, oldest first. */
export type MarketHistory = {
  id: string;
  range: MarketRange;
  points: { t: number; v: number }[];
  /** The close before the range began (today's chart draws it as a dashed line); null when unknown. */
  previousClose: number | null;
};

export type TrendingHeadline = Omit<Headline, "author"> & {
  author: { username: string; name: string; reporterLevel?: ReporterLevel | null };
  viewCount: number;
  likeCount: number;
  shareCount: number;
  score: number;
  /** The newest story on WebNEWS (owner 2026-10-14): always #1 in Trending, with a red border. Always sent by the API. */
  newest?: boolean;
};

export type Page<T> = { items: T[]; nextCursor: string | null };

export type UsernameCheck = {
  available: boolean;
  reason?: "taken" | "reserved" | "invalid";
  code?: UsernameIssue;
  message: string;
  suggestions: string[];
};

export type ApiErrorBody = { error: { code: string; message: string; fields?: Record<string, string> } };

/** "foryou" = ranked (SPEC §3.4b, cursor = opaque {asOf, offset}); "latest"/"following" = chronological. */
export type FeedTab = "foryou" | "latest" | "following";
export const FEED_TAB_VALUES = ["foryou", "latest", "following"] as const satisfies readonly FeedTab[];

/** `dm` = sent to people / chats inside WebNEWS (recorded by `POST /api/messages/send`, not by the share endpoint). */
export type ShareChannel = "native" | "copy" | "whatsapp" | "x" | "facebook" | "instagram" | "linkedin" | "telegram" | "email" | "dm";

/* ─────────────────────────── Realtime (SSE) ─────────────────────────── */

export type ArticleStats = { id: string; viewCount: number; likeCount: number; shareCount: number; commentCount: number };

/* ─────────────── Comments (owner 2026-09-26) ─────────────── */

export const COMMENT_MAX = 1000;

/*
 * GIFs in comments (owner 2026-10-31), from GIPHY through `GET /api/gifs`. Only GIPHY's own media addresses are
 * accepted, so a comment can't embed an image from anywhere else.
 */
export const GIF_HOST_REGEX = /^https:\/\/media[0-9]?\.giphy\.com\/media\/[A-Za-z0-9/_.-]+\.(gif|webp)(\?[A-Za-z0-9=&_.-]*)?$/;

export const commentGifSchema = z.object({
  url: z.string().max(500).regex(GIF_HOST_REGEX, "That GIF can't be used"),
  width: z.number().int().min(1).max(2000),
  height: z.number().int().min(1).max(2000),
  title: z.string().trim().max(140).default(""),
});
export type CommentGif = z.output<typeof commentGifSchema>;

/** One result in the GIF picker: the small `preview` for the grid and the `gif` that goes in the comment. */
export type GifResult = { id: string; preview: string; gif: CommentGif };
/** `GET /api/gifs?q=&offset=` — trending when `q` is empty. `configured: false` = no GIPHY key on the server yet. */
export type GifSearchResponse = { configured: boolean; items: GifResult[]; nextOffset: number | null };

/**
 * One comment under a story. `parentId` = the top-level comment it replies to (one level of threading).
 * `canDelete` = the viewer wrote it, wrote the story, or is the Editor Desk. `mentions` = the @usernames in the
 * body that belong to real accounts (the UI links only those).
 */
export type ArticleComment = {
  id: string;
  articleId: string;
  parentId: string | null;
  body: string;
  /** A GIF under (or instead of) the text. */
  gif: CommentGif | null;
  createdAt: string;
  author: AuthorSummary & { reporterLevel: ReporterLevel | null };
  likeCount: number;
  liked: boolean;
  replyCount: number;
  mentions: string[];
  canDelete: boolean;
};

/** `POST /api/articles/:id/comments` (`parentId` = reply to that comment). Text, a GIF, or both. */
export const commentSchema = z
  .object({
    body: z
      .string()
      .trim()
      .max(COMMENT_MAX, `Keep comments under ${COMMENT_MAX.toLocaleString("en-US")} characters`)
      .default(""),
    gif: commentGifSchema.nullable().optional(),
    parentId: z.string().uuid().nullable().optional(),
  })
  .refine((value) => value.body.length > 0 || Boolean(value.gif), { message: "Write a comment first", path: ["body"] });
export type CommentInput = z.input<typeof commentSchema>;
/** `POST | DELETE /api/articles/:id/comments/:commentId/like`. */
export type CommentLikeResult = { liked: boolean; likeCount: number };

/** "@name" in a comment (usernames: 3–30 letters and dots, no dot first or last). Group 2 = the username. */
export const MENTION_REGEX = /(^|[^a-z0-9._@])@([a-z](?:[a-z.]{0,28}[a-z])?)/gi;

/** The distinct lowercase usernames mentioned in a text (at most 20). */
export function extractMentions(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(MENTION_REGEX)) {
    const username = match[2]?.toLowerCase();
    if (username && USERNAME_REGEX.test(username)) found.add(username);
    if (found.size >= 20) break;
  }
  return [...found];
}

export type RealtimeEventMap = {
  "article.published": ArticleCard;
  "article.stats": ArticleStats;
  "article.deleted": { id: string };
  /** Sent only to that user's own connections: their bell has something new. */
  "notifications.changed": { userId: string };
  /** A comment or reply was posted / deleted on this story: open comment lists refetch. */
  "comments.changed": { articleId: string };
  /**
   * Sent only to that user's own connections: one of their chats changed — a new message (`message`), someone read it
   * (`read`: "Seen"), or its members / name / photo changed, or it was deleted (`update`).
   */
  "messages.changed": { userId: string; conversationId: string; reason: ChatEventReason };
  /** Sent only to that user's own connections: something happened in a press meet room they're in. */
  "meet.signal": PressMeetSignal & { userId: string };
  /** Sent only to that user's own connections: one of their press meets changed (invites, status, stories, payments). */
  "meet.changed": { userId: string; meetId: string };
  /** Sent only to that user's own connections: the chat of a press meet room they're in changed (message, on / off). */
  "meet.chat": { userId: string; meetId: string };
  /**
   * Sent only to the Editor Desk (owner 2026-10-16: Analytics updates live): new activity was recorded — `userIds` = the
   * signed-in people it came from (visitors aren't listed). Bursts are merged, at most one every couple of seconds.
   */
  "behaviour.changed": { userIds: string[] };
};
export type RealtimeEventName = keyof RealtimeEventMap;

/* ─────────────────────────── Request schemas ─────────────────────────── */

const usernameSchema = z
  .string()
  .transform(normalizeUsername)
  .superRefine((value, ctx) => {
    const result = validateUsernameFormat(value);
    if (!result.ok) ctx.addIssue({ code: "custom", message: result.message, params: { code: result.code } });
  });

/** A username being picked (sign-up): the new-username pattern too. */
const newUsernameSchema = z
  .string()
  .transform(normalizeUsername)
  .superRefine((value, ctx) => {
    const result = validateNewUsername(value);
    if (!result.ok) ctx.addIssue({ code: "custom", message: result.message, params: { code: result.code } });
  });

const httpUrl = z
  .string()
  .trim()
  .max(LIMITS.linkMax)
  .url()
  .refine((u) => /^https?:\/\//i.test(u), "Only http(s) links are allowed");

/** Most languages one account picks — the same 6 as a Press Pass (PRESS_PASS_LIMITS.languagesMax), as it's one list. */
export const READ_LANGUAGES_MAX = 6;

/**
 * Languages an account reads (owner 2026-10-05): their feeds show these first. For reporters it's the same list as their
 * Press Pass languages (shown on their profile) — editing one edits both. A check, not z.enum (declared below).
 */
const readLanguagesSchema = z
  .array(z.custom<PressLanguage>((value) => isPressLanguage(value), "Unknown language"))
  .max(READ_LANGUAGES_MAX, `Pick up to ${READ_LANGUAGES_MAX} languages`)
  .transform((list) => [...new Set(list)]);

export const onboardingSchema = z.object({
  username: newUsernameSchema,
  name: z.string().trim().min(1, "Name is required").max(LIMITS.nameMax),
  bio: z.string().trim().min(1, "Bio is required").max(LIMITS.bioMax),
  image: z.string().trim().min(1, "Profile photo is required").max(LIMITS.linkMax),
  /** The sign-up form asks for at least one; older clients may leave it out. */
  languages: readLanguagesSchema.optional(),
  acceptTerms: z.literal(true, { message: "You must agree to the Terms & Conditions" }),
});
export type OnboardingInput = z.input<typeof onboardingSchema>;

export const updateMeSchema = z
  .object({
    username: usernameSchema,
    name: z.string().trim().min(1).max(LIMITS.nameMax),
    bio: z.string().trim().min(1).max(LIMITS.bioMax),
    image: z.string().trim().min(1).max(LIMITS.linkMax),
    languages: readLanguagesSchema.refine((list) => list.length > 0, "Pick at least one language"),
  })
  .partial();
export type UpdateMeInput = z.input<typeof updateMeSchema>;

export const coverSchema = z.object({
  url: z.string().min(1).max(LIMITS.linkMax),
  key: z.string().min(1).max(512),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  blurDataUrl: z.string().max(10_000).nullable(),
});

export const videoSchema = z.object({
  url: z.string().min(1).max(LIMITS.linkMax),
  key: z.string().min(1).max(512),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationMs: z.number().int().positive().max(LIMITS.videoMaxSeconds * 1000 + 500),
});

export const saveArticleSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().max(LIMITS.titleMax).optional().default(""),
  bodyHtml: z.string().max(200_000).optional().default(""),
  cover: coverSchema.nullable().optional(),
  /** A video story: the clip from `POST /api/upload` (kind=video); `cover` must then be its poster. */
  video: videoSchema.nullable().optional(),
  /** The full article's 16:9 image (kind=cover upload), or its video's poster frame. Required to publish. */
  articleImage: coverSchema.nullable().optional(),
  /** The full article's video (kind=video upload); `articleImage` must then be its poster. */
  articleVideo: videoSchema.nullable().optional(),
  linkUrl: z.union([httpUrl, z.literal("")]).nullable().optional(),
  /** Required to publish ("Choose a category"); Karnataka stories also need their district. */
  category: z.enum(CATEGORY_VALUES, { message: "Choose a category" }).nullable().optional(),
  district: z.string().trim().max(60).nullable().optional(),
  /** The story's language (the Languages menu); unset → read from the headline's script when it's saved. */
  // A check, not z.enum: PRESS_LANGUAGE_VALUES is declared further down this file.
  language: z.custom<PressLanguage>((value) => isPressLanguage(value), "Choose a language").nullable().optional(),
  /** Reel poster design; publishing without one uses DEFAULT_POSTER_TEMPLATE. */
  template: z.enum(POSTER_TEMPLATE_VALUES, { message: "Choose a template" }).nullable().optional(),
  /** The photo's place in the poster (null / missing = centred). */
  posterFrame: posterFrameSchema.nullable().optional(),
  /**
   * Written for this press meet (the press meet page's "Write your story", owner 2026-10-07) — read on a new story's
   * first save only; later saves keep the link. `publish` then sends it to the organizer instead of going live.
   */
  pressMeetId: z.string().uuid().nullable().optional(),
  /** Sub category (SUBCATEGORIES; owner 2026-10-14) — required to publish, except Karnataka (its district). */
  subcategory: z.string().trim().max(60).nullable().optional(),
  /** The 2-line blurb under the headline (BLURB.min–max characters to publish). */
  blurb: z.string().trim().max(BLURB.hardMax, `Keep the blurb under ${BLURB.hardMax} characters`).nullable().optional(),
  /** Members-only (owner 2026-10-14): publishing it needs the author's membership price (Settings). */
  premium: z.boolean().optional().default(false),
  action: z.enum(["draft", "publish"]),
});
export type SaveArticleInput = z.input<typeof saveArticleSchema>;

/** `PATCH /api/articles/:id/category` — the author (or the Editor Desk) moves a story to another category. */
export const articleCategorySchema = z
  .object({
    category: z.enum(CATEGORY_VALUES, { message: "Choose a category" }),
    district: z
      .string()
      .trim()
      .max(60)
      .nullable()
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .superRefine((value, ctx) => {
    const issue = districtError(value.category, value.district);
    if (issue) ctx.addIssue({ code: "custom", path: ["district"], message: issue });
  });
export type ArticleCategoryInput = z.input<typeof articleCategorySchema>;
export type ArticleCategoryResult = { id: string; category: Category; district: string | null };

export const shareSchema = z.object({
  channel: z.enum(["native", "copy", "whatsapp", "x", "facebook", "instagram", "linkedin", "telegram", "email"]),
});

export const viewsSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(50) });

/**
 * `POST /api/articles/:id/read` (no body) — sent by the article page once it is actually open (never on render or
 * link prefetch). `counted` = a new Newsroom "read" (unique per viewer; authors' own opens don't count). 404 when
 * the story isn't live.
 */
export type ReadResult = { counted: boolean };

/* ═══════════════════════════ Roles · Press Pass · Newsroom · Editor Desk (SPEC §3.11) ═══════════════════════════ */

export type Role = "reader" | "reporter" | "admin";
export const ROLE_VALUES = ["reader", "reporter", "admin"] as const satisfies readonly Role[];

export type ReporterLevel = "trainee" | "verified";
export const REPORTER_LEVEL_VALUES = ["trainee", "verified"] as const satisfies readonly ReporterLevel[];

/** Approved Review Desk stories that turn a Trainee into a Verified Reporter. */
export const TRAINEE_APPROVALS_TO_VERIFY = 3;

/** UI wording used everywhere (SPEC §3.11). */
export const ROLE_LABELS: Record<Role, string> = { reader: "Reader", reporter: "Reporter", admin: "Editor Desk" };
export const REPORTER_LEVEL_LABELS: Record<ReporterLevel, string> = { trainee: "Trainee", verified: "Verified" };

/* ─────────────── Press Pass fixed lists ─────────────── */

/** How the applicant reports (Press Pass verification, SPEC §3.11). */
export const REPORTER_TYPE_VALUES = ["citizen", "freelance", "staff"] as const;
export type ReporterType = (typeof REPORTER_TYPE_VALUES)[number];
export const REPORTER_TYPE_LABELS: Record<ReporterType, string> = {
  citizen: "Citizen journalist",
  freelance: "Freelance journalist",
  staff: "Staff reporter",
};
export const REPORTER_TYPE_HINTS: Record<ReporterType, string> = {
  citizen: "You report on your own — your town, your community.",
  freelance: "You file stories for news outlets on assignment.",
  staff: "You work for a newspaper, TV channel or news site.",
};

export const EXPERIENCE_VALUES = ["new", "1_2", "3_5", "6_10", "10_plus"] as const;
export type ReportingExperience = (typeof EXPERIENCE_VALUES)[number];
export const EXPERIENCE_LABELS: Record<ReportingExperience, string> = {
  new: "Just starting",
  "1_2": "1–2 years",
  "3_5": "3–5 years",
  "6_10": "6–10 years",
  "10_plus": "10+ years",
};

/**
 * An Indian mobile number as `+91XXXXXXXXXX` (10 digits starting 6–9), or null. Accepts a +91 / 91 / 0
 * prefix and spaces, dashes, dots or brackets between the digits.
 */
export function normalizeIndianMobile(value: string): string | null {
  const digits = value.replace(/[\s().-]/g, "").replace(/^(?:\+91|91|0)(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

/**
 * A mobile number from any country (owner 2026-10-15: not only +91) as `+<country code><number>`, or null. An Indian
 * one (+91, or no code at all — older forms) must be a real Indian mobile (normalizeIndianMobile); any other: a "+"
 * then 7–15 digits in all (E.164).
 */
export function normalizeMobile(value: string): string | null {
  const compact = value.replace(/[\s().-]/g, "");
  if (!compact.startsWith("+") || compact.startsWith("+91")) return normalizeIndianMobile(compact);
  return /^\+[1-9]\d{6,14}$/.test(compact) ? compact : null;
}

/**
 * Languages a reporter files in (owner 2026-09-26: every language of India): Kannada, English and Hindi first, then
 * the other scheduled languages and widely spoken ones, alphabetically; "Other" last. ISO 639 codes.
 */
export const PRESS_LANGUAGE_VALUES = [
  "kn", "en", "hi",
  "as", "bn", "bho", "brx", "doi", "gu", "ks", "kfa", "kok", "mai", "ml", "mni", "mr", "ne", "or", "pa", "raj",
  "sa", "sat", "sd", "ta", "te", "tcy", "ur",
  "other",
] as const;
export type PressLanguage = (typeof PRESS_LANGUAGE_VALUES)[number];
export const PRESS_LANGUAGE_LABELS: Record<PressLanguage, string> = {
  kn: "Kannada",
  en: "English",
  hi: "Hindi",
  as: "Assamese",
  bn: "Bengali",
  bho: "Bhojpuri",
  brx: "Bodo",
  doi: "Dogri",
  gu: "Gujarati",
  ks: "Kashmiri",
  kfa: "Kodava",
  kok: "Konkani",
  mai: "Maithili",
  ml: "Malayalam",
  mni: "Manipuri (Meitei)",
  mr: "Marathi",
  ne: "Nepali",
  or: "Odia",
  pa: "Punjabi",
  raj: "Rajasthani",
  sa: "Sanskrit",
  sat: "Santali",
  sd: "Sindhi",
  ta: "Tamil",
  te: "Telugu",
  tcy: "Tulu",
  ur: "Urdu",
  other: "Other",
};

/** A story's language (owner 2026-10-05: the Languages menu — one language's news at a time). */
export function isPressLanguage(value: unknown): value is PressLanguage {
  return typeof value === "string" && (PRESS_LANGUAGE_VALUES as readonly string[]).includes(value);
}

/** The Languages menu: every language of India (not "Other"), in PRESS_LANGUAGE_VALUES order. */
export const NEWS_LANGUAGES = PRESS_LANGUAGE_VALUES.filter((value) => value !== "other");

/** `/language/<code>` — that language's news. */
export const languagePath = (language: PressLanguage) => `/language/${language}`;

/** Each script's first language (the reporter can pick another — e.g. Marathi or Tulu — in the composer). */
const SCRIPT_LANGUAGES: readonly (readonly [RegExp, PressLanguage])[] = [
  [/[\u0C80-\u0CFF]/, "kn"],
  [/[\u0900-\u097F]/, "hi"],
  [/[\u0D00-\u0D7F]/, "ml"],
  [/[\u0B80-\u0BFF]/, "ta"],
  [/[\u0C00-\u0C7F]/, "te"],
  [/[\u0980-\u09FF]/, "bn"],
  [/[\u0A80-\u0AFF]/, "gu"],
  [/[\u0A00-\u0A7F]/, "pa"],
  [/[\u0B00-\u0B7F]/, "or"],
  [/[\u0600-\u06FF]/, "ur"],
];

/** A text's language from its script (Kannada, Devanagari → Hindi, …); English otherwise. */
export function detectLanguage(text: string): PressLanguage {
  for (const [script, language] of SCRIPT_LANGUAGES) if (script.test(text)) return language;
  return "en";
}

export type IndianRegion = { code: string; name: string; kind: "state" | "ut" };

/**
 * Indian states + union territories (ISO 3166-2:IN style codes; used in pass numbers `WN-<CODE>-123456`), A–Z
 * (owner 2026-10-05; Karnataka used to come first). "IN" is reserved for passes without a region (accounts migrated
 * from before Press Passes existed).
 */
export const INDIAN_REGIONS: readonly IndianRegion[] = [
  { code: "AN", name: "Andaman and Nicobar Islands", kind: "ut" },
  { code: "AP", name: "Andhra Pradesh", kind: "state" },
  { code: "AR", name: "Arunachal Pradesh", kind: "state" },
  { code: "AS", name: "Assam", kind: "state" },
  { code: "BR", name: "Bihar", kind: "state" },
  { code: "CH", name: "Chandigarh", kind: "ut" },
  { code: "CG", name: "Chhattisgarh", kind: "state" },
  { code: "DH", name: "Dadra and Nagar Haveli and Daman and Diu", kind: "ut" },
  { code: "DL", name: "Delhi", kind: "ut" },
  { code: "GA", name: "Goa", kind: "state" },
  { code: "GJ", name: "Gujarat", kind: "state" },
  { code: "HR", name: "Haryana", kind: "state" },
  { code: "HP", name: "Himachal Pradesh", kind: "state" },
  { code: "JK", name: "Jammu and Kashmir", kind: "ut" },
  { code: "JH", name: "Jharkhand", kind: "state" },
  { code: "KA", name: "Karnataka", kind: "state" },
  { code: "KL", name: "Kerala", kind: "state" },
  { code: "LA", name: "Ladakh", kind: "ut" },
  { code: "LD", name: "Lakshadweep", kind: "ut" },
  { code: "MP", name: "Madhya Pradesh", kind: "state" },
  { code: "MH", name: "Maharashtra", kind: "state" },
  { code: "MN", name: "Manipur", kind: "state" },
  { code: "ML", name: "Meghalaya", kind: "state" },
  { code: "MZ", name: "Mizoram", kind: "state" },
  { code: "NL", name: "Nagaland", kind: "state" },
  { code: "OD", name: "Odisha", kind: "state" },
  { code: "PY", name: "Puducherry", kind: "ut" },
  { code: "PB", name: "Punjab", kind: "state" },
  { code: "RJ", name: "Rajasthan", kind: "state" },
  { code: "SK", name: "Sikkim", kind: "state" },
  { code: "TN", name: "Tamil Nadu", kind: "state" },
  { code: "TG", name: "Telangana", kind: "state" },
  { code: "TR", name: "Tripura", kind: "state" },
  { code: "UP", name: "Uttar Pradesh", kind: "state" },
  { code: "UK", name: "Uttarakhand", kind: "state" },
  { code: "WB", name: "West Bengal", kind: "state" },
];
export const REGION_CODES = INDIAN_REGIONS.map((r) => r.code);

/** Karnataka's districts (the only state with a fixed district list; elsewhere the district is free text). */
export const KARNATAKA_DISTRICTS: readonly string[] = [
  "Bagalkote", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban", "Bidar", "Chamarajanagar",
  "Chikkaballapur", "Chikkamagaluru", "Chitradurga", "Dakshina Kannada", "Davanagere", "Dharwad", "Gadag",
  "Hassan", "Haveri", "Kalaburagi", "Kodagu", "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur",
  "Ramanagara (Bengaluru South)", "Shivamogga", "Tumakuru", "Udupi", "Uttara Kannada", "Vijayanagara",
  "Vijayapura", "Yadgir",
];

/**
 * `GET /api/places?q=&state=&district=` (owner 2026-10-05) — cities, towns and villages whose name (or an older
 * spelling) starts with what was typed, for the City boxes (Press Pass form, press meet reporter picker).
 */
export type PlaceSuggestion = {
  name: string;
  /** Karnataka: one of KARNATAKA_DISTRICTS; elsewhere India Post's district name. */
  district: string;
  /** Region code (INDIAN_REGIONS). */
  state: string;
  /** The older spelling that matched when the name itself didn't ("Mangalore" → Mangaluru). */
  matchedAka: string | null;
};

export function regionName(code: string | null | undefined): string | null {
  if (!code) return null;
  return INDIAN_REGIONS.find((r) => r.code === code)?.name ?? (code === "IN" ? "India" : null);
}

/** The WebNEWS Reporter Pledge (step 3 of the Press Pass application). */
export const PRESS_PLEDGE: readonly string[] = [
  "I will verify what I report before I publish it.",
  "I will credit my sources and never pass off someone else's work as mine.",
  "I will correct my mistakes openly and quickly.",
  "I will not publish hate, harassment or fake news.",
  "I will disclose any conflict of interest in what I cover.",
];

/**
 * The government ID a reporter gives with their personal details (owner 2026-10-07: kept for legal matters, private to
 * them and the Editor Desk). Aadhaar (owner 2026-10-08) is one optional choice, and only its last 4 digits are ever
 * saved — masked as "XXXXXXXX1234" in the browser, so the full number never reaches WebNEWS (a private platform may not
 * keep Aadhaar numbers) — with the reporter's consent ticked in the form.
 */
export const PRESS_ID_TYPE_VALUES = ["pan", "voter_id", "driving_licence", "passport", "aadhaar"] as const;
export type PressIdType = (typeof PRESS_ID_TYPE_VALUES)[number];
export const PRESS_ID_TYPE_LABELS: Record<PressIdType, string> = {
  pan: "PAN card",
  voter_id: "Voter ID (EPIC)",
  driving_licence: "Driving licence",
  passport: "Passport",
  aadhaar: "Aadhaar card",
};
/** What each ID number looks like, for the field's hint. */
export const PRESS_ID_HINTS: Record<PressIdType, string> = {
  pan: "10 characters, like ABCDE1234F",
  voter_id: "10 characters, like ABC1234567",
  driving_licence: "As printed on it, like KA01 20110012345",
  passport: "8 characters, like K1234567",
  aadhaar: "12 digits — only the last 4 are saved",
};
const PRESS_ID_PATTERNS: Record<PressIdType, RegExp> = {
  pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  voter_id: /^[A-Z]{3}[0-9]{7}$/,
  // State code + the rest (formats differ by state and year).
  driving_licence: /^[A-Z]{2}[0-9A-Z]{8,18}$/,
  passport: /^[A-Z][0-9]{7}$/,
  // Stored masked: the last 4 digits only.
  aadhaar: /^X{8}[0-9]{4}$/,
};

/** An ID number as stored: capitals, without spaces, hyphens or slashes. */
export function normalizeIdNumber(value: string): string {
  return value.toUpperCase().replace(/[\s\-/]/g, "");
}

export function isValidIdNumber(type: PressIdType, value: string): boolean {
  return PRESS_ID_PATTERNS[type].test(normalizeIdNumber(value));
}

/* Aadhaar: checked in full in the browser, then only "XXXXXXXX" + its last 4 digits leave it. */

/** Verhoeff tables (Aadhaar's check digit). */
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
] as const;
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
] as const;

/** A real Aadhaar number: 12 digits, not starting with 0 or 1, with a valid Verhoeff check digit (spaces allowed). */
export function isValidAadhaar(value: string): boolean {
  const digits = value.replace(/\s/g, "");
  if (!/^[2-9][0-9]{11}$/.test(digits)) return false;
  let check = 0;
  [...digits].reverse().forEach((digit, i) => {
    check = VERHOEFF_D[check]![VERHOEFF_P[i % 8]![Number(digit)]!]!;
  });
  return check === 0;
}

/** Already the saved form ("XXXXXXXX1234", spaces allowed). */
export function isMaskedAadhaar(value: string): boolean {
  return PRESS_ID_PATTERNS.aadhaar.test(normalizeIdNumber(value));
}

/** What's saved for an Aadhaar number: "XXXXXXXX" + its last 4 digits. */
export function maskAadhaar(value: string): string {
  return `XXXXXXXX${value.replace(/\D/g, "").slice(-4)}`;
}

/** An ID number for display: a masked Aadhaar in groups of 4 ("XXXX XXXX 1234"), anything else as saved. */
export function formatIdNumber(type: PressIdType | null, value: string): string {
  return type === "aadhaar" ? normalizeIdNumber(value).replace(/(.{4})(?=.)/g, "$1 ") : value;
}

/** Press Pass holders must be at least this old. */
export const PRESS_PASS_MIN_AGE = 18;

/** Age in whole years on `today` for a `YYYY-MM-DD` birth date; null when it isn't a real past date. */
export function ageOn(dateOfBirth: string, today: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age--;
  return age >= 0 ? age : null;
}

export const PRESS_PASS_LIMITS = {
  mobileMax: 20,
  legalNameMax: 100,
  addressMax: 200,
  idNumberMax: 24,
  outletMax: 80,
  languagesMax: 6,
  aboutMax: 280,
  linksMax: 3,
  districtMax: 60,
  cityMax: 60,
  signatureMax: 50,
} as const;

/** `WN-<REGION>-<6 digits>` */
export const PASS_NUMBER_REGEX = /^WN-[A-Z]{2}-\d{6}$/;

/* ─────────────── Press Pass DTOs ─────────────── */

/** Compact pass info on `ViewerUser`. */
export type PressPassSummary = {
  passNumber: string;
  level: ReporterLevel;
  status: "active" | "revoked";
  approvedCount: number;
  /**
   * The application is filled in: mobile, reporter type, experience, region and the signed pledge (migrated passes
   * start incomplete). The personal details asked since 2026-10-07 don't count (owner 2026-10-09): holders who
   * applied before add them under Edit details.
   */
  complete: boolean;
};

export type PressPass = PressPassSummary & {
  /** Verification details — private: only the holder and the Editor Desk ever see them. `+91XXXXXXXXXX`. */
  mobile: string | null;
  /**
   * Personal details (owner 2026-10-07, kept for legal matters) — private like the mobile number. Null on passes
   * issued before they were asked (the holder is asked to complete their pass).
   */
  legalName: string | null;
  /** `YYYY-MM-DD`. */
  dateOfBirth: string | null;
  address: string | null;
  pincode: string | null;
  idType: PressIdType | null;
  idNumber: string | null;
  reporterType: ReporterType | null;
  /** News outlet (staff: required; freelance: optional; citizen: always null). */
  outlet: string | null;
  experience: ReportingExperience | null;
  state: string | null;
  stateName: string | null;
  district: string | null;
  /** The city or town they report from (owner 2026-10-05; older passes got their district's headquarters). */
  city: string | null;
  languages: PressLanguage[];
  about: string | null;
  links: string[];
  pledgeSignedAt: string | null;
  pledgeSignature: string | null;
  approvalsToVerify: number;
  /** The holder's own website, proven with a DNS TXT record (owner 2026-10-28) — null until they add one. */
  domain: PressDomain | null;
  issuedAt: string;
  revokedAt: string | null;
  holder: AuthorSummary;
};

/**
 * A Press Pass holder's domain (e.g. an outlet's site). Verified once a TXT record `value` is published at `host`
 * (the domain itself, or `_webnews.<domain>`).
 */
export type PressDomain = {
  name: string;
  /** The TXT record's Host in a DNS panel: `_webnews` for a root domain, `_webnews.<subdomain part>` otherwise (`_webnews.learn`). */
  host: string;
  /** The TXT record's value: `webnews-verification=<token>`. */
  value: string;
  verifiedAt: string | null;
  /**
   * The records that send visitors to the publisher's webnewsin site (owner 2026-10-30: added in the same visit to
   * the DNS provider as the TXT record) — A for a root domain (+ www CNAME), CNAME for a subdomain.
   */
  pointing: SiteDnsRecord[];
};

/** `GET /api/press-pass/options` — every list the application form needs. */
export type PressPassOptions = {
  reporterTypes: { value: ReporterType; label: string; hint: string }[];
  idTypes: { value: PressIdType; label: string; hint: string }[];
  experience: { value: ReportingExperience; label: string }[];
  languages: { value: PressLanguage; label: string }[];
  regions: IndianRegion[];
  districts: Record<string, readonly string[]>;
  pledge: readonly string[];
  limits: typeof PRESS_PASS_LIMITS;
};

/* ─────────────── Flags ─────────────── */

export const FLAG_REASON_VALUES = ["misinformation", "hate", "spam", "copyright", "other"] as const;
export type FlagReason = (typeof FLAG_REASON_VALUES)[number];
export const FLAG_REASON_LABELS: Record<FlagReason, string> = {
  misinformation: "Misinformation",
  hate: "Hate or harassment",
  spam: "Spam or scam",
  copyright: "Copyright",
  other: "Something else",
};
export const FLAG_NOTE_MAX = 500;

/** How many readers reported a story for one reason. */
export type ReasonCount = { reason: FlagReason; count: number };

/* ─────────────── Notifications (the bell) ─────────────── */

/**
 * The bell in the masthead (owner 2026-09-28): a publisher you follow posted a story; someone started following you;
 * readers liked / commented on your article — grouped per article like Instagram ("Harikiran and 9 others liked your
 * article": one unread group per article and kind, a new group after you've seen it); one of your stories was
 * reported (the reason and the reader's note — never who reported it); one of your stories was hidden after more
 * than REPORT_RULES.hideAfter reports (it can't be republished); the Editor Desk returned a story you sent for review,
 * with its note, or warned you about a reported story (owner 2026-10-01).
 */
export const NOTIFICATION_TYPES = [
  "new_story",
  "new_follower",
  "story_liked",
  "story_commented",
  "story_reported",
  "story_hidden",
  "story_returned",
  "story_warned",
  // Messages, groups and communities (owner 2026-09-30).
  "message",
  "group_added",
  "community_invite",
  "community_joined",
  // Press meets (owner 2026-10-01).
  "press_meet_invited",
  "press_meet_accepted",
  "press_meet_declined",
  "press_meet_reminder",
  "press_meet_live",
  "press_meet_cancelled",
  "press_meet_submitted",
  "press_meet_approved",
  "press_meet_changes",
  "press_meet_paid",
  "press_meet_received",
  // Public press meets (owner 2026-10-07): every reporter hears when one is booked and when it goes live; the
  // organizer hears when a reporter takes a seat.
  "press_meet_public",
  "press_meet_public_live",
  "press_meet_joined",
  // Premium membership renewals (owner 2026-10-16): the reporter is the actor; `amount` = days left.
  "membership_ending",
  "membership_ended",
  // Group accounts (owner 2026-10-23): invited to post for an outlet; the actor is the group, `note` the role.
  "outlet_invite",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type AppNotification = {
  id: string;
  type: NotificationType;
  /**
   * new_story: the publisher who posted; new_follower: the new follower; story_liked / story_commented: the latest
   * reader with an account (null when only logged-out visitors liked it).
   */
  actor: AuthorSummary | null;
  /** story_liked / story_commented: how many likes / comments in this group (the actor is one of them). */
  count: number | null;
  /**
   * The story (every type but new_follower); its title is kept if the story is deleted later (slug null when it can't
   * be opened).
   */
  story: { id: string | null; slug: string | null; title: string } | null;
  /**
   * story_reported: why, and the reader's note (if they wrote one); story_commented: the latest comment's text;
   * story_returned: the Editor Desk's note (the story itself opens in the composer by its id); story_warned: the
   * Editor Desk's warning (null when it wrote none).
   */
  reason: FlagReason | null;
  note: string | null;
  /** story_hidden: how many readers reported it, by reason. */
  reports: number | null;
  reasons: ReasonCount[] | null;
  /**
   * message: the chat (count = new messages since the group started, `request` = a message request — the bell never
   * shows what a message says); group_added: the group you were added to; community_invite / community_joined: the community.
   * Null once the chat / community is gone.
   */
  conversation: { id: string; kind: ChatKind; name: string; request: boolean } | null;
  /** community_invite: the invitation (answer it right in the bell while it's pending). */
  invite: { id: string; status: InviteStatus } | null;
  /**
   * press_meet_*: the press meet (null once deleted). `amount` = the reporter's fee (approved / paid / received);
   * `note` = the organizer's note when they ask for changes; press_meet_reminder: `soon` = the 15-minute one.
   */
  pressMeet: { id: string; title: string; startsAt: string; platform: PressMeetPlatform; soon: boolean } | null;
  amount: number | null;
  createdAt: string;
  read: boolean;
};

export type NotificationsResponse = { items: AppNotification[]; unread: number; nextCursor: string | null };

export const readNotificationsSchema = z.object({ ids: z.array(z.string().uuid()).max(100).optional() });

/**
 * One of the viewer's stories that readers reported (owner 2026-09-28: the "Reported" section of their profile) —
 * the reasons and notes, never who reported it.
 */
export type ReportedStory = {
  id: string;
  /** Null when it can't be opened (e.g. taken back to drafts). */
  slug: string | null;
  title: string;
  coverUrl: string | null;
  coverBlur: string | null;
  /** Hidden from everyone (by the report rules or the Editor Desk). */
  hidden: boolean;
  /** Hidden after more than REPORT_RULES.hideAfter reports: it can't be republished. */
  locked: boolean;
  hiddenReason: string | null;
  reports: number;
  reasons: ReasonCount[];
  /** The readers' notes, newest first (at most 5). */
  notes: string[];
  lastReportedAt: string;
};

export type ReportedStoriesResponse = { items: ReportedStory[] };

export const FLAG_RESOLUTION_VALUES = ["dismiss", "hide", "warn", "suspend"] as const;
export type FlagResolutionAction = (typeof FLAG_RESOLUTION_VALUES)[number];
export type FlagResolution = "dismissed" | "hidden" | "warned" | "suspended";

/* ─────────────── Spotlight (paid boost; payments later) ─────────────── */

export type SpotlightStatus = "pending" | "granted" | "declined" | "expired" | "cancelled";
export type PaymentProviderId = "manual" | "razorpay";

export type SpotlightPackage = { id: string; name: string; hours: number; priceInr: number; active: boolean; sort: number };

export type SpotlightOrder = {
  id: string;
  status: SpotlightStatus;
  /** Granted and running right now. */
  active: boolean;
  provider: PaymentProviderId;
  packageId: string | null;
  packageName: string;
  hours: number;
  priceInr: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  decidedAt: string | null;
  /** Editor Desk note (e.g. why it was declined). */
  note: string | null;
  article: { id: string; slug: string | null; title: string | null; coverUrl: string | null };
  /** What the boost did while it ran (owner 2026-10-16) — the reporter's own list only; null before it starts. */
  results?: SpotlightResults | null;
};

/**
 * A Spotlight's results (owner 2026-10-16): `shown` = times it appeared in feeds (once per reader per visit), `reached`
 * = different readers it reached, `opens` = readers who opened the story; likes, comments and new followers of the
 * reporter during the boost.
 */
export type SpotlightResults = { shown: number; reached: number; opens: number; likes: number; comments: number; newFollowers: number };

/** A spotlight stops being placed for a reader after this many visits that showed it, or once they open it. */
export const SPOTLIGHT_SHOW_CAP = 3;

/** `POST /api/spotlight/orders` → 201. Payments aren't connected yet: every order waits for the Editor Desk. */
export type SpotlightOrderResponse = {
  order: SpotlightOrder;
  message: string;
  payment: { provider: PaymentProviderId; status: "pending"; checkoutUrl: string | null };
};

/** Shown with every new request while payments are not connected. */
export const SPOTLIGHT_PENDING_MESSAGE = "Payments launch soon — your Spotlight request was sent to the Editor Desk.";

/** Active Spotlight multiplier in For You and the block rule (SPEC §3.11). */
/** The ranked For You window (SPEC §3.4b); Spotlight is sold only for stories published inside it. */
export const FOR_YOU_WINDOW_DAYS = 14;

export const SPOTLIGHT_RANKING = { multiplier: 2.5, blockSize: 10 } as const;

/* ─────────────── Newsroom analytics (reporters) ─────────────── */

export const NEWSROOM_RANGES = [7, 30, 90] as const;
export type NewsroomRange = (typeof NEWSROOM_RANGES)[number];

/** `delta` = (value − previous) / previous; null when the previous period was 0. */
export type NewsroomKpi = { value: number; previous: number; delta: number | null };

export type NewsroomSummary = {
  range: NewsroomRange;
  from: string;
  to: string;
  kpis: { views: NewsroomKpi; reads: NewsroomKpi; likes: NewsroomKpi; shares: NewsroomKpi; followers: NewsroomKpi };
  totals: {
    followers: number;
    published: number;
    inReview: number;
    returned: number;
    views: number;
    likes: number;
    shares: number;
  };
  pressPass: PressPassSummary | null;
};

export type NewsroomSeriesPoint = {
  /** Local calendar day (YYYY-MM-DD) in `timeZone`. */
  date: string;
  views: number;
  reads: number;
  likes: number;
  shares: number;
  /** New followers that day. */
  followers: number;
  /** Followers at the end of that day. */
  followersTotal: number;
};

export type NewsroomSeries = { range: NewsroomRange; timeZone: string; points: NewsroomSeriesPoint[] };

export type StoryStatus = "published" | "hidden" | "in_review" | "returned" | "draft";

export type NewsroomStory = {
  id: string;
  slug: string | null;
  title: string | null;
  coverUrl: string | null;
  coverBlur: string | null;
  status: StoryStatus;
  publishedAt: string | null;
  submittedAt: string | null;
  updatedAt: string;
  viewCount: number;
  readCount: number;
  likeCount: number;
  shareCount: number;
  /** (likes + shares) / views, 0 when there are no views. */
  engagementRate: number;
  editorsPick: boolean;
  /** Latest Spotlight request for the story (null when never requested). */
  spotlight: { id: string; status: SpotlightStatus; active: boolean; endsAt: string | null } | null;
  reviewNote: string | null;
  hiddenReason: string | null;
};

/** Days are ISO weekdays: index 0 = Monday … 6 = Sunday. Hours 0–23 in `timeZone`. */
export type NewsroomBestTimes = {
  timeZone: string;
  /** "you" = your own audience; "platform" = everyone's (too little data of your own yet). */
  basis: "you" | "platform";
  /** Engagement events counted (views + likes + shares over the last 90 days). */
  sample: number;
  byHour: number[];
  byDay: number[];
  best: { day: number; hour: number } | null;
  bestHours: number[];
  bestDays: number[];
};

export type NewsroomSpotlight = {
  packages: SpotlightPackage[];
  orders: SpotlightOrder[];
  paymentsEnabled: boolean;
  message: string;
};

/* ─────────────── Editor Desk (admin) ─────────────── */

export type AdminAuthor = AuthorSummary & {
  role: Role;
  reporterLevel: ReporterLevel | null;
  approvedCount: number | null;
  /** From the Press Pass verification details (null for readers / passes not verified yet). */
  reporterType: ReporterType | null;
  outlet: string | null;
  suspended: boolean;
};

export type AdminStoryRow = {
  id: string;
  slug: string | null;
  title: string | null;
  excerpt: string | null;
  coverUrl: string | null;
  coverBlur: string | null;
  status: StoryStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  submittedAt: string | null;
  viewCount: number;
  likeCount: number;
  shareCount: number;
  openFlags: number;
  editorsPick: boolean;
  pinOrder: number | null;
  spotlight: boolean;
  hiddenReason: string | null;
  reviewNote: string | null;
  category: Category | null;
  district: string | null;
  /** Reel poster design (DEFAULT_POSTER_TEMPLATE when none was chosen: drafts, stories from before templates). */
  template: PosterTemplate;
  /** The photo's place in the poster (null = centred). */
  posterFrame: PosterFrame | null;
  author: AdminAuthor;
};

export type AdminStoryDetail = AdminStoryRow & {
  bodyHtml: string | null;
  linkUrl: string | null;
  linkDomain: string | null;
  readingMinutes: number | null;
  coverWidth: number | null;
  coverHeight: number | null;
  /** Video stories: the clip, so the desk can watch what it moderates (the cover is its poster). */
  videoUrl: string | null;
  /** The full article's 16:9 image (for an article video, its poster frame); null for stories from before it existed. */
  articleImageUrl: string | null;
  articleImageBlur: string | null;
  /** The full article's clip, when its media is a video. */
  articleVideoUrl: string | null;
};

export type AdminFlag = {
  id: string;
  reason: FlagReason;
  note: string | null;
  status: "open" | "resolved";
  resolution: FlagResolution | null;
  createdAt: string;
  resolvedAt: string | null;
  by: { id: string; username: string | null; name: string };
};

export type AdminFlagGroup = {
  article: {
    id: string;
    slug: string | null;
    title: string | null;
    coverUrl: string | null;
    status: StoryStatus;
    author: AuthorSummary & { suspended: boolean };
  };
  openCount: number;
  totalCount: number;
  reasons: Partial<Record<FlagReason, number>>;
  latestAt: string;
  /** REPORT_RULES.reviewAt or more open reports: waiting for the desk's decision. */
  needsDecision: boolean;
  /** Newest first, open ones first (≤ 20). */
  flags: AdminFlag[];
};

export type AdminReporterRow = {
  user: AuthorSummary & { email: string; role: Role; suspended: boolean };
  pass: PressPass;
  published: number;
  inReview: number;
};

export type AdminUserRow = {
  id: string;
  username: string | null;
  name: string;
  email: string;
  image: string | null;
  role: Role;
  reporterLevel: ReporterLevel | null;
  onboarded: boolean;
  suspended: boolean;
  suspendedAt: string | null;
  suspendReason: string | null;
  createdAt: string;
  published: number;
  followers: number;
  isSelf: boolean;
  /** Listed in ADMIN_EMAILS: promoted back to admin on every sign-in. */
  adminEmail: boolean;
};

export type AdminSpotlightOrder = SpotlightOrder & {
  reporter: AuthorSummary & { reporterLevel: ReporterLevel | null };
  grantedBy: { id: string; username: string | null; name: string } | null;
};

export type AuditAction =
  | "review.approve"
  | "review.return"
  | "reporter.auto_verify"
  | "reporter.verify"
  | "reporter.downgrade"
  | "reporter.revoke"
  | "story.hide"
  | "story.auto_warn"
  | "story.auto_delete"
  | "story.auto_hide"
  | "story.unhide"
  | "story.unpublish"
  | "story.delete"
  | "story.pin"
  | "story.unpin"
  | "story.pins_reorder"
  | "story.category"
  | "story.edit"
  | "flags.resolve"
  | "user.role"
  | "user.auto_admin"
  | "user.suspend"
  | "user.unsuspend"
  | "user.warn"
  | "user.delete"
  | "spotlight.grant"
  | "spotlight.decline"
  | "spotlight.package_create"
  | "spotlight.package_update"
  | "spotlight.package_delete"
  | "press_meet.platform_fee"
  | "membership.rules"
  /** Group accounts (owner 2026-10-23): the Desk approved / turned down an application. */
  | "group.approve"
  | "group.reject"
  | "group.delete";

export type AuditEntry = {
  id: string;
  action: AuditAction;
  /** null = automatic (system) action. */
  actor: { id: string; username: string | null; name: string } | null;
  targetType: "article" | "user" | "press_pass" | "spotlight_order" | "spotlight_package" | "setting";
  targetId: string;
  /** Snapshot for display (story title / @username / package name). */
  targetLabel: string | null;
  meta: Record<string, string | number | boolean | null> | null;
  createdAt: string;
};

export type AdminOverview = {
  kpis: {
    storiesToday: number;
    published: number;
    activeReaders: number;
    activeReporters: number;
    openFlags: number;
    flaggedStories: number;
    /** Stories with REPORT_RULES.reviewAt+ open reports (the Flags badge). */
    needsDecision: number;
    reviewQueue: number;
    spotlightRequests: number;
    /** Contact us messages not answered yet (the Inbox badge, owner 2026-10-10). */
    newMessages: number;
    activeSpotlights: number;
    users: number;
    reporters: number;
    trainees: number;
    suspended: number;
  };
  recent: AuditEntry[];
};

/* ─────────────── Request schemas (roles) ─────────────── */

const uniqueList = <T>(items: T[]) => new Set(items).size === items.length;

const pressPassFields = {
  /** Personal details (owner 2026-10-07): private, kept for legal matters. */
  legalName: z
    .string({ message: "Add your full name as on your ID" })
    .trim()
    .min(2, "Add your full name as on your ID")
    .max(PRESS_PASS_LIMITS.legalNameMax),
  dateOfBirth: z
    .string({ message: "Add your date of birth" })
    .trim()
    .min(1, "Add your date of birth")
    .refine((v) => {
      const age = ageOn(v);
      return age !== null && age <= 120;
    }, "Enter a valid date of birth")
    .refine((v) => (ageOn(v) ?? 0) >= PRESS_PASS_MIN_AGE, `You must be ${PRESS_PASS_MIN_AGE} or older to get a Press Pass`),
  address: z
    .string({ message: "Add your home address" })
    .trim()
    .min(10, "Add your full home address (house, street, area)")
    .max(PRESS_PASS_LIMITS.addressMax),
  pincode: z
    .string({ message: "Add your PIN code" })
    .trim()
    .regex(/^[1-9][0-9]{5}$/, "Enter your 6-digit PIN code"),
  idType: z.enum(PRESS_ID_TYPE_VALUES, { message: "Choose an ID" }),
  idNumber: z
    .string({ message: "Add your ID number" })
    .trim()
    .min(1, "Add your ID number")
    .max(PRESS_PASS_LIMITS.idNumberMax)
    .transform(normalizeIdNumber),
  mobile: z
    .string({ message: "Add your mobile number" })
    .trim()
    .min(1, "Add your mobile number")
    .max(PRESS_PASS_LIMITS.mobileMax, "Enter a valid mobile number")
    .refine((v) => normalizeMobile(v) !== null, "Enter a valid mobile number with its country code")
    .transform((v) => normalizeMobile(v) ?? v),
  reporterType: z.enum(REPORTER_TYPE_VALUES, { message: "Choose how you report" }),
  outlet: z
    .string()
    .trim()
    .max(PRESS_PASS_LIMITS.outletMax)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  experience: z.enum(EXPERIENCE_VALUES, { message: "Choose your reporting experience" }),
  state: z.enum(REGION_CODES as [string, ...string[]], { message: "Choose your state" }),
  district: z
    .string()
    .trim()
    .max(PRESS_PASS_LIMITS.districtMax)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  /** The city or town they report from (owner 2026-10-05: organizers find reporters by city). */
  city: z
    .string({ message: "Add your city or town" })
    .trim()
    .min(1, "Add your city or town")
    .max(PRESS_PASS_LIMITS.cityMax),
  languages: z
    .array(z.enum(PRESS_LANGUAGE_VALUES))
    .min(1, "Pick at least one language")
    .max(PRESS_PASS_LIMITS.languagesMax, `Pick up to ${PRESS_PASS_LIMITS.languagesMax} languages`)
    .refine(uniqueList, "Each language only once"),
  about: z.string().trim().min(1, "Tell us why you report").max(PRESS_PASS_LIMITS.aboutMax),
  links: z.array(httpUrl).max(PRESS_PASS_LIMITS.linksMax, `Up to ${PRESS_PASS_LIMITS.linksMax} links`).optional().default([]),
};

/** Karnataka districts come from the fixed list (other states accept free text); staff reporters name their outlet. */
const pressPassRules = (
  value: { state: string; district: string | null; reporterType: ReporterType; outlet: string | null; idType: PressIdType; idNumber: string },
  ctx: z.RefinementCtx,
) => {
  if (!isValidIdNumber(value.idType, value.idNumber)) {
    ctx.addIssue({ code: "custom", path: ["idNumber"], message: `That doesn't look like a ${PRESS_ID_TYPE_LABELS[value.idType]} number` });
  }
  if (value.state === "KA" && value.district && !KARNATAKA_DISTRICTS.includes(value.district)) {
    ctx.addIssue({ code: "custom", path: ["district"], message: "Choose a district from the list" });
  }
  if (value.reporterType === "staff" && !value.outlet) {
    ctx.addIssue({ code: "custom", path: ["outlet"], message: "Name the news outlet you work for" });
  }
};

/** `POST /api/press-pass` — the 4-step application (personal details · verification & region · about · pledge). */
export const pressPassApplySchema = z
  .object({
    ...pressPassFields,
    /** Typed signature: must match your display name. */
    pledgeSignature: z.string().trim().min(1, "Type your name to sign the pledge").max(PRESS_PASS_LIMITS.signatureMax),
    acceptPledge: z.literal(true, { message: "You must accept the Reporter Pledge" }),
  })
  .superRefine(pressPassRules);
export type PressPassApplyInput = z.input<typeof pressPassApplySchema>;

/** `PATCH /api/press-pass` — complete / update your pass (e.g. migrated passes). Pledge fields only when not yet signed. */
export const pressPassUpdateSchema = z
  .object({
    ...pressPassFields,
    pledgeSignature: z.string().trim().min(1).max(PRESS_PASS_LIMITS.signatureMax).optional(),
    acceptPledge: z.literal(true).optional(),
  })
  .superRefine(pressPassRules);
export type PressPassUpdateInput = z.input<typeof pressPassUpdateSchema>;

export const flagSchema = z.object({
  reason: z.enum(FLAG_REASON_VALUES, { message: "Choose a reason" }),
  note: z
    .string()
    .trim()
    .max(FLAG_NOTE_MAX)
    .optional()
    .transform((v) => (v ? v : null)),
});
export type FlagInput = z.input<typeof flagSchema>;

export const spotlightOrderSchema = z.object({ articleId: z.string().uuid(), packageId: z.string().uuid() });
export type SpotlightOrderInput = z.input<typeof spotlightOrderSchema>;

const optionalNote = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .transform((v) => (v ? v : null));

export const reviewApproveSchema = z.object({ note: optionalNote });
export const reviewReturnSchema = z.object({ note: z.string().trim().min(1, "Tell the reporter what to fix").max(1000) });
export const moderationReasonSchema = z.object({ reason: z.string().trim().min(1, "Give a reason").max(500) });
export const optionalReasonSchema = z.object({ reason: optionalNote });
export const resolveFlagsSchema = z.object({ action: z.enum(FLAG_RESOLUTION_VALUES), note: optionalNote });
export const setRoleSchema = z.object({ role: z.enum(ROLE_VALUES) });
export const suspendSchema = z.object({ reason: z.string().trim().min(1, "Give a reason").max(500) });
export const reorderPinsSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(3) });
export const spotlightDecisionSchema = z.object({ note: optionalNote });
const spotlightPackageFields = {
  name: z.string().trim().min(1).max(40),
  hours: z.number().int().min(1).max(24 * 30),
  priceInr: z.number().int().min(0).max(1_000_000),
  active: z.boolean(),
  sort: z.number().int().min(0).max(1000),
};
export const spotlightPackageSchema = z.object({
  ...spotlightPackageFields,
  active: spotlightPackageFields.active.optional().default(true),
  sort: spotlightPackageFields.sort.optional().default(0),
});
/** PATCH: only the fields sent change (no defaults, so `{ priceInr }` never resets `active`/`sort`). */
export const spotlightPackageUpdateSchema = z.object(spotlightPackageFields).partial();
export type ReviewReturnInput = z.input<typeof reviewReturnSchema>;
export type ResolveFlagsInput = z.input<typeof resolveFlagsSchema>;
export type SpotlightPackageInput = z.input<typeof spotlightPackageSchema>;
export type SpotlightPackageUpdateInput = z.input<typeof spotlightPackageUpdateSchema>;

/* ─────────────── Role helpers (same rules on the server and in the UI) ─────────────── */

type RoleHolder = { role: Role; reporterLevel?: ReporterLevel | null } | null | undefined;

/** Reporters (active Press Pass) and the Editor Desk can write stories; Readers can't. */
export function canPublish(viewer: RoleHolder): boolean {
  return viewer?.role === "reporter" || viewer?.role === "admin";
}

/** Editor Desk (admin console). */
export function isEditorDesk(viewer: RoleHolder): boolean {
  return viewer?.role === "admin";
}

/** Trainee reporters' stories go to the Review Desk; Verified reporters and the Editor Desk publish instantly. */
export function publishesToReview(viewer: RoleHolder): boolean {
  return viewer?.role === "reporter" && viewer.reporterLevel !== "verified";
}

/* ─────────────── Response shapes (roles endpoints) ─────────────── */

/** `PUT /api/press-pass/domain` — a bare host name like `vkmangalore.com` (scheme, `www.` and paths are stripped). */
export const pressDomainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .max(253)
    .transform((value) => value.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "").replace(/\.$/, ""))
    .pipe(z.string().regex(/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "Enter a domain like yoursite.com")),
});
export type PressDomainInput = z.input<typeof pressDomainSchema>;

/** `GET /api/press-pass` · `PATCH /api/press-pass`. */
export type PressPassResponse = { pressPass: PressPass | null };
/** `POST /api/press-pass` → 201. `viewer` is the refreshed account (now a Trainee Reporter). */
export type PressPassApplyResponse = { pressPass: PressPass; viewer: ViewerUser | null };
/** `POST|DELETE /api/articles/:id/save`. */
export type SaveResult = { saved: boolean; articleId: string };
/** `POST /api/articles/:id/flag` → 201. */
export type FlagResult = { flagged: true };
/** `POST /api/admin/review/:id/approve`. `autoVerified` = this was the Trainee's 3rd approval. */
export type ReviewApproveResult = { story: AdminStoryRow; autoVerified: boolean };
/** `POST /api/admin/flags/:articleId/resolve`. */
export type ResolveFlagsResult = { resolved: number; resolution: FlagResolution };
/** `GET /api/admin/stories/:id`. */
export type AdminStoryDetailResponse = { story: AdminStoryDetail; flags: AdminFlag[] };

/* ─────────────── Editor Desk list filters (query strings) ─────────────── */

export type AdminStoryStatusFilter = StoryStatus | "all";
export type AdminStoriesQuery = {
  status?: AdminStoryStatusFilter;
  /** Title search. */
  q?: string;
  /** Reporter @username. */
  reporter?: string;
  category?: Category;
  /** ISO date/datetime (inclusive) … (exclusive), on the story's latest activity. */
  from?: string;
  to?: string;
  cursor?: string | null;
  limit?: number;
};
export type AdminUsersQuery = { q?: string; role?: Role; status?: "active" | "suspended"; cursor?: string | null; limit?: number };
export type AdminReportersQuery = { level?: ReporterLevel | "revoked"; q?: string; cursor?: string | null; limit?: number };
export type AdminFlagsStatus = "open" | "resolved";
export type AdminOrdersStatus = "pending" | "active" | "past" | "all";
export type AdminAuditQuery = { action?: string; target?: string; cursor?: string | null; limit?: number };

/* ─────────────── Messages, groups and communities (owner 2026-09-30, "like Instagram") ─────────────── */

/**
 * Direct messages (one chat per pair of people), group chats and communities. Every chat can carry text, a shared story
 * (article) or a shared profile — sent from the story / profile share sheet like Instagram's "Send to". A direct
 * message (or a group add) from someone you don't follow lands in "Requests" until you accept it. A community is a
 * named public or private space with its own chat: anyone can join a public one; a private one only by invitation.
 * Members invite people; the invitee accepts or declines from the bell. Everything shows up in the bell as it happens.
 */
export const CHAT_KIND_VALUES = ["direct", "group", "community"] as const;
export type ChatKind = (typeof CHAT_KIND_VALUES)[number];
/** owner = created it (groups: whoever holds it now); admins manage members and details (communities). */
export const CHAT_ROLE_VALUES = ["owner", "admin", "member"] as const;
export type ChatRole = (typeof CHAT_ROLE_VALUES)[number];
export const COMMUNITY_VISIBILITY_VALUES = ["public", "private"] as const;
export type CommunityVisibility = (typeof COMMUNITY_VISIBILITY_VALUES)[number];
export const MESSAGE_KIND_VALUES = ["text", "article", "profile", "system"] as const;
export type MessageKind = (typeof MESSAGE_KIND_VALUES)[number];
/** System lines in a chat: "Asha created the group", "Asha added Ravi", "Ravi left", "Asha renamed the group …". */
export const CHAT_EVENT_VALUES = ["created", "added", "removed", "left", "joined", "renamed", "photo"] as const;
export type ChatEvent = (typeof CHAT_EVENT_VALUES)[number];
export type ChatEventReason = "message" | "read" | "update";
export const INVITE_STATUS_VALUES = ["pending", "accepted", "declined"] as const;
export type InviteStatus = (typeof INVITE_STATUS_VALUES)[number];

export const CHAT_LIMITS = {
  messageMax: 2000,
  nameMax: 60,
  descriptionMax: 300,
  /** People in a group chat, you included. */
  groupMembersMax: 50,
  /** People / chats one "Send to" reaches at once, and people one invite call reaches. */
  sendRecipientsMax: 20,
  invitesPerCallMax: 20,
} as const;

/** A person in a chat context: name, handle, photo and badge. */
export type ChatPerson = AuthorSummary & { reporterLevel: ReporterLevel | null };

/** A story shared into a chat (null in the message when it's no longer public). */
export type SharedArticle = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverUrl: string;
  coverBlur: string | null;
  author: ChatPerson;
};

/** A profile shared into a chat (null in the message when the account is gone / suspended). */
export type SharedProfile = ChatPerson & { bio: string | null };

export type ChatMessage = {
  id: string;
  conversationId: string;
  kind: MessageKind;
  /** Null for system lines whose actor's account is gone. */
  sender: ChatPerson | null;
  /** text: the message; article / profile: the optional note sent with it; system `renamed`: the new name. */
  text: string | null;
  /** kind "article": the story, or null when it's no longer available. */
  article: SharedArticle | null;
  /** kind "profile": the person, or null when the account is no longer available. */
  profile: SharedProfile | null;
  /** kind "system": what happened, and to whom (added / removed). */
  event: ChatEvent | null;
  target: ChatPerson | null;
  createdAt: string;
  mine: boolean;
};

export type ChatMember = { user: ChatPerson; role: ChatRole; joinedAt: string };

export type ConversationSummary = {
  id: string;
  kind: ChatKind;
  /** Direct: the other person's name; group: its name, or the members' first names; community: its name. */
  title: string;
  /** Group / community photo (a direct chat shows the other person's photo). */
  image: string | null;
  /** Direct chats: the other person. */
  peer: ChatPerson | null;
  /** Direct chats: when the other person last had WebNEWS open (online = within PRESENCE_ONLINE_MS); else null. */
  peerActiveAt: string | null;
  /** A few other members (stacked avatars for groups). */
  preview: ChatPerson[];
  memberCount: number;
  lastMessage: { preview: string; senderName: string | null; mine: boolean; createdAt: string } | null;
  unread: number;
  /** A message request (someone you don't follow): accept it to move it to your chats. */
  request: boolean;
  role: ChatRole;
  lastMessageAt: string;
};

export type ConversationDetail = ConversationSummary & {
  /** Every member, owner and admins first (communities: the first 100). */
  members: ChatMember[];
  description: string | null;
  visibility: CommunityVisibility | null;
  /**
   * Direct chats: when the other person last read the chat ("Seen" under your last message); null in groups.
   */
  peerReadAt: string | null;
  /** May the viewer add people (groups) / invite (communities), rename, change the photo, remove members? */
  can: { add: boolean; edit: boolean; remove: boolean; delete: boolean };
};

/**
 * Online in Messages (owner 2026-10-01): someone whose WebNEWS was open within this long. The server refreshes the
 * time every ~45 s while their live connection is open (backend lib/presence.ts), so this rides out one missed beat.
 */
export const PRESENCE_ONLINE_MS = 2 * 60_000;

/* ─────────────── Settings (owner 2026-10-01) ─────────────── */

/** Highest advertorial price (owner 2026-10-05; was "press meet price") a reporter can set (whole ₹). */
export const PRESS_MEET_PRICE_MAX = 1_000_000;

/** `PUT /api/me/press-meet-price` — whole rupees; null clears it (nothing shown on the profile). */
export const pressMeetPriceSchema = z.object({
  price: z
    .number()
    .int("Use whole rupees")
    .min(0, "It can't be negative")
    .max(PRESS_MEET_PRICE_MAX, `Keep it under ₹${PRESS_MEET_PRICE_MAX.toLocaleString("en-IN")}`)
    .nullable(),
});

/** `GET /api/me/account` — what the Settings page needs about your account. */
export type AccountSettings = {
  email: string;
  /** The WhatsApp-verified number the account signs in with (owner 2026-10-22); null for social / Editor Desk accounts. */
  phoneNumber: string | null;
  /** False for Google-only accounts: they set a password through an emailed link instead of changing one. */
  hasPassword: boolean;
  pressMeetPrice: number | null;
  /** Reporters and the Editor Desk set an advertorial price; readers don't see the section. */
  canSetPressMeetPrice: boolean;
  /** Settings → Premium membership (owner 2026-10-14): monthly price in whole ₹ (null = not offered). Reporters only. */
  membershipPrice: number | null;
  /** Whether they may start a membership, and how far along each rule they are (owner 2026-10-16). Reporters only. */
  membershipEligibility: MembershipEligibility | null;
  /** Settings → Notifications (owner 2026-10-02): push to this account's phones (the WebNEWS app). */
  pushNotifications: boolean;
};

/* ─────────────── Generate with AI (owner 2026-10-14) ─────────────── */

/** `GET /api/ai/status` — whether the reporter has saved their own Gemini API key. */
export type AiStatus = { hasKey: boolean };

/** `PUT /api/ai/key` — the reporter's Gemini API key from Google AI Studio (checked with Google before it's saved). */
export const aiKeySchema = z.object({ key: z.string().trim().min(20, "That doesn't look like a Gemini API key").max(200) });

/** `POST /api/ai/describe` — write the story's description from its headline and the reporter's notes. */
export const aiDescribeSchema = z.object({
  title: z.string().trim().min(5, "Add the headline first").max(LIMITS.titleMax),
  notes: z.string().trim().min(10, "Add a few facts for the AI to write from").max(4_000),
  language: z.string().max(10).nullable().optional(),
});
export type AiDescribeResult = { html: string };

/* ─────────────── Premium membership (owner 2026-10-14) ─────────────── */

/**
 * "Like YouTube" channel membership: a reporter sets a monthly price, readers pay once (Razorpay) for
 * MEMBERSHIP_DAYS of that reporter's members-only stories, and renew by paying again (it adds to the days left).
 * No auto-debit: a reminder goes out before and when it ends (owner 2026-10-16).
 * WebNEWS keeps MEMBERSHIP_FEE_PERCENT of the price (taken from the reporter's share, never added on top).
 */
export const MEMBERSHIP_FEE_PERCENT = 8;
export const MEMBERSHIP_DAYS = 30;
export const MEMBERSHIP_PRICE_MIN = 10;
export const MEMBERSHIP_PRICE_MAX = 10_000;
/** The "ends soon" reminder goes out this many days before a membership ends. */
export const MEMBERSHIP_REMIND_DAYS = 3;

/** `PUT /api/me/membership-price` — whole rupees per month; null stops offering it (premium stories stay locked). */
export const membershipPriceSchema = z.object({
  price: z
    .number()
    .int("Use whole rupees")
    .min(MEMBERSHIP_PRICE_MIN, `At least ₹${MEMBERSHIP_PRICE_MIN}`)
    .max(MEMBERSHIP_PRICE_MAX, `Keep it under ₹${MEMBERSHIP_PRICE_MAX.toLocaleString("en-IN")}`)
    .nullable(),
});

/**
 * Who may start a premium membership (owner 2026-10-16): the Editor Desk's rules (Desk → Memberships → Rules). Each rule
 * is one measurable thing from MEMBERSHIP_RULE_METRICS with the number to reach; the Desk can change the numbers,
 * switch rules off, remove them and add new ones. Checked when a reporter sets a price; turning it off is always allowed.
 */
export const MEMBERSHIP_RULE_METRICS = {
  verified: { label: "Verified reporter", unit: "", hasValue: false },
  followers: { label: "Followers", unit: "followers", hasValue: true },
  posting_days: { label: "Days with a published story (any days)", unit: "days", hasValue: true },
  stories: { label: "Published stories in total", unit: "stories", hasValue: true },
  views: { label: "Total views on their stories", unit: "views", hasValue: true },
  likes: { label: "Total likes on their stories", unit: "likes", hasValue: true },
  account_age_days: { label: "Days since joining WebNEWS", unit: "days", hasValue: true },
  no_warnings_days: { label: "No Editor Desk warning in the last … days", unit: "days", hasValue: true },
} as const;
export type MembershipRuleMetric = keyof typeof MEMBERSHIP_RULE_METRICS;
export const MEMBERSHIP_RULE_METRIC_VALUES = Object.keys(MEMBERSHIP_RULE_METRICS) as MembershipRuleMetric[];

export type MembershipRule = { metric: MembershipRuleMetric; value: number; enabled: boolean };

/** Until the Desk changes them (owner 2026-10-16): Verified, 100 followers, stories on 30 different days. */
export const DEFAULT_MEMBERSHIP_RULES: MembershipRule[] = [
  { metric: "verified", value: 1, enabled: true },
  { metric: "followers", value: 100, enabled: true },
  { metric: "posting_days", value: 30, enabled: true },
];

/** `PUT /api/admin/membership-rules` — the whole list, in the order reporters see it; one rule per kind. */
export const membershipRulesSchema = z.object({
  rules: z
    .array(
      z.object({
        metric: z.enum(MEMBERSHIP_RULE_METRIC_VALUES as [MembershipRuleMetric, ...MembershipRuleMetric[]]),
        value: z.number().int("Use a whole number").min(1, "At least 1").max(100_000_000),
        enabled: z.boolean(),
      }),
    )
    .max(MEMBERSHIP_RULE_METRIC_VALUES.length)
    .refine((rules) => new Set(rules.map((rule) => rule.metric)).size === rules.length, "Each rule can be added once"),
});

/** `GET /api/admin/membership-rules` */
export type AdminMembershipRules = { rules: MembershipRule[]; updatedAt: string | null };

/** What a rule says to a reporter: "Have 100 followers", "Publish on 30 days"… */
export function membershipRuleTitle(rule: Pick<MembershipRule, "metric" | "value">): string {
  const n = rule.value.toLocaleString("en-IN");
  switch (rule.metric) {
    case "verified":
      return "Be a Verified reporter";
    case "followers":
      return `Have ${n} followers`;
    case "posting_days":
      return `Publish on ${n} days`;
    case "stories":
      return `Publish ${n} stories`;
    case "views":
      return `Get ${n} views on your stories`;
    case "likes":
      return `Get ${n} likes on your stories`;
    case "account_age_days":
      return `Be on WebNEWS for ${n} days`;
    case "no_warnings_days":
      return `No Editor Desk warning in the last ${n} days`;
  }
}

/** One rule for one reporter: where they are now, and whether it's met. */
export type MembershipRuleProgress = { metric: MembershipRuleMetric; title: string; target: number; current: number; done: boolean };

export type MembershipEligibility = {
  eligible: boolean;
  /** The Desk's switched-on rules, in order. */
  rules: MembershipRuleProgress[];
  /** Published something today already (the "days" rule counts today). */
  postedToday: boolean;
};

/** What a membership payment of `priceInr` is split into, in paise (the buyer pays `totalPaise`). */
export function membershipSplit(priceInr: number): { totalPaise: number; feePaise: number; reporterPaise: number } {
  const totalPaise = priceInr * 100;
  const feePaise = Math.round((totalPaise * MEMBERSHIP_FEE_PERCENT) / 100);
  return { totalPaise, feePaise, reporterPaise: totalPaise - feePaise };
}

/** `GET /api/memberships/:username` — the checkout page. */
export type MembershipCheckout = {
  reporter: AuthorSummary & { reporterLevel: ReporterLevel | null };
  priceInr: number;
  totalPaise: number;
  feePaise: number;
  reporterPaise: number;
  feePercent: number;
  days: number;
  /** The viewer's membership end (null = not a member); paying again adds MEMBERSHIP_DAYS to it. */
  activeUntil: string | null;
  /** How payment is taken: "razorpay" (keys set), "test" (no keys, not production: no money moves), null = unavailable. */
  provider: "razorpay" | "test" | null;
};

/** `POST /api/memberships/:username/orders` — open Razorpay Checkout with this, or (`test`) it is already paid. */
export type MembershipOrder =
  | { kind: "razorpay"; orderId: string; keyId: string; amountPaise: number; currency: "INR"; description: string; email: string; name: string }
  | { kind: "paid"; activeUntil: string };

/* ─────────────── Membership dashboards (owner 2026-10-15) ─────────────── */

/** One payment in a membership history. Amounts in paise. */
export type MembershipPaymentRow = {
  id: string;
  paidAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  amountPaise: number;
  feePaise: number;
  /** amount − fee: the reporter's share. */
  netPaise: number;
  /** "test" = development payment, no money moved. */
  provider: "test" | "razorpay";
};

/** `GET /api/memberships/mine` — Settings → My memberships: every reporter the viewer has (had) a membership of. */
export type MyMembership = {
  reporter: AuthorSummary & { reporterLevel: ReporterLevel | null };
  /** The reporter's current monthly price (null = they stopped offering it). */
  priceInr: number | null;
  memberSince: string;
  /** End of the paid time (may be in the past). */
  validUntil: string;
  active: boolean;
  totalPaidPaise: number;
  payments: MembershipPaymentRow[];
};
export type MyMemberships = { items: MyMembership[] };

/** One member in a reporter's earnings. */
export type MembershipMemberRow = {
  member: AuthorSummary;
  memberSince: string;
  validUntil: string;
  active: boolean;
  payments: number;
  paidPaise: number;
  netPaise: number;
};

export type MembershipPayoutRow = { id: string; amountPaise: number; reference: string | null; note: string | null; paidAt: string };

/** `GET /api/memberships/earnings` — Settings → Premium membership: the reporter's members and money. */
export type MembershipEarnings = {
  priceInr: number | null;
  feePercent: number;
  activeMembers: number;
  totalMembers: number;
  grossPaise: number;
  feePaise: number;
  netPaise: number;
  paidOutPaise: number;
  /** net − paid out: what WebNEWS still owes the reporter. */
  balancePaise: number;
  /** The reporter's share per month, oldest first (last 6 months, IST). */
  monthly: { month: string; netPaise: number; payments: number }[];
  members: MembershipMemberRow[];
  recent: (MembershipPaymentRow & { member: AuthorSummary })[];
  payouts: MembershipPayoutRow[];
};

/** One reporter in the desk's payouts table. */
export type AdminMembershipReporterRow = {
  reporter: AuthorSummary & { email: string | null };
  priceInr: number | null;
  activeMembers: number;
  totalMembers: number;
  grossPaise: number;
  feePaise: number;
  netPaise: number;
  paidOutPaise: number;
  balancePaise: number;
  lastPaymentAt: string | null;
};

/** `GET /api/admin/memberships` — Desk → Memberships: totals, what each reporter is owed, every payment. */
export type AdminMemberships = {
  totals: {
    grossPaise: number;
    /** WebNEWS's platform fee. */
    feePaise: number;
    netPaise: number;
    paidOutPaise: number;
    balancePaise: number;
    activeMemberships: number;
    payments: number;
    /** Any of them made without Razorpay (development test payments: no money moved). */
    testPayments: number;
  };
  reporters: AdminMembershipReporterRow[];
  recent: (MembershipPaymentRow & { member: AuthorSummary; reporter: AuthorSummary })[];
  payouts: (MembershipPayoutRow & { reporter: AuthorSummary })[];
};

/** `POST /api/admin/memberships/payouts` — the desk records money sent to a reporter. */
export const membershipPayoutSchema = z.object({
  reporterId: z.string().min(1).max(100),
  amountInr: z.number().positive("Enter an amount").max(10_000_000),
  reference: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});
export type MembershipPayoutInput = z.input<typeof membershipPayoutSchema>;

/** `POST /api/memberships/verify` — what Razorpay Checkout's success handler returns. */
export const membershipVerifySchema = z.object({
  razorpayOrderId: z.string().min(1).max(100),
  razorpayPaymentId: z.string().min(1).max(100),
  razorpaySignature: z.string().min(1).max(200),
});

/**
 * `POST /api/me/push-devices` (the app registers its push token after you log in) and `DELETE` (logging out on that
 * phone). One token belongs to one account: logging in as someone else on the phone moves it.
 */
export const pushDeviceSchema = z.object({
  token: z.string().trim().min(10).max(4096),
  platform: z.enum(["android", "ios"]),
});

/**
 * `POST /api/me/contact { message }` — the Contact us page (owner 2026-10-02): signed-in members only; their email and
 * username come from their account (never typed), the message is theirs.
 */
export const CONTACT_MESSAGE_MIN = 10;
export const CONTACT_MESSAGE_MAX = 2000;
/** A Contact us message in the Editor Desk inbox (owner 2026-10-10), with the team's reply once sent. */
export type DeskContactMessage = {
  id: string;
  name: string;
  username: string;
  email: string;
  /** The member's current photo (null if the account is gone or has none). */
  image: string | null;
  body: string;
  createdAt: string;
  reply: string | null;
  repliedAt: string | null;
};
export type DeskContactStatus = "new" | "replied" | "all";
export const CONTACT_REPLY_MAX = 4000;
export const contactReplySchema = z.object({
  reply: z
    .string()
    .trim()
    .min(2, "Write a reply")
    .max(CONTACT_REPLY_MAX, `Keep it under ${CONTACT_REPLY_MAX.toLocaleString("en-IN")} characters`),
});

export const contactMessageSchema = z.object({
  message: z
    .string()
    .trim()
    .min(CONTACT_MESSAGE_MIN, `Tell us a little more (at least ${CONTACT_MESSAGE_MIN} characters)`)
    .max(CONTACT_MESSAGE_MAX, `Keep it under ${CONTACT_MESSAGE_MAX.toLocaleString("en-IN")} characters`),
});

/** `PUT /api/me/push-notifications { enabled }` → `{ pushNotifications }`. */
export const pushSettingSchema = z.object({ enabled: z.boolean() });

export type InboxFolder = "primary" | "requests";
export type InboxResponse = Page<ConversationSummary> & { unread: number; requests: number };
export type UnreadMessages = { unread: number; requests: number };

export type CommunitySummary = {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  visibility: CommunityVisibility;
  memberCount: number;
  /** The viewer's place in it: their role when a member; the pending invitation they may answer. */
  viewer: { role: ChatRole | null; inviteId: string | null };
};

export type CommunityDetail = CommunitySummary & {
  owner: ChatPerson | null;
  /** A few members (newest admins and members), for the header. */
  preview: ChatPerson[];
  createdAt: string;
  can: { invite: boolean; edit: boolean; delete: boolean; remove: boolean };
};

export type CommunityInvite = {
  id: string;
  community: CommunitySummary;
  inviter: ChatPerson | null;
  status: InviteStatus;
  createdAt: string;
};

const chatText = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters`);
/**
 * A group / community photo: one of the viewer's own uploaded images (`kind: "avatar"` upload) — a full URL (R2) or,
 * with local storage, a site path ("/media/…"), which `.url()` would reject.
 */
const chatImage = z
  .string()
  .trim()
  .max(LIMITS.linkMax)
  .refine((value) => value.startsWith("/media/") || /^https?:\/\//.test(value), "Pick a photo uploaded to WebNEWS")
  .nullable()
  .optional();

/** `POST /api/messages/:id/messages` — exactly one of text / articleId / profileUsername (text may go with the others). */
export const sendMessageSchema = z
  .object({
    text: chatText(CHAT_LIMITS.messageMax).optional(),
    articleId: z.string().uuid().optional(),
    profileUsername: z.string().min(1).max(USERNAME_MAX).optional(),
  })
  .refine((v) => Boolean(v.text) || Boolean(v.articleId) || Boolean(v.profileUsername), { message: "Write a message", path: ["text"] })
  .refine((v) => !(v.articleId && v.profileUsername), { message: "Send one thing at a time", path: ["_"] });
export type SendMessageInput = z.input<typeof sendMessageSchema>;

/** `POST /api/messages/send` — the share sheet: one story / profile (and an optional note) to people and chats. */
export const sendToSchema = z
  .object({
    usernames: z.array(z.string().min(1).max(USERNAME_MAX)).max(CHAT_LIMITS.sendRecipientsMax).default([]),
    conversationIds: z.array(z.string().uuid()).max(CHAT_LIMITS.sendRecipientsMax).default([]),
    text: chatText(CHAT_LIMITS.messageMax).optional(),
    articleId: z.string().uuid().optional(),
    profileUsername: z.string().min(1).max(USERNAME_MAX).optional(),
  })
  .refine((v) => v.usernames.length + v.conversationIds.length > 0, { message: "Pick someone to send it to", path: ["usernames"] })
  .refine((v) => v.usernames.length + v.conversationIds.length <= CHAT_LIMITS.sendRecipientsMax, {
    message: `Send to at most ${CHAT_LIMITS.sendRecipientsMax} at once`,
    path: ["usernames"],
  })
  .refine((v) => Boolean(v.text) || Boolean(v.articleId) || Boolean(v.profileUsername), { message: "Nothing to send", path: ["text"] });
export type SendToInput = z.input<typeof sendToSchema>;
export type SendToResult = { sent: number; conversationIds: string[] };

/** `POST /api/messages/direct` — open (or start) your chat with someone. */
export const directChatSchema = z.object({ username: z.string().min(1).max(USERNAME_MAX) });

/** `POST /api/messages/groups` — a group chat with 2+ other people (a name is optional). */
export const createGroupSchema = z.object({
  name: chatText(CHAT_LIMITS.nameMax).optional(),
  usernames: z
    .array(z.string().min(1).max(USERNAME_MAX))
    .min(2, "Pick at least two people for a group")
    .max(CHAT_LIMITS.groupMembersMax - 1, `A group holds at most ${CHAT_LIMITS.groupMembersMax} people`),
  image: chatImage,
});
export type CreateGroupInput = z.input<typeof createGroupSchema>;

/** `PATCH /api/messages/:id` — rename a group / change its photo. */
export const updateChatSchema = z.object({ name: chatText(CHAT_LIMITS.nameMax).optional(), image: chatImage });
export type UpdateChatInput = z.input<typeof updateChatSchema>;

/** `POST /api/messages/:id/members` (groups) and `POST /api/communities/:id/invites`. */
export const addPeopleSchema = z.object({
  usernames: z.array(z.string().min(1).max(USERNAME_MAX)).min(1, "Pick someone").max(CHAT_LIMITS.invitesPerCallMax),
});

export const createCommunitySchema = z.object({
  name: chatText(CHAT_LIMITS.nameMax).min(3, "Give it a name (3+ characters)"),
  description: chatText(CHAT_LIMITS.descriptionMax).optional(),
  visibility: z.enum(COMMUNITY_VISIBILITY_VALUES).default("public"),
  image: chatImage,
});
export type CreateCommunityInput = z.input<typeof createCommunitySchema>;

export const updateCommunitySchema = z.object({
  name: chatText(CHAT_LIMITS.nameMax).min(3, "Give it a name (3+ characters)").optional(),
  description: chatText(CHAT_LIMITS.descriptionMax).nullable().optional(),
  visibility: z.enum(COMMUNITY_VISIBILITY_VALUES).optional(),
  image: chatImage,
});
export type UpdateCommunityInput = z.input<typeof updateCommunitySchema>;

/** `POST /api/communities/:id/members/:username/role` (the owner). */
export const communityRoleSchema = z.object({ role: z.enum(["admin", "member"]) });

/** One line for a message in the inbox / bell ("Shared a story: …", "Asha added Ravi"). */
export function messagePreview(m: Pick<ChatMessage, "kind" | "text" | "event" | "article" | "profile" | "target"> & { senderName?: string | null }): string {
  const who = m.senderName ?? "Someone";
  switch (m.kind) {
    case "article":
      return m.article ? `Shared a story: ${m.article.title}` : "Shared a story";
    case "profile":
      return m.profile ? `Shared a profile: @${m.profile.username}` : "Shared a profile";
    case "system": {
      const target = m.target?.name ?? "someone";
      switch (m.event) {
        case "created":
          return `${who} created the chat`;
        case "added":
          return `${who} added ${target}`;
        case "removed":
          return `${who} removed ${target}`;
        case "left":
          return `${who} left`;
        case "joined":
          return `${who} joined`;
        case "renamed":
          return `${who} renamed the chat to "${m.text ?? ""}"`;
        case "photo":
          return `${who} changed the photo`;
        default:
          return "";
      }
    }
    default:
      return m.text ?? "";
  }
}

/* ─────────────── Connected social accounts: auto-post (owner 2026-09-30) ─────────────── */

/**
 * Verified reporters connect Instagram (a Professional account, through Instagram Login) and a Facebook Page (through
 * Facebook Login) in Edit profile. From then on every story they publish is posted there automatically: the story's
 * 9:16 poster as an Instagram Story, and as a photo post (headline, summary and the link) on the Page. Personal
 * Facebook profiles can't be posted to by any app (Meta's rule).
 */
export const SOCIAL_PROVIDER_VALUES = ["instagram", "facebook"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDER_VALUES)[number];
export const SOCIAL_PROVIDER_LABELS: Record<SocialProvider, string> = { instagram: "Instagram", facebook: "Facebook" };

export type SocialPostStatus = "waiting" | "pending" | "posted" | "failed";

export type SocialConnection = {
  provider: SocialProvider;
  /** Instagram: the @username; Facebook: the Page's name. */
  accountName: string;
  accountId: string;
  autoPost: boolean;
  connectedAt: string;
  /** Facebook: the Pages this person manages (the one posted to is `accountId`). */
  pages: { id: string; name: string }[];
  /** Needs connecting again (the permission was removed or the login expired). */
  needsReconnect: boolean;
  /** The latest auto-post, to show it worked (or why it didn't). */
  lastPost: { status: SocialPostStatus; storyTitle: string; error: string | null; at: string } | null;
};

export type SocialStatus = {
  /** Whether the site has its Meta app keys for each (until then the buttons explain it's not set up). */
  configured: Record<SocialProvider, boolean>;
  /** Only verified reporters can connect accounts. */
  eligible: boolean;
  connections: SocialConnection[];
};

export const updateSocialSchema = z.object({ autoPost: z.boolean().optional(), pageId: z.string().min(1).max(64).optional() });
export type UpdateSocialInput = z.input<typeof updateSocialSchema>;

/* ─────────────── Press meets (owner 2026-10-01) ─────────────── */

/**
 * Virtual press meets. Any member books one from their profile: a date + time on the calendar (an organizer's own press
 * meets can't overlap; others' don't block a time — owner 2026-10-02; 9 AM–9 PM IST, 30 / 60 / 90 minutes), then Verified reporters (each shows the price
 * they set in Settings), then the details. Reporters get the invitation in the bell and in their profile's "Press meet"
 * tab, accept or decline, are reminded on the day, and join the room the organizer starts — the built-in WebNEWS room
 * (organizer on camera + mic, reporters mic only; reporters can record it, replayed only inside WebNEWS) or a Google
 * Meet link. Afterwards each reporter writes their story from the press meet page and sends it to the organizer; it
 * stays unpublished until the organizer verifies it — which publishes it, locked from then on (owner 2026-10-07) — or
 * asks for changes. The organizer then releases the reporter's fee (paid outside WebNEWS for now, recorded here), and
 * the reporter confirms they received it.
 */
export const PRESS_MEET = {
  /** Calendar timezone: India (IST has no daylight saving, so it's always UTC+5:30). */
  timeZone: "Asia/Kolkata",
  utcOffsetMinutes: 330,
  /** Bookable hours (minutes after midnight IST): from 9:00 AM to 9:00 PM. */
  dayStartMinutes: 9 * 60,
  dayEndMinutes: 21 * 60,
  /** Start times every 30 minutes. */
  slotStepMinutes: 30,
  /** A slot must start at least this long from now — 0: any time that hasn't started yet (owner 2026-10-02). */
  leadMinutes: 0,
  /** How far ahead the calendar opens. */
  bookAheadDays: 60,
  /** The built-in room connects everyone directly, so a press meet invites at most this many reporters. */
  reportersMax: 10,
  /** The organizer can start the press meet this many minutes early. */
  startEarlyMinutes: 10,
  /** Reminder before it starts (the other reminder goes out at 8 AM IST on the day). */
  remindBeforeMinutes: 15,
  dayReminderMinutes: 8 * 60,
  titleMin: 5,
  titleMax: 140,
  agendaMax: 2000,
  noteMax: 500,
  referenceMax: 80,
  /** The notepad (characters). */
  notesMax: 20_000,
  /** One chat message in the room (owner 2026-10-02). */
  chatMax: 500,
  /** Recording upload pieces (MediaRecorder timeslice) and their size cap. */
  chunkMs: 4000,
  chunkMaxBytes: 8 * 1024 * 1024,
} as const;

export const PRESS_MEET_DURATIONS = [30, 60, 90] as const;
export type PressMeetDuration = (typeof PRESS_MEET_DURATIONS)[number];

export const PRESS_MEET_PLATFORM_VALUES = ["webnews", "google_meet"] as const;
export type PressMeetPlatform = (typeof PRESS_MEET_PLATFORM_VALUES)[number];
export const PRESS_MEET_PLATFORM_LABELS: Record<PressMeetPlatform, string> = { webnews: "WebNEWS Live", google_meet: "Google Meet" };

/**
 * Who can join (owner 2026-10-07): `invited` — the reporters the organizer chose; `public` — any reporter, first come
 * first served up to PRESS_MEET.reportersMax, free (no fees). Every reporter is told when a public one is booked and
 * when it goes live.
 */
export const PRESS_MEET_VISIBILITY_VALUES = ["invited", "public"] as const;
export type PressMeetVisibility = (typeof PRESS_MEET_VISIBILITY_VALUES)[number];

export const PRESS_MEET_STATUS_VALUES = ["scheduled", "live", "ended", "cancelled"] as const;
export type PressMeetStatus = (typeof PRESS_MEET_STATUS_VALUES)[number];

export const PRESS_MEET_INVITE_STATUS_VALUES = ["invited", "accepted", "declined"] as const;
export type PressMeetInviteStatus = (typeof PRESS_MEET_INVITE_STATUS_VALUES)[number];

/** The organizer's check of the story a reporter sent in. */
export const PRESS_MEET_REVIEW_VALUES = ["pending", "approved", "changes"] as const;
export type PressMeetReview = (typeof PRESS_MEET_REVIEW_VALUES)[number];

/** The reporter's fee: released by the organizer, then confirmed by the reporter. */
export const PRESS_MEET_PAYMENT_VALUES = ["unpaid", "released", "received"] as const;
export type PressMeetPayment = (typeof PRESS_MEET_PAYMENT_VALUES)[number];

export const PRESS_MEET_RECORDING_STATUS_VALUES = ["recording", "processing", "ready", "failed"] as const;
export type PressMeetRecordingStatus = (typeof PRESS_MEET_RECORDING_STATUS_VALUES)[number];

/** A Google Meet link: https://meet.google.com/abc-defg-hij (the code is what matters). */
export const GOOGLE_MEET_URL_REGEX = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(?:\?[^\s]*)?$/;

/** "2026-10-04" for an instant, in IST. */
export function istDateKey(input: Date | string | number): string {
  const shifted = new Date(new Date(input).getTime() + PRESS_MEET.utcOffsetMinutes * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** The instant of `minutes` after midnight IST on `dateKey` ("2026-10-04"). */
export function istInstant(dateKey: string, minutes: number): Date {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + (minutes - PRESS_MEET.utcOffsetMinutes) * 60_000);
}

/** Minutes after midnight IST of an instant. */
export function istMinutes(input: Date | string | number): number {
  const shifted = new Date(new Date(input).getTime() + PRESS_MEET.utcOffsetMinutes * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

export type PressMeetSlot = {
  start: string;
  end: string;
  available: boolean;
  /** Why it can't be booked: too soon / already over, or another press meet holds (part of) it. */
  reason: "past" | "booked" | null;
};

export type PressMeetSlotsResponse = { date: string; duration: PressMeetDuration; slots: PressMeetSlot[] };

/** The calendar month: how many start times are still free each day (for the chosen length). */
export type PressMeetMonthResponse = {
  month: string;
  duration: PressMeetDuration;
  /** First and last bookable days (IST). */
  firstDate: string;
  lastDate: string;
  days: Array<{ date: string; open: number }>;
};

/** A Verified reporter on the "choose reporters" step, with the price they set in Settings (null = not set yet). */
export type PressMeetReporter = AuthorSummary & {
  state: string | null;
  district: string | null;
  city: string | null;
  languages: PressLanguage[];
  outlet: string | null;
  reporterType: ReporterType | null;
  experience: ReportingExperience | null;
  followers: number;
  articles: number;
  price: number | null;
};

export type PressMeetReportersResponse = { items: PressMeetReporter[]; nextCursor: string | null };

export type PressMeetRecording = {
  id: string;
  status: PressMeetRecordingStatus;
  durationMs: number | null;
  createdAt: string;
  finishedAt: string | null;
};

export type PressMeetInvite = {
  id: string;
  reporter: AuthorSummary;
  /** The reporter's price when they were invited (₹). */
  price: number;
  status: PressMeetInviteStatus;
  respondedAt: string | null;
  joinedAt: string | null;
  /**
   * Their story for this press meet (slug null while it isn't live). The organizer sees it only once it's been sent
   * (`review` set); the reporter also while it's still their draft.
   */
  article: { id: string; slug: string | null; title: string; coverUrl: string | null } | null;
  submittedAt: string | null;
  review: PressMeetReview | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  payment: PressMeetPayment;
  paymentRef: string | null;
  releasedAt: string | null;
  receivedAt: string | null;
};

export type PressMeetSummary = {
  id: string;
  title: string;
  agenda: string | null;
  startsAt: string;
  endsAt: string;
  durationMinutes: PressMeetDuration;
  platform: PressMeetPlatform;
  /** Invited reporters only, or public: any reporter joins (owner 2026-10-07). */
  visibility: PressMeetVisibility;
  /** Public press meets: seats still free (null for invited ones). */
  seatsLeft: number | null;
  status: PressMeetStatus;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  /** From when the organizer can start it (10 minutes before; any time on a local test server). */
  startOpensAt: string;
  organizer: AuthorSummary;
  /** The viewer's part in it. */
  role: "organizer" | "reporter";
  counts: { invited: number; accepted: number; declined: number; total: number };
  /** Sum of the fees of the reporters who haven't declined (₹). */
  totalAmount: number;
  /** A reporter's own invitation (null for the organizer). */
  myInvite: PressMeetInvite | null;
};

export type PressMeetDetail = PressMeetSummary & {
  /** The Google Meet link — only for the organizer and reporters who accepted. */
  meetUrl: string | null;
  /** The press meet report the organizer attached (organizer + invited reporters; GET /api/press-meets/:id/report). */
  report: PressMeetReportFile | null;
  /** The platform fee the organizer paid when booking — organizer only. */
  platformFee: PlatformFeePayment | null;
  /** When the organizer agreed, on Start, that the press meet may be recorded (null before it starts). */
  recordingConsentAt: string | null;
  /** The organizer sees every invitation; a reporter only their own (in `myInvite`). */
  invites: PressMeetInvite[];
  /** A reporter's own recordings of this press meet. */
  recordings: PressMeetRecording[];
};

export type PressMeetListResponse = { items: PressMeetSummary[]; nextCursor: string | null };

/**
 * `GET /api/press-meets/:id/invites/:inviteId/story` — a story sent for the press meet, read by its organizer before
 * they verify it (it isn't public yet).
 */
export type PressMeetStoryPreview = {
  id: string;
  title: string;
  bodyHtml: string;
  category: Category | null;
  district: string | null;
  coverUrl: string | null;
  coverBlur: string | null;
  /** Video stories: the clip (the cover is its poster). */
  videoUrl: string | null;
  articleImageUrl: string | null;
  articleImageBlur: string | null;
  articleVideoUrl: string | null;
  template: PosterTemplate;
  posterFrame: PosterFrame | null;
  author: AuthorSummary & { reporterLevel: ReporterLevel | null };
  submittedAt: string | null;
};

const pressMeetTitle = z
  .string()
  .trim()
  .min(PRESS_MEET.titleMin, `Give it a title of at least ${PRESS_MEET.titleMin} characters`)
  .max(PRESS_MEET.titleMax, `Keep the title under ${PRESS_MEET.titleMax} characters`);

export const createPressMeetSchema = z
  .object({
    title: pressMeetTitle,
    agenda: z
      .string()
      .trim()
      .max(PRESS_MEET.agendaMax, `Keep the agenda under ${PRESS_MEET.agendaMax} characters`)
      .nullish()
      .transform((value) => value || null),
    startsAt: z.iso.datetime({ offset: true, error: "Choose a time slot" }),
    durationMinutes: z.union([z.literal(30), z.literal(60), z.literal(90)]),
    platform: z.enum(PRESS_MEET_PLATFORM_VALUES),
    meetUrl: z
      .string()
      .trim()
      .nullish()
      .transform((value) => value || null),
    /** `public`: no invitations — any reporter joins (owner 2026-10-07). */
    visibility: z.enum(PRESS_MEET_VISIBILITY_VALUES).default("invited"),
    /** The invited reporters (none for a public press meet). */
    reporterIds: z
      .array(z.string().min(1).max(64))
      .max(PRESS_MEET.reportersMax, `Invite at most ${PRESS_MEET.reportersMax} reporters`)
      .default([]),
    /** The uploaded press meet report (POST /api/press-meets/report) — required (owner 2026-10-05). */
    reportId: z.uuid({ error: "Upload the press meet report" }),
    /** The paid platform fee (POST /api/press-meets/platform-fee/pay); null only while the fee is ₹0. */
    platformFeePaymentId: z
      .uuid()
      .nullish()
      .transform((value) => value ?? null),
  })
  .superRefine((value, ctx) => {
    if (value.platform === "google_meet" && !(value.meetUrl && GOOGLE_MEET_URL_REGEX.test(value.meetUrl))) {
      ctx.addIssue({ code: "custom", path: ["meetUrl"], message: "Paste a Google Meet link like https://meet.google.com/abc-defg-hij" });
    }
    if (value.visibility === "invited" && value.reporterIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["reporterIds"], message: "Choose at least one reporter" });
    }
  });
export type CreatePressMeetInput = z.input<typeof createPressMeetSchema>;

/**
 * `POST /api/press-meets/:id/start` (owner 2026-10-05): the organizer ticks the recording consent in the Start dialog;
 * without it the press meet doesn't start.
 */
export const startPressMeetSchema = z.object({
  recordingConsent: z.literal(true, { error: "Agree that the press meet may be recorded to start it" }),
});

/* ─────────────── Press meet report + platform fee (owner 2026-10-05) ─────────────── */

/**
 * The report an organizer attaches when booking: PDF, Word or a JPG / PNG image, at most 10 MB. Private — the
 * organizer, the reporters they invite and the Editor Desk open it.
 */
export const PRESS_MEET_REPORT = {
  maxBytes: 10 * 1024 * 1024,
  /** The file picker's `accept`. */
  accept:
    ".pdf,.doc,.docx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png",
} as const;

export type PressMeetReportFile = { id: string; fileName: string; mime: string; sizeBytes: number };

/** Who took the platform fee: `test` until online payments (Razorpay) are connected — no money moves. */
export const PLATFORM_FEE_PROVIDER_VALUES = ["test", "razorpay"] as const;
export type PlatformFeeProvider = (typeof PLATFORM_FEE_PROVIDER_VALUES)[number];

/** `GET /api/press-meets/platform-fee` — what booking costs now (set by the Editor Desk). */
export type PlatformFeeQuote = { amountInr: number; provider: PlatformFeeProvider };

export type PlatformFeePayment = { id: string; amountInr: number; provider: PlatformFeeProvider; paidAt: string };

/** Highest platform fee the Editor Desk can set (whole ₹). */
export const PLATFORM_FEE_MAX = 1_000_000;

/** `PUT /api/admin/press-meets/platform-fee` — whole rupees; 0 = free (no payment step). */
export const platformFeeSchema = z.object({
  amountInr: z
    .number({ error: "Enter the fee in rupees" })
    .int("Use whole rupees")
    .min(0, "It can't be negative")
    .max(PLATFORM_FEE_MAX, `Keep it under ₹${PLATFORM_FEE_MAX.toLocaleString("en-IN")}`),
});

/** `GET /api/admin/press-meets/platform-fee`. */
export type AdminPlatformFee = { amountInr: number; updatedAt: string | null };

/** A row of the Editor Desk's press meet list. */
export type AdminPressMeetRow = {
  id: string;
  title: string;
  startsAt: string;
  status: PressMeetStatus;
  platform: PressMeetPlatform;
  organizer: AuthorSummary;
  reporters: number;
  totalAmount: number;
  report: PressMeetReportFile | null;
  platformFee: PlatformFeePayment | null;
};

export const respondPressMeetSchema = z.object({ accept: z.boolean() });

/** Each person's private notepad for a press meet (owner 2026-10-01). */
export type PressMeetNotes = { body: string; updatedAt: string | null };
export const pressMeetNotesSchema = z.object({
  body: z.string().max(PRESS_MEET.notesMax, `Notes can be up to ${PRESS_MEET.notesMax.toLocaleString("en-IN")} characters`),
});
/**
 * The room's chat (owner 2026-10-02): reporters ask questions while the press meet is live, the organizer can reply and
 * switch the chat off (and on) for reporters. `GET /api/press-meets/:id/chat`; new messages and the switch arrive as
 * `meet.chat` (refetch).
 */
export type PressMeetChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  author: AuthorSummary;
  role: "organizer" | "reporter";
};
export type PressMeetChat = { enabled: boolean; messages: PressMeetChatMessage[] };
/** `POST /api/press-meets/:id/chat { body }` → the message. */
export const pressMeetChatSendSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write a message")
    .max(PRESS_MEET.chatMax, `Keep it under ${PRESS_MEET.chatMax} characters`),
});
/** `PUT /api/press-meets/:id/chat { enabled }` → `{ enabled }` — the organizer only. */
export const pressMeetChatSettingSchema = z.object({ enabled: z.boolean() });

/** The organizer invites more reporters after booking (owner 2026-10-01), up to PRESS_MEET.reportersMax in all. */
export const inviteMoreReportersSchema = z.object({
  reporterIds: z
    .array(z.string().min(1).max(64))
    .min(1, "Choose at least one reporter")
    .max(PRESS_MEET.reportersMax, `Invite at most ${PRESS_MEET.reportersMax} reporters`),
});
export const reviewPressMeetStorySchema = z
  .object({
    approve: z.boolean(),
    note: z
      .string()
      .trim()
      .max(PRESS_MEET.noteMax, `Keep the note under ${PRESS_MEET.noteMax} characters`)
      .nullish()
      .transform((value) => value || null),
  })
  .superRefine((value, ctx) => {
    if (!value.approve && !value.note) ctx.addIssue({ code: "custom", path: ["note"], message: "Tell the reporter what to change" });
  });
export const releasePressMeetPaymentSchema = z.object({
  reference: z
    .string()
    .trim()
    .max(PRESS_MEET.referenceMax, `Keep the reference under ${PRESS_MEET.referenceMax} characters`)
    .nullish()
    .transform((value) => value || null),
});

/* The built-in room: WebRTC between every participant, signalled through the API + the live stream. */

/** A browser tab in the room (random per join, so one person's two tabs are told apart). */
const peerIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

export type PressMeetPeer = {
  peerId: string;
  user: AuthorSummary;
  role: "organizer" | "reporter";
  micOn: boolean;
  cameraOn: boolean;
  /** A raised hand = a request to speak (owner 2026-10-05). */
  hand: boolean;
  /** The organizer accepted their request: a reporter's mic works only then (the organizer's always does). */
  canSpeak: boolean;
  recording: boolean;
};

export type PressMeetRoom = {
  meet: PressMeetDetail;
  /** STUN (+ TURN when the server has one) for RTCPeerConnection. */
  iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
  peers: PressMeetPeer[];
};

export const joinPressMeetRoomSchema = z.object({
  peerId: peerIdSchema,
  micOn: z.boolean(),
  cameraOn: z.boolean(),
  /** Reporters agree that the press meet is recorded before they join (owner 2026-10-05); the API refuses them without it. */
  recordingConsent: z.literal(true).optional(),
});
export const pressMeetPeerSchema = z.object({ peerId: peerIdSchema });
export const pressMeetStateSchema = z.object({
  peerId: peerIdSchema,
  micOn: z.boolean(),
  cameraOn: z.boolean(),
  hand: z.boolean(),
  recording: z.boolean(),
});
export const PRESS_MEET_SIGNAL_KINDS = ["offer", "answer", "candidate"] as const;
export const pressMeetSignalSchema = z.object({
  from: peerIdSchema,
  to: peerIdSchema,
  kind: z.enum(PRESS_MEET_SIGNAL_KINDS),
  /** An RTCSessionDescriptionInit or RTCIceCandidateInit. */
  data: z.record(z.string(), z.unknown()),
});
/** The organizer mutes a reporter (and lowers their hand). */
export const pressMeetMuteSchema = z.object({ peerId: peerIdSchema });
/** The organizer accepts or declines a reporter's request to speak. */
export const pressMeetSpeakSchema = z.object({ peerId: peerIdSchema, allow: z.boolean() });

/**
 * Room events to one person's own connections (the `meet.signal` stream event). `to` = the tab it's for (null = every
 * tab of theirs in that room).
 */
export type PressMeetSignal =
  | { meetId: string; to: string; from: string; kind: "offer" | "answer" | "candidate"; data: Record<string, unknown> }
  | { meetId: string; to: null; from: string; kind: "peer-joined" | "state"; data: PressMeetPeer }
  | { meetId: string; to: null; from: string; kind: "peer-left"; data: null }
  | { meetId: string; to: string; from: string; kind: "mute"; data: null }
  /** The organizer's answer to this tab's request to speak. */
  | { meetId: string; to: string; from: string; kind: "speak"; data: { allowed: boolean } }
  /** The same person joined from another tab / device: this tab (`to`) is out of the room. */
  | { meetId: string; to: string; from: string; kind: "replaced"; data: null }
  | { meetId: string; to: null; from: string; kind: "ended"; data: null };

/* ─────────────── Behaviour tracking (owner 2026-10-16) ─────────────── */

/*
 * Every tap is recorded with who did it (owner 2026-10-16: "every single button's data, saved with the profile, to
 * build behaviour-based features later"): a site-wide tracker sends `click` for any button or link (its label), plus
 * named events for the features worth counting on their own. Publishers see their stories' share in Newsroom →
 * Insights; the Editor Desk sees everything in Desk → Behaviour.
 */
export const TRACKED_FEATURES = {
  autoscroll_on: "Auto-scroll turned on",
  autoscroll_off: "Auto-scroll turned off",
  autoscroll_advance: "Auto-scroll moved to the next story",
  layout_grid: "Switched to grid",
  layout_reel: "Switched to reels",
  radio_play: "News radio started",
  search: "Searched",
  read: "Read a story",
  double_tap_like: "Double-tap like",
  page_view: "Opened a page",
  get_app: "Tapped “Get the app”",
  get_app_dismissed: "Dismissed “Get the app”",
  get_app_nav: "Downloaded the app from the top bar",
  get_app_menu: "Downloaded the app from the menu",
  tour_start: "Started the guided tour",
  tour_step_done: "Did a tour step",
  tour_step_skipped: "Skipped a tour step",
  tour_done: "Finished the guided tour",
  tour_exit: "Left the guided tour",
  tour_declined: "Skipped the guided tour",
} as const;
export type TrackedFeature = keyof typeof TRACKED_FEATURES;

const trackPropValue = z.union([z.string().max(200), z.number().finite(), z.boolean()]);

export const trackEventSchema = z.object({
  /** `click` or a TRACKED_FEATURES key (or a future name). */
  name: z.string().regex(/^[a-z0-9_]{1,40}$/),
  /** What was tapped ("Like", "Share", "Follow"…). */
  label: z.string().trim().max(80).optional(),
  articleId: z.string().uuid().optional(),
  /** A profile the tap was about (Follow, a profile link). */
  targetUsername: z.string().max(40).optional(),
  path: z.string().max(300),
  props: z.record(z.string().max(40), trackPropValue).optional(),
});
export type TrackEvent = z.infer<typeof trackEventSchema>;

/** `POST /api/events` — a batch from one page. */
export const trackBatchSchema = z.object({
  platform: z.enum(["web", "app"]),
  events: z.array(trackEventSchema).min(1).max(50),
});

/** One action and how often it happened. */
export type ActionCount = { label: string; count: number; people: number };

/** `GET /api/newsroom/stories/:id/insights` — Meta-Ads-style insights for one of the publisher's stories. */
export type StoryInsights = {
  story: { id: string; title: string; slug: string | null; coverUrl: string | null; publishedAt: string | null; spotlight: boolean };
  /** Shown (readers who saw the card) → opened → engaged (liked, commented, shared or saved) → followed. */
  funnel: { shown: number; opened: number; engaged: number; followed: number };
  totals: {
    views: number;
    reads: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    /** Average seconds spent on the story page (null until someone has read it). */
    avgReadSeconds: number | null;
    clicks: number;
  };
  /** Per day since publishing (last 30 days, the publisher's time zone). */
  daily: { date: string; views: number; reads: number; likes: number; shares: number }[];
  /** Every button readers pressed on this story. */
  actions: ActionCount[];
  /** Shares by channel (WhatsApp, Copy link…). */
  shareChannels: { channel: string; count: number }[];
  /** Who saw it. */
  audience: { signedIn: number; visitors: number; app: number; web: number };
};

/** One day of site activity. */
export type BehaviourDay = { date: string; events: number; people: number };

/** `GET /api/admin/behaviour?days=` — Desk → Behaviour. */
export type BehaviourOverview = {
  days: number;
  totals: { events: number; people: number; signedIn: number; visitors: number; app: number; web: number };
  daily: BehaviourDay[];
  /** TRACKED_FEATURES usage (e.g. how many turned auto-scroll on). */
  features: (ActionCount & { name: string })[];
  /** The most-tapped buttons and links. */
  topActions: ActionCount[];
  topPages: { path: string; count: number; people: number }[];
  /** The most active signed-in people. */
  topPeople: (AuthorSummary & { events: number; lastAt: string })[];
};

export type BehaviourEvent = {
  id: string;
  name: string;
  label: string | null;
  path: string;
  platform: "web" | "app";
  story: { id: string; title: string } | null;
  props: Record<string, string | number | boolean> | null;
  at: string;
};

/** `GET /api/admin/behaviour/people/:username` — one person's behaviour. */
export type PersonBehaviour = {
  person: AuthorSummary & { email: string | null; joinedAt: string };
  totals: { events: number; days: number; reads: number; avgReadSeconds: number | null; app: number; web: number };
  features: (ActionCount & { name: string })[];
  topActions: ActionCount[];
  /** The sections they read most. */
  categories: { category: string; reads: number }[];
  /** Latest first. */
  timeline: BehaviourEvent[];
};

/** `PUT /api/users/:username/follow/notify` — the follow's bell (owner 2026-10-16): every new story, or none. */
export const followNotifySchema = z.object({ notify: z.boolean() });
export type FollowNotify = { following: boolean; notify: boolean };

/** `GET /api/admin/live` — who's on WebNEWS right now (owner 2026-10-16): anyone active in the last LIVE_WINDOW_MINUTES. */
export const LIVE_WINDOW_MINUTES = 5;
export type LiveVisitors = {
  total: number;
  signedIn: number;
  visitors: number;
  app: number;
  web: number;
  /** What they're looking at. */
  pages: { path: string; people: number }[];
  /** Signed-in people on now, latest first. */
  people: (AuthorSummary & { path: string; at: string })[];
};

/* ─────────────────────────── Group accounts (owner 2026-10-23) ─────────────────────────── */

/*
 * A group account (e.g. @vkmangalore) is one public account several people post as — like a Facebook Page. Nobody
 * signs in to it: its members keep their own accounts and switch to "Posting as VK Mangalore". A Press Pass holder
 * applies, the Editor Desk approves; the group then has its own Press Pass, which covers its members. Readers see only
 * the group's name; inside the group every story records which member wrote it. All money goes to the owner.
 *
 * Roles: owner (members, the group's profile, everything), editor (publishes and edits any story, approves the writers'),
 * writer (writes; a story goes to the editors, not live).
 */

export type AccountType = "person" | "group";
export const ACCOUNT_TYPE_VALUES = ["person", "group"] as const satisfies readonly AccountType[];

export type GroupRole = "owner" | "editor" | "writer";
export const GROUP_ROLE_VALUES = ["owner", "editor", "writer"] as const satisfies readonly GroupRole[];
export const GROUP_ROLE_LABELS: Record<GroupRole, string> = { owner: "Owner", editor: "Editor", writer: "Writer" };
export const GROUP_ROLE_HINTS: Record<GroupRole, string> = {
  owner: "Manages members and the group's profile; publishes anything",
  editor: "Publishes and edits any story; approves the writers' stories",
  writer: "Writes stories; an editor approves them before they go live",
};

export type GroupApplicationStatus = "pending" | "approved" | "rejected";
export const GROUP_APPLICATION_STATUS_VALUES = ["pending", "approved", "rejected"] as const satisfies readonly GroupApplicationStatus[];
export type GroupMemberStatus = "invited" | "active";
export const GROUP_MEMBER_STATUS_VALUES = ["invited", "active"] as const satisfies readonly GroupMemberStatus[];

export const GROUP_LIMITS = { membersMax: 25, aboutMax: 300, groupsPerPersonMax: 10 } as const;

/** Who is really behind a group account while posting as it (`ViewerUser.actingAs`). */
export type GroupActor = {
  groupId: string;
  role: GroupRole;
  member: { id: string; username: string | null; name: string; image: string | null };
};

/** A group you belong to, as the account switcher lists it. */
export type GroupMembershipSummary = {
  id: string;
  username: string;
  name: string;
  image: string | null;
  role: GroupRole;
  /** Deactivated by its owner (owner 2026-10-23): hidden, nobody posts as it, until the owner reactivates it. */
  deactivated?: boolean;
};

export type GroupMember = {
  user: AuthorSummary;
  role: GroupRole;
  status: GroupMemberStatus;
  joinedAt: string | null;
  invitedAt: string;
};

export type GroupApplication = {
  id: string;
  name: string;
  username: string;
  about: string;
  image: string;
  link: string | null;
  status: GroupApplicationStatus;
  deskNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  /** The approved group's account (approved applications). */
  groupUsername: string | null;
};

/** A writer's story waiting for the group's editors. */
export type GroupPendingStory = {
  id: string;
  title: string | null;
  coverUrl: string | null;
  submittedAt: string;
  writer: AuthorSummary | null;
};

/** `GET /api/groups` — the Groups page. */
export type MyGroupsResponse = {
  groups: (GroupMembershipSummary & { memberCount: number; pendingStories: number })[];
  invites: (GroupMembershipSummary & { invitedBy: AuthorSummary | null })[];
  applications: GroupApplication[];
  /** Applying needs your own Press Pass. */
  canApply: boolean;
  /** One group per person (owner 2026-10-23): you already own one, so you can't start another. */
  ownsGroup: boolean;
};

/** `GET /api/groups/:id` — one group, for its members. */
export type GroupDetailResponse = {
  group: GroupMembershipSummary & { bio: string | null };
  members: GroupMember[];
  pendingStories: GroupPendingStory[];
};

/** `GET /api/admin/groups` — the Editor Desk's queue. */
export type AdminGroupApplication = GroupApplication & { applicant: AuthorSummary & { passNumber: string | null } };

/** `GET /api/admin/groups/:applicationId/detail` — an approved group: who runs it, its members and what they posted. */
export type AdminGroupDetail = {
  group: AuthorSummary & { createdAt: string; passNumber: string | null; followers: number };
  stories: { published: number; drafts: number; waiting: number };
  /** Members (owner first), with how many of the group's stories each wrote. */
  members: (GroupMember & { storiesPosted: number })[];
  /** The group's latest stories and who really wrote each one. */
  recent: { id: string; title: string | null; status: "draft" | "in_review" | "published"; at: string; writer: AuthorSummary | null }[];
};

export const groupApplicationSchema = z.object({
  name: z.string().trim().min(2, "Enter the group's name").max(LIMITS.nameMax),
  username: newUsernameSchema,
  about: z.string().trim().min(10, "Tell readers what the group covers").max(GROUP_LIMITS.aboutMax),
  image: z.string().trim().min(1, "Add the group's logo").max(LIMITS.linkMax),
  link: httpUrl.nullable().optional(),
});
export type GroupApplicationInput = z.input<typeof groupApplicationSchema>;

export const groupInviteSchema = z.object({
  username: usernameSchema,
  role: z.enum(["editor", "writer"]),
});
export type GroupInviteInput = z.input<typeof groupInviteSchema>;

export const groupMemberRoleSchema = z.object({ role: z.enum(["editor", "writer"]) });

export const groupDecisionSchema = z.object({ note: z.string().trim().max(500).optional() });

/* ─────────────────────────── Leaving WebNEWS (owner 2026-10-23) ─────────────────────────── */

/**
 * Deactivate = the account is hidden (profile, stories, comments — like a suspension) until its owner logs in again,
 * which brings it back. Stored as a suspension with this reason, so every "hide suspended accounts" rule applies.
 */
export const SELF_DEACTIVATED_REASON = "Deactivated by its owner";

/** `POST /api/me/deactivate` and `POST /api/me/delete`: type your @username to confirm. */
export const leaveAccountSchema = z.object({ confirm: z.string().trim().min(1).max(64) });

/* ─────────────── Publisher websites (owner 2026-10-29) ─────────────── */
/*
 * A Press Pass holder with a verified domain runs a news site on it in the webnews.in layout: their logo, title and
 * tagline, only their stories (or their group's), the webnews.in ad positions managed from `<domain>/admin` with a
 * separate email + password. A story opens on WebNEWS itself (`/pub/<domain>/article/<slug>`) in the same layout, so
 * its views count on WebNEWS.
 */

export const SITE_LIMITS = {
  titleMax: 60,
  taglineMax: 120,
  cityMax: 60,
  addressMax: 300,
  phoneMax: 20,
  passwordMin: 8,
  passwordMax: 128,
  adTitleMax: 120,
  adsPerSite: 60,
  footerTextMax: 280,
} as const;

/** The webnews.in ad positions (its lib/adPositions.ts): key, label, display ratio, recommended size, video allowed. */
export const SITE_AD_POSITIONS = [
  { key: "logo-left", label: "Logo Left — header, beside logo", ratio: "4 / 1", recW: 320, recH: 80, video: false },
  { key: "logo-right", label: "Logo Right — header, beside logo", ratio: "4 / 1", recW: 320, recH: 80, video: false },
  { key: "hero-left", label: "Hero Left — homepage left column", ratio: "1 / 1", recW: 300, recH: 300, video: false },
  { key: "hero-right", label: "Hero Right — homepage right column", ratio: "1 / 1", recW: 300, recH: 300, video: false },
  { key: "mid-page", label: "Mid-Page Banner — full width", ratio: "16 / 9", recW: 1280, recH: 720, video: true },
  { key: "trending-sidebar", label: "Trending Sidebar — beside the trending list", ratio: "3 / 5", recW: 300, recH: 500, video: true },
  { key: "newsletter-left", label: "Wide Banner — below trending", ratio: "16 / 9", recW: 640, recH: 360, video: true },
  { key: "in-article", label: "In-Article Poster — inside every story", ratio: "3 / 4", recW: 600, recH: 800, video: true },
  { key: "article-strip", label: "Article Logo Strip — under every story image", ratio: "4 / 1", recW: 320, recH: 80, video: false },
] as const;
export type SiteAdPosition = (typeof SITE_AD_POSITIONS)[number]["key"];
export const SITE_AD_POSITION_KEYS = SITE_AD_POSITIONS.map((p) => p.key) as [SiteAdPosition, ...SiteAdPosition[]];
/** Each ad holds its position this long before the next one in the rotation (webnews.in AD_CARD_MS). */
export const SITE_AD_ROTATE_MS = 5000;

/** Where a site's domain stands on Vercel: not added yet / DNS not pointed yet / live. */
export type SiteConnection = "not_connected" | "pending_dns" | "live";

/** The records the publisher adds so the domain reaches WebNEWS (A for a root domain, CNAME for a subdomain). */
export type SiteDnsRecord = { type: "A" | "CNAME" | "TXT"; host: string; value: string };

/** One ad as the site's admin manages it. */
export type SiteAd = {
  id: string;
  position: SiteAdPosition;
  title: string;
  creativeUrl: string | null;
  /** The creative is a video (mp4). */
  video: boolean;
  targetUrl: string | null;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
};

/** Live ads for the public site, grouped by position (each rotates). */
export type SiteAdsByPosition = Partial<Record<SiteAdPosition, Pick<SiteAd, "id" | "title" | "creativeUrl" | "video" | "targetUrl">[]>>;

/** What the public site shows about itself. */
export type PublicSite = {
  domain: string;
  title: string;
  tagline: string | null;
  logoUrl: string | null;
  city: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  /** Where its stories open: `<WebNEWS>/pub/<domain>/article/<slug>`. */
  articleBase: string;
  /** The owner's default interface language (the visitor's toggle overrides it). */
  language: SiteLanguage;
  /** The footer's line under the brand; null = the default ("News from <city> — reported and published every day."). */
  footerText: string | null;
};

/** `GET /api/sites/d/:domain` — the home page: the site, its stories (newest first), trending, breaking and live ads. */
/**
 * A publisher site's interface language (owner 2026-10-30): menus, labels and dates switch between English and
 * Kannada; stories always stay in the language they were written in. The owner picks the default (English).
 */
export const SITE_LANGUAGES = ["en", "kn"] as const;
export type SiteLanguage = (typeof SITE_LANGUAGES)[number];
export const DEFAULT_SITE_LANGUAGE: SiteLanguage = "en";
/** The visitor's choice (the site's toggle), read by the site's pages. */
export const SITE_LANGUAGE_COOKIE = "wn_site_lang";
/** Home's per-category blocks (webnews.in's category sections): stories in each. */
export const SITE_SECTION_SIZE = 4;

/** One category block on a publisher's home. */
export type SiteSection = { category: Category; stories: ArticleCard[] };

export type SiteHome = {
  site: PublicSite;
  latest: ArticleCard[];
  trending: ArticleCard[];
  breaking: ArticleCard[];
  ads: SiteAdsByPosition;
  /**
   * The site's menu (owner 2026-10-30): the owner's picks in their order (site setup), or every category the site has
   * stories in, most stories first; categories with no stories are left out either way.
   */
  categories: Category[];
  /** Home only: a block of the latest stories per menu category (empty on a category page). */
  sections: SiteSection[];
  /** `GET …/category/:category`: the section shown (latest + trending in it only); null on Home. */
  category: Category | null;
};

/** `GET /api/sites/d/:domain/articles/:slug` — a story on the site's layout (premium stories open in full). */
export type SiteArticle = {
  site: PublicSite;
  article: ArticleDetail;
  more: ArticleCard[];
  breaking: ArticleCard[];
  ads: SiteAdsByPosition;
  categories: Category[];
};

/** A story source the owner may pick: their own account or a group they own. */
export type SiteSource = { id: string; name: string; username: string; image: string | null; kind: "person" | "group" };

/** `GET /api/sites/mine` — the owner's site (null until saved once) and what setup needs. */
export type MySiteResponse = {
  /** The verified domain on their Press Pass (null = verify one first). */
  domain: string | null;
  site: {
    title: string;
    tagline: string | null;
    logoUrl: string | null;
    city: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    address: string | null;
    footerText: string | null;
    sourceId: string;
    adminEmail: string;
    connection: SiteConnection;
    /** The menu's categories in order; null = every category with stories (the default). */
    navCategories: Category[] | null;
    language: SiteLanguage;
  } | null;
  /** The categories the chosen source has stories in, most first (the setup's menu picker marks them). */
  postedCategories: Category[];
  sources: SiteSource[];
  /** Records to add at their DNS provider so the domain opens the site. */
  dns: SiteDnsRecord[];
  /** Stories of the chosen source (default: the person's own) for the live preview. */
  preview: { latest: ArticleCard[]; trending: ArticleCard[] };
};

/**
 * Site admin passwords (owner 2026-10-30): 8+ characters with a capital, a small letter, a number and a symbol. The
 * setup page ticks each rule off as they type.
 */
export const SITE_PASSWORD_RULES = [
  { id: "length", label: `${SITE_LIMITS.passwordMin}+ characters`, test: (v: string) => v.length >= SITE_LIMITS.passwordMin },
  { id: "upper", label: "A capital letter (A–Z)", test: (v: string) => /[A-Z]/.test(v) },
  { id: "lower", label: "A small letter (a–z)", test: (v: string) => /[a-z]/.test(v) },
  { id: "digit", label: "A number (0–9)", test: (v: string) => /\d/.test(v) },
  { id: "symbol", label: "A symbol (! @ # $ …)", test: (v: string) => /[^A-Za-z0-9\s]/.test(v) },
] as const;
export const sitePasswordOk = (value: string) => SITE_PASSWORD_RULES.every((rule) => rule.test(value));
const SITE_PASSWORD_MESSAGE = "Use 8+ characters with a capital letter, a small letter, a number and a symbol";
const sitePassword = z.string().max(SITE_LIMITS.passwordMax).refine(sitePasswordOk, SITE_PASSWORD_MESSAGE);

/**
 * A site's contact phone (owner 2026-10-30): `+<country code> <number>` — India (+91) exactly 10 digits starting 6–9,
 * elsewhere 6–14 digits. Null = none.
 */
export function sitePhoneProblem(value: string): string | null {
  const match = /^(\+\d{1,4}) (\d+)$/.exec(value);
  if (!match) return "Enter the mobile number";
  const [, code, digits] = match as unknown as [string, string, string];
  if (code === "+91") return /^[6-9]\d{9}$/.test(digits) ? null : "Enter a 10-digit mobile number";
  return digits.length >= 6 && digits.length <= 14 ? null : "Enter a valid mobile number";
}

/** An uploaded file's address: absolute (R2 / CDN) or this API's own `/media/…` path (local storage). */
const uploadUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => v.startsWith("/media/") || /^https?:\/\/\S+$/.test(v), "That upload didn't work — upload it again");

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

/** `PUT /api/sites/mine` — create / update the site. `adminPassword` is required the first time only. */
export const siteSetupSchema = z.object({
  // Logo, title and tagline are all required (owner 2026-10-30).
  title: z.string().trim().min(2, "Add your site's title").max(SITE_LIMITS.titleMax),
  tagline: z.string().trim().min(2, "Add your tagline").max(SITE_LIMITS.taglineMax),
  logoUrl: z.string({ error: "Add your logo" }).min(1, "Add your logo").pipe(uploadUrl),
  logoKey: z.string().trim().max(300).nullable().optional(),
  city: optionalTrimmed(SITE_LIMITS.cityMax),
  contactEmail: z.union([z.literal(""), z.email()]).transform((v) => (v === "" ? null : v.toLowerCase())).nullable().optional(),
  contactPhone: optionalTrimmed(SITE_LIMITS.phoneMax).refine((v) => !v || !sitePhoneProblem(v), { message: "Enter a valid mobile number" }),
  address: optionalTrimmed(SITE_LIMITS.addressMax),
  footerText: optionalTrimmed(SITE_LIMITS.footerTextMax),
  sourceId: z.string().trim().min(1),
  adminEmail: z.email("Enter the admin email").transform((v) => v.toLowerCase()),
  adminPassword: sitePassword.optional(),
  // The menu (owner 2026-10-30): the categories to show, in order; null / omitted = every category with stories.
  navCategories: z.array(z.enum(CATEGORY_VALUES)).max(CATEGORY_VALUES.length).nullable().optional()
    .transform((v) => (v ? [...new Set(v)] : null)),
  language: z.enum(SITE_LANGUAGES).default(DEFAULT_SITE_LANGUAGE),
});
export type SiteSetupInput = z.input<typeof siteSetupSchema>;

/** `POST /api/sites/d/:domain/admin/login`. */
export const siteAdminLoginSchema = z.object({
  email: z.email().transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(SITE_LIMITS.passwordMax),
});
export type SiteAdminLoginInput = z.input<typeof siteAdminLoginSchema>;
export type SiteAdminLoginResponse = { token: string; expiresAt: string };

/** `PATCH /api/sites/d/:domain/admin/settings` — what the site's admin may change (not the domain or the source). */
export const siteSettingsSchema = siteSetupSchema.pick({
  title: true,
  tagline: true,
  logoUrl: true,
  logoKey: true,
  city: true,
  contactEmail: true,
  contactPhone: true,
  address: true,
  footerText: true,
  navCategories: true,
  language: true,
});
export type SiteSettingsInput = z.input<typeof siteSettingsSchema>;

/** `PUT /api/sites/d/:domain/admin/password`. */
export const sitePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(SITE_LIMITS.passwordMax),
  newPassword: sitePassword,
});
export type SitePasswordInput = z.input<typeof sitePasswordSchema>;

/** `POST /api/sites/d/:domain/admin/ads` — an image / video creative, or text only (title). */
export const siteAdSchema = z
  .object({
    position: z.enum(SITE_AD_POSITION_KEYS),
    title: z.string().trim().min(1, "Give the ad a name").max(SITE_LIMITS.adTitleMax),
    creativeUrl: uploadUrl.nullable().optional(),
    creativeKey: z.string().trim().max(300).nullable().optional(),
    video: z.boolean().optional(),
    targetUrl: z.union([z.literal(""), z.url()]).transform((v) => (v === "" ? null : v)).nullable().optional(),
    startsAt: z.iso.datetime({ offset: true }).optional(),
    endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .refine((v) => !v.endsAt || !v.startsAt || new Date(v.endsAt) > new Date(v.startsAt), { path: ["endsAt"], message: "End after the start" });
export type SiteAdInput = z.input<typeof siteAdSchema>;

/** `GET /api/sites/d/:domain/admin` — the admin panel's data. */
export type SiteAdminData = {
  site: PublicSite;
  adminEmail: string;
  /** The menu's categories in order; null = automatic (every category with stories). */
  navCategories: Category[] | null;
  /** The categories the site has stories in, most first (the menu picker marks them). */
  postedCategories: Category[];
  stats: { stories: number; views: number; activeAds: number };
  ads: SiteAd[];
};

/** A story in the admin's list (hide it from the site, or mark it Breaking). */
export type SiteAdminStory = { id: string; slug: string; title: string; coverUrl: string; publishedAt: string; viewCount: number; hidden: boolean; breaking: boolean };

/** `PATCH /api/sites/d/:domain/admin/stories/:id`. */
export const siteStoryFlagsSchema = z.object({ hidden: z.boolean().optional(), breaking: z.boolean().optional() });
export type SiteStoryFlagsInput = z.input<typeof siteStoryFlagsSchema>;
