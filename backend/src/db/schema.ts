import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import {
  SITE_AD_POSITION_KEYS,
  ACCOUNT_TYPE_VALUES,
  GROUP_APPLICATION_STATUS_VALUES,
  GROUP_MEMBER_STATUS_VALUES,
  GROUP_ROLE_VALUES,
  PLATFORM_FEE_PROVIDER_VALUES,
  CATEGORY_VALUES,
  CHAT_EVENT_VALUES,
  CHAT_KIND_VALUES,
  CHAT_LIMITS,
  CHAT_ROLE_VALUES,
  COMMUNITY_VISIBILITY_VALUES,
  EXPERIENCE_VALUES,
  INVITE_STATUS_VALUES,
  MESSAGE_KIND_VALUES,
  SOCIAL_PROVIDER_VALUES,
  FLAG_REASON_VALUES,
  LIMITS,
  NOTICE_KINDS,
  NOTIFICATION_TYPES,
  POSTER_TEMPLATE_VALUES,
  PRESS_ID_TYPE_VALUES,
  PRESS_LANGUAGE_VALUES,
  PRESS_MEET_INVITE_STATUS_VALUES,
  PRESS_MEET_PAYMENT_VALUES,
  PRESS_MEET_PLATFORM_VALUES,
  PRESS_MEET_VISIBILITY_VALUES,
  PRESS_MEET_RECORDING_STATUS_VALUES,
  PRESS_MEET_REVIEW_VALUES,
  PRESS_MEET_STATUS_VALUES,
  REPORTER_LEVEL_VALUES,
  REPORTER_TYPE_VALUES,
  ROLE_VALUES,
  USERNAME_REGEX,
  type AuditAction,
  type AuditEntry,
  type FlagResolution,
  type PaymentProviderId,
  type PressLanguage,
  type SpotlightStatus,
} from "../shared/contracts.js";

/**
 * Timestamps that take part in keyset pagination use millisecond precision so a cursor
 * built from a JS Date round-trips exactly (no duplicate / skipped rows).
 */
const tsMs = (name: string) => timestamp(name, { withTimezone: true, precision: 3, mode: "date" });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/* ─────────────── Better Auth core tables (+ WebNEWS profile columns on "user") ─────────────── */

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    /** Display name. Empty string until onboarding (the sign-up form only collects email + password). */
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: tsMs("created_at").notNull().defaultNow(),
    updatedAt: tsMs("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    username: text("username").unique(),
    bio: text("bio"),
    onboardedAt: ts("onboarded_at"),
    termsAcceptedAt: ts("terms_accepted_at"),
    termsVersion: text("terms_version"),
    /** SPEC §3.11. Only our own endpoints (and the ADMIN_EMAILS hook) change it. */
    role: text("role", { enum: ROLE_VALUES }).notNull().default("reader"),
    /** Mirrors the active press_pass.level (null without an active pass) — read on every card. */
    reporterLevel: text("reporter_level", { enum: REPORTER_LEVEL_VALUES }),
    suspendedAt: ts("suspended_at"),
    suspendReason: text("suspend_reason"),
    /** Messages' online dot (owner 2026-10-01): kept fresh while the person has the site open (lib/presence.ts). */
    lastActiveAt: ts("last_active_at"),
    /**
     * Settings → Press meet price (owner 2026-10-01): what a reporter charges to attend a press meet, in whole ₹.
     * Not on the profile: only its owner (Settings) and organizers choosing reporters for a press meet see it.
     */
    pressMeetPrice: integer("press_meet_price"),
    /** Settings → Premium membership (owner 2026-10-14): monthly price in whole ₹; null = not offered. */
    membershipPrice: integer("membership_price"),
    /** The reporter's own Gemini API key (owner 2026-10-14, "Generate with AI"), AES-GCM encrypted (lib/social-crypto). */
    geminiKeyEnc: text("gemini_key_enc"),
    /** Languages they read (owner 2026-10-05: asked at sign-up, editable in Settings): their feeds show these first. */
    preferredLanguages: text("preferred_languages").array().$type<PressLanguage[]>().notNull().default(sql`'{}'::text[]`),
    /** Their own poster frame (owner 2026-10-08, the "own-frame" template): a 9:16 webp with a see-through middle. */
    posterOverlayUrl: text("poster_overlay_url"),
    posterOverlayKey: text("poster_overlay_key"),
    /** Settings → Notifications (owner 2026-10-02): push new stories / likes / comments to their phones. */
    pushNotifications: boolean("push_notifications").notNull().default(true),
    /** Phone sign-in (owner 2026-10-22; Better Auth's phone-number plugin): the E.164 number, verified by a WhatsApp code. */
    phoneNumber: text("phone_number").unique(),
    phoneNumberVerified: boolean("phone_number_verified").notNull().default(false),
    /** "group" = a group account (owner 2026-10-23): nobody signs in to it; its members post as it (group_member). */
    accountType: text("account_type", { enum: ACCOUNT_TYPE_VALUES }).notNull().default("person"),
  },
  (t) => [
    check("user_username_format", sql`${t.username} ~ ${sql.raw(`'${USERNAME_REGEX.source}'`)}`),
    check("user_bio_length", sql`char_length(${t.bio}) <= ${sql.raw(String(LIMITS.bioMax))}`),
    check("user_role_valid", sql`${t.role} in ('reader', 'reporter', 'admin')`),
    check("user_reporter_level_valid", sql`${t.reporterLevel} is null or ${t.reporterLevel} in ('trainee', 'verified')`),
    index("user_role_idx").on(t.role),
  ],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at")
      .notNull()
      .$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at")
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/* ─────────────── WebNEWS tables ─────────────── */

