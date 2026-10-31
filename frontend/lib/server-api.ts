import "server-only";

import type { MarketResponse, SiteArticle, SiteHome } from "@/lib/shared/contracts";

import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import {
  EXPERIENCE_LABELS,
  EXPERIENCE_VALUES,
  INDIAN_REGIONS,
  KARNATAKA_DISTRICTS,
  PRESS_LANGUAGE_LABELS,
  PRESS_LANGUAGE_VALUES,
  PRESS_PASS_LIMITS,
  PRESS_PLEDGE,
  REPORTER_TYPE_HINTS,
  PRESS_ID_HINTS,
  PRESS_ID_TYPE_LABELS,
  PRESS_ID_TYPE_VALUES,
  REPORTER_TYPE_LABELS,
  REPORTER_TYPE_VALUES,
  type AdminAuditQuery,
  type AdminFlagGroup,
  type AdminFlagsStatus,
  type AdminOrdersStatus,
  type AdminOverview,
  type AdminPlatformFee,
  type AdminPressMeetRow,
  type AdminReporterRow,
  type AdminReportersQuery,
  type AdminSpotlightOrder,
  type AdminStoriesQuery,
  type AdminStoryDetailResponse,
  type AdminStoryRow,
  type AdminUserRow,
  type AdminUsersQuery,
  type ApiErrorBody,
  type ArticleCard,
  type ArticleDetail,
  type AuditEntry,
  type Category,
  type DraftCard,
  type FeedTab,
  type Headline,
  type NewsroomBestTimes,
  type NewsroomRange,
  type NewsroomSeries,
  type NewsroomSpotlight,
  type NewsroomStory,
  type NewsroomSummary,
  type OwnedArticle,
  type Page,
  type PressLanguage,
  type PressPass,
  type PressPassOptions,
  type PressPassResponse,
  type ProfileData,
  type SitemapData,
  type SpotlightPackage,
  type TrendingHeadline,
  type UserRow,
  type ViewerUser,
} from "./shared/contracts";

/**
 * Server-side access to the WebNEWS API. Server Components call the backend directly at
 * BACKEND_URL and forward the visitor's cookie (Better Auth session) and client IP.
 * The frontend never touches the database.
 */

const BACKEND_URL = (process.env.BACKEND_URL || "http://127.0.0.1:4000").replace(/\/+$/, "");
/** Backend: answer as for a logged-out visitor (see backend middleware/session.ts). */
const VIEW_AS_VISITOR_HEADER = "x-webnews-view-as";
const DEFAULT_TIMEOUT_MS = 8_000;

/* ─────────────────────────── Errors ─────────────────────────── */

/** Non-2xx response from the backend. */
export class ServerApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "ServerApiError";
    this.status = status;
    this.code = code;
    if (fields) this.fields = fields;
  }
}

/** The backend could not be reached (connection refused, DNS, timeout). `status` is 0. */
export class BackendUnavailableError extends ServerApiError {
  constructor(path: string, cause: unknown) {
    super(0, "backend_unavailable", `WebNEWS API unreachable (${path})`);
    this.name = "BackendUnavailableError";
    this.cause = cause;
  }
}

/* ─────────────────────────── Core fetch ─────────────────────────── */

export type ServerFetchInit = Omit<RequestInit, "body"> & {
  /** Plain objects are JSON-encoded; BodyInit values are sent as-is. */
  body?: unknown;
  timeoutMs?: number;
  /** Forward the incoming cookie / user-agent headers and the client address (default true). */
  forwardRequestHeaders?: boolean;
  /** Keep an admin's own identity (the Editor Desk editing a story in the composer) instead of fetching as a visitor. */
  asAdmin?: boolean;
};

function isBodyInit(value: unknown): value is BodyInit {
  return (
    typeof value === "string" ||
    value instanceof FormData ||
    value instanceof URLSearchParams ||
    value instanceof Blob ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    value instanceof ReadableStream
  );
}

/**
 * `fetch(`${BACKEND_URL}${path}`)` with cookie forwarding, `cache: "no-store"`, a timeout and
 * typed errors. Throws ServerApiError (non-2xx) or BackendUnavailableError (network).
 * Returns `undefined` for 204.
 */
