import type { NextConfig } from "next";

/**
 * The browser only ever talks to this origin: /api/* and /media/* are proxied to the backend,
 * so Better Auth cookies stay first-party (docs/SPEC.md §1). Rewrites and headers are computed
 * at build time — BACKEND_URL / NEXT_PUBLIC_* must be set for `next build`.
 */
const isDev = process.env.NODE_ENV !== "production";
// Parallel dev servers / builds (e.g. agents, CI) each get their own output dir: NEXT_DIST_DIR=.next-foo.
const distDir = process.env.NEXT_DIST_DIR || ".next";
const backendUrl = (process.env.BACKEND_URL || "http://127.0.0.1:4000").replace(/\/+$/, "");

function toOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).origin;
  } catch {
    return null;
  }
}

const streamOrigin = toOrigin(process.env.NEXT_PUBLIC_STREAM_URL);
const mediaOrigins = (process.env.NEXT_PUBLIC_MEDIA_HOSTS ?? "")
  .split(/[\s,]+/)
  .map((host) => toOrigin(host.trim()))
  .filter((origin): origin is string => Boolean(origin));

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts; eval is only needed for dev tooling (HMR / React refresh).
  // Razorpay Checkout (premium memberships, owner 2026-10-14) loads its script and opens its payment frame.
  `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com${isDev ? " 'unsafe-eval'" : ""}`,
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline'",
  ["img-src 'self' data: blob: https://*.googleusercontent.com https://*.razorpay.com", ...mediaOrigins].join(" "),
  "font-src 'self' data:",
  // The poster images shared / auto-posted (components/poster/poster-jpeg.tsx) read the cover and the author's photo
  // to draw them: the media hosts and Google profile photos.
  ["connect-src 'self'", streamOrigin, "https://*.googleusercontent.com", "https://*.razorpay.com",
    // Desktop masthead weather + reader's city (owner 2026-10-15; no keys, no cookies).
    "https://api.open-meteo.com",
    "https://api.bigdatacloud.net",
    ...mediaOrigins, isDev ? "ws: wss:" : null].filter(Boolean).join(" "),
  ["media-src 'self' blob:", ...mediaOrigins].join(" "),
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  // Better Auth's Google sign-in ends with a navigation to accounts.google.com.
  "form-action 'self' https://accounts.google.com https://api.razorpay.com",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    // Camera + mic for this site only: press meet rooms (owner 2026-10-01). Screen wake lock keeps phones awake there.
    value: "camera=(self), microphone=(self), display-capture=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  distDir,
  // No dev-tools "N" badge on screen (owner 2026-10-01); compile and runtime errors still show.
  devIndicators: false,
  // The repo root has its own lockfile (root convenience scripts); pin Turbopack to this app.
  // (__dirname exists when the config is loaded as CommonJS; cwd is the app dir for npm scripts.)
  turbopack: { root: typeof __dirname !== "undefined" ? __dirname : process.cwd() },
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Story videos (≤ 200 MB) go through the /api rewrite: when proxy.ts runs it buffers bodies up to this size
    // (default 10 MB), and the backend may take a while to re-encode a clip (default proxy timeout 30 s).
    proxyClientMaxBodySize: "210mb",
    proxyTimeout: 5 * 60 * 1000,
    // Pages you were just on open instantly when you go back to them (owner 2026-10-02: Home after another tab
    // showed its loading skeleton every time) — reused for 30 s, then fetched fresh. Feeds stay live through realtime;
    // pull-to-refresh and router.refresh() always fetch fresh.
    staleTimes: { dynamic: 30 },
  },
  async rewrites() {
    // Array form = "afterFiles": checked before dynamic routes such as /[username].
    return [
      { source: "/api/:path*", destination: `${backendUrl}/api/:path*` },
      { source: "/media/:path*", destination: `${backendUrl}/media/:path*` },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