export const article = pgTable(
  "article",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** draft → (Trainee) in_review → published. Hidden stories stay "published" with hiddenAt set. */
    status: text("status", { enum: ["draft", "in_review", "published"] })
      .notNull()
      .default("draft"),
    title: text("title"),
    /** Sanitized HTML (see lib/sanitize.ts). */
    bodyHtml: text("body_html"),
    /** Plain text derived from bodyHtml (length checks, reading time). */
    bodyText: text("body_text"),
    excerpt: text("excerpt"),
    coverUrl: text("cover_url"),
    coverKey: text("cover_key"),
    coverWidth: integer("cover_width"),
    coverHeight: integer("cover_height"),
    /** Tiny base64 webp data URL used as a blurred placeholder. */
    coverBlur: text("cover_blur"),
    /** Video stories (≤ 30 s H.264 MP4, `videos/<authorId>/…`); the cover fields then hold its poster frame. */
    videoUrl: text("video_url"),
    videoKey: text("video_key"),
    videoWidth: integer("video_width"),
    videoHeight: integer("video_height"),
    videoDurationMs: integer("video_duration_ms"),
    /**
     * The article's own media (owner 2026-09-28): a 16:9 image — or a video's poster frame — shown at the top of the
     * full article instead of the 9:16 cover. Required to publish; older stories have none and show their cover.
     */
    articleImageUrl: text("article_image_url"),
    articleImageKey: text("article_image_key"),
    articleImageWidth: integer("article_image_width"),
    articleImageHeight: integer("article_image_height"),
    articleImageBlur: text("article_image_blur"),
    /** The article's video (the article image fields then hold its poster frame). */
    articleVideoUrl: text("article_video_url"),
    articleVideoKey: text("article_video_key"),
    articleVideoWidth: integer("article_video_width"),
    articleVideoHeight: integer("article_video_height"),
    articleVideoDurationMs: integer("article_video_duration_ms"),
    linkUrl: text("link_url"),
    linkDomain: text("link_domain"),
    /** One per story (required to publish); Karnataka stories also carry their district. */
    category: text("category", { enum: CATEGORY_VALUES }),
    district: text("district"),
    /** The story's language (PRESS_LANGUAGE_VALUES; owner 2026-10-05, the Languages menu). Set on save; migration 0041 read older ones from their headline's script. */
    language: text("language", { enum: PRESS_LANGUAGE_VALUES }),
    /** Reel poster design (POSTER_TEMPLATE_VALUES). Drafts may have none yet; going live stores DEFAULT_POSTER_TEMPLATE when unset. */
    template: text("template", { enum: POSTER_TEMPLATE_VALUES }),
    /** The photo's place in the poster (PosterFrame: x/y 0–100 %, zoom 1–3), set in the live preview. All null = centred. */
    posterX: real("poster_x"),
    posterY: real("poster_y"),
    posterZoom: real("poster_zoom"),
    /** "own-frame" stories: the author's frame as it was when the story was saved (it keeps it if they change frames). */
    posterOverlayUrl: text("poster_overlay_url"),
    posterOverlayKey: text("poster_overlay_key"),
    slug: text("slug").unique(),
    /** Short share link (`/s/<code>`, 7 chars a–z 0–9): given when the story first goes live, kept for good (re-publishing never changes it). */
    shortCode: text("short_code").unique(),
    readingMinutes: integer("reading_minutes"),
    viewCount: integer("view_count").notNull().default(0),
    likeCount: integer("like_count").notNull().default(0),
    /** 👎 inside the story (owner 2026-10-16); likes stay the 👍. */
    dislikeCount: integer("dislike_count").notNull().default(0),
    shareCount: integer("share_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    createdAt: tsMs("created_at").notNull().defaultNow(),
    updatedAt: tsMs("updated_at").notNull().defaultNow(),
    publishedAt: tsMs("published_at"),
    /** Last time the author edited the story while it was live (owner 2026-10-02) — the page shows "Updated". */
    editedAt: tsMs("edited_at"),
    /* Review Desk (Trainee stories). */
    submittedAt: tsMs("submitted_at"),
    reviewNote: text("review_note"),
    reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
    reviewedAt: ts("reviewed_at"),
    /** Set when the Review Desk returned the story (or the Editor Desk unpublished it); status is back to draft. */
    returnedAt: ts("returned_at"),
    /* Editor Desk moderation. */
    hiddenAt: ts("hidden_at"),
    hiddenReason: text("hidden_reason"),
    /**
     * Automatic report rules (REPORT_RULES, owner 2026-09-28): enough readers reported it in its first hour live that
     * its author was warned automatically (once; cleared when the Editor Desk resolves the reports).
     */
    reportWarnedAt: ts("report_warned_at"),
    /**
     * Hidden automatically after more than REPORT_RULES.hideAfter reports (owner 2026-09-28): it can't be republished.
     * Cleared only when the Editor Desk restores the story.
     */
    reportLockedAt: ts("report_locked_at"),
    /** Editor's Pick: pinned stories lead page 1 of For You and Latest (max 3, ordered by pinOrder). */
    pinnedAt: ts("pinned_at"),
    pinOrder: integer("pin_order"),
    /**
     * Written for a press meet (owner 2026-10-07: the press meet page's "Write your story"). Publishing sends it to the
     * organizer instead of going live; it goes live only when they verify it (press_meet_invite.review), and is locked
     * from then on (no edits, no deleting). See queries/press-meets.ts, "Press meet stories".
     */
    pressMeetId: uuid("press_meet_id").references(() => pressMeet.id, { onDelete: "set null" }),
    /** Members-only (owner 2026-10-14): only the author's premium members (membership_payment) read the body. */
    premium: boolean("premium").notNull().default(false),
    /** Sub category (SUBCATEGORIES, owner 2026-10-14); Karnataka stories use `district` instead. */
    subcategory: text("subcategory"),
    /** The 2-line summary under the headline (owner 2026-10-14); also the cards' excerpt when set. */
    blurb: text("blurb"),
    /** A group account's story (owner 2026-10-23): the member who wrote it — shown only inside the group and to the Desk. */
    postedById: text("posted_by_id").references((): AnyPgColumn => user.id, { onDelete: "set null" }),
    /** A group Writer sent this draft to the group's Editors (cleared when it goes live or is saved as a draft again). */
    groupSubmittedAt: tsMs("group_submitted_at"),
  },
  (t) => [
    index("article_feed_idx").on(t.status, t.publishedAt.desc(), t.id.desc()),
    // Category pages, newest first (a Karnataka district's page filters within Karnataka).
    index("article_category_feed_idx").on(t.category, t.publishedAt.desc(), t.id.desc()).where(sql`${t.status} = 'published'`),
    index("article_language_feed_idx").on(t.language, t.publishedAt.desc(), t.id.desc()).where(sql`${t.status} = 'published'`),
    index("article_author_status_published_idx").on(t.authorId, t.status, t.publishedAt.desc()),
    index("article_author_updated_idx").on(t.authorId, t.updatedAt.desc()),
    index("article_review_idx").on(t.status, t.submittedAt),
    index("article_pinned_idx").on(t.pinOrder).where(sql`${t.pinnedAt} is not null`),
    index("article_press_meet_idx").on(t.pressMeetId).where(sql`${t.pressMeetId} is not null`),
    check("article_status_valid", sql`${t.status} in ('draft', 'in_review', 'published')`),
    check("article_category_valid", sql.raw(`category in (${CATEGORY_VALUES.map((c) => `'${c}'`).join(", ")})`)),
    check("article_template_valid", sql.raw(`template in (${POSTER_TEMPLATE_VALUES.map((v) => `'${v}'`).join(", ")})`)),
    check(
      "article_published_complete",
      sql`${t.status} <> 'published' or (${t.title} is not null and ${t.bodyHtml} is not null and ${t.coverUrl} is not null and ${t.slug} is not null and ${t.publishedAt} is not null)`,
    ),
    check(
      "article_in_review_complete",
      sql`${t.status} <> 'in_review' or (${t.title} is not null and ${t.bodyHtml} is not null and ${t.coverUrl} is not null and ${t.submittedAt} is not null)`,
    ),
    check("article_excerpt_length", sql`char_length(${t.excerpt}) <= ${sql.raw(String(LIMITS.excerptMax))}`),
    check("article_counts_non_negative", sql`${t.viewCount} >= 0 and ${t.likeCount} >= 0 and ${t.shareCount} >= 0`),
  ],
);

export const articleLike = pgTable(
  "article_like",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    articleId: uuid("article_id")
      .notNull()
      .references(() => article.id, { onDelete: "cascade" }),
    createdAt: tsMs("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.articleId] }),
    index("article_like_article_idx").on(t.articleId),
    // "Trending now": likes in the last 24h.
    index("article_like_created_idx").on(t.createdAt),
  ],
);

/**
 * Likes from logged-out visitors (owner rule 2026-09-28: anyone can like; commenting needs an account). Keyed by the
 * signed anonymous viewer id (lib/viewer-id.ts, the `wn_vid` cookie): one like per browser per story. They count in
 * `article.like_count`, Trending and Newsroom analytics like account likes.
 */
/**
 * 👎 on a story (owner 2026-10-16), shown only inside the story beside 👍 (the like). One per viewer — `u:<id>` or a
 * visitor's anonymous `a:<id>` — and never together with a like (one replaces the other).
 */