export async function serverFetch<T>(path: string, init: ServerFetchInit = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, forwardRequestHeaders = true, asAdmin = false, body, headers: extra, signal, ...rest } = init;

  const outgoing = new Headers(extra);
  if (!outgoing.has("accept")) outgoing.set("accept", "application/json");

  if (forwardRequestHeaders) {
    const incoming = await headers();
    for (const name of ["cookie", "user-agent", "accept-language"]) {
      const value = incoming.get(name);
      if (value && !outgoing.has(name)) outgoing.set(name, value);
    }
    // Only the address this server saw (the last hop — proxy.ts drops browser-written X-Forwarded-For unless an
    // edge proxy we trust set it), never a chain the browser could have written.
    const clientIp = incoming.get("x-forwarded-for")?.split(",").at(-1)?.trim();
    if (clientIp && !outgoing.has("x-forwarded-for")) outgoing.set("x-forwarded-for", clientIp);
    // "Visit site" (owner rule 2026-09-25): an admin sees the site exactly as a logged-out visitor does, so site
    // data is fetched as one. The console's own calls (/api/admin/*) and the viewer lookup itself are left alone.
    // Only a request carrying a session can be an admin's, so logged-out traffic never waits for the lookup.
    const hasSession = incoming.get("cookie")?.includes("session_token") ?? false;
    if (hasSession && !asAdmin && path !== "/api/me" && !path.startsWith("/api/admin") && (await getViewer())?.role === "admin") {
      outgoing.set(VIEW_AS_VISITOR_HEADER, "visitor");
    }
  }

  let payload: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    if (isBodyInit(body)) {
      payload = body;
    } else {
      payload = JSON.stringify(body);
      outgoing.set("content-type", "application/json");
    }
  }

  const timeout = AbortSignal.timeout(timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      ...rest,
      body: payload,
      headers: outgoing,
      cache: "no-store",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    throw new BackendUnavailableError(path, error);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const err = (data as Partial<ApiErrorBody> | null)?.error;
    throw new ServerApiError(res.status, err?.code ?? `http_${res.status}`, err?.message ?? res.statusText, err?.fields);
  }
  return data as T;
}

/* ─────────────────────────── Helpers ─────────────────────────── */

const EMPTY_PAGE = Object.freeze({ items: [], nextCursor: null }) as Readonly<Page<never>>;
const emptyPage = <T>(): Page<T> => ({ items: [...EMPTY_PAGE.items], nextCursor: null });

function logFailure(label: string, error: unknown): void {
  const detail = error instanceof ServerApiError ? `${error.status} ${error.code}` : String(error);
  console.warn(`[server-api] ${label} failed: ${detail}`);
}

/** Runs `fn`; on failure logs and returns `fallback`. Next.js control-flow errors are rethrown. */
async function soft<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    unstable_rethrow(error);
    logFailure(label, error);
    return fallback;
  }
}

/** Returns null on 404 (and 403 when `forbiddenAsNull`); throws on anything else. */
async function orNull<T>(fn: () => Promise<T>, forbiddenAsNull = false): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    unstable_rethrow(error);
    if (
      error instanceof ServerApiError &&
      (error.status === 404 || (forbiddenAsNull && (error.status === 403 || error.status === 401)))
    ) {
      return null;
    }
    throw error;
  }
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

/* ─────────────────────────── Loaders ─────────────────────────── */

/** Every public story and publisher (sitemaps). Never tied to a visitor, so nothing is forwarded. */
export async function getSitemapData(): Promise<SitemapData> {
  return soft("getSitemapData", { articles: [], publishers: [] }, () =>
    serverFetch<SitemapData>("/api/sitemap", { forwardRequestHeaders: false, timeoutMs: 15_000 }),
  );
}

/** Current viewer (deduped per request). Null when logged out or when the backend is down. */
export const getViewer = cache(
  async (): Promise<ViewerUser | null> =>
    soft("getViewer", null, async () => (await serverFetch<{ viewer: ViewerUser | null }>("/api/me")).viewer ?? null),
);

/**
 * First/next page of a feed: Home / Following / Latest (`tab`), or a category (+ Karnataka district). THROWS when
 * the backend fails or is unreachable, so the page shows the error boundary ("Signal lost · Try again") — an empty
 * page would read as "nobody has published yet".
 */
