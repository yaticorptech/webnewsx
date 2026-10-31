/*
 * Guided tour (owner 2026-10-22): four short guides, each offered where it's needed (Instagram style, owner
 * 2026-10-22: "not all in once"), each remembered on the device (localStorage — the app's WebView included):
 *
 *  - `basics`      first opening of the site or the app, on the feed: Reels, swipe, auto-scroll, News radio, Explore,
 *                  search, languages, Home. Per device.
 *  - `engage`      signed in, on the feed, once the basics are behind them: like, save, follow, comments, the bell, the
 *                  profile. Per account.
 *  - `press-pass`  a Reader arriving on the Press Pass page: the details, then the pledge. Per account.
 *  - `publish`     a reporter opening the composer for a new story: images, the story, publish. Per account.
 *
 * A guide is `done` at its end or `skipped` when declined / left early: neither is offered again on this device
 * (Settings → Help center → "Take the tour again" forgets them all). Pure: no `window` here (unit tested in
 * tests/unit/tour-storage.test.ts); the provider hands in the storage.
 */

/**
 * Page guides (owner 2026-10-22: "when every page opens, show that page's guide"): offered the first time someone opens
 * that page — PAGE_GUIDES says which page, and for whom.
 */
export type PageGuideId = "profile" | "edit-profile" | "settings" | "notifications" | "messages" | "press-meet" | "communities" | "newsroom" | "market";
export type GuideId = "basics" | "engage" | "press-pass" | "publish" | PageGuideId;
export type MemberGuide = Exclude<GuideId, "basics">;
export type TourMark = "done" | "skipped";

export type TourRecord = {
  basics?: TourMark;
  /** Page guides a visitor (signed out) has seen on this device (the Market page's, so far). */
  pages?: Partial<Record<GuideId, TourMark>>;
  /** The account guides, by account id. */
  members?: Record<string, Partial<Record<MemberGuide, TourMark>>>;
  /** Skipped a guide (owner 2026-10-31: "if a user skips the guide, don't show it again"): no guide is offered on this
   * device any more. Settings → Help center → "Take the tour again" clears it. */
  optOut?: true;
};

/** Mid-guide progress, kept per tab so a reload (the layout switch's rescue, the app) resumes where it was. */
export type TourProgress = { guide: GuideId; stepId: string; viewerId: string | null };

export const TOUR_KEY = "webnews:tour";
export const TOUR_PROGRESS_KEY = "webnews:tour-progress";
/** A feed guide (basics, engage) was offered in this tab's session: the next one waits for a fresh visit. */
export const TOUR_OFFERED_KEY = "webnews:tour-offered";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The account facts the guides depend on. */
export type TourViewer = { id: string; onboarded: boolean; username: string | null; role: string } | null;

export function readTour(storage: StorageLike | null): TourRecord {
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(TOUR_KEY) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as TourRecord) : {};
  } catch {
    return {};
  }
}

export function writeTour(storage: StorageLike | null, record: TourRecord): void {
  try {
    storage?.setItem(TOUR_KEY, JSON.stringify(record));
  } catch {
    // Not remembered (private mode): it may be offered again next time.
  }
}