export const articleDislike = pgTable(
  "article_dislike",
  {
    articleId: uuid("article_id")
      .notNull()
      .references(() => article.id, { onDelete: "cascade" }),
    viewerKey: text("viewer_key").notNull(),
    createdAt: tsMs("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.viewerKey] })],
);

export const articleAnonLike = pgTable(
  "article_anon_like",
  {
    viewerId: uuid("viewer_id").notNull(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => article.id, { onDelete: "cascade" }),
    createdAt: tsMs("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.viewerId, t.articleId] }),
    index("article_anon_like_article_idx").on(t.articleId),
    index("article_anon_like_created_idx").on(t.createdAt),
  ],
);

export const articleView = pgTable(
  "article_view",
  {
    articleId: uuid("article_id")
      .notNull()
      .references(() => article.id, { onDelete: "cascade" }),
    /** `u:<userId>` for signed-in viewers, `a:<uuid>` (wn_vid cookie) for anonymous ones. */
    viewerKey: text("viewer_key").notNull(),
    createdAt: tsMs("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.articleId, t.viewerKey] }),
    // "Trending now": views in the last 24h (index-only scan with article_id).
    index("article_view_created_idx").on(t.createdAt, t.articleId),
    // "For You" seen-penalty: this viewer's views.
    index("article_view_viewer_idx").on(t.viewerKey, t.articleId),
  ],
);

export const follow = pgTable(
  "follow",
  {
    followerId: text("follower_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    followingId: text("following_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The follow's bell (owner 2026-10-16, like YouTube): true = notify me of every new story, false = none. */
    notify: boolean("notify").notNull().default(true),
    createdAt: tsMs("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followingId] }),
    // Leading followingId: "who follows X" lookups + follower-list pagination.
    index("follow_following_idx").on(t.followingId, t.createdAt.desc(), t.followerId.desc()),
    // Following-list pagination.
    index("follow_follower_created_idx").on(t.followerId, t.createdAt.desc(), t.followingId.desc()),
    check("follow_not_self", sql`${t.followerId} <> ${t.followingId}`),
  ],
);

/* ─────────────── Roles: Press Pass, saves, flags, analytics events, Spotlight, audit (SPEC §3.11) ─────────────── */

export const pressPass = pgTable(
  "press_pass",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    /** `WN-<REGION>-<6 digits>` ("IN" for migrated passes without a region). */
    passNumber: text("pass_number").notNull().unique(),
    /**
     * Legacy: beats were collected until 2026-09-26 and are no longer read or written. Kept (not dropped)
     * until stories get their own category, which may be seeded from it.
     */
    beats: text("beats").array().notNull().default(sql`'{}'::text[]`),
    /** Verification (SPEC §3.11) — private to the holder and the Editor Desk. `+91XXXXXXXXXX`; one pass per number. */
    mobile: text("mobile").unique(),
    /*
     * Personal details (owner 2026-10-07: kept for legal matters) — private like the mobile number. Null on passes
     * issued before they were asked (incomplete until the holder adds them). One pass per government ID.
     */
    legalName: text("legal_name"),
    dateOfBirth: date("date_of_birth", { mode: "string" }),
    address: text("address"),
    pincode: text("pincode"),
    idType: text("id_type", { enum: PRESS_ID_TYPE_VALUES }),
    /** Normalized: capitals, no spaces / hyphens / slashes (normalizeIdNumber). */
    idNumber: text("id_number"),
    reporterType: text("reporter_type", { enum: REPORTER_TYPE_VALUES }),
    /** News outlet (null for citizen journalists). */
    outlet: text("outlet"),
    experience: text("experience", { enum: EXPERIENCE_VALUES }),
    state: text("state"),
    district: text("district"),
    /** City or town (owner 2026-10-05; migration 0034 gave older passes their district's headquarters). */
    city: text("city"),
    languages: text("languages").array().$type<PressLanguage[]>().notNull().default(sql`'{}'::text[]`),
    about: text("about"),
    links: text("links").array().notNull().default(sql`'{}'::text[]`),
    pledgeSignedAt: ts("pledge_signed_at"),
    pledgeSignature: text("pledge_signature"),
    level: text("level", { enum: REPORTER_LEVEL_VALUES }).notNull().default("trainee"),
    /** Stories approved by the Review Desk (3 → Verified). */
    approvedCount: integer("approved_count").notNull().default(0),
    /** The holder's website (owner 2026-10-28), proven by a DNS TXT record `webnews-verification=<domainToken>`. */
    domain: text("domain"),
    domainToken: text("domain_token"),
    domainVerifiedAt: ts("domain_verified_at"),
    issuedAt: tsMs("issued_at").notNull().defaultNow(),
    revokedAt: ts("revoked_at"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("press_pass_level_valid", sql`${t.level} in ('trainee', 'verified')`),
    check("press_pass_reporter_type_valid", sql`${t.reporterType} in ('citizen', 'freelance', 'staff')`),
    check("press_pass_experience_valid", sql`${t.experience} in ('new', '1_2', '3_5', '6_10', '10_plus')`),
    check("press_pass_number_format", sql`${t.passNumber} ~ '^WN-[A-Z]{2}-[0-9]{6}$'`),
    check("press_pass_id_type_valid", sql`${t.idType} in ('pan', 'voter_id', 'driving_licence', 'passport', 'aadhaar')`),
    check("press_pass_pincode_format", sql`${t.pincode} ~ '^[1-9][0-9]{5}$'`),
    // One pass per ID — except Aadhaar, whose saved last 4 digits ("XXXXXXXX1234") many people share (owner 2026-10-08).
    uniqueIndex("press_pass_id_unique").on(t.idType, t.idNumber).where(sql`${t.idType} <> 'aadhaar'`),
    index("press_pass_issued_idx").on(t.issuedAt.desc(), t.userId.desc()),
  ],
);

export const articleComment = pgTable(
  "article_comment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => article.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** A reply's top-level comment (one level of threading; replies to a reply attach to the same parent). */
    parentId: uuid("parent_id").references((): AnyPgColumn => articleComment.id, { onDelete: "cascade" }),
    /** Empty when the comment is only a GIF. */
    body: text("body").notNull(),
    /** A GIPHY GIF under the text (owner 2026-10-31). */
    gif: jsonb("gif").$type<{ url: string; width: number; height: number; title: string }>(),
    likeCount: integer("like_count").notNull().default(0),
    createdAt: tsMs("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("article_comment_article_created_idx").on(t.articleId, t.createdAt.desc(), t.id.desc()),
    index("article_comment_parent_created_idx").on(t.parentId, t.createdAt, t.id),
    check("article_comment_body_length", sql`char_length(${t.body}) <= 1000 and (char_length(${t.body}) >= 1 or ${t.gif} is not null)`),
  ],
);
export type ArticleCommentRecord = typeof articleComment.$inferSelect;

export const articleCommentLike = pgTable(
  "article_comment_like",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => articleComment.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: tsMs("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId] })],
);

export const articleSave = pgTable(
  "article_save",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    articleId: uuid("article_id")
      .notNull()
      .references(() => article.id, { onDelete: "cascade" }),
    createdAt: tsMs("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.articleId] }), index("article_save_user_created_idx").on(t.userId, t.createdAt.desc(), t.articleId.desc())],
);

export const articleFlag = pgTable(
  "article_flag",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => article.id, { onDelete: "cascade" }),
    /** The reader who reported (flagged) the story. */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reason: text("reason", { enum: FLAG_REASON_VALUES }).notNull(),
    note: text("note"),
    status: text("status", { enum: ["open", "resolved"] })
      .notNull()
      .default("open"),
    resolution: text("resolution").$type<FlagResolution>(),
    resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
    resolvedAt: ts("resolved_at"),
    createdAt: tsMs("created_at").notNull().defaultNow(),
  },
  (t) => [
    // One OPEN flag per reader per story.
    uniqueIndex("article_flag_open_unique").on(t.articleId, t.userId).where(sql`${t.status} = 'open'`),
    index("article_flag_article_idx").on(t.articleId, t.createdAt.desc()),
    index("article_flag_status_created_idx").on(t.status, t.createdAt.desc()),
    check("article_flag_reason_valid", sql`${t.reason} in ('misinformation', 'hate', 'spam', 'copyright', 'other')`),
    check("article_flag_status_valid", sql`${t.status} in ('open', 'resolved')`),
  ],
);

/** Timestamped share events for Newsroom analytics (article.shareCount stays the live counter). */
export const articleShare = pgTable(
  "article_share",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => article.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    /** `u:<userId>` / `a:<signed wn_vid id>` — one counted share per viewer per story per 24 h (null on older rows). */
    viewerKey: text("viewer_key"),
    createdAt: tsMs("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("article_share_article_created_idx").on(t.articleId, t.createdAt),
    index("article_share_created_idx").on(t.createdAt),
    index("article_share_viewer_idx").on(t.articleId, t.viewerKey, t.createdAt),
  ],
);

/** Article page opens ("reads"), unique per viewer — recorded when the article page loads its data. */
export const articleRead = pgTable(
  "article_read",
  {
    articleId: uuid("article_id")
      .notNull()
      .references(() => article.id, { onDelete: "cascade" }),
    viewerKey: text("viewer_key").notNull(),
    createdAt: tsMs("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.viewerKey] }), index("article_read_created_idx").on(t.createdAt, t.articleId)],
);

/**
 * Behaviour events (owner 2026-10-16): every tap on the site with who made it — `viewerKey` (`u:<id>` / `a:<id>`), the
 * account when signed in — what it was (`name`, `label`), the story it was on, the page and web / app. Read by
 * Newsroom → Insights and Desk → Behaviour; kept for behaviour-based features later.
 */
export const userEvent = pgTable(
  "user_event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    viewerKey: text("viewer_key").notNull(),
    // A deleted account takes its activity with it (Privacy Policy, owner 2026-10-16).
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    label: text("label"),
    articleId: uuid("article_id").references(() => article.id, { onDelete: "set null" }),
    targetUsername: text("target_username"),
    path: text("path").notNull(),
    platform: text("platform").notNull(),
    props: jsonb("props").$type<Record<string, string | number | boolean>>(),
    /** The address and browser / app it came from (owner 2026-10-31: kept for legal requests). */
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: tsMs("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("user_event_created_idx").on(t.createdAt),
    index("user_event_user_idx").on(t.userId, t.createdAt.desc()),
    index("user_event_viewer_idx").on(t.viewerKey, t.createdAt.desc()),
    index("user_event_article_idx").on(t.articleId, t.createdAt),
    index("user_event_name_idx").on(t.name, t.createdAt),
  ],
);

/**
 * Wishes (owner 2026-10-31): birthday wishes and invitations any member can post (no Press Pass), drawn in a simple
 * template and woven into the Home feed at random spots, never on top. They stay — no expiry (owner 2026-10-31);
 * `expires_at` is kept but not used.
 */
export const wish = pgTable(
  "wish",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["birthday", "invitation"] }).notNull(),
    template: text("template").notNull(),
    /** Birthday: whose birthday. Invitation: the event's name. */
    title: text("title").notNull(),
    message: text("message"),
    photoUrl: text("photo_url"),
    photoKey: text("photo_key"),
    /** Invitations: when and where. */
    eventAt: tsMs("event_at"),
    venue: text("venue"),
    createdAt: tsMs("created_at").notNull().defaultNow(),
    /** Not used: wishes don't expire (owner 2026-10-31). */
    expiresAt: tsMs("expires_at").notNull(),
  },
  (t) => [index("wish_expires_idx").on(t.expiresAt), index("wish_author_idx").on(t.authorId, t.createdAt.desc())],
);

/**
 * Quick wishes on a birthday wish / invitation (owner 2026-10-31): one of WISH_QUICK_COMMENTS, tapped on the Home card.
 * One per person per wish — tapping another replaces it.
 */
export const wishComment = pgTable(
  "wish_comment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    wishId: uuid("wish_id")
      .notNull()
      .references(() => wish.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: tsMs("created_at").notNull().defaultNow(),
  },
  (t) => [index("wish_comment_wish_idx").on(t.wishId, t.createdAt.desc()), uniqueIndex("wish_comment_one_per_user").on(t.wishId, t.userId)],
);

/**
 * Content log (owner 2026-10-31: "for future or any legal issues"): every story a reporter publishes, edits, saves,
 * sends for review or deletes — who did it (the account, and the member / editor who acted for it), the story as it was
 * named then, and the IP address and browser / app it came from. No foreign keys: the record outlives a deleted story
 * or account. The Editor Desk reads it under Reporter activity.
 */
export const contentLog = pgTable(
  "content_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id"),
    username: text("username"),
    /** Who pressed the button when it wasn't the account itself: a group member, or the Editor Desk. */
    actorId: text("actor_id"),
    actorUsername: text("actor_username"),
    action: text("action").notNull(),
    articleId: uuid("article_id"),
    articleTitle: text("article_title"),
    articleSlug: text("article_slug"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: tsMs("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("content_log_created_idx").on(t.createdAt.desc()),
    index("content_log_user_idx").on(t.userId, t.createdAt.desc()),
    index("content_log_article_idx").on(t.articleId, t.createdAt.desc()),
  ],
);

/**
 * Spotlight impressions (owner 2026-10-16): one row per order and reader — `shows` = visits whose feed showed it (the
 * view tracker sends each card once per visit). Drives the per-reader cap and the reporter's results.
 */
export const spotlightImpression = pgTable(
  "spotlight_impression",
  {
    orderId: uuid("order_id")
      .notNull()
      .references((): AnyPgColumn => spotlightOrder.id, { onDelete: "cascade" }),
    viewerKey: text("viewer_key").notNull(),
    shows: integer("shows").notNull().default(1),
    firstAt: tsMs("first_at").notNull().defaultNow(),
    lastAt: tsMs("last_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orderId, t.viewerKey] }), index("spotlight_impression_viewer_idx").on(t.viewerKey)],
);

export const spotlightPackage = pgTable("spotlight_package", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  hours: integer("hours").notNull(),
  priceInr: integer("price_inr").notNull(),
  active: boolean("active").notNull().default(true),
  sort: integer("sort").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const spotlightOrder = pgTable(
  "spotlight_order",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => article.id, { onDelete: "cascade" }),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    packageId: uuid("package_id").references(() => spotlightPackage.id, { onDelete: "set null" }),
    /** Snapshot of the package at order time (packages can change or be deleted later). */
    packageName: text("package_name").notNull(),
    hours: integer("hours").notNull(),
    priceInr: integer("price_inr").notNull(),
    status: text("status").$type<SpotlightStatus>().notNull().default("pending"),
    provider: text("provider").$type<PaymentProviderId>().notNull().default("manual"),
    providerRef: text("provider_ref"),
    startsAt: tsMs("starts_at"),
    endsAt: tsMs("ends_at"),
    grantedBy: text("granted_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: ts("decided_at"),
    note: text("note"),
    createdAt: tsMs("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("spotlight_order_article_idx").on(t.articleId, t.createdAt.desc()),
    index("spotlight_order_status_idx").on(t.status, t.endsAt),
    index("spotlight_order_reporter_idx").on(t.reporterId, t.createdAt.desc()),
    index("spotlight_order_created_idx").on(t.createdAt.desc(), t.id.desc()),
    check("spotlight_order_status_valid", sql`${t.status} in ('pending', 'granted', 'declined', 'expired', 'cancelled')`),
    check("spotlight_order_provider_valid", sql`${t.provider} in ('manual', 'razorpay')`),
  ],
);

export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** null = automatic action (auto-verify, ADMIN_EMAILS promotion) or a since-deleted admin. */
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").$type<AuditAction>().notNull(),
    targetType: text("target_type").$type<AuditEntry["targetType"]>().notNull(),
    targetId: text("target_id").notNull(),
    targetLabel: text("target_label"),
    meta: jsonb("meta").$type<AuditEntry["meta"]>(),
    createdAt: tsMs("created_at").notNull().defaultNow(),
  },
  (t) => [index("admin_audit_created_idx").on(t.createdAt.desc(), t.id.desc()), index("admin_audit_target_idx").on(t.targetType, t.targetId)],
);

/**
 * Notices from the Editor Desk to a reporter (owner rule 2026-09-25): a warning about a reported story, or one of
 * their stories hidden. Shown as a banner until read, and listed in the Newsroom.
 */
export const userNotice = pgTable(
  "user_notice",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: NOTICE_KINDS }).notNull(),
    articleId: uuid("article_id").references(() => article.id, { onDelete: "set null" }),
    /** The story's title when the notice was made (kept if the story is deleted later). */
    articleTitle: text("article_title"),
    message: text("message"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: tsMs("created_at").notNull().defaultNow(),
    readAt: ts("read_at"),
  },
  (t) => [
    index("user_notice_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("user_notice_unread_idx").on(t.userId).where(sql`${t.readAt} is null`),
    check("user_notice_kind_valid", sql`${t.kind} in ('warning', 'story_hidden')`),
  ],
);

/**
 * The bell (owner 2026-09-28): new stories from publishers you follow, reports on your stories (reason + note, never
 * the reporter) and stories hidden after too many reports. One "new_story" row per follower per story.
 */
/* ─────────────── Messages, groups and communities (owner 2026-09-30) ─────────────── */

/** A chat: a direct message thread (one per pair), a group chat, or a community (with its own chat). */
export const conversation = pgTable(
  "conversation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind", { enum: CHAT_KIND_VALUES }).notNull(),
    /** Groups (optional) and communities (required); null for direct chats. */
    name: text("name"),
    /** Communities only. */
    description: text("description"),
    /** Group / community photo: one of its creator's / an admin's uploaded images (`avatars/<userId>/…`). */
    image: text("image"),
    /** Communities only: anyone may join a public one; a private one only by invitation. */
    visibility: text("visibility", { enum: COMMUNITY_VISIBILITY_VALUES }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    /** Direct chats: "<smaller user id>:<larger user id>", so a pair only ever has one chat. */
    directKey: text("direct_key").unique(),
    /** Newest message (inbox order). */
    lastMessageAt: tsMs("last_message_at").notNull().defaultNow(),
    createdAt: tsMs("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("conversation_kind_valid", sql`${t.kind} in ('direct', 'group', 'community')`),
    check("conversation_visibility_valid", sql`(${t.kind} = 'community') = (${t.visibility} is not null)`),
    check("conversation_direct_key", sql`(${t.kind} = 'direct') = (${t.directKey} is not null)`),
    check("conversation_community_name", sql`${t.kind} <> 'community' or ${t.name} is not null`),
    check("conversation_name_length", sql`char_length(${t.name}) <= ${sql.raw(String(CHAT_LIMITS.nameMax))}`),
    check("conversation_description_length", sql`char_length(${t.description}) <= ${sql.raw(String(CHAT_LIMITS.descriptionMax))}`),
    // Public communities to discover, busiest first.
    index("conversation_community_idx").on(t.visibility, t.lastMessageAt.desc()).where(sql`${t.kind} = 'community'`),
  ],
);

export const conversationMember = pgTable(
  "conversation_member",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: CHAT_ROLE_VALUES }).notNull().default("member"),
    /** `request`: a direct message / group add from someone this member doesn't follow, not accepted yet. */
    status: text("status", { enum: ["active", "request"] })
      .notNull()
      .default("active"),
    /** Messages up to here are read. */
    lastReadAt: tsMs("last_read_at").notNull().defaultNow(),
    /**
     * "Clear chat" / "Delete chat": messages up to here are gone for this member. A deleted direct chat leaves the inbox
     * (it comes back with the next message); a cleared one stays there, empty (`keepListed`, owner 2026-10-01).
     */
    clearedAt: tsMs("cleared_at"),
    keepListed: boolean("keep_listed").notNull().default(false),
    joinedAt: tsMs("joined_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    index("conversation_member_user_idx").on(t.userId, t.status),
    check("conversation_member_role_valid", sql`${t.role} in ('owner', 'admin', 'member')`),
    check("conversation_member_status_valid", sql`${t.status} in ('active', 'request')`),
  ],
);

export const message = pgTable(
  "message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    /** The author; for system lines, who did it. */
    senderId: text("sender_id").references(() => user.id, { onDelete: "set null" }),
    kind: text("kind", { enum: MESSAGE_KIND_VALUES }).notNull(),
    /** text: the message; article / profile: an optional note; system `renamed`: the new name. */
    body: text("body"),
    articleId: uuid("article_id").references(() => article.id, { onDelete: "set null" }),
    profileId: text("profile_id").references(() => user.id, { onDelete: "set null" }),
    event: text("event", { enum: CHAT_EVENT_VALUES }),
    /** System `added` / `removed`: who. */
    targetId: text("target_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: tsMs("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("message_conversation_created_idx").on(t.conversationId, t.createdAt.desc(), t.id.desc()),
    check("message_kind_valid", sql`${t.kind} in ('text', 'article', 'profile', 'system')`),
    check("message_body_length", sql`char_length(${t.body}) <= ${sql.raw(String(CHAT_LIMITS.messageMax))}`),
    check("message_system_event", sql`(${t.kind} = 'system') = (${t.event} is not null)`),
  ],
);

/** An invitation to join a community (the invitee accepts or declines it from the bell / the community page). */
export const communityInvite = pgTable(
  "community_invite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    inviterId: text("inviter_id").references(() => user.id, { onDelete: "set null" }),
    inviteeId: text("invitee_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status", { enum: INVITE_STATUS_VALUES }).notNull().default("pending"),
    createdAt: tsMs("created_at").notNull().defaultNow(),
    respondedAt: ts("responded_at"),
  },
  (t) => [
    // One open invitation per person per community.
    uniqueIndex("community_invite_pending_unique").on(t.conversationId, t.inviteeId).where(sql`${t.status} = 'pending'`),
    index("community_invite_invitee_idx").on(t.inviteeId, t.createdAt.desc()),
    check("community_invite_status_valid", sql`${t.status} in ('pending', 'accepted', 'declined')`),
  ],
);

export const notification = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type", { enum: NOTIFICATION_TYPES }).notNull(),
    /** new_story: the publisher; new_follower: the follower. */
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    articleId: uuid("article_id").references(() => article.id, { onDelete: "set null" }),
    /** The story's title when it happened (kept if the story is deleted later); null for new_follower. */
    articleTitle: text("article_title"),
    reason: text("reason", { enum: FLAG_REASON_VALUES }),
    note: text("note"),
    reports: integer("reports"),
    reasons: jsonb("reasons").$type<Array<{ reason: (typeof FLAG_REASON_VALUES)[number]; count: number }>>(),
    /** story_liked / story_commented / message: when this group started (its count = likes / comments / messages since then). */
    batchStart: tsMs("batch_start"),
    /** message / group_added / community_invite / community_joined: the chat or community. */
    conversationId: uuid("conversation_id").references(() => conversation.id, { onDelete: "cascade" }),
    /** community_invite: the invitation. */
    inviteId: uuid("invite_id").references(() => communityInvite.id, { onDelete: "cascade" }),
    /** press_meet_*: the press meet (note = the organizer's note for press_meet_changes, "day" / "soon" for reminders). */
    pressMeetId: uuid("press_meet_id").references((): AnyPgColumn => pressMeet.id, { onDelete: "cascade" }),
    /** press_meet_approved / _paid / _received: the reporter's fee (₹). */
    amount: integer("amount"),
    createdAt: tsMs("created_at").notNull().defaultNow(),
    readAt: ts("read_at"),
    /** Sent to the recipient's phones (or skipped): null = waiting for the push worker (lib/push-worker.ts). */
    pushedAt: ts("pushed_at"),
  },
  (t) => [
    index("notification_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("notification_unread_idx").on(t.userId).where(sql`${t.readAt} is null`),
    // The push worker's queue (owner 2026-10-02): only the few rows not pushed yet.
    index("notification_push_queue_idx").on(t.createdAt).where(sql`${t.pushedAt} is null`),
    uniqueIndex("notification_new_story_unique").on(t.userId, t.articleId).where(sql`${t.type} = 'new_story'`),
    // Likes / comments on an article: one unread group per article and kind (Instagram-style); seen → a new group.
    uniqueIndex("notification_batch_unique")
      .on(t.userId, t.articleId, t.type)
      .where(sql`${t.readAt} is null and ${t.type} in ('story_liked', 'story_commented')`),
    // One "started following you" per follower (unfollow + follow again doesn't repeat it).
    uniqueIndex("notification_new_follower_unique").on(t.userId, t.actorId).where(sql`${t.type} = 'new_follower'`),
    // New messages: one unread group per chat (like likes / comments); seen → a new group.
    uniqueIndex("notification_message_unique")
      .on(t.userId, t.conversationId)
      .where(sql`${t.readAt} is null and ${t.type} = 'message'`),
  ],
);

/**
 * Contact us (owner 2026-10-02): a signed-in member's message to WebNEWS. The email and username are copied from the
 * account when it's sent (so the message still says who wrote it if they change them later).
 */
export const contactMessage = pgTable(
  "contact_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    username: text("username").notNull(),
    name: text("name").notNull(),
    body: text("body").notNull(),
    createdAt: tsMs("created_at").notNull().defaultNow(),
    /** Answered / dealt with by the team (null = new). */
    handledAt: ts("handled_at"),
    /** The team's reply from the Editor Desk inbox (owner 2026-10-10), emailed to the member. */
    reply: text("reply"),
    repliedBy: text("replied_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [index("contact_message_created_idx").on(t.createdAt.desc())],
);

/**
 * A phone that gets push notifications (owner 2026-10-02): the WebNEWS app's FCM token, registered after login. A
 * token belongs to one account at a time (logging in as someone else moves it); tokens FCM rejects are deleted.
 */
export const pushDevice = pgTable(
  "push_device",
  {
    token: text("token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    platform: text("platform", { enum: ["android", "ios"] }).notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("push_device_user_idx").on(t.userId)],
);

/* ─────────────── Connected social accounts: auto-post (owner 2026-09-30) ─────────────── */

/** A verified reporter's Instagram account / Facebook Page. Tokens are encrypted at rest (lib/social-crypto.ts). */
export const socialConnection = pgTable(
  "social_connection",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: SOCIAL_PROVIDER_VALUES }).notNull(),
    /** Instagram: the professional account's id; Facebook: the Page posted to. */
    accountId: text("account_id").notNull(),
    accountName: text("account_name").notNull(),
    /** Instagram: the long-lived user token; Facebook: the Page's token. */
    tokenEnc: text("token_enc").notNull(),
    tokenExpiresAt: ts("token_expires_at"),
    /** Facebook: every Page the person manages, `{ id, name, tokenEnc }` (switching Page needs no new login). */
    pages: jsonb("pages").$type<Array<{ id: string; name: string; tokenEnc: string }>>().notNull().default(sql`'[]'::jsonb`),
    autoPost: boolean("auto_post").notNull().default(true),
    /** Set when Meta rejected the token (permission removed / expired): the person has to connect again. */
    needsReconnectAt: ts("needs_reconnect_at"),
    connectedAt: ts("connected_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.provider] }),
    check("social_connection_provider_valid", sql`${t.provider} in ('instagram', 'facebook')`),
  ],
);

/**
 * One auto-post of a story to one account (at most once per story and provider). `waiting` = for the poster image
 * (the composer uploads it right after publishing; after a couple of minutes the story's cover is used instead),
 * `pending` = ready to send, then `posted` / `failed`.
 */
export const socialPost = pgTable(
  "social_post",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => article.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: SOCIAL_PROVIDER_VALUES }).notNull(),
    status: text("status", { enum: ["waiting", "pending", "posted", "failed"] })
      .notNull()
      .default("waiting"),
    /** The JPEG sent (`covers/<userId>/social-<articleId>.jpg`). */
    imageKey: text("image_key"),
    remoteId: text("remote_id"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: tsMs("next_attempt_at").notNull().defaultNow(),
    createdAt: tsMs("created_at").notNull().defaultNow(),
    postedAt: ts("posted_at"),
  },
  (t) => [
    uniqueIndex("social_post_article_provider_unique").on(t.articleId, t.provider),
    index("social_post_due_idx").on(t.status, t.nextAttemptAt),
    index("social_post_user_created_idx").on(t.userId, t.provider, t.createdAt.desc()),
    check("social_post_status_valid", sql`${t.status} in ('waiting', 'pending', 'posted', 'failed')`),
  ],
);

