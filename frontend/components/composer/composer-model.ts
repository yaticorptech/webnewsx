import type { PosterStory } from "@/components/poster/story-poster";
import {
  BLURB,
  DISTRICT_CATEGORY,
  LIMITS,
  subcategoryError,
  isPressLanguage,
  type PressLanguage,
  districtError,
  isCategory,
  isPosterTemplate,
  type ArticleCard,
  type ArticleDetail,
  type ArticleMedia,
  type Category,
  type DraftDetail,
  type PosterFrame,
  type PosterTemplate,
  type ReporterLevel,
  type ViewerUser,
  type VideoRef,
} from "@/lib/shared/contracts";

/*
 * Pure composer logic: field shapes, client-side validation (mirrors the backend's rules and
 * messages in backend/src/queries/article-write.ts) and the preview DTO builders.
 */

export type ComposerCover = {
  url: string;
  key: string;
  width: number | null;
  height: number | null;
  blurDataUrl: string | null;
};

/** What a media slot is uploading: the cover's image or video, or the article's. */
export type ComposerMedia = "cover" | "video" | "articleImage" | "articleVideo";

export type ComposerFields = {
  title: string;
  /** Tiptap HTML; "" when the editor is empty. */
  bodyHtml: string;
  /** The cover image — for a video story, the video's poster frame (both come from one upload). */
  cover: ComposerCover | null;
  /** A video story's clip (≤ 30 s); null for an image story. */
  video: VideoRef | null;
  /**
   * The full article's 16:9 image (owner 2026-09-28), shown at the top of the article instead of the cover — for an
   * article video, its poster frame. Required to publish.
   */
  articleImage: ComposerCover | null;
  /** The full article's clip (≤ 30 s); null for an article image. */
  articleVideo: VideoRef | null;
  /** Required to publish ("" = not chosen yet). */
  category: Category | "";
  /** Karnataka stories only ("" = not chosen yet). */
  district: string;
  /** The story's language for the Languages menu ("" = automatic: read from the headline's script). */
  language: PressLanguage | "";
  /** The reel poster design, required to publish ("" = not chosen yet: the reporter picks one, nothing is preselected). */
  template: PosterTemplate | "";
  /** Where the photo sits in the poster, set in the live preview (null = centred; a new cover resets it). */
  posterFrame: PosterFrame | null;
};

export type FieldKey = "cover" | "articleMedia" | "title" | "category" | "district" | "subcategory" | "template" | "bodyHtml" | "linkUrl" | "blurb";
export type FieldErrors = Partial<Record<FieldKey, string>>;

/** Order used to pick the first invalid field to scroll to — top to bottom as on the page (owner 2026-10-08: category first). */
/** Step 1 (images) first, then step 2 top to bottom (owner 2026-10-14: the 3-step composer). */
export const FIELD_ORDER: FieldKey[] = ["cover", "articleMedia", "category", "district", "subcategory", "title", "blurb", "bodyHtml", "linkUrl", "template"];
/** The composer step a field is on. */
export const stepOfField = (key: FieldKey): "poster" | "article" => (key === "cover" || key === "articleMedia" ? "poster" : "article");

/** Author shown in the preview byline (the viewer). */
export type ComposerAuthor = { id: string; username: string; name: string; image: string | null; bio: string | null };

export const EMPTY_FIELDS: ComposerFields = {
  title: "",
  bodyHtml: "",
  cover: null,
  video: null,
  articleImage: null,
  articleVideo: null,
  category: "",
  district: "",
  language: "",
  template: "",
  posterFrame: null,
};

export function fieldsFromDraft(draft: DraftDetail | null): ComposerFields {
  if (!draft) return EMPTY_FIELDS;
  return {
    title: draft.title ?? "",
    bodyHtml: draft.bodyHtml ?? "",
    cover: draft.cover ? { ...draft.cover } : null,
    video: draft.cover && draft.video ? { ...draft.video } : null,
    articleImage: draft.articleImage ? { ...draft.articleImage } : null,
    articleVideo: draft.articleImage && draft.articleVideo ? { ...draft.articleVideo } : null,
    category: draft.category ?? "",
    district: draft.district ?? "",
    language: draft.language ?? "",
    // null = not chosen yet (drafts may be saved without one).
    template: draft.template ?? "",
    posterFrame: draft.cover ? (draft.posterFrame ?? null) : null,
  };
}

/** A stored value → a language, or "" (unknown / automatic). */
export function languageOrEmpty(value: unknown): PressLanguage | "" {
  return isPressLanguage(value) ? value : "";
}

/** A stored value → a category, or "" (unknown / not chosen). */
export function categoryOrEmpty(value: unknown): Category | "" {
  return isCategory(value) ? value : "";
}

/** A stored value → a poster template, or "" (unknown / not chosen). */
export function templateOrEmpty(value: unknown): PosterTemplate | "" {
  return isPosterTemplate(value) ? value : "";
}