export async function getFeedPage({
  tab = "foryou",
  category,
  district,
  cursor,
  shuffle,
  languages,
}: {
  tab?: FeedTab;
  category?: Category;
  district?: string | null;
  cursor?: string | null;
  shuffle?: string | null;
  languages?: PressLanguage[] | null;
} = {}): Promise<Page<ArticleCard>> {
  const params = languages?.length
    ? query({ language: languages.join(","), cursor, shuffle })
    : category
      ? query({ category, district, cursor, shuffle })
      : query({ tab, cursor, shuffle });
  return serverFetch<Page<ArticleCard>>(`/api/feed${params}`);
}

export type ArticlePageData = { article: ArticleDetail; moreFromAuthor: ArticleCard[] };

/**
 * Published article by slug (deduped per request, for generateMetadata + page).
 * Null → 404. THROWS when the backend is unreachable so the page shows the error boundary
 * instead of a misleading "not found".
 */
export const getArticleBySlug = cache(
  async (slug: string): Promise<ArticlePageData | null> =>
    orNull(() => serverFetch<ArticlePageData>(`/api/articles/by-slug/${enc(slug)}`)),
);

/** Public profile (deduped per request). Null → 404. THROWS when the backend is unreachable. */
export const getProfile = cache(
  async (username: string): Promise<ProfileData | null> =>
    orNull(() => serverFetch<ProfileData>(`/api/users/${enc(username)}`)),
);

/** Published articles of a user. Fails soft to an empty page. */
export async function getUserArticles(username: string, cursor?: string | null): Promise<Page<ArticleCard>> {
  return soft(`getUserArticles(${username})`, emptyPage<ArticleCard>(), () =>
    serverFetch<Page<ArticleCard>>(`/api/users/${enc(username)}/articles${query({ status: "published", cursor })}`),
  );
}

/** The viewer's own drafts. Empty page for non-owners or when the backend is down. */
export async function getUserDrafts(username: string, cursor?: string | null): Promise<Page<DraftCard>> {
  return soft(`getUserDrafts(${username})`, emptyPage<DraftCard>(), () =>
    serverFetch<Page<DraftCard>>(`/api/users/${enc(username)}/drafts${query({ cursor })}`),
  );
}

/**
 * One of the viewer's own articles for the composer (`/publish/[id]`), draft or published.
 * Null on 404/403/401 (not the owner / logged out). THROWS when the backend is unreachable.
 */
export const getOwnedArticle = cache(
  async (id: string): Promise<OwnedArticle | null> =>
    // asAdmin: the Editor Desk opens anyone's story here (owner 2026-10-31).
    orNull(async () => (await serverFetch<{ article: OwnedArticle }>(`/api/articles/${enc(id)}`, { asAdmin: true })).article, true),
);

export async function getFollowers(username: string, cursor?: string | null): Promise<Page<UserRow>> {
  return soft(`getFollowers(${username})`, emptyPage<UserRow>(), () =>
    serverFetch<Page<UserRow>>(`/api/users/${enc(username)}/followers${query({ cursor })}`),
  );
}

export async function getFollowing(username: string, cursor?: string | null): Promise<Page<UserRow>> {
  return soft(`getFollowing(${username})`, emptyPage<UserRow>(), () =>
    serverFetch<Page<UserRow>>(`/api/users/${enc(username)}/following${query({ cursor })}`),
  );
}

/** Latest headlines for the ticker and Live Wire (deduped per request). Fails soft to []. */
export const getLatestHeadlines = cache(
  async (limit = 12): Promise<Headline[]> =>
    soft("getLatestHeadlines", [] as Headline[], async () =>
      (await serverFetch<{ items: Headline[] }>(`/api/feed/headlines${query({ limit })}`)).items ?? [],
    ),
);

/** The /trending page's list. THROWS on failure (error boundary) instead of pretending nothing is trending. */
export async function getTrendingPage(limit: number): Promise<TrendingHeadline[]> {
  return (await serverFetch<{ items: TrendingHeadline[] }>(`/api/feed/trending${query({ limit })}`)).items ?? [];
}

/** The Market page's quotes for the first paint (fails soft to null: the page then loads them itself). */
export async function getMarket(): Promise<MarketResponse | null> {
  return orNull(() => serverFetch<MarketResponse>("/api/market"));
}