/* ─────────────── Press meets (owner 2026-10-01) ─────────────── */

export const pressMeet = pgTable(
  "press_meet",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizerId: text("organizer_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    agenda: text("agenda"),
    startsAt: tsMs("starts_at").notNull(),
    endsAt: tsMs("ends_at").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    platform: text("platform", { enum: PRESS_MEET_PLATFORM_VALUES }).notNull().default("webnews"),
    /** `public` (owner 2026-10-07): any reporter joins, first come first served, free; `invited`: the chosen reporters. */
    visibility: text("visibility", { enum: PRESS_MEET_VISIBILITY_VALUES }).notNull().default("invited"),
    /** Google Meet: the link the organizer pasted. */
    meetUrl: text("meet_url"),
    status: text("status", { enum: PRESS_MEET_STATUS_VALUES }).notNull().default("scheduled"),
    startedAt: ts("started_at"),
    /** When the organizer agreed, on Start, that the press meet may be recorded (owner 2026-10-05). */
    recordingConsentAt: ts("recording_consent_at"),
    endedAt: ts("ended_at"),
    cancelledAt: ts("cancelled_at"),
    /** Reminders sent (8 AM IST on the day; 15 minutes before). */
    remindedDayAt: ts("reminded_day_at"),
    remindedSoonAt: ts("reminded_soon_at"),
    /** The room's chat (owner 2026-10-02): reporters can send questions while this is on; the organizer switches it. */
    chatEnabled: boolean("chat_enabled").notNull().default(true),
    createdAt: tsMs("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("press_meet_organizer_idx").on(t.organizerId, t.startsAt.desc()),
    index("press_meet_starts_idx").on(t.startsAt),
    check("press_meet_status_valid", sql`${t.status} in ('scheduled', 'live', 'ended', 'cancelled')`),
    check("press_meet_platform_valid", sql`${t.platform} in ('webnews', 'google_meet')`),
    check("press_meet_visibility_valid", sql`${t.visibility} in ('invited', 'public')`),
    // The public press meets list (upcoming and live ones).
    index("press_meet_public_idx").on(t.startsAt).where(sql`${t.visibility} = 'public'`),
    check("press_meet_duration_valid", sql`${t.durationMinutes} in (30, 60, 90)`),
    check("press_meet_time_order", sql`${t.endsAt} > ${t.startsAt}`),
    // + press_meet_no_overlap (EXCLUDE USING gist, in the migrations): an organizer's own press meets can't overlap.
  ],
);

export const pressMeetInvite = pgTable(
  "press_meet_invite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pressMeetId: uuid("press_meet_id")
      .notNull()
      .references(() => pressMeet.id, { onDelete: "cascade" }),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The reporter's press meet price when invited (₹). */
    price: integer("price").notNull(),
    status: text("status", { enum: PRESS_MEET_INVITE_STATUS_VALUES }).notNull().default("invited"),
    respondedAt: ts("responded_at"),
    /** First time they joined the built-in room. */
    joinedAt: ts("joined_at"),
    /** When they agreed, before joining the room, that the press meet is recorded (owner 2026-10-05). */
    recordingConsentAt: ts("recording_consent_at"),
    articleId: uuid("article_id").references(() => article.id, { onDelete: "set null" }),
    articleTitle: text("article_title"),
    submittedAt: ts("submitted_at"),
    review: text("review", { enum: PRESS_MEET_REVIEW_VALUES }),
    reviewNote: text("review_note"),
    reviewedAt: ts("reviewed_at"),
    payment: text("payment", { enum: PRESS_MEET_PAYMENT_VALUES }).notNull().default("unpaid"),
    paymentRef: text("payment_ref"),
    releasedAt: ts("released_at"),
    receivedAt: ts("received_at"),
    createdAt: tsMs("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("press_meet_invite_unique").on(t.pressMeetId, t.reporterId),
    index("press_meet_invite_reporter_idx").on(t.reporterId, t.createdAt.desc()),
    check("press_meet_invite_status_valid", sql`${t.status} in ('invited', 'accepted', 'declined')`),
    check("press_meet_invite_review_valid", sql`${t.review} is null or ${t.review} in ('pending', 'approved', 'changes')`),
    check("press_meet_invite_payment_valid", sql`${t.payment} in ('unpaid', 'released', 'received')`),
    check("press_meet_invite_price_valid", sql`${t.price} >= 0`),
  ],
);

/** A reporter's recording of the built-in room: uploaded in pieces while it runs, then made into an MP4 (private). */
export const pressMeetRecording = pgTable(
  "press_meet_recording",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pressMeetId: uuid("press_meet_id")
      .notNull()
      .references(() => pressMeet.id, { onDelete: "cascade" }),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status", { enum: PRESS_MEET_RECORDING_STATUS_VALUES }).notNull().default("recording"),
    /** What the browser recorded (video/webm or video/mp4). */
    sourceType: text("source_type").notNull(),
    chunks: integer("chunks").notNull().default(0),
    bytes: bigint("bytes", { mode: "number" }).notNull().default(0),
    durationMs: integer("duration_ms"),
    lastChunkAt: ts("last_chunk_at"),
    createdAt: tsMs("created_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
  },
  (t) => [
    index("press_meet_recording_reporter_idx").on(t.pressMeetId, t.reporterId),
    index("press_meet_recording_status_idx").on(t.status),
    check("press_meet_recording_status_valid", sql`${t.status} in ('recording', 'processing', 'ready', 'failed')`),
  ],
);

/** Who is in a built-in room right now (one row per open tab; refreshed every few seconds, swept when stale). */
/**
 * The press meet report an organizer uploads while booking (owner 2026-10-05) — stored privately on disk
 * (PRESS_MEET_REPORTS_DIR/<id>), linked to the press meet when it is scheduled. Unlinked ones are the organizer's own.
 */
export const pressMeetReport = pgTable(
  "press_meet_report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    pressMeetId: uuid("press_meet_id").references(() => pressMeet.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: tsMs("created_at").notNull().defaultNow(),
  },
  (t) => [index("press_meet_report_user_idx").on(t.userId), uniqueIndex("press_meet_report_meet_unique").on(t.pressMeetId)],
);

