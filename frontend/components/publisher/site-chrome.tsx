"use client";

import { ArrowUp, ImagePlus, Mail, Phone } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { SITE_LANGUAGE_COOKIE, type ArticleCard, type Category, type PublicSite, type SiteAdsByPosition, type SiteLanguage } from "@/lib/shared/contracts";
import { categoryName, dateLocale, siteBookHref, siteCategoryHref, tr } from "./site-i18n";
import { AdBooking, AdSlot } from "./ad-slot";
import { PUB_FONTS } from "./fonts";
import { COMPANY } from "@/lib/company";
import { SITE_NAME, TAGLINE, siteUrl } from "@/lib/config";

/** webnews.in's top-bar date and live clock, in the visitor's own zone, after hydration (the server's may differ). */
function useClock(lang: SiteLanguage) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (!now) return { today: "", todayShort: "", time: "" };
  const locale = dateLocale(lang);
  return {
    today: now.toLocaleDateString(locale, { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    todayShort: now.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }),
    time: now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
  };
}

/** The language toggle (webnews.in's "(EN)" / "(ಕನ್ನಡ)"): remembered for a year, then the page reloads in it. */
function switchLanguage(to: SiteLanguage) {
  document.cookie = `${SITE_LANGUAGE_COOKIE}=${to}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}

/** webnews.in's TOP_SLUGS count: the first categories are direct links, the rest go under "More". */
const DIRECT_CATEGORIES = 7;

/** The setup page's inline editing (owner 2026-10-29): only the logo, title and tagline change; the rest is fixed. */
export type ChromeEditor = {
  onLogo: () => void;
  onTitle: (value: string) => void;
  onTagline: (value: string) => void;
  titleMax: number;
  taglineMax: number;
  /** Required and still empty after a save attempt: outlined in red (owner 2026-10-30: all three are mandatory). */
  missing?: { logo: boolean; title: boolean; tagline: boolean };
};

type SiteChromeProps = {
  site: Pick<PublicSite, "domain" | "title" | "tagline" | "logoUrl" | "city" | "contactEmail" | "contactPhone" | "address">;
  /** Where the logo and Home lead (their domain; on WebNEWS's story page, back to it). */
  homeHref: string;
  ticker: ArticleCard[];
  /** Stories open at `<articleBase>/<slug>` (WebNEWS); null in the setup preview (links go nowhere). */
  articleBase: string | null;
  ads: SiteAdsByPosition;
  /** The menu after Home (owner 2026-10-30): the categories the site has stories in. */
  categories?: Category[];
  /** The section being read (its menu item is underlined); null on Home. */
  activeCategory?: Category | null;
  /** The interface language (the visitor's toggle, else the owner's default). */
  lang?: SiteLanguage;
  preview?: boolean;
  editor?: ChromeEditor;
  children: ReactNode;
};

/** A menu section's page: `<domain>/category/<category>` (no link anywhere in the setup preview). */
const categoryHref = (homeHref: string, category: Category) => (homeHref === "#" ? "#" : siteCategoryHref(homeHref, category));
const navItem = (active: boolean) =>
  `inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${
    active ? "border-pub text-pub" : "border-transparent text-gray-700 hover:text-pub"
  }`;

/**
 * A publisher site's frame in the webnews.in layout (its components/layout/Header.tsx + BreakingTicker + Footer): the
 * date bar, the masthead (logo-left ad · logo, title, tagline · logo-right ad), the breaking ticker, the sticky menu
 * (Home + the site's categories, owner 2026-10-30), the page, and the footer. Full width like webnews.in's container-wn.
 * An empty ad position shows webnews.in's "Advertise here" card, booked by mail to the site (AdBooking).
 */
export function SiteChrome({
  site,
  homeHref,
  ticker,
  articleBase,
  ads,
  categories = [],
  activeCategory = null,
  lang = "en",
  preview = false,
  editor,
  children,
}: SiteChromeProps) {
  const { today, todayShort, time } = useClock(lang);
  const other: SiteLanguage = lang === "kn" ? "en" : "kn";
  const kn = lang === "kn" ? "kn" : "";

  // The compact logo + clock in the menu bar once the masthead has scrolled away (webnews.in's Header).
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 150);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const bookHref = siteBookHref(site);
  const direct = categories.slice(0, DIRECT_CATEGORIES);
  const more = categories.slice(DIRECT_CATEGORIES);

  return (
    <AdBooking value={preview ? null : bookHref}>
    <div lang={lang} className={`${PUB_FONTS} min-h-dvh bg-white font-pub-sans text-pub-ink`}>
      <header className="border-b border-gray-200 bg-white">
        <div className="border-b border-gray-100 bg-white">
          <div className="pub-container flex h-9 items-center justify-between gap-2 whitespace-nowrap text-[11px] text-gray-500">
            <div className="flex min-w-0 items-center gap-2 truncate">
              <span className="truncate">
                <span className="sm:hidden">{todayShort}</span>
                <span className="hidden sm:inline">{today}</span>
              </span>
              {time && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="font-medium tabular-nums text-pub">{time}</span>
                </>
              )}
              {site.city && (
                <>
                  <span className="hidden text-gray-300 sm:inline">|</span>
                  <span className="hidden sm:inline">{site.city}</span>
                </>
              )}
            </div>
            <span className="shrink-0 truncate font-medium">{site.domain}</span>
          </div>
        </div>

        <div className="pub-container flex items-center justify-center gap-6 py-5">
          <div className="hidden flex-1 justify-end lg:flex">
            <AdSlot position="logo-left" ads={ads} preview={preview} className="w-full max-w-[320px]" />
          </div>

          <div className="flex min-w-0 flex-col items-center text-center">
            {editor ? (
              <button
                type="button"
                onClick={editor.onLogo}
                className="group relative flex min-h-14 min-w-40 items-center justify-center rounded-lg outline-2 outline-offset-4 outline-pub/0 transition hover:outline-dashed hover:outline-pub/60"
                aria-label={site.logoUrl ? "Change your logo" : "Add your logo"}
              >
                {site.logoUrl ? (
                  <img src={site.logoUrl} alt={site.title} className="h-12 w-auto max-w-[80vw] object-contain sm:h-[4.5rem] sm:max-w-[600px]" />
                ) : (
                  <span
                    className={`flex h-14 items-center gap-2 rounded-lg border-2 border-dashed px-5 text-sm font-bold text-pub ${
                      editor.missing?.logo ? "border-pub bg-pub/10 ring-4 ring-pub/15" : "border-pub/50 bg-pub/5"
                    }`}
                  >
                    <ImagePlus aria-hidden className="size-5" /> Add your logo <span aria-hidden>*</span>
                  </span>
                )}
                {site.logoUrl && (
                  <span className="absolute -bottom-2 -right-2 rounded-full bg-pub p-1.5 text-white opacity-0 shadow transition group-hover:opacity-100">
                    <ImagePlus aria-hidden className="size-3.5" />
                  </span>
                )}
              </button>
            ) : site.logoUrl ? (
              // webnews.in's masthead (owner 2026-10-30): the logo and the tagline only — no title beside a logo.
              <a href={homeHref} aria-label={`${site.title} home`}>
                <img src={site.logoUrl} alt={site.title} className="h-12 w-auto max-w-[80vw] object-contain sm:h-[4.5rem] sm:max-w-[600px]" />
              </a>
            ) : null}

            {editor ? (
              <>
                <input
                  value={site.title}
                  onChange={(e) => editor.onTitle(e.target.value)}
                  maxLength={editor.titleMax}
                  placeholder="Your site's title *"
                  aria-label="Title (required)"
                  aria-invalid={editor.missing?.title || undefined}
                  className={`${editor.missing?.title ? "border-pub! ring-4 ring-pub/15" : ""} mt-3 w-[min(32rem,80vw)] rounded-md border border-dashed border-transparent bg-transparent px-2 text-center font-pub-head text-3xl font-extrabold leading-tight text-pub-ink outline-none transition placeholder:text-gray-300 hover:border-pub/50 focus:border-pub sm:text-4xl`}
                />
                <input
                  value={site.tagline ?? ""}
                  onChange={(e) => editor.onTagline(e.target.value)}
                  maxLength={editor.taglineMax}
                  placeholder="Your tagline *"
                  aria-label="Tagline (required)"
                  aria-invalid={editor.missing?.tagline || undefined}
                  className={`${editor.missing?.tagline ? "border-pub! ring-4 ring-pub/15" : ""} mt-1 w-[min(32rem,80vw)] rounded-md border border-dashed border-transparent bg-transparent px-2 text-center text-xs font-extrabold uppercase tracking-[0.22em] text-pub outline-none transition placeholder:text-pub/40 hover:border-pub/50 focus:border-pub`}
                />
              </>
            ) : (
              <>
                {!site.logoUrl && (
                  <a href={homeHref}>
                    <span className="block font-pub-head text-3xl font-extrabold leading-tight text-pub-ink sm:text-4xl">{site.title}</span>
                  </a>
                )}
                {site.tagline && (
                  <p className="mt-1.5 flex items-center gap-2">
                    <span className="relative flex size-1.5 shrink-0">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-pub opacity-60" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-pub" />
                    </span>
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-pub sm:text-xs">{site.tagline}</span>
                  </p>
                )}
              </>
            )}
          </div>

          <div className="hidden flex-1 justify-start lg:flex">
            <AdSlot position="logo-right" ads={ads} preview={preview} className="w-full max-w-[320px]" />
          </div>
        </div>

        {/* Phones / tablets: the two header ads under the masthead (webnews.in shows them there too). */}
        <div className="pub-container grid grid-cols-2 gap-3 pb-4 lg:hidden">
          <AdSlot position="logo-left" ads={ads} preview={preview} />
          <AdSlot position="logo-right" ads={ads} preview={preview} />
        </div>
      </header>

      <nav aria-label="Sections" className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="pub-container flex items-center">
          <a
            href={homeHref}
            aria-hidden={!scrolled}
            tabIndex={scrolled ? undefined : -1}
            className={`hidden shrink-0 items-center overflow-hidden transition-all duration-300 lg:flex ${
              scrolled ? "mr-4 max-w-[15rem] opacity-100" : "pointer-events-none max-w-0 opacity-0"
            }`}
          >
            {site.logoUrl ? (
              <img src={site.logoUrl} alt={site.title} className="h-7 w-auto max-w-[14rem] object-contain" />
            ) : (
              <span className="font-pub-head text-lg font-extrabold text-pub-ink">{site.title}</span>
            )}
          </a>

          <div className="relative flex min-w-0 flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-white to-transparent" aria-hidden />
            <span className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-white to-transparent" aria-hidden />
            <div className="no-scrollbar flex w-full overflow-x-auto whitespace-nowrap">
              <div className="mx-auto flex shrink-0 items-center gap-0.5 lg:gap-1">
                <a href={homeHref} aria-current={activeCategory ? undefined : "page"} className={`${navItem(!activeCategory)} ${kn}`}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
                    <path d="M3 10.5 12 3l9 7.5" />
                    <path d="M5 9.5V21h14V9.5" />
                    <path d="M9.5 21v-6h5v6" />
                  </svg>
                  {tr(lang, "home")}
                </a>
                {direct.map((category) => (
                  <a
                    key={category}
                    href={categoryHref(homeHref, category)}
                    aria-current={activeCategory === category ? "page" : undefined}
                    className={`${navItem(activeCategory === category)} ${kn}`}
                  >
                    {categoryName(category, lang)}
                  </a>
                ))}
                {more.length > 0 && <MoreMenu items={more} homeHref={homeHref} lang={lang} active={activeCategory} />}
              </div>
            </div>
          </div>

          <button type="button" onClick={() => switchLanguage(other)} className="shrink-0 py-3 pl-2 pr-1 text-xs font-semibold text-gray-500 hover:text-pub">
            {other === "kn" ? "(ಕನ್ನಡ)" : "(EN)"}
          </button>

          <span
            aria-hidden={!scrolled}
            className={`hidden shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11px] text-gray-500 transition-all duration-300 lg:flex ${
              scrolled ? "ml-4 max-w-[15rem] opacity-100" : "pointer-events-none max-w-0 opacity-0"
            }`}
          >
            <span>{today}</span>
            {time && (
              <>
                <span className="text-gray-300">·</span>
                <span className="font-medium tabular-nums text-pub">{time}</span>
              </>
            )}
          </span>
        </div>
      </nav>

      {ticker.length > 0 && (
        <div className="pub-container mt-4">
          <div className="flex items-center gap-3 rounded-md border border-red-100 bg-red-50 px-3 py-2">
            <span className="z-10 shrink-0 rounded bg-pub px-2 py-0.5 text-xs font-bold text-white">{tr(lang, "breaking")}</span>
            <div className="relative flex-1 overflow-hidden text-sm">
              <div className="pub-marquee">
                {[0, 1].map((copy) => (
                  <div key={copy} aria-hidden={copy === 1} className="flex shrink-0 items-center gap-10 pr-10">
                    {ticker.map((card) => (
                      <a key={`${copy}-${card.id}`} href={articleBase ? `${articleBase}/${card.slug}` : "#"} tabIndex={copy === 1 ? -1 : undefined} className="shrink-0 text-gray-800 transition-colors hover:text-pub">
                        {card.title}
                      </a>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="pub-container pb-16">{children}</main>

      <SiteFooter site={site} homeHref={homeHref} lang={lang} />
      <BackToTop lang={lang} />
    </div>
    </AdBooking>
  );
}

/** webnews.in's "More ▾": the categories past the first few, in a panel fixed under the button (the menu row scrolls). */
function MoreMenu({ items, homeHref, lang, active }: { items: Category[]; homeHref: string; lang: SiteLanguage; active: Category | null }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onDown = (e: Event) => {
      if (!(e.target as HTMLElement)?.closest("[data-more-menu]")) setPos(null);
    };
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
      document.removeEventListener("mousedown", onDown);
    };
  }, [pos]);
  const open = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom, left: Math.max(8, Math.min(r.left, window.innerWidth - 232)) });
  };
  const current = active !== null && items.includes(active);
  return (
    <div data-more-menu className="contents">
      <button
        type="button"
        aria-expanded={Boolean(pos)}
        onClick={(e) => (pos ? setPos(null) : open(e.currentTarget))}
        className={`${navItem(current)} ${lang === "kn" ? "kn" : ""}`}
      >
        {lang === "kn" ? "ಇನ್ನಷ್ಟು" : "More"} <span aria-hidden className="text-[10px]">▾</span>
      </button>
      {pos && (
        <div data-more-menu className="fixed z-50 w-56 rounded-b-md border border-gray-200 bg-white py-1 shadow-lg" style={{ top: pos.top, left: pos.left }}>
          {items.map((category) => (
            <a
              key={category}
              href={categoryHref(homeHref, category)}
              className={`block px-4 py-2 text-sm font-medium transition hover:bg-red-50 hover:text-pub ${active === category ? "text-pub" : "text-gray-700"}`}
            >
              {categoryName(category, lang)}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const footHead = "text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400";
const footLink = "text-sm leading-6 text-gray-600 transition hover:text-pub";

/**
 * The webnews.in footer (its components/layout/Footer.tsx — owner 2026-10-30: "same layout and colors"): light grey
 * with a red rule on top; the publisher's brand · Explore · Company (Privacy, Terms, Login) · Office; then the centred bottom line with
 * "Powered by WebNEWS" and the copyright.
 */
function SiteFooter({ site, homeHref, lang }: { site: SiteChromeProps["site"]; homeHref: string; lang: SiteLanguage }) {
  const hasOffice = Boolean(site.address || site.contactPhone || site.contactEmail);
  return (
    <footer className="mt-16 bg-gray-50">
      <span aria-hidden className="block h-0.5 w-full bg-linear-to-r from-pub via-pub-dark to-pub" />

      <div className="pub-container grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-4">
          <a href={homeHref} className="inline-block">
            {site.logoUrl ? (
              <img src={site.logoUrl} alt={site.title} className="h-9 w-auto max-w-60 object-contain" />
            ) : (
              <span className="font-pub-head text-2xl font-extrabold text-pub-ink">{site.title}</span>
            )}
          </a>
          {site.logoUrl && <p className="mt-2 font-pub-head text-lg font-extrabold text-pub-ink">{site.title}</p>}
          {site.tagline && (
            <p className="mt-3 flex items-center gap-2.5">
              <span className="relative flex size-2.5 shrink-0">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-pub opacity-60" />
                <span className="relative inline-flex size-2.5 rounded-full bg-pub" />
              </span>
              <span className="text-sm font-extrabold uppercase tracking-[0.16em] text-pub-ink">{site.tagline}</span>
            </p>
          )}
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-gray-500">
            {lang === "kn"
              ? `${site.city ? `${site.city} ` : ""}${tr(lang, "newsEveryDay")}`
              : `News${site.city ? ` from ${site.city}` : ""} — reported and published every day.`}
          </p>
        </div>

        <nav className="lg:col-span-2" aria-label="Explore">
          <h2 className={footHead}>{tr(lang, "explore")}</h2>
          <ul className="mt-3.5 space-y-2">
            <li>
              <a href={homeHref} className={footLink}>
                {tr(lang, "home")}
              </a>
            </li>
            <li>
              <a href={`${homeHref === "#" ? "" : homeHref.replace(/\/$/, "")}#trending`} className={footLink}>
                {tr(lang, "trending")}
              </a>
            </li>
            {site.contactEmail && (
              <li>
                <a href={`mailto:${site.contactEmail}?subject=Advertising`} className={footLink}>
                  {tr(lang, "advertise")}
                </a>
              </li>
            )}
          </ul>
        </nav>

        <nav className="lg:col-span-2" aria-label="Company">
          <h2 className={footHead}>{tr(lang, "company")}</h2>
          <div className="mt-3.5 flex flex-col items-start gap-2">
            <a href={`${siteUrl}/privacy`} className={footLink}>
              {tr(lang, "privacy")}
            </a>
            <a href={`${siteUrl}/terms`} className={footLink}>
              {tr(lang, "terms")}
            </a>
            {/* A full page load: on their domain /admin is the site's own admin (proxy.ts), not a WebNEWS page. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/admin" className="text-sm font-semibold leading-6 text-gray-700 transition hover:text-pub">
              {tr(lang, "login")}
            </a>
          </div>
        </nav>

        {hasOffice && (
          <div className="lg:col-span-4">
            <h2 className={footHead}>{tr(lang, "office")}</h2>
            <address className="mt-3.5 not-italic">
              <div className="text-sm font-semibold text-gray-700">{site.title}</div>
              {site.address && <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-gray-500">{site.address}</p>}
              {site.contactPhone && (
                <a href={`tel:${site.contactPhone.replace(/\s/g, "")}`} className="mt-3 flex items-center gap-1.5 text-sm font-medium text-gray-600 transition hover:text-pub">
                  <Phone aria-hidden className="size-3.5 shrink-0 text-gray-400" />
                  {site.contactPhone}
                </a>
              )}
              {site.contactEmail && (
                <a href={`mailto:${site.contactEmail}`} className="mt-2 flex items-center gap-1.5 text-sm font-medium text-gray-600 transition hover:text-pub">
                  <Mail aria-hidden className="size-3.5 shrink-0 text-gray-400" />
                  <span className="break-all">{site.contactEmail}</span>
                </a>
              )}
            </address>
          </div>
        )}
      </div>

      <div className="border-t border-gray-200">
        <div className="pub-container flex flex-col items-center justify-center gap-2 py-4 text-center text-xs text-gray-500">
          <a href={siteUrl} className="group inline-flex items-center gap-2" aria-label={`Powered by ${SITE_NAME} — ${TAGLINE}`}>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">{tr(lang, "poweredBy")}</span>
            {/* Same deployment on every domain: a relative path works on the publisher's own domain too. */}
            <img src="/brand/logo-light.svg" alt={SITE_NAME} className="h-4 w-auto transition group-hover:opacity-80" />
          </a>
          <div>
            © {new Date().getFullYear()} {site.title} ·{" "}
            <a href={`mailto:${COMPANY.email}`} className="hover:text-pub">
              {COMPANY.email}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

/** webnews.in's red round "back to top" button, shown once the page is scrolled. */
function BackToTop({ lang }: { lang: SiteLanguage }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label={tr(lang, "backToTop")}
      className={`fixed bottom-6 right-6 z-40 flex size-12 items-center justify-center rounded-full bg-pub text-white shadow-lg transition hover:bg-pub-dark ${
        shown ? "opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <ArrowUp aria-hidden className="size-5" strokeWidth={2.5} />
    </button>
  );
}
