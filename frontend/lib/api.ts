/**
 * Browser-side API client. Every call is a relative, same-origin URL (`/api/...`) that the
 * Next.js rewrite proxies to the backend, so Better Auth cookies are sent automatically.
 * Types come from the generated contract copy (lib/shared/contracts.ts).
 */
import type { MarketHistory, MarketRange, MarketResponse } from "@/lib/shared/contracts";
import type { AdminGroupApplication, AdminGroupDetail, GroupApplication, GroupApplicationInput, GroupDetailResponse, MyGroupsResponse } from "@/lib/shared/contracts";
import type {
  AdminPlatformFee,
  AdminPressMeetRow,
  CreatePressMeetInput,
  PlaceSuggestion,
  PlatformFeePayment,
  PlatformFeeQuote,
  PressMeetReportFile,
  PressMeetDetail,
  PressMeetDuration,
  PressMeetListResponse,
  PressMeetMonthResponse,
  PressMeetChat,
  PressMeetNotes,
  PressMeetReportersResponse,
  PressMeetRoom,
  PressMeetSignal,
  PressMeetSlotsResponse,
  PressMeetStoryPreview,
  AccountSettings,
  MembershipCheckout,
  MembershipEarnings,
  MyMemberships,
  AdminMemberships,
  MembershipPayoutInput,
  AiStatus,
  AiDescribeResult,
  MembershipOrder,
  FollowNotify,
  TrackEvent,
  StoryInsights,
  BehaviourOverview,
  PersonBehaviour,
  LiveVisitors,
  AdminMembershipRules,
  MembershipRule,
  AdminAuditQuery,
  AdminFlagGroup,
  AdminFlagsStatus,
  DeskContactMessage,
  DeskContactStatus,
  AdminOrdersStatus,
  AdminOverview,
  AdminReporterRow,
  AdminReportersQuery,
  AdminSpotlightOrder,
  AdminStoriesQuery,
  AdminStoryDetailResponse,
  AdminStoryRow,
  AdminUserRow,
  AdminUsersQuery,
  ApiErrorBody,
  ArticleCard,
  ArticleCategoryInput,
  ChatMember,
  ChatMessage,
  ChatPerson,
  CommunityDetail,
  CommunityInvite,
  CommunitySummary,
  ConversationDetail,
  ConversationSummary,
  CreateCommunityInput,
  CreateGroupInput,
  InboxFolder,
  InboxResponse,
  InviteStatus,
  SendMessageInput,
  SendToInput,
  SendToResult,
  SocialProvider,
  SocialStatus,
  UnreadMessages,
  UpdateSocialInput,
  UpdateChatInput,
  UpdateCommunityInput,
  ArticleComment,
  ArticleCategoryResult,
  ArticleDetail,
  AuditEntry,
  Category,
  CommentInput,
  ContentLogEntry,
  GifSearchResponse,
  CommentLikeResult,
  DraftCard,
  FeedTab,
  FlagInput,
  FlagResolutionAction,
  FlagResult,
  Headline,
  NewsroomBestTimes,
  NewsroomRange,
  NoticesResponse,
  NotificationsResponse,
  ReportedStoriesResponse,
  NewsroomSeries,
  NewsroomSpotlight,
  NewsroomStory,
  NewsroomSummary,
  OnboardingInput,
  OwnedArticle,
  Page,
  PressLanguage,
  PressDomainInput,
  MySiteResponse,
  SiteAd,
  SiteAdInput,
  SiteAdminData,
  SiteAdminLoginInput,
  SiteAdminLoginResponse,
  SiteAdminStory,
  SitePasswordInput,
  SiteSettingsInput,
  SiteSetupInput,
  SiteStoryFlagsInput,
  PressPassApplyInput,
  PressPassApplyResponse,
  PressPassOptions,
  PressPassResponse,
  PressPassUpdateInput,
  ProfileData,
  ReadResult,
  ResolveFlagsResult,
  ReviewApproveResult,
  Role,
  SaveArticleInput,
  SaveArticleResponse,
  SearchResults,
  SaveResult,
  ShareChannel,
  SpotlightOrder,
  SpotlightOrderResponse,
  SpotlightPackage,
  SpotlightPackageInput,
  SpotlightPackageUpdateInput,
  TrendingHeadline,
  UpdateMeInput,
  UploadedImage,
  UploadedVideo,
  UserRow,
  UsernameCheck,
  ViewerUser,
} from "./shared/contracts";

/* ─────────────────────────── Errors ─────────────────────────── */

const FALLBACK_MESSAGES: Record<number, string> = {
  0: "Network error — check your connection and try again.",
  400: "Please check the highlighted fields.",
  401: "Please log in to continue.",
  403: "You don't have permission to do that.",
  404: "We couldn't find that.",
  409: "That conflicts with something that already exists.",
  413: "That file is too large.",
  415: "That file type isn't supported.",
  429: "You're going a little fast — try again in a moment.",
};

/** Error thrown by every `api.*` call for non-2xx responses and network failures (status 0). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    if (fields) this.fields = fields;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Human-readable message for any thrown value (for toasts). */
export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof ApiError) return error.message || fallback;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function toApiError(status: number, body: unknown): ApiError {
  const err = (body as Partial<ApiErrorBody> | null)?.error;
  const fallback = FALLBACK_MESSAGES[status] ?? (status >= 500 ? "Something went wrong on our side. Please try again." : "Request failed.");
  return new ApiError(status, err?.code ?? `http_${status}`, err?.message || fallback, err?.fields);
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* ─────────────────────────── Core request ─────────────────────────── */

/**
 * "Visit site" from the Editor Desk (owner rule 2026-09-25): while an admin browses the site, every site request
 * asks the API to answer as it would a logged-out visitor (backend `x-webnews-view-as`). Console requests
 * (`/api/admin/*`) never carry it. Switched by <AdminVisit> in the app shell.
 */
let viewAsVisitor = false;

export function setViewAsVisitor(on: boolean): void {
  viewAsVisitor = on;
}

function visitorHeader(path: string): Record<string, string> {
  return viewAsVisitor && !path.startsWith("/api/admin") ? { "x-webnews-view-as": "visitor" } : {};
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** Let the request outlive the page (view beacons on visibilitychange). */
  keepalive?: boolean;
  /** A publisher site admin's token (`<domain>/admin`, owner 2026-10-29). */
  bearer?: string;
};

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal, keepalive, bearer } = options;
  const headers: Record<string, string> = { accept: "application/json", ...visitorHeader(path) };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  if (body !== undefined) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal,
      keepalive,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError(0, "network_error", FALLBACK_MESSAGES[0]!);
  }

  if (res.status === 204) return undefined as T;
  const data = parseJson(await res.text());
  if (!res.ok) throw toApiError(res.status, data);
  return data as T;
}

/** Builds `?a=1&b=2`, skipping null/undefined/empty values. */
export type FeedParams = {
  tab?: FeedTab;
  category?: Category;
  district?: string | null;
  cursor?: string | null;
  /** First page of Latest / a category in a fresh shuffled mix (lib/shuffle.ts); its next pages follow by cursor. */
  shuffle?: string | null;
  /** The news in these languages (the Languages menu). */
  languages?: PressLanguage[] | null;
};

/** `?language=…` for languages, `?category=…&district=…` for a category page, otherwise `?tab=…` (default For You). */
function feedQuery({ tab, category, district, cursor, shuffle, languages }: FeedParams): string {
  if (languages?.length) return query({ language: languages.join(","), cursor, shuffle });
  return category ? query({ category, district, cursor, shuffle }) : query({ tab: tab ?? "foryou", cursor, shuffle });
}