/**
 * The platform fee an organizer pays to book (owner 2026-10-05; the amount is the Editor Desk's `site_setting`
 * "press_meet.platform_fee" at the time). Provider `test` until online payments are connected. Linked to the press
 * meet it paid for when that is scheduled.
 */
export const pressMeetFeePayment = pgTable(
  "press_meet_fee_payment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    pressMeetId: uuid("press_meet_id").references(() => pressMeet.id, { onDelete: "set null" }),
    amountInr: integer("amount_inr").notNull(),
    provider: text("provider", { enum: PLATFORM_FEE_PROVIDER_VALUES }).notNull(),
    providerRef: text("provider_ref"),
    paidAt: tsMs("paid_at").notNull().defaultNow(),
  },
  (t) => [
    index("press_meet_fee_payment_user_idx").on(t.userId),
    uniqueIndex("press_meet_fee_payment_meet_unique").on(t.pressMeetId),
    check("press_meet_fee_payment_provider_valid", sql`${t.provider} in ('test', 'razorpay')`),
    check("press_meet_fee_payment_amount_valid", sql`${t.amountInr} >= 0`),
  ],
);

/**
 * Premium membership payments (owner 2026-10-14): a reader pays a reporter's monthly price for MEMBERSHIP_DAYS of
 * their members-only stories. `created` = a Razorpay order waiting for payment; `paid` = verified (or `test`, no money
 * moved). A paid row's period starts where the member's previous one ends, so a membership is active while any paid
 * row's `periodEnd` is in the future. `feePaise` = WebNEWS's MEMBERSHIP_FEE_PERCENT, taken from the reporter's share.
 */
