import { ImageResponse } from "next/og";
import { SITE_NAME, TAGLINE } from "@/lib/config";

/*
 * The share image for every page that has none of its own (owner 2026-10-22, "ready to host… SEO"): Home, sections,
 * Market, Trending… — a 1200 × 630 card in the brand red with the name and tagline. Stories and profiles use their own
 * cover / photo (their generateMetadata).
 */
export const alt = `${SITE_NAME} — ${TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 96px", background: "#E30613", color: "#fff" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 44 }}>
          {[520, 440, 360].map((w) => (
            <div key={w} style={{ width: w, height: 30, background: "#fff", borderRadius: 4, transform: "skewX(-20deg)" }} />
          ))}
        </div>
        <div style={{ fontSize: 112, fontWeight: 900, letterSpacing: -3, lineHeight: 1 }}>{SITE_NAME}</div>
        <div style={{ fontSize: 44, marginTop: 18, opacity: 0.92 }}>{TAGLINE}</div>
        <div style={{ fontSize: 30, marginTop: 30, opacity: 0.85 }}>News from the people who live it — in Kannada, English and more.</div>
      </div>
    ),
    size,
  );
}
