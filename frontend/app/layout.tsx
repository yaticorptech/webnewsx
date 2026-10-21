import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Archivo, Noto_Sans_Kannada, Noto_Serif_Kannada, Source_Serif_4 } from "next/font/google";
import type { ReactNode } from "react";
import { AppProviders } from "@/components/providers/app-providers";
import { SITE_DESCRIPTION, SITE_NAME, TAGLINE, THEME_COLOR, siteUrl } from "@/lib/config";
import { getViewer } from "@/lib/server-api";
import "./globals.css";

/** UI + headlines. The `wdth` axis gives the wide cuts (font-stretch 112–125%) that echo the wordmark. */
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

/**
 * Article reading text only. Not preloaded: most pages (feed, profiles, console) never show it, and a preloaded font
 * that a page doesn't use costs a download and a console warning. Story pages fetch it as soon as their text renders.
 */
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-source-serif",
  display: "swap",
  preload: false,
});

/*
 * Kannada (the owner's audience writes in Kannada). Only the Kannada subset is loaded and it is not
 * preloaded: its unicode-range means the browser fetches it only when Kannada text is on screen,
 * while Latin glyphs keep coming from Archivo / Source Serif 4 (first in the stacks).
 */
const notoSansKannada = Noto_Sans_Kannada({
  subsets: ["kannada"],
  weight: "variable",
  variable: "--font-noto-kannada",
  display: "swap",
  preload: false,
});

const notoSerifKannada = Noto_Serif_Kannada({
  subsets: ["kannada"],
  weight: "variable",
  variable: "--font-noto-serif-kannada",
  display: "swap",
  preload: false,
});

const DEFAULT_TITLE = `${SITE_NAME} — ${TAGLINE}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: DEFAULT_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
    title: DEFAULT_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: DEFAULT_TITLE, description: SITE_DESCRIPTION },
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "default" },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: THEME_COLOR,
};

const fontVariables = [archivo, sourceSerif, notoSansKannada, notoSerifKannada].map((font) => font.variable).join(" ");

export default async function RootLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  // The Android app (mobile/, user agent "… WebNEWSApp") already keeps the page below the status bar itself, so
  // the page must not pad for it again (globals.css, `data-app`) — its WebView still reports a camera cutout.
  const userAgent = (await headers()).get("user-agent") ?? "";
  const androidApp = userAgent.includes("WebNEWSApp") && userAgent.includes("Android");
  // A phone ("Mobi": Android phones and the app's WebView; iPhone): phone layouts render from the first paint
  // (usePhoneLayout). Tablets don't match.
  const phone = /Mobi|iPhone|iPod/i.test(userAgent);
  return (
    // suppressHydrationWarning: AppProviders sets `data-hydrated` on <html> after hydration (e2e hook).
    <html
      lang="en"
      data-scroll-behavior="smooth"
      data-app={androidApp ? "android" : undefined}
      suppressHydrationWarning
      className={fontVariables}
    >
      <body className="min-h-dvh bg-bg font-sans text-ink antialiased">
        <a
          href="#main"
          className="fixed left-3 top-3 z-200 -translate-y-24 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-brand-contrast transition-transform focus-visible:translate-y-0 focus-visible:shadow-pop"
        >
          Skip to content
        </a>
        <AppProviders viewer={viewer} phone={phone}>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