export const membershipPayment = pgTable(
  "membership_payment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: text("member_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    priceInr: integer("price_inr").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    feePaise: integer("fee_paise").notNull(),
    provider: text("provider", { enum: PLATFORM_FEE_PROVIDER_VALUES }).notNull(),
    providerOrderId: text("provider_order_id").unique(),
    providerPaymentId: text("provider_payment_id"),
    status: text("status", { enum: ["created", "paid"] }).notNull().default("created"),
    periodStart: tsMs("period_start"),
    periodEnd: tsMs("period_end"),
    createdAt: tsMs("created_at").notNull().defaultNow(),
    paidAt: tsMs("paid_at"),
    /** Renewal reminders sent for this period (lib/membership-worker.ts): "ends soon", then "has ended". */
    endingNotifiedAt: ts("ending_notified_at"),
    endedNotifiedAt: ts("ended_notified_at"),
  },
  (t) => [
    index("membership_payment_member_idx").on(t.memberId, t.reporterId, t.periodEnd),
    index("membership_payment_reporter_idx").on(t.reporterId, t.paidAt),
    check("membership_payment_provider_valid", sql`${t.provider} in ('test', 'razorpay')`),
    check("membership_payment_status_valid", sql`${t.status} in ('created', 'paid')`),
    check("membership_payment_amounts_valid", sql`${t.amountPaise} > 0 and ${t.feePaise} >= 0 and ${t.feePaise} <= ${t.amountPaise}`),
    check("membership_payment_paid_complete", sql`${t.status} <> 'paid' or (${t.paidAt} is not null and ${t.periodEnd} is not null)`),
  ],
);