function query(params: Record<string, string | number | null | undefined> = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

const enc = encodeURIComponent;

/* ─────────────────────────── Upload (XHR for progress) ─────────────────────────── */

/** `article`: the full article's image — stored like a cover, any shape. */
/** `frame`: the reporter's own poster frame (owner 2026-10-08) — saved to their account as it uploads. */
export type UploadKind = "avatar" | "cover" | "article" | "frame" | "logo";

/**
 * Multipart upload with progress. `onProgress` receives a fraction 0..1.
 * Rejects with ApiError (or a DOMException "AbortError" when `signal` aborts).
 */
export function uploadImage(
  file: Blob,
  kind: UploadKind,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<UploadedImage> {
  const form = new FormData();
  form.append("file", file, file instanceof File ? file.name : `${kind}.webp`);
  form.append("kind", kind);
  return sendUpload<UploadedImage>(form, onProgress, signal);
}

/**
 * Story video upload (≤ 30 s; `trim` keeps the first 30 s of a longer clip — 422 `video_too_long` otherwise).
 * Progress reaches 1 when the file is sent; the server then re-encodes it, which can take a little while.
 */
export function uploadVideo(
  file: File,
  options: { trim: boolean },
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<UploadedVideo> {
  const form = new FormData();
  form.append("file", file, file.name || "video.mp4");
  form.append("kind", "video");
  if (options.trim) form.append("trim", "1");
  return sendUpload<UploadedVideo>(form, onProgress, signal);
}

/** The press meet report an organizer attaches when booking (owner 2026-10-05): PDF / Word / JPG / PNG, ≤ 10 MB. */
export function uploadPressMeetReport(file: File, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<{ report: PressMeetReportFile }> {
  const form = new FormData();
  form.append("file", file, file.name);
  return sendUpload<{ report: PressMeetReportFile }>(form, onProgress, signal, "/api/press-meets/report");
}

/** A publisher site admin's upload (owner 2026-10-29): an image (→ webp) or an MP4 ad. */
export function uploadSiteFile(
  domain: string,
  token: string,
  file: File,
  onProgress?: (fraction: number) => void,
  purpose?: "logo",
): Promise<SiteUpload> {
  const form = new FormData();
  form.append("file", file, file.name);
  if (purpose) form.append("purpose", purpose);
  return sendUpload<SiteUpload>(form, onProgress, undefined, `/api/sites/d/${encodeURIComponent(domain)}/admin/upload`, token);
}
export type SiteUpload = { url: string; key: string; video: boolean };

function sendUpload<T>(form: FormData, onProgress?: (fraction: number) => void, signal?: AbortSignal, url = "/api/upload", bearer?: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Upload aborted", "AbortError"));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "text";
    xhr.setRequestHeader("accept", "application/json");
    if (bearer) xhr.setRequestHeader("authorization", `Bearer ${bearer}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(Math.min(1, event.loaded / event.total));
    };
    xhr.onload = () => {
      const data = parseJson(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve(data as T);
      } else {
        reject(toApiError(xhr.status, data));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, "network_error", FALLBACK_MESSAGES[0]!));
    xhr.onabort = () => reject(new DOMException("Upload aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });

    xhr.send(form);
  });
}

/* ─────────────────────────── Endpoint types ─────────────────────────── */

export type FollowResult = { following: boolean; followerCount: number };
export type LikeResult = { liked: boolean; likeCount: number };
export type ArticlePageData = { article: ArticleDetail; moreFromAuthor: ArticleCard[] };

/* ─────────────────────────── Endpoints (docs/SPEC.md §5.2) ─────────────────────────── */

export const api = {
  /** GET /api/me — `{ viewer }` (null when logged out). */
  me: (signal?: AbortSignal) => request<{ viewer: ViewerUser | null }>("/api/me", { signal }),

  /** GET /api/username/check?u= — live availability for onboarding / settings. */
  checkUsername: (username: string, signal?: AbortSignal) =>
    request<UsernameCheck>(`/api/username/check${query({ u: username })}`, { signal }),

  /** POST /api/onboarding — completes the profile. 409 `username_taken`. */
  onboard: (input: OnboardingInput) =>
    request<{ user: ViewerUser }>("/api/onboarding", { method: "POST", body: input }),

  /** PATCH /api/me — partial profile update. 409 `username_taken`. */
  updateMe: (input: UpdateMeInput) => request<{ user: ViewerUser }>("/api/me", { method: "PATCH", body: input }),
  /** POST /api/me/contact — Contact us; the email and username come from the account on the server. */
  contact: (message: string) => request<void>("/api/me/contact", { method: "POST", body: { message } }),
  /** GET /api/me/account — the Settings page: email, password login or not, advertorial price. */
  account: (signal?: AbortSignal) => request<AccountSettings>("/api/me/account", { signal }),
  /** PUT /api/me/press-meet-price — whole ₹, null clears it. Reporters and the Editor Desk only. */
  setPressMeetPrice: (price: number | null) =>
    request<{ pressMeetPrice: number | null }>("/api/me/press-meet-price", { method: "PUT", body: { price } }),
  /** PUT /api/me/membership-price — premium membership, whole ₹ a month; null stops offering it. Reporters only. */
  setMembershipPrice: (price: number | null) =>
    request<{ membershipPrice: number | null }>("/api/me/membership-price", { method: "PUT", body: { price } }),
  /** PUT /api/me/push-notifications — Settings → Notifications: pushes to this account's phones on / off. */
  setPushNotifications: (enabled: boolean) =>
    request<{ pushNotifications: boolean }>("/api/me/push-notifications", { method: "PUT", body: { enabled } }),
  /** The WebNEWS app's push token for this phone (lib/native-push.ts): register after login, remove on logout. */
  pushDevices: {
    register: (token: string, platform: "android" | "ios") =>
      request<void>("/api/me/push-devices", { method: "POST", body: { token, platform } }),
    remove: (token: string, platform: "android" | "ios") =>
      request<void>("/api/me/push-devices", { method: "DELETE", body: { token, platform } }),
  },

  /** City / town / village suggestions for the City boxes: names starting with `q` (owner 2026-10-05). */
  places: (params: { q: string; state?: string; district?: string }, signal?: AbortSignal) =>
    request<{ items: PlaceSuggestion[] }>(`/api/places${query(params)}`, { signal }),

  /** Press meets (owner 2026-10-01): booking, invitations, stories, payments, the built-in room and recordings. */
  pressMeets: {
    calendar: (month: string, duration: PressMeetDuration, signal?: AbortSignal) =>
      request<PressMeetMonthResponse>(`/api/press-meets/calendar${query({ month, duration })}`, { signal }),
    slots: (date: string, duration: PressMeetDuration, signal?: AbortSignal) =>
      request<PressMeetSlotsResponse>(`/api/press-meets/slots${query({ date, duration })}`, { signal }),
    reporters: (params: { q?: string; language?: string; state?: string; district?: string; city?: string; cursor?: string | null }, signal?: AbortSignal) =>
      request<PressMeetReportersResponse>(`/api/press-meets/reporters${query(params)}`, { signal }),
    create: (input: CreatePressMeetInput) => request<{ id: string }>("/api/press-meets", { method: "POST", body: input }),
    /** What booking costs now (the Editor Desk sets it) — owner 2026-10-05. */
    platformFee: (signal?: AbortSignal) => request<PlatformFeeQuote>("/api/press-meets/platform-fee", { signal }),
    /** Pays it (a test payment until online payments are connected). */
    payPlatformFee: () => request<{ payment: PlatformFeePayment }>("/api/press-meets/platform-fee/pay", { method: "POST", body: {} }),
    uploadReport: uploadPressMeetReport,
    /** Opens / downloads a press meet's report (organizer, invited reporters, Editor Desk). */
    reportUrl: (id: string) => `/api/press-meets/${enc(id)}/report`,
    /** `public`: upcoming and live public press meets, any reporter can join (owner 2026-10-07). */
    list: (scope: "organizing" | "invited" | "public", signal?: AbortSignal) =>
      request<PressMeetListResponse>(`/api/press-meets${query({ scope })}`, { signal }),
    /** A reporter takes a seat in a public press meet (leave it with `respond(id, false)`). */
    joinPublic: (id: string) => request<void>(`/api/press-meets/${enc(id)}/join`, { method: "POST", body: {} }),
    detail: (id: string, signal?: AbortSignal) => request<PressMeetDetail>(`/api/press-meets/${enc(id)}`, { signal }),
    /** The viewer's private notepad for a press meet. */
    notes: (id: string, signal?: AbortSignal) => request<PressMeetNotes>(`/api/press-meets/${enc(id)}/notes`, { signal }),
    saveNotes: (id: string, body: string) => request<PressMeetNotes>(`/api/press-meets/${enc(id)}/notes`, { method: "PUT", body: { body } }),
    /** The room's chat (owner 2026-10-02): reporters' questions, the organizer's replies, and the on / off switch. */
    chat: (id: string, signal?: AbortSignal) => request<PressMeetChat>(`/api/press-meets/${enc(id)}/chat`, { signal }),
    sendChat: (id: string, body: string) => request<void>(`/api/press-meets/${enc(id)}/chat`, { method: "POST", body: { body } }),
    setChat: (id: string, enabled: boolean) =>
      request<{ enabled: boolean }>(`/api/press-meets/${enc(id)}/chat`, { method: "PUT", body: { enabled } }),
    /** The organizer invites more reporters after booking → how many were invited. */
    inviteMore: (id: string, reporterIds: string[]) =>
      request<{ invited: number }>(`/api/press-meets/${enc(id)}/invites`, { method: "POST", body: { reporterIds } }),
    respond: (id: string, accept: boolean) => request<void>(`/api/press-meets/${enc(id)}/respond`, { method: "POST", body: { accept } }),
    cancel: (id: string) => request<void>(`/api/press-meets/${enc(id)}/cancel`, { method: "POST", body: {} }),
    /** Goes live — only with the organizer's recording consent (the Start dialog, owner 2026-10-05). */
    start: (id: string) => request<void>(`/api/press-meets/${enc(id)}/start`, { method: "POST", body: { recordingConsent: true } }),
    end: (id: string) => request<void>(`/api/press-meets/${enc(id)}/end`, { method: "POST", body: {} }),
    /** The organizer reads a reporter's story before verifying it (stories are sent from the composer — owner 2026-10-07). */
    story: (id: string, inviteId: string, signal?: AbortSignal) =>
      request<PressMeetStoryPreview>(`/api/press-meets/${enc(id)}/invites/${enc(inviteId)}/story`, { signal }),
    /** Verifying publishes the story; asking for changes sends the note back. */
    review: (id: string, inviteId: string, approve: boolean, note?: string | null) =>
      request<void>(`/api/press-meets/${enc(id)}/invites/${enc(inviteId)}/review`, { method: "POST", body: { approve, note } }),
    release: (id: string, inviteId: string, reference?: string | null) =>
      request<void>(`/api/press-meets/${enc(id)}/invites/${enc(inviteId)}/release`, { method: "POST", body: { reference } }),
    received: (id: string) => request<void>(`/api/press-meets/${enc(id)}/received`, { method: "POST", body: {} }),

    room: (id: string, signal?: AbortSignal) => request<PressMeetRoom>(`/api/press-meets/${enc(id)}/room`, { signal }),
    join: (id: string, body: { peerId: string; micOn: boolean; cameraOn: boolean; recordingConsent?: true }) =>
      request<PressMeetRoom>(`/api/press-meets/${enc(id)}/room/join`, { method: "POST", body }),
    beat: (id: string, peerId: string) =>
      request<{ present: boolean; status: string }>(`/api/press-meets/${enc(id)}/room/beat`, { method: "POST", body: { peerId } }),
    /** Also on page close (keepalive). */
    leave: (id: string, peerId: string) =>
      request<void>(`/api/press-meets/${enc(id)}/room/leave`, { method: "POST", body: { peerId }, keepalive: true }),
    signal: (id: string, body: { from: string; to: string; kind: Extract<PressMeetSignal["kind"], "offer" | "answer" | "candidate">; data: Record<string, unknown> }) =>
      request<void>(`/api/press-meets/${enc(id)}/room/signal`, { method: "POST", body }),
    state: (id: string, body: { peerId: string; micOn: boolean; cameraOn: boolean; hand: boolean; recording: boolean }) =>
      request<void>(`/api/press-meets/${enc(id)}/room/state`, { method: "POST", body }),
    mute: (id: string, peerId: string) => request<void>(`/api/press-meets/${enc(id)}/room/mute`, { method: "POST", body: { peerId } }),
    /** The organizer accepts / declines a request to speak; a reporter ends their own turn (allow: false). */
    speak: (id: string, peerId: string, allow: boolean) =>
      request<void>(`/api/press-meets/${enc(id)}/room/speak`, { method: "POST", body: { peerId, allow } }),

  },

  /** POST /api/upload (multipart) with progress. */
  upload: uploadImage,

  /** POST /api/upload with kind=video (story clip + poster frame). */
  uploadVideo,

  /**
   * GET /api/feed?tab=&cursor= (10 per page). Default tab = "foryou" (ranked; its cursor pins the
   * ranking snapshot, so pages may overlap — de-duplicate by id). `following` needs a session (401 otherwise).
   * With `category` (+ `district` for Karnataka): that category's stories, newest first.
   */
  feed: (params: FeedParams = {}, signal?: AbortSignal) => request<Page<ArticleCard>>(`/api/feed${feedQuery(params)}`, { signal }),

  /** PATCH /api/articles/:id/category — the author (or the Editor Desk) moves a story; 400 `fields.district` for Karnataka without one. */
  setCategory: (id: string, input: ArticleCategoryInput) =>
    request<ArticleCategoryResult>(`/api/articles/${enc(id)}/category`, { method: "PATCH", body: input }),

  /** GET /api/me/notices — notices from the Editor Desk (warnings, hidden stories) + the unread count. */
  notices: (signal?: AbortSignal) => request<NoticesResponse>("/api/me/notices", { signal }),

  /** POST /api/me/notices/read — "Got it": marks the given notices (all when `ids` is omitted) read. */
  readNotices: (ids?: string[]) => request<{ unread: number }>("/api/me/notices/read", { method: "POST", body: ids ? { ids } : {} }),

  /** GET /api/me/notifications — the bell (newest first, 20 a page) + the unread count. `limit: 1` = just the count. */
  notifications: (cursor?: string | null, signal?: AbortSignal, limit = 20) =>
    request<NotificationsResponse>(`/api/me/notifications${query({ cursor, limit })}`, { signal }),

  /** POST /api/me/notifications/read — marks the given notifications (all when `ids` is omitted) read. */
  readNotifications: (ids?: string[]) =>
    request<{ unread: number }>("/api/me/notifications/read", { method: "POST", body: ids ? { ids } : {} }),

  /** GET /api/me/reported-stories — the viewer's stories readers reported (reasons, notes, hidden / locked). */
  reportedStories: (signal?: AbortSignal) => request<ReportedStoriesResponse>("/api/me/reported-stories", { signal }),

  /** GET /api/search?q= — instant search: people (username / name) and public stories (headline / text). */
  search: (q: string, signal?: AbortSignal) => request<SearchResults>(`/api/search${query({ q })}`, { signal }),

  /** GET /api/feed/trending?limit= — "Trending now": top stories by engagement in the last 24h. */
  trending: (limit = 5, signal?: AbortSignal) =>
    request<{ items: TrendingHeadline[] }>(`/api/feed/trending${query({ limit })}`, { signal }),

  /** GET /api/market — the Market page's live quotes (indices, gold and silver, crude, the rupee, Bitcoin). */
  market: (signal?: AbortSignal) => request<MarketResponse>("/api/market", { signal }),
  /** GET /api/market/history?id=&range= — one quote's chart over a week or a month (today's points ride with the quote). */
  marketHistory: (id: string, range: MarketRange, signal?: AbortSignal) =>
    request<MarketHistory>(`/api/market/history${query({ id, range })}`, { signal }),

  /** GET /api/feed/headlines?limit= (ticker + Live Wire). */
  headlines: (limit = 12, signal?: AbortSignal) =>
    request<{ items: Headline[] }>(`/api/feed/headlines${query({ limit })}`, { signal }),

  /** GET /api/users/top?limit= (publishers to follow). */
  topPublishers: (limit = 5, signal?: AbortSignal) =>
    request<{ items: UserRow[] }>(`/api/users/top${query({ limit })}`, { signal }),

  /** POST /api/articles — create/update a draft (`action: "draft"`) or publish. `status` tells which shape `article` has. */
  saveArticle: (input: SaveArticleInput) =>
    request<SaveArticleResponse>("/api/articles", { method: "POST", body: input }),

  /** GET /api/articles/:id — one of the viewer's own articles (composer). 404 for anyone else. */
  getArticle: (id: string, signal?: AbortSignal) =>
    request<{ article: OwnedArticle }>(`/api/articles/${enc(id)}`, { signal }),

  /** GET /api/articles/by-slug/:slug — public article page data. */
  articleBySlug: (slug: string, signal?: AbortSignal) =>
    request<ArticlePageData>(`/api/articles/by-slug/${enc(slug)}`, { signal }),

  /** DELETE /api/articles/:id → 204 (owner only). */
  deleteArticle: (id: string) => request<void>(`/api/articles/${enc(id)}`, { method: "DELETE" }),

  /** GET /api/articles/:id/comments — newest first, 20 per page. 404 when the story isn't visible. */
  comments: (id: string, cursor?: string | null, signal?: AbortSignal) =>
    request<Page<ArticleComment>>(`/api/articles/${enc(id)}/comments${query({ cursor })}`, { signal }),
  /** GET /api/articles/:id/comments/:commentId/replies — one thread's replies, oldest first. */
  replies: (id: string, commentId: string, signal?: AbortSignal) =>
    request<{ items: ArticleComment[] }>(`/api/articles/${enc(id)}/comments/${enc(commentId)}/replies`, { signal }),
  /** POST | DELETE /api/articles/:id/comments/:commentId/like (idempotent). */
  likeComment: (id: string, commentId: string, liked: boolean) =>
    request<CommentLikeResult>(`/api/articles/${enc(id)}/comments/${enc(commentId)}/like`, { method: liked ? "POST" : "DELETE" }),
  /** POST /api/articles/:id/comments — onboarded accounts (`parentId` = reply). 400 `fields.body`. */
  /** GET /api/gifs — the comment box's GIF picker (GIPHY; trending when `q` is empty). */
  gifs: (q: string, offset: number, signal?: AbortSignal) => request<GifSearchResponse>(`/api/gifs${query({ q: q || undefined, offset: offset || undefined })}`, { signal }),
  addComment: (id: string, input: CommentInput) =>
    request<{ comment: ArticleComment; commentCount: number }>(`/api/articles/${enc(id)}/comments`, { method: "POST", body: input }),
  /** DELETE /api/articles/:id/comments/:commentId — the comment's author, the story's author or the Editor Desk. */
  deleteComment: (id: string, commentId: string) =>
    request<{ commentCount: number }>(`/api/articles/${enc(id)}/comments/${enc(commentId)}`, { method: "DELETE" }),

  like: (id: string) => request<LikeResult>(`/api/articles/${enc(id)}/like`, { method: "POST" }),
  unlike: (id: string) => request<LikeResult>(`/api/articles/${enc(id)}/like`, { method: "DELETE" }),
  /** POST / DELETE /api/articles/:id/dislike — 👎 inside a story (owner 2026-10-16); disliking takes the like back. */
  dislike: (id: string, disliked: boolean) =>
    request<{ disliked: boolean; dislikeCount: number; liked: boolean | null; likeCount: number | null }>(`/api/articles/${enc(id)}/dislike`, {
      method: disliked ? "POST" : "DELETE",
    }),

  /** POST /api/articles/:id/share — records a share, returns the new count (DM shares are counted by `messages.send`). */
  share: (id: string, channel: Exclude<ShareChannel, "dm">) =>
    request<{ shareCount: number }>(`/api/articles/${enc(id)}/share`, { method: "POST", body: { channel } }),

  /** POST /api/articles/:id/read — the article page is open (Newsroom "reads"; never sent for prefetches). */
  read: (id: string) => request<ReadResult>(`/api/articles/${enc(id)}/read`, { method: "POST" }),

  /** POST /api/views — batched (≤ 50 ids). Pass `keepalive` when flushing on page hide. */
  views: (ids: string[], options: { keepalive?: boolean } = {}) =>
    request<{ counted: string[] }>("/api/views", { method: "POST", body: { ids }, keepalive: options.keepalive }),

  /** POST /api/events — behaviour tracking (owner 2026-10-16): a batch of taps from this page (lib/track.ts). */
  events: (platform: "web" | "app", events: TrackEvent[], options: { keepalive?: boolean } = {}) =>
    request<null>("/api/events", { method: "POST", body: { platform, events }, keepalive: options.keepalive }),

  /** GET /api/users/:username — ProfileData (404 when unknown / not onboarded). */
  profile: (username: string, signal?: AbortSignal) =>
    request<ProfileData>(`/api/users/${enc(username)}`, { signal }),

  follow: (username: string) => request<FollowResult>(`/api/users/${enc(username)}/follow`, { method: "POST" }),
  unfollow: (username: string) => request<FollowResult>(`/api/users/${enc(username)}/follow`, { method: "DELETE" }),
  /** GET /api/users/:username/follow — the viewer's follow and its bell (owner 2026-10-16). */
  followNotify: (username: string, signal?: AbortSignal) => request<FollowNotify>(`/api/users/${enc(username)}/follow`, { signal }),
  /** PUT /api/users/:username/follow/notify — every new story (true) or none (false). */
  setFollowNotify: (username: string, notify: boolean) =>
    request<{ notify: boolean }>(`/api/users/${enc(username)}/follow/notify`, { method: "PUT", body: { notify } }),

  followers: (username: string, cursor?: string | null, signal?: AbortSignal) =>
    request<Page<UserRow>>(`/api/users/${enc(username)}/followers${query({ cursor })}`, { signal }),
  following: (username: string, cursor?: string | null, signal?: AbortSignal) =>
    request<Page<UserRow>>(`/api/users/${enc(username)}/following${query({ cursor })}`, { signal }),

  /** Published articles of a user (profile grid). */
  /** The profile's "Members only" tab (owner 2026-10-14): their premium stories. */
  userPremiumArticles: (username: string, cursor?: string | null, signal?: AbortSignal) =>
    request<Page<ArticleCard>>(`/api/users/${enc(username)}/articles${query({ status: "published", premium: "1", cursor })}`, { signal }),
  userArticles: (username: string, cursor?: string | null, signal?: AbortSignal) =>
    request<Page<ArticleCard>>(`/api/users/${enc(username)}/articles${query({ status: "published", cursor })}`, {
      signal,
    }),

  /** The owner's drafts (404 for anyone else). */
  userDrafts: (username: string, cursor?: string | null, signal?: AbortSignal) =>
    request<Page<DraftCard>>(`/api/users/${enc(username)}/drafts${query({ cursor })}`, { signal }),

  /** GET /api/health */
  health: (signal?: AbortSignal) => request<{ ok: boolean; db: boolean }>("/api/health", { signal }),

  /* ─────────────── Roles: Reader · Reporter (SPEC §3.11) ─────────────── */

  /** POST /api/articles/:id/save — "Save for later" (idempotent; 404 when the story isn't visible). */
  save: (id: string) => request<SaveResult>(`/api/articles/${enc(id)}/save`, { method: "POST" }),
  /** DELETE /api/articles/:id/save */
  unsave: (id: string) => request<SaveResult>(`/api/articles/${enc(id)}/save`, { method: "DELETE" }),
  /** GET /api/me/saved — the viewer's "Saved" tab (most recently saved first). */
  saved: (cursor?: string | null, signal?: AbortSignal) =>
    request<Page<ArticleCard>>(`/api/me/saved${query({ cursor })}`, { signal }),

  /** POST /api/articles/:id/flag — report a story. 409 `already_flagged` (one open report per story), 400 `cannot_flag_own`. */
  flag: (id: string, input: FlagInput) =>
    request<FlagResult>(`/api/articles/${enc(id)}/flag`, { method: "POST", body: input }),

  /** GET /api/press-pass/options — reporter types, experience, languages, Indian states (Karnataka first) + KA districts, pledge, limits. */
  pressPassOptions: (signal?: AbortSignal) => request<PressPassOptions>("/api/press-pass/options", { signal }),
  /** GET /api/press-pass — the viewer's pass (active or revoked) or null. */
  pressPass: (signal?: AbortSignal) => request<PressPassResponse>("/api/press-pass", { signal }),
  /**
   * POST /api/press-pass — readers apply; the pass is issued instantly as Trainee and the account becomes a Reporter.
   * 409 `already_reporter` / `already_editor_desk`, 403 `press_pass_revoked`, 400 with `fields` (pledgeSignature must match the display name; `mobile` already on another pass).
   */
  applyPressPass: (input: PressPassApplyInput) =>
    request<PressPassApplyResponse>("/api/press-pass", { method: "POST", body: input }),
  /** PATCH /api/press-pass — complete / update your active pass (verification, region, languages, about, links; pledge once). */
  updatePressPass: (input: PressPassUpdateInput) =>
    request<PressPassResponse>("/api/press-pass", { method: "PATCH", body: input }),
  /** Publisher websites (owner 2026-10-29). */
  sites: {
    mine: (source?: string | null, signal?: AbortSignal) => request<MySiteResponse>(`/api/sites/mine${query({ source })}`, { signal }),
    save: (input: SiteSetupInput) => request<MySiteResponse>("/api/sites/mine", { method: "PUT", body: input }),
    connect: () => request<MySiteResponse>("/api/sites/mine/connect", { method: "POST" }),
    login: (domain: string, input: SiteAdminLoginInput) =>
      request<SiteAdminLoginResponse>(`/api/sites/d/${enc(domain)}/admin/login`, { method: "POST", body: input }),
    admin: (domain: string, token: string, signal?: AbortSignal) => request<SiteAdminData>(`/api/sites/d/${enc(domain)}/admin`, { bearer: token, signal }),
    saveSettings: (domain: string, token: string, input: SiteSettingsInput) =>
      request<SiteAdminData>(`/api/sites/d/${enc(domain)}/admin/settings`, { method: "PATCH", body: input, bearer: token }),
    changePassword: (domain: string, token: string, input: SitePasswordInput) =>
      request<SiteAdminLoginResponse>(`/api/sites/d/${enc(domain)}/admin/password`, { method: "PUT", body: input, bearer: token }),
    stories: (domain: string, token: string) => request<{ stories: SiteAdminStory[] }>(`/api/sites/d/${enc(domain)}/admin/stories`, { bearer: token }),
    setStory: (domain: string, token: string, id: string, input: SiteStoryFlagsInput) =>
      request<{ stories: SiteAdminStory[] }>(`/api/sites/d/${enc(domain)}/admin/stories/${enc(id)}`, { method: "PATCH", body: input, bearer: token }),
    addAd: (domain: string, token: string, input: SiteAdInput) =>
      request<{ ad: SiteAd }>(`/api/sites/d/${enc(domain)}/admin/ads`, { method: "POST", body: input, bearer: token }),
    updateAd: (domain: string, token: string, id: string, input: SiteAdInput) =>
      request<{ ad: SiteAd }>(`/api/sites/d/${enc(domain)}/admin/ads/${enc(id)}`, { method: "PUT", body: input, bearer: token }),
    removeAd: (domain: string, token: string, id: string) =>
      request<{ ok: true }>(`/api/sites/d/${enc(domain)}/admin/ads/${enc(id)}`, { method: "DELETE", bearer: token }),
  },
  /** PUT /api/press-pass/domain — add / change your domain; the pass carries the TXT record to publish. */
  setPressDomain: (input: PressDomainInput) =>
    request<PressPassResponse>("/api/press-pass/domain", { method: "PUT", body: input }),
  /** POST /api/press-pass/domain/verify — checks DNS; 400 `domain_not_verified` until the TXT record is live. */
  verifyPressDomain: () => request<PressPassResponse>("/api/press-pass/domain/verify", { method: "POST" }),
  /** DELETE /api/press-pass/domain. */
  removePressDomain: () => request<PressPassResponse>("/api/press-pass/domain", { method: "DELETE" }),

  /** Newsroom analytics (reporters + Editor Desk; readers get 403 `press_pass_required`). `tz` = IANA zone (default the browser's). */
  newsroom: {
    summary: (range: NewsroomRange = 7, signal?: AbortSignal) =>
      request<NewsroomSummary>(`/api/newsroom/summary${query({ range })}`, { signal }),
    series: (range: NewsroomRange = 7, tz: string = browserTimeZone(), signal?: AbortSignal) =>
      request<NewsroomSeries>(`/api/newsroom/series${query({ range, tz })}`, { signal }),
    stories: (cursor?: string | null, signal?: AbortSignal) =>
      request<Page<NewsroomStory>>(`/api/newsroom/stories${query({ cursor })}`, { signal }),
    bestTimes: (tz: string = browserTimeZone(), signal?: AbortSignal) =>
      request<NewsroomBestTimes>(`/api/newsroom/best-times${query({ tz })}`, { signal }),
    spotlight: (signal?: AbortSignal) => request<NewsroomSpotlight>("/api/newsroom/spotlight", { signal }),
    /** GET /api/newsroom/stories/:id/insights — one story's insights, Meta Ads style (owner 2026-10-16). */
    insights: (id: string, signal?: AbortSignal) => request<StoryInsights>(`/api/newsroom/stories/${enc(id)}/insights`, { signal }),
  },

  /** Spotlight (paid boost; payments not connected → every order is `pending` until the Editor Desk grants it). */
  spotlight: {
    /** GET /api/spotlight/packages — active packages (public price list). */
    packages: (signal?: AbortSignal) => request<{ items: SpotlightPackage[] }>("/api/spotlight/packages", { signal }),
    /** POST /api/spotlight/orders → 201 `{ order, message, payment }`. 409 `spotlight_exists`, 400 `spotlight_ineligible`. */
    order: (articleId: string, packageId: string) =>
      request<SpotlightOrderResponse>("/api/spotlight/orders", { method: "POST", body: { articleId, packageId } }),
    /** POST /api/spotlight/orders/:id/cancel — withdraw a pending request (409 `not_pending`). */
    cancel: (orderId: string) =>
      request<{ order: SpotlightOrder }>(`/api/spotlight/orders/${enc(orderId)}/cancel`, { method: "POST" }),
  },

  /* ─────────────── Messages, groups and communities (owner 2026-09-30) ─────────────── */

  /** "Generate with AI" in the composer (owner 2026-10-14): the reporter's own Gemini key. */
  ai: {
    status: (signal?: AbortSignal) => request<AiStatus>("/api/ai/status", { signal }),
    saveKey: (key: string) => request<AiStatus>("/api/ai/key", { method: "PUT", body: { key } }),
    removeKey: () => request<AiStatus>("/api/ai/key", { method: "DELETE" }),
    describe: (input: { title: string; notes: string; language: string | null }) =>
      request<AiDescribeResult>("/api/ai/describe", { method: "POST", body: input }),
  },

  /** Premium membership checkout (owner 2026-10-14). */
  memberships: {
    /** GET /api/memberships/:username — price, 8% platform fee split, the viewer's current end date. */
    checkout: (username: string, signal?: AbortSignal) => request<MembershipCheckout>(`/api/memberships/${enc(username)}`, { signal }),
    /** GET /api/memberships/mine — Settings → My memberships (owner 2026-10-15). */
    mine: (signal?: AbortSignal) => request<MyMemberships>("/api/memberships/mine", { signal }),
    /** GET /api/memberships/earnings — Settings → Premium membership: members, earnings, payouts. */
    earnings: (signal?: AbortSignal) => request<MembershipEarnings>("/api/memberships/earnings", { signal }),
    /** POST /api/memberships/:username/orders — a Razorpay order, or (test provider) already paid. */
    order: (username: string) => request<MembershipOrder>(`/api/memberships/${enc(username)}/orders`, { method: "POST" }),
    /** POST /api/memberships/verify — Razorpay Checkout's success response. */
    verify: (input: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
      request<{ activeUntil: string; username: string }>("/api/memberships/verify", { method: "POST", body: input }),
  },

  messages: {
    /** GET /api/messages?folder= — the inbox (chats or message requests), latest first, + unread / request counts. */
    inbox: (folder: InboxFolder = "primary", cursor?: string | null, signal?: AbortSignal) =>
      request<InboxResponse>(`/api/messages${query({ folder, cursor })}`, { signal }),
    /** GET /api/messages/unread — the masthead badge. */
    unread: (signal?: AbortSignal) => request<UnreadMessages>("/api/messages/unread", { signal }),
    /** GET /api/messages/suggested — the "Send to" sheet: recent chats, then people you follow. */
    suggested: (signal?: AbortSignal) =>
      request<{ chats: ConversationSummary[]; people: ChatPerson[] }>("/api/messages/suggested", { signal }),
    /** POST /api/messages/direct — your chat with someone (created on first use). */
    direct: (username: string) => request<{ id: string }>("/api/messages/direct", { method: "POST", body: { username } }),
    createGroup: (input: CreateGroupInput) => request<{ id: string }>("/api/messages/groups", { method: "POST", body: input }),
    /** POST /api/messages/send — a story / profile / note to people and chats at once. */
    send: (input: SendToInput) => request<SendToResult>("/api/messages/send", { method: "POST", body: input }),
    detail: (id: string, signal?: AbortSignal) => request<ConversationDetail>(`/api/messages/${enc(id)}`, { signal }),
    update: (id: string, input: UpdateChatInput) =>
      request<ConversationDetail>(`/api/messages/${enc(id)}`, { method: "PATCH", body: input }),
    /** Deletes a direct chat for you / declines a request / leaves a group or community chat. */
    remove: (id: string) => request<void>(`/api/messages/${enc(id)}`, { method: "DELETE" }),
    /** Clear chat: every message so far gone for you; the chat stays in your inbox. */
    clear: (id: string) => request<void>(`/api/messages/${enc(id)}/clear`, { method: "POST" }),
    /** Newest first, 30 a page. */
    list: (id: string, cursor?: string | null, signal?: AbortSignal) =>
      request<Page<ChatMessage>>(`/api/messages/${enc(id)}/messages${query({ cursor })}`, { signal }),
    post: (id: string, input: SendMessageInput) =>
      request<{ message: ChatMessage }>(`/api/messages/${enc(id)}/messages`, { method: "POST", body: input }),
    unsend: (id: string, messageId: string) =>
      request<void>(`/api/messages/${enc(id)}/messages/${enc(messageId)}`, { method: "DELETE" }),
    read: (id: string) => request<UnreadMessages>(`/api/messages/${enc(id)}/read`, { method: "POST" }),
    accept: (id: string) => request<{ accepted: true }>(`/api/messages/${enc(id)}/accept`, { method: "POST" }),
    addMembers: (id: string, usernames: string[]) =>
      request<{ added: number }>(`/api/messages/${enc(id)}/members`, { method: "POST", body: { usernames } }),
    removeMember: (id: string, username: string) =>
      request<void>(`/api/messages/${enc(id)}/members/${enc(username)}`, { method: "DELETE" }),
  },

  communities: {
    /** Public communities (biggest first) — or yours with `mine`. */
    list: (params: { q?: string; mine?: boolean } = {}, signal?: AbortSignal) =>
      request<{ items: CommunitySummary[] }>(`/api/communities${query({ q: params.q, mine: params.mine ? 1 : null })}`, { signal }),
    invites: (signal?: AbortSignal) => request<{ items: CommunityInvite[] }>("/api/communities/invites", { signal }),
    respond: (inviteId: string, accept: boolean) =>
      request<{ status: InviteStatus; communityId: string }>(`/api/communities/invites/${enc(inviteId)}/${accept ? "accept" : "decline"}`, {
        method: "POST",
      }),
    create: (input: CreateCommunityInput) => request<{ id: string }>("/api/communities", { method: "POST", body: input }),
    detail: (id: string, signal?: AbortSignal) => request<CommunityDetail>(`/api/communities/${enc(id)}`, { signal }),
    update: (id: string, input: UpdateCommunityInput) =>
      request<CommunityDetail>(`/api/communities/${enc(id)}`, { method: "PATCH", body: input }),
    remove: (id: string) => request<void>(`/api/communities/${enc(id)}`, { method: "DELETE" }),
    join: (id: string) => request<CommunityDetail>(`/api/communities/${enc(id)}/join`, { method: "POST" }),
    leave: (id: string) => request<CommunityDetail | null>(`/api/communities/${enc(id)}/leave`, { method: "POST" }),
    members: (id: string, offset = 0, signal?: AbortSignal) =>
      request<{ items: ChatMember[]; nextOffset: number | null }>(`/api/communities/${enc(id)}/members${query({ offset })}`, { signal }),
    invite: (id: string, usernames: string[]) =>
      request<{ invited: number }>(`/api/communities/${enc(id)}/invites`, { method: "POST", body: { usernames } }),
    setRole: (id: string, username: string, role: "admin" | "member") =>
      request<{ role: string }>(`/api/communities/${enc(id)}/members/${enc(username)}/role`, { method: "POST", body: { role } }),
    removeMember: (id: string, username: string) =>
      request<void>(`/api/communities/${enc(id)}/members/${enc(username)}`, { method: "DELETE" }),
  },

  /* ─────────────── Connected Instagram / Facebook: auto-post (owner 2026-09-30) ─────────────── */

  social: {
    /** GET /api/social — which accounts are connected (+ whether the site is set up, whether the viewer may connect). */
    status: (signal?: AbortSignal) => request<SocialStatus>("/api/social", { signal }),
    /** The Connect buttons are plain links to this (it redirects to Meta's login and back to Edit profile). */
    connectUrl: (provider: SocialProvider) => `/api/social/${provider}/connect`,
    /** The phone app's one-time pass: Connect then runs in the phone's browser (`connect?ticket=`). */
    ticket: (provider: SocialProvider) => request<{ ticket: string }>(`/api/social/${enc(provider)}/ticket`, { method: "POST" }),
    update: (provider: SocialProvider, input: UpdateSocialInput) =>
      request<SocialStatus>(`/api/social/${enc(provider)}`, { method: "PATCH", body: input }),
    disconnect: (provider: SocialProvider) => request<SocialStatus>(`/api/social/${enc(provider)}`, { method: "DELETE" }),
    /** Is the story waiting for its poster (auto-posts queued)? */
    posterWanted: (articleId: string) => request<{ wanted: boolean }>(`/api/social/poster/${enc(articleId)}`),
    /** The story's 9:16 poster as a JPEG: its auto-posts go out with it. */
    uploadPoster: (articleId: string, image: Blob) => {
      const form = new FormData();
      form.append("file", image, "poster.jpg");
      return fetch(`/api/social/poster/${enc(articleId)}`, { method: "POST", body: form, credentials: "same-origin" }).then((res) => {
        if (!res.ok) throw new ApiError(res.status, `http_${res.status}`, "Couldn't send the poster");
        return res.json() as Promise<{ queued: number }>;
      });
    },
  },

  /* ─────────────── Group accounts (owner 2026-10-23) ─────────────── */

  groups: {
    /** GET /api/groups — your groups, invitations and applications. */
    mine: (signal?: AbortSignal) => request<MyGroupsResponse>("/api/groups", { signal }),
    apply: (input: GroupApplicationInput) =>
      request<{ application: GroupApplication }>("/api/groups/applications", { method: "POST", body: input }),
    detail: (id: string, signal?: AbortSignal) => request<GroupDetailResponse>(`/api/groups/${enc(id)}`, { signal }),
    invite: (id: string, username: string, role: "editor" | "writer") =>
      request<GroupDetailResponse>(`/api/groups/${enc(id)}/members`, { method: "POST", body: { username, role } }),
    setRole: (id: string, userId: string, role: "editor" | "writer") =>
      request<GroupDetailResponse>(`/api/groups/${enc(id)}/members/${enc(userId)}`, { method: "PATCH", body: { role } }),
    /** Removes a member (owner) or leaves the group (yourself). */
    remove: (id: string, userId: string) => request<unknown>(`/api/groups/${enc(id)}/members/${enc(userId)}`, { method: "DELETE" }),
    answer: (id: string, accept: boolean) =>
      request<MyGroupsResponse>(`/api/groups/${enc(id)}/invite/${accept ? "accept" : "decline"}`, { method: "POST" }),
    /** "Posting as" the group / back to your own account. Reload the page data afterwards. */
    switchTo: (id: string) => request<{ ok: true }>(`/api/groups/${enc(id)}/switch`, { method: "POST" }),
    switchBack: () => request<{ ok: true }>("/api/groups/switch-back", { method: "POST" }),
    /** The owner deactivates (hidden, nobody posts as it) / reactivates the group. */
    deactivate: (id: string) => request<MyGroupsResponse>(`/api/groups/${enc(id)}/deactivate`, { method: "POST" }),
    reactivate: (id: string) => request<MyGroupsResponse>(`/api/groups/${enc(id)}/reactivate`, { method: "POST" }),
    /** The owner deletes the group for good (its stories too). */
    delete: (id: string) => request<MyGroupsResponse>(`/api/groups/${enc(id)}`, { method: "DELETE" }),
  },

  /* ─────────────── Editor Desk (admins only: 403 `admin_only` otherwise) ─────────────── */

  admin: {
    /** Group account applications (owner 2026-10-23): pending first. */
    groups: (signal?: AbortSignal) => request<{ items: AdminGroupApplication[] }>("/api/admin/groups", { signal }),
    groupDetail: (applicationId: string, signal?: AbortSignal) =>
      request<AdminGroupDetail>(`/api/admin/groups/${enc(applicationId)}/detail`, { signal }),
    deleteGroup: (applicationId: string) =>
      request<{ items: AdminGroupApplication[] }>(`/api/admin/groups/${enc(applicationId)}/group`, { method: "DELETE" }),
    decideGroup: (id: string, decision: "approve" | "reject", note?: string) =>
      request<{ items: AdminGroupApplication[] }>(`/api/admin/groups/${enc(id)}/${decision}`, { method: "POST", body: { note } }),
    /** GET /api/admin/memberships — totals, what each reporter is owed, payments, payouts (owner 2026-10-15). */
    memberships: (signal?: AbortSignal) => request<AdminMemberships>("/api/admin/memberships", { signal }),
    /** GET / PUT /api/admin/membership-rules — who may start a premium membership (owner 2026-10-16). */
    membershipRules: (signal?: AbortSignal) => request<AdminMembershipRules>("/api/admin/membership-rules", { signal }),
    setMembershipRules: (rules: MembershipRule[]) =>
      request<AdminMembershipRules>("/api/admin/membership-rules", { method: "PUT", body: { rules } }),
    /** GET /api/admin/live — who's on WebNEWS right now (owner 2026-10-16). */
    live: (signal?: AbortSignal) => request<LiveVisitors>("/api/admin/live", { signal }),
    /** GET /api/admin/behaviour?days= — Desk → Behaviour (owner 2026-10-16). */
    behaviour: (days: number, signal?: AbortSignal) => request<BehaviourOverview>(`/api/admin/behaviour${query({ days })}`, { signal }),
    /** GET /api/admin/behaviour/people/:username — one person's behaviour. */
    personBehaviour: (username: string, signal?: AbortSignal) =>
      request<PersonBehaviour>(`/api/admin/behaviour/people/${enc(username)}`, { signal }),
    /** POST /api/admin/memberships/payouts — record money sent to a reporter; returns the refreshed dashboard. */
    recordPayout: (input: MembershipPayoutInput) => request<AdminMemberships>("/api/admin/memberships/payouts", { method: "POST", body: input }),
    overview: (tz: string = browserTimeZone(), signal?: AbortSignal) =>
      request<AdminOverview>(`/api/admin/overview${query({ tz })}`, { signal }),

    /** Review Desk queue (oldest submission first). */
    reviewQueue: (cursor?: string | null, signal?: AbortSignal) =>
      request<Page<AdminStoryRow>>(`/api/admin/review${query({ cursor })}`, { signal }),
    approve: (id: string, note?: string) =>
      request<ReviewApproveResult>(`/api/admin/review/${enc(id)}/approve`, { method: "POST", body: { note } }),
    /** Back to the reporter's drafts with a (required) note. */
    returnStory: (id: string, note: string) =>
      request<{ story: AdminStoryRow }>(`/api/admin/review/${enc(id)}/return`, { method: "POST", body: { note } }),

    stories: (params: AdminStoriesQuery = {}, signal?: AbortSignal) =>
      request<Page<AdminStoryRow>>(`/api/admin/stories${query(params)}`, { signal }),
    story: (id: string, signal?: AbortSignal) => request<AdminStoryDetailResponse>(`/api/admin/stories/${enc(id)}`, { signal }),
    hide: (id: string, reason: string) =>
      request<{ story: AdminStoryRow }>(`/api/admin/stories/${enc(id)}/hide`, { method: "POST", body: { reason } }),
    unhide: (id: string) => request<{ story: AdminStoryRow }>(`/api/admin/stories/${enc(id)}/unhide`, { method: "POST" }),
    unpublish: (id: string, reason?: string) =>
      request<{ story: AdminStoryRow }>(`/api/admin/stories/${enc(id)}/unpublish`, { method: "POST", body: { reason } }),
    deleteStory: (id: string, reason?: string) =>
      request<void>(`/api/admin/stories/${enc(id)}${query({ reason })}`, { method: "DELETE" }),

    /** Editor's Picks (max 3, ordered) — every call returns the current picks. 409 `pin_limit` / `not_published`. */
    pins: (signal?: AbortSignal) => request<{ items: AdminStoryRow[] }>("/api/admin/stories/pins", { signal }),
    pin: (id: string) => request<{ items: AdminStoryRow[] }>(`/api/admin/stories/${enc(id)}/pin`, { method: "POST" }),
    unpin: (id: string) => request<{ items: AdminStoryRow[] }>(`/api/admin/stories/${enc(id)}/unpin`, { method: "POST" }),
    /** `ids` = every current pick exactly once, in the new order (400 `invalid_order`). */
    reorderPins: (ids: string[]) =>
      request<{ items: AdminStoryRow[] }>("/api/admin/stories/pins/reorder", { method: "POST", body: { ids } }),

    /** Contact us messages (owner 2026-10-10): new (no reply yet), replied or all, newest first. */
    inbox: (status: DeskContactStatus = "new", signal?: AbortSignal) =>
      request<{ items: DeskContactMessage[] }>(`/api/admin/inbox${query({ status })}`, { signal }),
    /** Replies to a message: saved, marked answered and emailed to the member. */
    replyInbox: (id: string, reply: string) =>
      request<DeskContactMessage>(`/api/admin/inbox/${enc(id)}/reply`, { method: "POST", body: { reply } }),
    /** Flags grouped by story (newest report first). */
    flags: (status: AdminFlagsStatus = "open", cursor?: string | null, signal?: AbortSignal) =>
      request<Page<AdminFlagGroup>>(`/api/admin/flags${query({ status, cursor })}`, { signal }),
    /** Resolves every open flag on a story: dismiss · hide the story · warn · suspend the reporter. */
    resolveFlags: (articleId: string, action: FlagResolutionAction, note?: string) =>
      request<ResolveFlagsResult>(`/api/admin/flags/${enc(articleId)}/resolve`, { method: "POST", body: { action, note } }),

    reporters: (params: AdminReportersQuery = {}, signal?: AbortSignal) =>
      request<Page<AdminReporterRow>>(`/api/admin/reporters${query(params)}`, { signal }),
    /** verify (also reinstates a revoked pass) · downgrade (to Trainee, approvals restart) · revoke (back to Reader). */
    reporterAction: (userId: string, action: "verify" | "downgrade" | "revoke", reason?: string) =>
      request<{ reporter: AdminReporterRow }>(`/api/admin/reporters/${enc(userId)}/${action}`, { method: "POST", body: { reason } }),

    users: (params: AdminUsersQuery = {}, signal?: AbortSignal) =>
      request<Page<AdminUserRow>>(`/api/admin/users${query(params)}`, { signal }),
    /** 400 `cannot_modify_self` for your own account. */
    setRole: (userId: string, role: Role) =>
      request<{ user: AdminUserRow }>(`/api/admin/users/${enc(userId)}/role`, { method: "POST", body: { role } }),
    /** Revokes every session; sign-in then fails with `ACCOUNT_SUSPENDED`. 409 `cannot_suspend_admin`. */
    suspend: (userId: string, reason: string) =>
      request<{ user: AdminUserRow }>(`/api/admin/users/${enc(userId)}/suspend`, { method: "POST", body: { reason } }),
    unsuspend: (userId: string) =>
      request<{ user: AdminUserRow }>(`/api/admin/users/${enc(userId)}/unsuspend`, { method: "POST" }),
    /** The account and everything it owns, for good. 409 `cannot_delete_admin` / `cannot_modify_self`. */
    deleteUser: (userId: string) => request<{ stories: number }>(`/api/admin/users/${enc(userId)}`, { method: "DELETE" }),

    spotlightOrders: (status: AdminOrdersStatus = "pending", cursor?: string | null, signal?: AbortSignal) =>
      request<Page<AdminSpotlightOrder>>(`/api/admin/spotlight/orders${query({ status, cursor })}`, { signal }),
    /** Grant = comped / paid by hand: the boost runs from now for the package's hours. 409 `not_pending`. */
    grantSpotlight: (orderId: string, note?: string) =>
      request<{ order: AdminSpotlightOrder }>(`/api/admin/spotlight/orders/${enc(orderId)}/grant`, { method: "POST", body: { note } }),
    declineSpotlight: (orderId: string, note?: string) =>
      request<{ order: AdminSpotlightOrder }>(`/api/admin/spotlight/orders/${enc(orderId)}/decline`, { method: "POST", body: { note } }),
    /** Every package, inactive ones included. */
    spotlightPackages: (signal?: AbortSignal) =>
      request<{ items: SpotlightPackage[] }>("/api/admin/spotlight/packages", { signal }),
    createPackage: (input: SpotlightPackageInput) =>
      request<{ package: SpotlightPackage }>("/api/admin/spotlight/packages", { method: "POST", body: input }),
    updatePackage: (id: string, input: SpotlightPackageUpdateInput) =>
      request<{ package: SpotlightPackage }>(`/api/admin/spotlight/packages/${enc(id)}`, { method: "PATCH", body: input }),
    deletePackage: (id: string) => request<void>(`/api/admin/spotlight/packages/${enc(id)}`, { method: "DELETE" }),

    /** Press meets (owner 2026-10-05): the platform fee organizers pay to book, and every press meet with its report. */
    platformFee: (signal?: AbortSignal) => request<AdminPlatformFee>("/api/admin/press-meets/platform-fee", { signal }),
    setPlatformFee: (amountInr: number) =>
      request<AdminPlatformFee>("/api/admin/press-meets/platform-fee", { method: "PUT", body: { amountInr } }),
    pressMeets: (cursor?: string | null, signal?: AbortSignal) =>
      request<{ items: AdminPressMeetRow[]; nextCursor: string | null }>(`/api/admin/press-meets${query({ cursor })}`, { signal }),

    /** Reporter activity, newest first (owner 2026-10-31); `q` = a username or story title. */
    activity: (params: { cursor?: string | null; q?: string } = {}, signal?: AbortSignal) =>
      request<Page<ContentLogEntry>>(`/api/admin/activity${query({ cursor: params.cursor, q: params.q || undefined })}`, { signal }),
    /** Audit log, newest first. `action` filters by prefix ("story." / "user.role"), `target` by target id. */
    audit: (params: AdminAuditQuery = {}, signal?: AbortSignal) =>
      request<Page<AuditEntry>>(`/api/admin/audit${query(params)}`, { signal }),
  },
};

export type Api = typeof api;

/** The browser's IANA time zone (Newsroom / Editor Desk day boundaries); India time when unknown. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
  } catch {
    return "Asia/Kolkata";
  }
}

