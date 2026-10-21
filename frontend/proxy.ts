import { NextResponse, type NextRequest } from "next/server";

/**
 * Client-address headers only a proxy we trust may set. The API rate-limits by client IP (from
 * X-Forwarded-For), and Next passes these headers on untouched — to `/api/*` rewrites and to server
 * rendering — so a browser that sends its own "X-Forwarded-For: 1.2.3.4" could pick a fresh identity per
 * request. Unless an edge proxy in front of this app sets them (TRUST_PROXY=1, e.g. Vercel or a load
 * balancer), they are dropped here; server rendering then sees the real socket address and the API sees
 * this server's.
 */
const FORWARDING_HEADERS = ["x-forwarded-for", "x-real-ip", "forwarded"] as const;

function trustsUpstreamProxy(): boolean {
  const value = process.env.TRUST_PROXY;
  return value === "true" || Number(value) > 0;
}

export function proxy(request: NextRequest) {
  if (trustsUpstreamProxy()) return NextResponse.next();
  const headers = new Headers(request.headers);
  for (const name of FORWARDING_HEADERS) headers.delete(name);
  return NextResponse.next({ request: { headers } });
}

// Only requests that carry one of the headers pay for the proxy at all (Next reads this statically: literals only).
export const config = {
  matcher: [
    { source: "/:path*", has: [{ type: "header", key: "x-forwarded-for" }] },
    { source: "/:path*", has: [{ type: "header", key: "x-real-ip" }] },
    { source: "/:path*", has: [{ type: "header", key: "forwarded" }] },
  ],
};
