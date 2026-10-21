import {
  CATEGORY_LABELS,
  NEWS_LANGUAGES,
  PRESS_LANGUAGE_LABELS,
  categoryLabel,
  type ArticleCard,
  type Category,
  type FeedTab,
  type PressLanguage,
} from "@/lib/shared/contracts";

/**
 * What a feed shows (owner 2026-09-26: the category nav replaced For You / Latest):
 *  - "/" = Home: every category, newest first (owner 2026-09-28: "always newest first" — it used to be the ranked
 *    For You mix; `/api/feed?tab=foryou` still exists); "/?tab=following" = reporters you follow;
 *    "/?tab=latest" still works for old links (the same list as Home);
 *  - "/category/<category>" = one category, "/category/karnataka/<district>" = one Karnataka district —
 *    newest first.
 */
export type FeedView =
  | { kind: "tab"; tab: FeedTab }
  | { kind: "category"; category: Category; district: string | null }
  /** The news in one or more languages (owner 2026-10-05, the Languages menu): /language/<code>[,<code>…]. */
  | { kind: "language"; languages: PressLanguage[] };

export const LATEST_VIEW: FeedView = { kind: "tab", tab: "latest" };
/** Home is the Latest list (newest first). */
export const HOME_VIEW: FeedView = LATEST_VIEW;
export const FOLLOWING_VIEW: FeedView = { kind: "tab", tab: "following" };

/**
 * Pages that show a feed of every story or one category ("/" with any ?tab=, "/category/…") — as YouTube-style cards
 * or as full-screen reels, whichever the visitor picked with the switch beside Home (lib/feed-layout.ts).
 */
export function isFeedPath(pathname: string): boolean {
  return pathname === "/" || pathname.startsWith("/category/") || pathname.startsWith("/language/");
}

/** "Hindi", "Hindi and Tamil", "Hindi, Tamil and Kannada". */
export function languagesLabel(languages: readonly PressLanguage[]): string {
  const names = languages.map((code) => PRESS_LANGUAGE_LABELS[code]);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** `/language/hi,ta` → its languages in menu order (unknown codes dropped; none → null). */
export function parseLanguages(segment: string): PressLanguage[] | null {
  const picked = new Set(decodeURIComponent(segment).split(","));
  const languages = NEWS_LANGUAGES.filter((code) => picked.has(code));
  return languages.length > 0 ? languages : null;
}

/** `?tab=` on "/" → its view (anything else → Home). */
export function parseHomeTab(value: string | string[] | undefined | null): FeedView {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "following") return FOLLOWING_VIEW;
  if (raw === "latest") return LATEST_VIEW;
  return HOME_VIEW;
}

/** Cache id: "foryou" · "following" · "latest" · "category:sports" · "category:karnataka:Mysuru". */
export function viewId(view: FeedView): string {
  if (view.kind === "tab") return view.tab;
  if (view.kind === "language") return `language:${view.languages.join(",")}`;
  return view.district ? `category:${view.category}:${view.district}` : `category:${view.category}`;
}

/** `GET /api/feed` parameters for a view. */
export function viewQuery(view: FeedView): { tab?: FeedTab; category?: Category; district?: string | null; languages?: PressLanguage[] } {
  if (view.kind === "language") return { languages: view.languages };
  return view.kind === "tab" ? { tab: view.tab } : { category: view.category, district: view.district };
}

/** Latest and the category pages come in a fresh shuffled mix on every visit (lib/shuffle.ts, owner 2026-10-05). */
export const isShuffled = (view: FeedView) =>
  view.kind === "category" || view.kind === "language" || (view.kind === "tab" && view.tab === "latest");

/** Ranked (For You) pages share one snapshot and aren't chronological. */
export const isRanked = (view: FeedView) => view.kind === "tab" && view.tab === "foryou";

/** Every feed a newly published story belongs in — except Following, which depends on the viewer. */
export function viewsOfCard(card: ArticleCard): FeedView[] {
  // Home and Latest are one list.
  const views: FeedView[] = [LATEST_VIEW];
  if (card.language) views.push({ kind: "language", languages: [card.language] });
  if (card.category) {
    views.push({ kind: "category", category: card.category, district: null });
    if (card.district) views.push({ kind: "category", category: card.category, district: card.district });
  }
  return views;
}

/** Heading (visually hidden — the nav shows where you are), list label and empty-state kicker. */
export function viewCopy(view: FeedView): { heading: string; listLabel: string; kicker: string } {
  if (view.kind === "language") {
    const label = languagesLabel(view.languages);
    return { heading: `${label} news`, listLabel: `Stories in ${label}`, kicker: label };
  }
  if (view.kind === "category") {
    const label = categoryLabel(view.category, view.district);
    return { heading: label, listLabel: `${label} stories`, kicker: view.district ? view.district : CATEGORY_LABELS[view.category] };
  }
  if (view.tab === "following") {
    return { heading: "From reporters you follow", listLabel: "Stories from reporters you follow", kicker: "Following" };
  }
  if (view.tab === "latest") return { heading: "Latest stories", listLabel: "Latest stories from every section", kicker: "Home" };
  return { heading: "Top stories", listLabel: "Top stories from every section", kicker: "Home" };
}
