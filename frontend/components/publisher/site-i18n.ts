import { COMPANY } from "@/lib/company";
import {
  CATEGORY_LABELS,
  CATEGORY_LABELS_KN,
  DEFAULT_SITE_LANGUAGE,
  SITE_LANGUAGES,
  categoryLabel,
  type Category,
  type SiteLanguage,
} from "@/lib/shared/contracts";

/*
 * A publisher site's interface in English or Kannada (owner 2026-10-30; words from webnews.in's lib/i18n.ts where it
 * has them). Only the site's own words change — stories stay in the language they were written in.
 */

const TEXT = {
  home: { en: "Home", kn: "ಮುಖಪುಟ" },
  breaking: { en: "Breaking", kn: "ಬ್ರೇಕಿಂಗ್" },
  live: { en: "Live", kn: "ಲೈವ್" },
  moreHeadlines: { en: "More Headlines", kn: "ಇನ್ನಷ್ಟು ಮುಖ್ಯಾಂಶಗಳು" },
  latestStories: { en: "Latest Stories", kn: "ಇತ್ತೀಚಿನ ಸುದ್ದಿ" },
  mostRead: { en: "Most Read", kn: "ಹೆಚ್ಚು ಓದಿದವರು" },
  trending: { en: "Trending", kn: "ಟ್ರೆಂಡಿಂಗ್" },
  moreNews: { en: "More News", kn: "ಇನ್ನಷ್ಟು ಸುದ್ದಿ" },
  seeAll: { en: "See all", kn: "ಎಲ್ಲಾ" },
  noStories: { en: "Stories are on their way — check back soon.", kn: "ಸುದ್ದಿಗಳು ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿವೆ." },
  previewEmpty: { en: "Your published stories will appear here.", kn: "ನೀವು ಪ್ರಕಟಿಸಿದ ಸುದ್ದಿಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ." },
  noneInSection: { en: "No stories here yet.", kn: "ಇಲ್ಲಿ ಇನ್ನೂ ಸುದ್ದಿಗಳಿಲ್ಲ." },
  explore: { en: "Explore", kn: "ಅನ್ವೇಷಿಸಿ" },
  company: { en: "Company", kn: "ಸಂಸ್ಥೆ" },
  office: { en: "Office", kn: "ಕಚೇರಿ" },
  advertise: { en: "Advertise", kn: "ಜಾಹೀರಾತು" },
  privacy: { en: "Privacy", kn: "ಗೌಪ್ಯತೆ" },
  terms: { en: "Terms", kn: "ನಿಯಮಗಳು" },
  login: { en: "Login", kn: "ಲಾಗಿನ್" },
  poweredBy: { en: "Powered by", kn: "ಸಹಯೋಗ" },
  newsEveryDay: { en: "News — reported and published every day.", kn: "ಸುದ್ದಿ — ಪ್ರತಿದಿನ ವರದಿ ಮತ್ತು ಪ್ರಕಟಣೆ." },
  backToTop: { en: "Back to top", kn: "ಮೇಲಕ್ಕೆ" },
  related: { en: "More from", kn: "ಇನ್ನಷ್ಟು" },
  humidity: { en: "Humidity", kn: "ಆರ್ದ್ರತೆ" },
  wind: { en: "Wind", kn: "ಗಾಳಿ" },
  rainChance: { en: "chance of rain", kn: "ಮಳೆಯ ಸಾಧ್ಯತೆ" },
  loading: { en: "Loading…", kn: "ಲೋಡ್ ಆಗುತ್ತಿದೆ…" },
  justNow: { en: "Just now", kn: "ಈಗಷ್ಟೇ" },
  minAgo: { en: "min ago", kn: "ನಿಮಿಷ ಹಿಂದೆ" },
  hAgo: { en: "h ago", kn: "ಗಂಟೆ ಹಿಂದೆ" },
  dAgo: { en: "d ago", kn: "ದಿನ ಹಿಂದೆ" },
} as const;

export type SiteTextKey = keyof typeof TEXT;

export const isSiteLanguage = (value: unknown): value is SiteLanguage => (SITE_LANGUAGES as readonly unknown[]).includes(value);

/** The visitor's toggle (cookie) if set, else the owner's default. */
export const pickSiteLanguage = (cookie: string | undefined, siteDefault: SiteLanguage | undefined): SiteLanguage =>
  isSiteLanguage(cookie) ? cookie : (siteDefault ?? DEFAULT_SITE_LANGUAGE);

export const tr = (lang: SiteLanguage, key: SiteTextKey): string => TEXT[key][lang];

/** A category's menu / kicker name; English keeps the district ("Dakshina Kannada, Karnataka"). */
export const categoryName = (category: Category, lang: SiteLanguage, district?: string | null): string =>
  lang === "kn" ? CATEGORY_LABELS_KN[category] : district ? categoryLabel(category, district) : CATEGORY_LABELS[category];

export const dateLocale = (lang: SiteLanguage) => (lang === "kn" ? "kn-IN" : "en-IN");

/** Weather conditions (Open-Meteo codes) by name. */
export const WEATHER_KN: Record<string, string> = {
  "Clear sky": "ಸ್ಪಷ್ಟ ಆಕಾಶ",
  "Partly cloudy": "ಭಾಗಶಃ ಮೋಡ",
  Cloudy: "ಮೋಡ ಕವಿದ",
  Foggy: "ಮಂಜು",
  Drizzle: "ತುಂತುರು ಮಳೆ",
  Rain: "ಮಳೆ",
  "Rain showers": "ಮಳೆಯ ಸುರಿಮಳೆ",
  Thunderstorm: "ಗುಡುಗು ಸಹಿತ ಮಳೆ",
  Weather: "ಹವಾಮಾನ",
};

/** "Advertise here" / "Get in touch" book by mail to the site (its contact, else WebNEWS). */
export const siteBookHref = (site: { contactEmail: string | null; title: string; domain: string }) =>
  `mailto:${site.contactEmail || COMPANY.email}?subject=${encodeURIComponent(`Advertise on ${site.title || site.domain}`)}`;

/** A menu section's page: `<home>/category/<category>`. */
export const siteCategoryHref = (homeHref: string, category: Category) => `${homeHref.replace(/\/+$/, "")}/category/${category}`;
