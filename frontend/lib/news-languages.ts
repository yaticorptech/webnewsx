/**
 * The reader's saved Languages pick (owner 2026-11-05: stays until they change it, and the address stays "/" — no
 * /language/… in the URL). A cookie, so Home's server render shows their languages straight away on refresh / app reopen.
 */
export const NEWS_LANGUAGES_COOKIE = "wn_news_langs";

const YEAR = 60 * 60 * 24 * 365;

export function saveNewsLanguages(codes: readonly string[]): void {
  document.cookie = codes.length
    ? `${NEWS_LANGUAGES_COOKIE}=${codes.join(",")}; Path=/; Max-Age=${YEAR}; SameSite=Lax`
    : `${NEWS_LANGUAGES_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function hasSavedNewsLanguages(): boolean {
  return document.cookie.split("; ").some((part) => part.startsWith(`${NEWS_LANGUAGES_COOKIE}=`) && part.length > NEWS_LANGUAGES_COOKIE.length + 1);
}

/** The saved codes, as raw strings (callers keep only known languages). */
export function readNewsLanguages(cookieValue: string | undefined | null): string[] {
  return (cookieValue ?? "").split(",").filter(Boolean);
}

/** Client side: the saved codes, as raw strings. */
export function savedNewsLanguages(): string[] {
  const part = document.cookie.split("; ").find((p) => p.startsWith(`${NEWS_LANGUAGES_COOKIE}=`));
  return readNewsLanguages(part?.slice(NEWS_LANGUAGES_COOKIE.length + 1));
}