/** "Trending now" rail items (deduped per request). Fails soft to []. */
export const getTrending = cache(
  async (limit = 5): Promise<TrendingHeadline[]> =>
    soft("getTrending", [] as TrendingHeadline[], async () =>
      (await serverFetch<{ items: TrendingHeadline[] }>(`/api/feed/trending${query({ limit })}`)).items ?? [],
    ),
);

/** Top publishers by followers (deduped per request). Fails soft to []. */
export const getTopPublishers = cache(
  async (limit = 5): Promise<UserRow[]> =>
    soft("getTopPublishers", [] as UserRow[], async () =>
      (await serverFetch<{ items: UserRow[] }>(`/api/users/top${query({ limit })}`)).items ?? [],
    ),
);

/* ─────────────────────────── Roles (SPEC §3.11) ─────────────────────────── */

/** Same lists the backend serves at /api/press-pass/options (both come from the shared contract). */
const LOCAL_PRESS_PASS_OPTIONS: PressPassOptions = {
  reporterTypes: REPORTER_TYPE_VALUES.map((value) => ({ value, label: REPORTER_TYPE_LABELS[value], hint: REPORTER_TYPE_HINTS[value] })),
  idTypes: PRESS_ID_TYPE_VALUES.map((value) => ({ value, label: PRESS_ID_TYPE_LABELS[value], hint: PRESS_ID_HINTS[value] })),
  experience: EXPERIENCE_VALUES.map((value) => ({ value, label: EXPERIENCE_LABELS[value] })),
  languages: PRESS_LANGUAGE_VALUES.map((value) => ({ value, label: PRESS_LANGUAGE_LABELS[value] })),
  regions: [...INDIAN_REGIONS],
  districts: { KA: KARNATAKA_DISTRICTS },
  pledge: PRESS_PLEDGE,
  limits: PRESS_PASS_LIMITS,
};

/** Press Pass form lists. Falls back to the contract's own copy when the API is down (never fails). */
export const getPressPassOptions = cache(
  async (): Promise<PressPassOptions> =>
    soft("getPressPassOptions", LOCAL_PRESS_PASS_OPTIONS, () => serverFetch<PressPassOptions>("/api/press-pass/options")),
);

/** The viewer's Press Pass (active or revoked). Null when they have none or are logged out. THROWS when the backend is down. */
export const getPressPass = cache(
  async (): Promise<PressPass | null> =>
    (await orNull(async () => (await serverFetch<PressPassResponse>("/api/press-pass")).pressPass, true)) ?? null,
);

/** The viewer's "Saved" tab. Fails soft to an empty page. */
export async function getSaved(cursor?: string | null): Promise<Page<ArticleCard>> {
  return soft("getSaved", emptyPage<ArticleCard>(), () => serverFetch<Page<ArticleCard>>(`/api/me/saved${query({ cursor })}`));
}

/** Active Spotlight packages (public price list). Fails soft to []. */
export const getSpotlightPackages = cache(
  async (): Promise<SpotlightPackage[]> =>
    soft("getSpotlightPackages", [] as SpotlightPackage[], async () =>
      (await serverFetch<{ items: SpotlightPackage[] }>("/api/spotlight/packages")).items ?? [],
    ),
);

/*
 * Newsroom (reporters). Pages call these after `requireReporter()`; they THROW on failure (error boundary).
 * `tz` = IANA time zone for day/hour buckets — the server doesn't know the browser's, so the backend default
 * (Asia/Kolkata) applies unless a client component refetches with its own.
 */
export function getNewsroomSummary(range: NewsroomRange = 7): Promise<NewsroomSummary> {
  return serverFetch<NewsroomSummary>(`/api/newsroom/summary${query({ range })}`);
}

export function getNewsroomSeries(range: NewsroomRange = 7, tz?: string): Promise<NewsroomSeries> {
  return serverFetch<NewsroomSeries>(`/api/newsroom/series${query({ range, tz })}`);
}

export function getNewsroomStories(cursor?: string | null): Promise<Page<NewsroomStory>> {
  return serverFetch<Page<NewsroomStory>>(`/api/newsroom/stories${query({ cursor })}`);
}

