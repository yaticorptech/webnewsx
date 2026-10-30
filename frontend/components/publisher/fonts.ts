import { IBM_Plex_Sans, Newsreader } from "next/font/google";

/* webnews.in's type (its tailwind.config.ts): Newsreader headlines, IBM Plex Sans text. Kannada falls through to Noto. */
const newsreader = Newsreader({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-newsreader", display: "swap" });
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex", display: "swap" });

/** Put on a publisher page's wrapper (with `font-pub-sans`). */
export const PUB_FONTS = `${newsreader.variable} ${plex.variable}`;