/**
 * Membership payouts (owner 2026-10-15): money the Editor Desk has sent a reporter for their memberships. A reporter's
 * balance due = their paid memberships' share (amount − fee) − these payouts.
 */
export const membershipPayout = pgTable(
  "membership_payout",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    amountPaise: integer("amount_paise").notNull(),
    /** Bank / UPI reference, as the desk typed it. */
    reference: text("reference"),
    note: text("note"),
    paidAt: tsMs("paid_at").notNull().defaultNow(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    index("membership_payout_reporter_idx").on(t.reporterId, t.paidAt),
    check("membership_payout_amount_positive", sql`${t.amountPaise} > 0`),
  ],
);

/** Site-wide settings the Editor Desk changes (owner 2026-10-05: first, "press_meet.platform_fee" = { amountInr }). */
export const siteSetting = pgTable("site_setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const pressMeetPeer = pgTable(
  "press_meet_peer",
  {
    peerId: text("peer_id").primaryKey(),
    pressMeetId: uuid("press_meet_id")
      .notNull()
      .references(() => pressMeet.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["organizer", "reporter"] }).notNull(),
    micOn: boolean("mic_on").notNull().default(false),
    cameraOn: boolean("camera_on").notNull().default(false),
    hand: boolean("hand").notNull().default(false),
    /** A reporter the organizer let speak (owner 2026-10-05: reporters ask first; their mic stays off until then). */
    canSpeak: boolean("can_speak").notNull().default(false),
    recording: boolean("recording").notNull().default(false),
    joinedAt: ts("joined_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  },
  (t) => [index("press_meet_peer_meet_idx").on(t.pressMeetId)],
);

/** Each person's private notepad for a press meet (owner 2026-10-01): written in the room, kept for the story. */
export const pressMeetNote = pgTable(
  "press_meet_note",
  {
    pressMeetId: uuid("press_meet_id")
      .notNull()
      .references(() => pressMeet.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull().default(""),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.pressMeetId, t.userId] })],
);

