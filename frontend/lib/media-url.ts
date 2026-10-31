/** Where uploads live (R2's public address etc.; build-time list, like the CSP's). */
const MEDIA_ORIGINS = (process.env.NEXT_PUBLIC_MEDIA_HOSTS ?? "")
  .split(/[\s,]+/)
  .filter(Boolean)
  .map((host) => {
    try {
      return new URL(host.includes("://") ? host : `https://${host}`).origin;
    } catch {
      return "";
    }
  })
  .filter(Boolean);

/**
 * An upload's address on this site (`/media/<key>?inline=1`) for drawing it on a canvas: R2 doesn't let other sites
 * read its images, so canvases (share posters, the Press Pass download — owner 2026-10-31) got nothing. Anything that
 * isn't one of our uploads comes back unchanged; null when it isn't.
 */
export function sameOriginMediaUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url, window.location.href);
  } catch {
    return null;
  }
  const own = parsed.origin === window.location.origin && parsed.pathname.startsWith("/media/");
  const uploaded = MEDIA_ORIGINS.includes(parsed.origin) || parsed.hostname.endsWith(".r2.dev");
  if (!own && !uploaded) return null;
  const key = own ? parsed.pathname.slice("/media/".length) : parsed.pathname.replace(/^\/+/, "");
  return `/media/${key}?inline=1`;
}
