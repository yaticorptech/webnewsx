/*
 * Owner rule (2026-09-25): a login ends when the browser closes — for every account and every way in (email, sign-up,
 * Google). Better Auth sets the session cookie with Max-Age/Expires ("remember me"); every Set-Cookie it produces
 * (sign-in responses and session refreshes) passes through here and loses that lifetime, so the browser keeps the
 * cookie only for the browsing session. Deletions (Max-Age=0, log out) are left alone. The server-side session still
 * expires on its own (admins after DESK_SESSION_HOURS).
 * The WebNEWS app is the exception (owner 2026-10-01): it stays logged in until Log out, so its cookies keep their
 * lifetime (`fromNativeApp`). An admin's email + password sign-in is never remembered there either (auth.ts).
 */

const SESSION_COOKIE = /^(?:__Secure-)?[\w.-]*session_token=/;

/** A request from the WebNEWS app: Capacitor appends "WebNEWSApp" to its WebView's user agent (mobile/capacitor.config.ts). */
export function fromNativeApp(userAgent: string | undefined): boolean {
  return /\bWebNEWSApp\b/.test(userAgent ?? "");
}

export function toBrowserSessionCookie(setCookie: string): string {
  if (!SESSION_COOKIE.test(setCookie) || /;\s*max-age=0\b/i.test(setCookie)) return setCookie;
  return setCookie.replace(/;\s*max-age=\d+/gi, "").replace(/;\s*expires=[^;]*/gi, "");
}

/** The same response with every session cookie turned into a browser-session cookie. */
export function withBrowserSessionCookies(response: Response): Response {
  const cookies = response.headers.getSetCookie();
  if (!cookies.some((cookie) => SESSION_COOKIE.test(cookie))) return response;
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  for (const cookie of cookies) headers.append("set-cookie", toBrowserSessionCookie(cookie));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