export function clearTour(storage: StorageLike | null): void {
  try {
    storage?.removeItem(TOUR_KEY);
    storage?.removeItem(TOUR_PROGRESS_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** A signed-in, onboarded site account (the Editor Desk never tours: it doesn't use the site). */
export function toursAsMember(viewer: TourViewer): viewer is NonNullable<TourViewer> {
  return Boolean(viewer && viewer.onboarded && viewer.username && viewer.role !== "admin");
}

/** This guide has been done or declined (for the account guides: by this account; signed out: on this device). */
export function isMarked(record: TourRecord, guide: GuideId, viewerId: string | null): boolean {
  if (guide === "basics") return record.basics !== undefined;
  if (viewerId === null) return record.pages?.[guide] !== undefined;
  return record.members?.[viewerId]?.[guide] !== undefined;
}

/** The record with `guide` marked (`viewerId`: whose account guide it is; ignored for the basics). */
export function markGuide(record: TourRecord, guide: GuideId, viewerId: string | null, mark: TourMark): TourRecord {
  if (guide === "basics") return { ...record, basics: mark };
  if (!viewerId) return isPageGuide(guide) ? { ...record, pages: { ...record.pages, [guide]: mark } } : record;
  return { ...record, members: { ...record.members, [viewerId]: { ...record.members?.[viewerId], [guide]: mark } } };
}

export type OfferContext = {
  viewer: TourViewer;
  /** The account may publish (a Reporter or the Editor Desk). */
  canPublish: boolean;
  pathname: string;
  /** Home, a category or a language feed. */
  onFeed: boolean;
  record: TourRecord;
  /** A feed guide was already offered in this session. */
  feedOfferedThisSession: boolean;
};

/**
 * Which guide to offer here and now, or null. The page guides (Press Pass, publish) come first — they belong to the
 * page just opened; the feed guides wait their turn: the basics before anything, then, signed in, the engagement guide
 * (one feed guide per session, so nobody gets two welcomes in a row).
 */
export function guideToOffer({ viewer, canPublish, pathname, onFeed, record, feedOfferedThisSession }: OfferContext): GuideId | null {
  if (viewer?.role === "admin") return null;
  if (record.optOut) return null;
  const member = toursAsMember(viewer);
  const id = viewer?.id ?? null;
  for (const page of PAGE_GUIDES) {
    if (page.who === "members" && !member) continue;
    if (page.who === "readers" && (!member || canPublish)) continue;
    if (page.who === "publishers" && (!member || !canPublish)) continue;
    if (!page.match(pathname, member ? viewer.username : null)) continue;
    // A visitor's page guides are kept per device, a member's per account.
    return isMarked(record, page.guide, member ? id : null) ? null : page.guide;
  }
  if (!onFeed || feedOfferedThisSession) return null;
  if (!isMarked(record, "basics", id)) return "basics";
  if (member && !isMarked(record, "engage", id)) return "engage";
  return null;
}

/**
 * Which page offers which guide, and to whom: `members` = signed in; `readers` = signed in without a Press Pass;
 * `publishers` = Reporters (who may publish); `anyone` = visitors too.
 */
const PAGE_GUIDES: { guide: GuideId; who: "anyone" | "members" | "readers" | "publishers"; match: (pathname: string, username: string | null) => boolean }[] = [
  { guide: "press-pass", who: "readers", match: (p) => p === "/press-pass" },
  { guide: "publish", who: "publishers", match: (p) => p === "/publish" },
  { guide: "profile", who: "members", match: (p, username) => username !== null && p === `/${username}` },
  { guide: "edit-profile", who: "members", match: (p) => p === "/settings/profile" },
  { guide: "settings", who: "members", match: (p) => p === "/settings" },
  { guide: "notifications", who: "members", match: (p) => p === "/notifications" },
  { guide: "messages", who: "members", match: (p) => p === "/messages" },
  { guide: "press-meet", who: "members", match: (p) => p === "/press-meet" },
  { guide: "communities", who: "members", match: (p) => p === "/communities" },
  { guide: "newsroom", who: "publishers", match: (p) => p === "/newsroom" },
  { guide: "market", who: "anyone", match: (p) => p === "/market" },
];

/** The short guides of a single page: no closing card, a toast instead. */
export function isPageGuide(guide: GuideId): guide is PageGuideId {
  return !["basics", "engage", "press-pass", "publish"].includes(guide);
}

export function readProgress(storage: StorageLike | null): TourProgress | null {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(TOUR_PROGRESS_KEY) ?? "null") as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const p = parsed as Partial<TourProgress>;
    if (typeof p.guide !== "string" || typeof p.stepId !== "string") return null;
    return { guide: p.guide as GuideId, stepId: p.stepId, viewerId: p.viewerId ?? null };
  } catch {
    return null;
  }
}

export function writeProgress(storage: StorageLike | null, progress: TourProgress | null): void {
  try {
    if (progress) storage?.setItem(TOUR_PROGRESS_KEY, JSON.stringify(progress));
    else storage?.removeItem(TOUR_PROGRESS_KEY);
  } catch {
    // A reload then starts the guide over from its welcome.
  }
}
