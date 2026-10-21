import type {
  AdminAuditQuery,
  AdminFlagsStatus,
  AdminOrdersStatus,
  AdminReportersQuery,
  AdminStoriesQuery,
  AdminUsersQuery,
  NewsroomRange,
} from "./shared/contracts";

/**
 * TanStack Query keys — one factory so invalidation stays consistent across features.
 * Prefix keys (e.g. `qk.feedAll`) invalidate every variant beneath them.
 */
export const qk = {
  viewer: ["viewer"] as const,

  /** Prefix of every story feed (`qk.feed`) and of the publisher reels under stories (`qk.publisherReel`). */
  feedAll: ["feed"] as const,
  /** Comments under one story (newest first, cursor pages). */
  comments: (articleId: string) => ["comments", articleId] as const,
  /** Replies to one top-level comment. */
  replies: (commentId: string) => ["comment-replies", commentId] as const,
  /** Every open replies list (prefix of `replies`). */
  allReplies: ["comment-replies"] as const,
  /** One feed: "foryou" · "following" · "latest" · "category:<category>[:<district>]" (components/feed/feed-views.ts). */
  feed: (viewId: string) => ["feed", viewId] as const,

  headlines: (limit: number) => ["headlines", limit] as const,
  trending: (limit: number) => ["trending", limit] as const,
  /** Notices from the Editor Desk (warnings, hidden stories) for the signed-in reporter. */
  notices: ["notices"] as const,
  /** The bell: `notifications` prefixes both the unread count and the list (invalidate it to refresh both). */
  notifications: ["notifications"] as const,
  notificationsUnread: ["notifications", "unread"] as const,
  notificationsList: ["notifications", "list"] as const,
  /** Messages (owner 2026-09-30): `messagesAll` prefixes every chat query (invalidate it on `messages.changed`). */
  messagesAll: ["messages"] as const,
  /** Settings (owner 2026-10-01): GET /api/me/account. */
  account: ["me", "account"] as const,
  myMemberships: ["me", "memberships"] as const,
  membershipEarnings: ["me", "membership-earnings"] as const,
  adminMemberships: ["admin", "memberships"] as const,
  messagesUnread: ["messages", "unread"] as const,
  inbox: (folder: "primary" | "requests") => ["messages", "inbox", folder] as const,
  chat: (id: string) => ["messages", "chat", id] as const,
  chatMessages: (id: string) => ["messages", "thread", id] as const,
  sendSuggestions: ["messages", "suggested"] as const,
  /** Communities: `communitiesAll` prefixes the lists, pages, members and invitations. */
  communitiesAll: ["communities"] as const,
  communities: (scope: "discover" | "mine", q = "") => ["communities", "list", scope, q] as const,
  community: (id: string) => ["communities", "detail", id] as const,
  communityMembers: (id: string) => ["communities", "members", id] as const,
  communityInvites: ["communities", "invites"] as const,
  /** The viewer's reported stories (their profile's "Reported" tab). */
  reportedStories: ["reported-stories"] as const,
  /** Connected Instagram / Facebook (Edit profile). */
  social: ["social"] as const,
  /** /explore: the poster grid (the ranked mix). */
  explore: ["explore"] as const,
  /** Masthead instant search (people + stories). */
  search: (query: string) => ["search", query] as const,
  topPublishers: (limit: number) => ["top-publishers", limit] as const,

  article: (slug: string) => ["article", slug] as const,
  ownedArticle: (id: string) => ["owned-article", id] as const,

  profile: (username: string) => ["profile", username] as const,
  userArticles: (username: string) => ["user-articles", username] as const,
  /**
   * "More from @publisher" reels under a story (the publisher's newest stories; + viewer id, like feeds). Nested under
   * `feedAll` with the same data shape, so the feed cache helpers (live-state.ts) and every feed invalidation reach it.
   */
  publisherReel: (username: string) => ["feed", "publisher-reel", username] as const,
  userDrafts: (username: string) => ["user-drafts", username] as const,
  followers: (username: string) => ["followers", username] as const,
  following: (username: string) => ["following", username] as const,

  /** Client-side override of "viewer follows <username>" shared by every FollowButton. */
  followState: (username: string) => ["follow-state", username] as const,
  /** Client-side override of "viewer liked <articleId>" (like buttons). */
  likeState: (articleId: string) => ["like-state", articleId] as const,

  usernameCheck: (username: string) => ["username-check", username] as const,

  /* ─────────────── Roles (SPEC §3.11) ─────────────── */

  /** The viewer's "Saved" tab. Invalidate after save/unsave. */
  saved: ["saved"] as const,
  /** Client-side override of "viewer saved <articleId>" (bookmark buttons), like `likeState`. */
  saveState: (articleId: string) => ["save-state", articleId] as const,

  pressPassOptions: ["press-pass", "options"] as const,
  /** The viewer's own pass. After apply/update also invalidate `qk.viewer` / call `router.refresh()`. */
  pressPass: ["press-pass", "mine"] as const,

  /** Prefix for every Newsroom query (invalidate after a Spotlight request). */
  newsroomAll: ["newsroom"] as const,
  newsroomSummary: (range: NewsroomRange) => ["newsroom", "summary", range] as const,
  newsroomSeries: (range: NewsroomRange, tz: string) => ["newsroom", "series", range, tz] as const,
  newsroomStories: ["newsroom", "stories"] as const,
  newsroomBestTimes: (tz: string) => ["newsroom", "best-times", tz] as const,
  newsroomSpotlight: ["newsroom", "spotlight"] as const,

  spotlightPackages: ["spotlight", "packages"] as const,

  /** Press meets (owner 2026-10-01): `pressMeetsAll` prefixes every press meet query (refetched on `meet.changed`). */
  pressMeetsAll: ["press-meets"] as const,
  /** The platform fee to book (owner 2026-10-05) — outside `pressMeetsAll`: live refreshes don't need it. */
  pressMeetPlatformFee: ["press-meet-platform-fee"] as const,
  pressMeets: (scope: "organizing" | "invited" | "public") => ["press-meets", "list", scope] as const,
  pressMeet: (id: string) => ["press-meets", "detail", id] as const,
  pressMeetCalendar: (month: string, duration: number) => ["press-meets", "calendar", month, duration] as const,
  pressMeetSlots: (date: string, duration: number) => ["press-meets", "slots", date, duration] as const,
  places: (q: string, state: string, district: string) => ["places", q, state, district] as const,
  pressMeetReporters: (q: string, language: string, state: string, district: string, city: string) =>
    ["press-meets", "reporters", q, language, state, district, city] as const,
  /** A reporter's story the organizer reads before verifying it (owner 2026-10-07). */
  pressMeetStory: (id: string, inviteId: string) => ["press-meets", "story", id, inviteId] as const,
  /** Kept out of the `pressMeetsAll` prefix: a live refresh must never reload notes under someone's cursor. */
  pressMeetNotes: (id: string) => ["press-meet-notes", id] as const,
  /** The room's chat (refetched on `meet.chat`). */
  pressMeetChat: (id: string) => ["press-meet-chat", id] as const,

  /** Prefix for every Editor Desk query (invalidate broadly after an admin action). */
  adminAll: ["admin"] as const,
  adminOverview: ["admin", "overview"] as const,
  adminReview: ["admin", "review"] as const,
  adminStories: (filters: Omit<AdminStoriesQuery, "cursor"> = {}) => ["admin", "stories", filters] as const,
  adminStory: (id: string) => ["admin", "story", id] as const,
  adminPins: ["admin", "pins"] as const,
  adminFlags: (status: AdminFlagsStatus) => ["admin", "flags", status] as const,
  adminInbox: (status: string) => ["admin", "inbox", status] as const,
  adminReporters: (filters: Omit<AdminReportersQuery, "cursor"> = {}) => ["admin", "reporters", filters] as const,
  adminUsers: (filters: Omit<AdminUsersQuery, "cursor"> = {}) => ["admin", "users", filters] as const,
  adminSpotlightOrders: (status: AdminOrdersStatus) => ["admin", "spotlight-orders", status] as const,
  adminSpotlightPackages: ["admin", "spotlight-packages"] as const,
  adminPlatformFee: ["admin", "press-meet-platform-fee"] as const,
  adminPressMeets: ["admin", "press-meets"] as const,
  adminAudit: (filters: Omit<AdminAuditQuery, "cursor"> = {}) => ["admin", "audit", filters] as const,
} as const;