/**
 * The press meet room's chat (owner 2026-10-02): reporters' questions and the organizer's replies while it's live. Seen
 * by the organizer and the reporters who accepted; kept with the press meet.
 */
export const pressMeetMessage = pgTable(
  "press_meet_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pressMeetId: uuid("press_meet_id")
      .notNull()
      .references(() => pressMeet.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: tsMs("created_at").notNull().defaultNow(),
  },
  (t) => [index("press_meet_message_meet_idx").on(t.pressMeetId, t.createdAt)],
);

/** Room signals too big for a NOTIFY payload (SDP offers): the NOTIFY carries this row's id; swept after a minute. */
export const pressMeetSignal = pgTable("press_meet_signal", {
  id: uuid("id").primaryKey().defaultRandom(),
  payload: jsonb("payload").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/* ─────────────── Group accounts (owner 2026-10-23) ─────────────── */

/** A Press Pass holder's request for a group account; the Editor Desk approves it (the account is made then). */
export const groupApplication = pgTable(
  "group_application",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicantId: text("applicant_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    username: text("username").notNull(),
    about: text("about").notNull(),
    /** The logo: one of the applicant's uploaded avatars; becomes the group's photo. */
    image: text("image").notNull(),
    link: text("link"),
    status: text("status", { enum: GROUP_APPLICATION_STATUS_VALUES }).notNull().default("pending"),
    deskNote: text("desk_note"),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: ts("decided_at"),
    /** The group account made on approval. */
    groupId: text("group_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: tsMs("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("group_application_status_idx").on(t.status, t.createdAt),
    index("group_application_applicant_idx").on(t.applicantId, t.createdAt.desc()),
    check("group_application_status_valid", sql`${t.status} in ('pending', 'approved', 'rejected')`),
  ],
);

/** Who may post as a group account, and how (owner / editor / writer). "invited" until they accept. */
export const groupMember = pgTable(
  "group_member",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: GROUP_ROLE_VALUES }).notNull(),
    status: text("status", { enum: GROUP_MEMBER_STATUS_VALUES }).notNull().default("invited"),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    invitedAt: tsMs("invited_at").notNull().defaultNow(),
    joinedAt: tsMs("joined_at"),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.userId] }),
    index("group_member_user_idx").on(t.userId, t.status),
    check("group_member_role_valid", sql`${t.role} in ('owner', 'editor', 'writer')`),
    check("group_member_status_valid", sql`${t.status} in ('invited', 'active')`),
    check("group_member_not_self", sql`${t.groupId} <> ${t.userId}`),
  ],
);

export const authSchema = { user, session, account, verification };
export const schema = {
  ...authSchema,
  article,
  articleLike,
  articleAnonLike,
  articleDislike,
  articleView,
  follow,
  pressPass,
  articleSave,
  articleFlag,
  articleShare,
  articleRead,
  spotlightPackage,
  spotlightOrder,
  spotlightImpression,
  userEvent,
  adminAuditLog,
  userNotice,
  conversation,
  conversationMember,
  message,
  communityInvite,
  notification,
  socialConnection,
  socialPost,
  pressMeet,
  pressMeetInvite,
  pressMeetRecording,
  pressMeetPeer,
  pressMeetSignal,
  pressMeetNote,
  groupApplication,
  groupMember,
};

/**
 * A Press Pass holder's news website on their verified domain (owner 2026-10-29, the webnews.in layout). One per
 * domain; `sourceId` is whose stories it shows — the owner's own account or a group they own.
 */
export const publisherSite = pgTable(
  "publisher_site",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    domain: text("domain").notNull().unique(),
    sourceId: text("source_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    tagline: text("tagline"),
    logoUrl: text("logo_url"),
    logoKey: text("logo_key"),
    city: text("city"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    address: text("address"),
    /** The site admin's own login (`<domain>/admin`), separate from WebNEWS accounts. scrypt `salt:hash`. */
    adminEmail: text("admin_email").notNull(),
    adminPasswordHash: text("admin_password_hash").notNull(),
    /** Bumped on a password change: older admin tokens stop working. */
    adminTokenVersion: integer("admin_token_version").notNull().default(0),
    /** Stories the admin took off the site / marked Breaking (they stay on WebNEWS). */
    hiddenArticleIds: uuid("hidden_article_ids").array().notNull().default(sql`'{}'::uuid[]`),
    breakingArticleIds: uuid("breaking_article_ids").array().notNull().default(sql`'{}'::uuid[]`),
    /** Added to the Vercel project (the domain then serves the site once its DNS points at Vercel). */
    connectedAt: ts("connected_at"),
    /** The menu's categories in order (owner 2026-10-30); null = every category the source has stories in. */
    navCategories: text("nav_categories").array(),
    /** The footer's line under the brand (owner 2026-10-30: editable footer); null = the default line. */
    footerText: text("footer_text"),
    /** Default interface language, `en` | `kn` (visitors can switch); stories are never translated. */
    language: text("language").notNull().default("en"),
    createdAt: tsMs("created_at").notNull().defaultNow(),
    updatedAt: tsMs("updated_at").notNull().defaultNow(),
  },
  (t) => [index("publisher_site_source_idx").on(t.sourceId)],
);

/** An ad on a publisher site (the webnews.in positions; several at one position rotate). */
export const siteAd = pgTable(
  "site_ad",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => publisherSite.id, { onDelete: "cascade" }),
    position: text("position", { enum: SITE_AD_POSITION_KEYS }).notNull(),
    title: text("title").notNull(),
    creativeUrl: text("creative_url"),
    creativeKey: text("creative_key"),
    video: boolean("video").notNull().default(false),
    targetUrl: text("target_url"),
    startsAt: tsMs("starts_at").notNull().defaultNow(),
    endsAt: tsMs("ends_at"),
    createdAt: tsMs("created_at").notNull().defaultNow(),
  },
  (t) => [index("site_ad_site_idx").on(t.siteId, t.position)],
);

export type PublisherSiteRecord = typeof publisherSite.$inferSelect;
export type SiteAdRecord = typeof siteAd.$inferSelect;

export type UserRecord = typeof user.$inferSelect;
export type ArticleRecord = typeof article.$inferSelect;
export type PressPassRecord = typeof pressPass.$inferSelect;
export type SpotlightOrderRecord = typeof spotlightOrder.$inferSelect;