/**
 * The badge next to the viewer's name on their own stories, as the API computes it (backend `badgeLevelSql`): Editor
 * Desk accounts carry the Verified badge, everyone else their Press Pass level.
 */
export function badgeLevelOf(viewer: Pick<ViewerUser, "role" | "reporterLevel"> | null): ReporterLevel | null {
  if (!viewer) return null;
  return viewer.role === "admin" ? "verified" : viewer.reporterLevel;
}

/** The district the story is filed under (null unless it's a Karnataka story with one). */
export function districtOf(fields: Pick<ComposerFields, "category" | "district">): string | null {
  return fields.category === DISTRICT_CATEGORY && fields.district ? fields.district : null;
}

/* ─────────────────────────── Text helpers ─────────────────────────── */

/** Collapses whitespace like the backend's htmlToText (block boundaries → spaces). */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Minutes to finish at ~220 wpm, minimum 1 (backend readingMinutes). */
export function readingMinutesOf(text: string): number {
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  return Math.max(1, Math.ceil(words / 220));
}

/** ≤ 280 chars, cut on a word boundary (backend makeExcerpt). */
export function excerptOf(text: string, max: number = LIMITS.excerptMax): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const base = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${base.replace(/[\s.,;:!?\-–—]+$/u, "")}…`;
}

/** The design a story is published with: the pick, or "No template" when none was picked (owner 2026-10-07). */
export function posterTemplateOf(template: PosterTemplate | ""): PosterTemplate {
  return template || "plain";
}

/* ─────────────────────────── Validation ─────────────────────────── */

export const MESSAGES = {
  cover: "Add a cover image or a video",
  articleMedia: "Add an article image or video",
  title: "Add a headline",
  category: "Choose a category",
  template: "Choose a template",
  bodyMin: `Write at least ${LIMITS.bodyTextMin} characters`,
  bodyMax: `Keep the story under ${LIMITS.bodyTextMax.toLocaleString("en-US")} characters`,
  draftEmpty: "Add a headline, an image or some text before saving a draft",
  linkUrl: "Paste the full link, starting with https://",
  blurb: `Write a blurb of at least ${BLURB.min} characters`,
} as const;

/** A full http(s) link ("Read more link" stories, owner 2026-10-14). */
export function isHttpLink(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/** What validateForPublish checks beside the fields (owner 2026-10-14). */
export type PublishExtras = {
  /** The "Read more link": then the story needs no description, only a valid link. null = description mode. */
  link?: string | null;
  subcategory?: string;
  blurb?: string;
};

export function validateForPublish(fields: ComposerFields, textLength: number, extras: PublishExtras = {}): FieldErrors {
  const link = extras.link ?? null;
  const errors: FieldErrors = {};
  if (!fields.cover) errors.cover = MESSAGES.cover;
  if (!fields.articleImage) errors.articleMedia = MESSAGES.articleMedia;
  if (!fields.title.trim()) errors.title = MESSAGES.title;
  if (!fields.category) errors.category = MESSAGES.category;
  const district = districtError(fields.category || null, fields.district || null);
  if (district) errors.district = district;
  // No template needed (owner 2026-10-07): a story published without a pick gets "plain" (posterTemplateOf).
  if (extras.subcategory !== undefined) {
    const sub = subcategoryError(fields.category || null, extras.subcategory || null);
    if (sub) errors.subcategory = sub;
  }
  if (extras.blurb !== undefined && extras.blurb.replace(/\s+/g, " ").trim().length < BLURB.min) errors.blurb = MESSAGES.blurb;
  if (link !== null) {
    if (!isHttpLink(link)) errors.linkUrl = MESSAGES.linkUrl;
  } else if (textLength < LIMITS.bodyTextMin) errors.bodyHtml = MESSAGES.bodyMin;
  else if (textLength > LIMITS.bodyTextMax) errors.bodyHtml = MESSAGES.bodyMax;
  return errors;
}

export function validateForDraft(fields: ComposerFields, textLength: number): FieldErrors {
  const errors: FieldErrors = {};
  if (textLength > LIMITS.bodyTextMax) errors.bodyHtml = MESSAGES.bodyMax;
  return errors;
}

export function hasDraftContent(fields: ComposerFields, textLength: number): boolean {
  return Boolean(fields.title.trim() || fields.cover || fields.articleImage || textLength > 0);
}

/** Maps backend `fields` (keys match the request) to our field keys. */
export function errorsFromApi(fields: Record<string, string> | undefined): FieldErrors {
  if (!fields) return {};
  const errors: FieldErrors = {};
  for (const key of FIELD_ORDER) if (fields[key]) errors[key] = fields[key];
  // The video lives in the cover slot of the composer; the article's image and video share the article media slot.
  if (fields.video && !errors.cover) errors.cover = fields.video;
  const articleMedia = fields.articleImage ?? fields.articleVideo;
  if (articleMedia && !errors.articleMedia) errors.articleMedia = articleMedia;
  return errors;
}

export function firstInvalid(errors: FieldErrors): FieldKey | null {
  return FIELD_ORDER.find((key) => errors[key]) ?? null;
}

/* ─────────────────────────── Preview DTOs ─────────────────────────── */

/** Stand-in headline while the story has none yet (preview card, posters). */
export const PLACEHOLDER_TITLE = "Your headline goes here";

/** Neutral 16:9 stand-in while there is no cover (light panel with the speed-line bars). */
export const PLACEHOLDER_COVER =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#F6F7F9"/>` +
      `<g fill="#E5E6EA" transform="translate(704 342) scale(3.7)"><polygon points="20,9 60,9 48,20 8,20"/>` +
      `<polygon points="20,26 60,26 48,37 8,37"/><polygon points="20,43 60,43 48,54 8,54"/></g></svg>`,
  );