export function getNewsroomBestTimes(tz?: string): Promise<NewsroomBestTimes> {
  return serverFetch<NewsroomBestTimes>(`/api/newsroom/best-times${query({ tz })}`);
}

export function getNewsroomSpotlight(): Promise<NewsroomSpotlight> {
  return serverFetch<NewsroomSpotlight>("/api/newsroom/spotlight");
}

/* Editor Desk (admins). Pages call these after `requireAdmin()`; they THROW on failure (error boundary). */

export function getAdminOverview(tz?: string): Promise<AdminOverview> {
  return serverFetch<AdminOverview>(`/api/admin/overview${query({ tz })}`);
}

export function getReviewQueue(cursor?: string | null): Promise<Page<AdminStoryRow>> {
  return serverFetch<Page<AdminStoryRow>>(`/api/admin/review${query({ cursor })}`);
}

export function getAdminStories(params: AdminStoriesQuery = {}): Promise<Page<AdminStoryRow>> {
  return serverFetch<Page<AdminStoryRow>>(`/api/admin/stories${query(params)}`);
}

/** One story with its flags; null for unknown ids. */
export const getAdminStory = cache(
  async (id: string): Promise<AdminStoryDetailResponse | null> =>
    orNull(() => serverFetch<AdminStoryDetailResponse>(`/api/admin/stories/${enc(id)}`)),
);

export async function getAdminPins(): Promise<AdminStoryRow[]> {
  return (await serverFetch<{ items: AdminStoryRow[] }>("/api/admin/stories/pins")).items;
}

export function getAdminFlags(status: AdminFlagsStatus = "open", cursor?: string | null): Promise<Page<AdminFlagGroup>> {
  return serverFetch<Page<AdminFlagGroup>>(`/api/admin/flags${query({ status, cursor })}`);
}

export function getAdminReporters(params: AdminReportersQuery = {}): Promise<Page<AdminReporterRow>> {
  return serverFetch<Page<AdminReporterRow>>(`/api/admin/reporters${query(params)}`);
}

export function getAdminUsers(params: AdminUsersQuery = {}): Promise<Page<AdminUserRow>> {
  return serverFetch<Page<AdminUserRow>>(`/api/admin/users${query(params)}`);
}

export function getAdminSpotlightOrders(status: AdminOrdersStatus = "pending", cursor?: string | null): Promise<Page<AdminSpotlightOrder>> {
  return serverFetch<Page<AdminSpotlightOrder>>(`/api/admin/spotlight/orders${query({ status, cursor })}`);
}

export function getAdminPlatformFee(): Promise<AdminPlatformFee> {
  return serverFetch<AdminPlatformFee>("/api/admin/press-meets/platform-fee");
}

export function getAdminPressMeets(): Promise<{ items: AdminPressMeetRow[]; nextCursor: string | null }> {
  return serverFetch<{ items: AdminPressMeetRow[]; nextCursor: string | null }>("/api/admin/press-meets");
}

export async function getAdminSpotlightPackages(): Promise<SpotlightPackage[]> {
  return (await serverFetch<{ items: SpotlightPackage[] }>("/api/admin/spotlight/packages")).items;
}

export function getAdminAudit(params: AdminAuditQuery = {}): Promise<Page<AuditEntry>> {
  return serverFetch<Page<AuditEntry>>(`/api/admin/audit${query(params)}`);
}

/** A publisher site's home page (owner 2026-10-29); null when no site is on that domain. */
/** A publisher site's home — or one menu section's page with `category`; null when there's no such site / section. */
export async function getSiteHome(domain: string, category?: string): Promise<SiteHome | null> {
  const section = category ? `/category/${encodeURIComponent(category)}` : "";
  try {
    return await serverFetch<SiteHome>(`/api/sites/d/${encodeURIComponent(domain)}${section}`, { forwardRequestHeaders: false });
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 404) return null;
    throw error;
  }
}

/** A story on a publisher site's layout; null when it isn't that site's. */
export async function getSiteArticle(domain: string, slug: string): Promise<SiteArticle | null> {
  try {
    return await serverFetch<SiteArticle>(`/api/sites/d/${encodeURIComponent(domain)}/articles/${encodeURIComponent(slug)}`, { forwardRequestHeaders: false });
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 404) return null;
    throw error;
  }
}
