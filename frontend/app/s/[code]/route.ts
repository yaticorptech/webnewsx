import { ServerApiError, serverFetch } from "@/lib/server-api";
import { SHORT_CODE_REGEX, type ShortLinkTarget } from "@/lib/shared/contracts";

/**
 * Nothing here may be remembered: an unpublished story's code leads home until it is back up, and re-publishing gives
 * it a new slug under the same code — a browser that cached a permanent redirect would keep the old target forever.
 */
const NO_STORE = "no-store";

/**
 * The Location is a bare path (RFC 9110 allows relative references), so the browser resolves it against the address it
 * actually asked for. Not NextResponse.redirect(new URL(path, request.nextUrl)): on a Node host nextUrl carries the
 * server's own hostname and port (Host / X-Forwarded-Host are ignored), so behind a proxy it would send readers to
 * http://localhost:3000/… — and NextResponse.redirect refuses relative URLs.
 */
function redirectTo(path: string, status: 302 | 308): Response {
  return new Response(null, { status, headers: { Location: path, "Cache-Control": NO_STORE } });
}

/**
 * /s/<code> — a story's short share link (every channel of components/feed/share-button.tsx sends it). Asks the API
 * which publicly visible story carries the code (case-insensitive) and answers 308 → /a/<slug> on whatever origin the
 * reader used (a relative Location, see redirectTo).
 * Unknown or malformed codes, and stories that are no longer public, go to the home page (302). When the API can't
 * be reached the answer is a 503 instead, so reloading later still reaches the story (sending the reader home would
 * lose the link). The request's cookies aren't forwarded: the lookup is the same for everyone.
 * "s" is a static segment, so it wins over app/(main)/[username] (and usernames have at least 3 characters).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const code = (await params).code.toLowerCase();
  if (!SHORT_CODE_REGEX.test(code)) return redirectTo("/", 302);
  try {
    const { slug } = await serverFetch<ShortLinkTarget>(`/api/articles/by-code/${encodeURIComponent(code)}`, { forwardRequestHeaders: false });
    return redirectTo(`/a/${encodeURIComponent(slug)}`, 308);
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 404) return redirectTo("/", 302);
    console.warn(`[short-link] /s/${code} failed: ${error instanceof ServerApiError ? `${error.status} ${error.code}` : String(error)}`);
    return new Response("WebNEWS is briefly unavailable. Please try this link again in a moment.", {
      status: 503,
      headers: { "Cache-Control": NO_STORE, "Content-Type": "text/plain; charset=utf-8", "Retry-After": "10" },
    });
  }
}