/** The full article's stand-in while it has no image or video yet: the neutral 16:9 panel. */
export const PLACEHOLDER_ARTICLE_MEDIA: ArticleMedia = { url: PLACEHOLDER_COVER, width: 1600, height: 900, blur: null, video: null };

export type PreviewInput = {
  fields: ComposerFields;
  /** Normalized plain text of the body. */
  text: string;
  author: ComposerAuthor;
  draftId: string | null;
  publishedAt: string;
  /** The author's badge (`badgeLevelOf(viewer)`), so the preview shows the same mark readers will see. */
  reporterLevel?: ReporterLevel | null;
  /** The author's own frame ("Your frame" template), or null. */
  overlayUrl?: string | null;
};

export function buildPreviewCard({ fields, text, author, draftId, publishedAt, reporterLevel = null, overlayUrl = null }: PreviewInput): ArticleCard {
  return {
    id: draftId ?? "00000000-0000-4000-8000-000000000000",
    slug: "preview",
    title: fields.title.trim() || PLACEHOLDER_TITLE,
    excerpt: text ? excerptOf(text) : "The opening lines of your story will appear here.",
    coverUrl: fields.cover?.url ?? PLACEHOLDER_COVER,
    coverWidth: fields.cover?.width ?? 1600,
    coverHeight: fields.cover?.height ?? 900,
    coverBlur: fields.cover?.blurDataUrl ?? null,
    linkUrl: null,
    linkDomain: null,
    readingMinutes: readingMinutesOf(text),
    viewCount: 0,
    likeCount: 0,
    shareCount: 0,
    commentCount: 0,
    publishedAt,
    author: { id: author.id, username: author.username, name: author.name, image: author.image },
    viewer: { liked: false, followingAuthor: false, isAuthor: true },
    badges: { spotlight: false, editorsPick: false, reporterLevel },
    category: fields.category || null,
    district: districtOf(fields),
    video: fields.cover && fields.video
      ? { url: fields.video.url, width: fields.video.width, height: fields.video.height, durationMs: fields.video.durationMs }
      : null,
    // Not chosen: "No template" (owner 2026-10-07), what publishing it would give.
    template: posterTemplateOf(fields.template),
    posterFrame: fields.cover ? fields.posterFrame : null,
    posterOverlayUrl: overlayUrl,
  };
}

/**
 * The story as its reel poster shows it, from the fields as they stand: the cover (for a video story its poster
 * frame; the neutral placeholder until there is one), the headline (or the stand-in) and the author's byline.
 */
export function previewPosterStory(
  fields: Pick<ComposerFields, "title" | "cover" | "posterFrame">,
  author: Pick<ComposerAuthor, "name" | "username" | "image">,
  reporterLevel: ReporterLevel | null,
  /** The author's own frame ("Your frame"), or null. */
  overlayUrl: string | null = null,
): PosterStory {
  return {
    title: fields.title.trim() || PLACEHOLDER_TITLE,
    overlayUrl,
    imageUrl: fields.cover?.url ?? PLACEHOLDER_COVER,
    imageBlur: fields.cover?.blurDataUrl ?? null,
    imageFrame: fields.cover ? fields.posterFrame : null,
    author: { name: author.name, username: author.username, image: author.image, reporterLevel },
  };
}

export function buildPreviewDetail(input: PreviewInput): ArticleDetail {
  const card = buildPreviewCard(input);
  return {
    ...card,
    bodyHtml: input.fields.bodyHtml || "<p>Write your story in step 02 and it will appear here.</p>",
    author: { ...card.author, bio: input.author.bio },
    articleMedia: articleMediaOf(input.fields) ?? PLACEHOLDER_ARTICLE_MEDIA,
  };
}

/** The full article's media as readers get it (ArticleDetail.articleMedia), or null while none is set. */
export function articleMediaOf(fields: Pick<ComposerFields, "articleImage" | "articleVideo">): ArticleMedia | null {
  const image = fields.articleImage;
  if (!image) return null;
  const video = fields.articleVideo;
  return {
    url: image.url,
    width: image.width,
    height: image.height,
    blur: image.blurDataUrl,
    video: video ? { url: video.url, width: video.width, height: video.height, durationMs: video.durationMs } : null,
  };
}
