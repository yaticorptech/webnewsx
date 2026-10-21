import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { env } from "../env.js";
import { ApiError } from "../lib/errors.js";
import { facebookLoginUrl, facebookPagesFromCode, instagramAccountFromCode, instagramLoginUrl, MetaError } from "../lib/meta.js";
import { makeConnectTicket, makeOAuthState, newNonce, readConnectTicket, readOAuthState } from "../lib/social-crypto.js";
import { readJson } from "../lib/validate.js";
import { mustViewer, requireOnboarded } from "../middleware/guards.js";
import {
  attachSocialImage,
  disconnectSocial,
  getSocialStatus,
  isVerifiedReporter,
  saveFacebookConnection,
  saveInstagramConnection,
  updateSocialConnection,
  wantsSocialImage,
} from "../queries/social-accounts.js";
import { findUserById } from "../queries/users.js";
import { SOCIAL_PROVIDER_LABELS, SOCIAL_PROVIDER_VALUES, updateSocialSchema, type SocialProvider } from "../shared/contracts.js";
import type { AppEnv } from "../types.js";

const providerSchema = z.enum(SOCIAL_PROVIDER_VALUES);
const SOCIAL_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

function providerOf(c: Context<AppEnv>): SocialProvider {
  const parsed = providerSchema.safeParse(c.req.param("provider"));
  if (!parsed.success) throw new ApiError(404, "not_found", "Not found");
  return parsed.data;
}

/** Back to Edit profile with the outcome (`?social=instagram&result=connected|error&reason=…`). */
function backToSettings(c: Context<AppEnv>, provider: SocialProvider, result: Outcome, reason?: string) {
  const params = new URLSearchParams({ social: provider, result });
  if (reason) params.set("reason", reason.slice(0, 200));
  return c.redirect(`${env.FRONTEND_URL}/settings/profile?${params.toString()}#connected-accounts`, 302);
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** Started in the phone app: this page stays in the phone's browser, so it just says to go back to the app. */
function appDonePage(c: Context<AppEnv>, provider: SocialProvider, result: Outcome, reason?: string) {
  const name = SOCIAL_PROVIDER_LABELS[provider];
  const ok = result === "connected";
  const title = ok ? `${name} connected` : result === "cancelled" ? "Not connected" : `Couldn't connect ${name}`;
  const body = ok
    ? "Go back to the WebNEWS app — your next story will be posted there automatically."
    : escapeHtml(reason ?? "You closed the login. Go back to the WebNEWS app and tap Connect to try again.");
  return c.html(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${escapeHtml(title)} · WebNEWS</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;` +
      `font-family:system-ui,-apple-system,sans-serif;background:#fff;color:#16181d}main{max-width:22rem;padding:2rem;text-align:center}` +
      `.mark{width:56px;height:56px;border-radius:50%;margin:0 auto 1rem;display:grid;place-items:center;color:#fff;font-size:28px;` +
      `background:${ok ? "#1f8a4c" : "#e30613"}}h1{font-size:1.35rem;margin:0 0 .5rem}p{color:#6b7079;line-height:1.5;margin:0}` +
      `b{color:#e30613;letter-spacing:.2em;font-size:.7rem}</style></head><body><main><div class="mark">${ok ? "&#10003;" : "!"}</div>` +
      `<h1>${escapeHtml(title)}</h1><p>${body}</p><p style="margin-top:1.5rem"><b>WEBNEWS</b></p></main></body></html>`,
    ok ? 200 : 400,
  );
}

type Outcome = "connected" | "error" | "cancelled";

function finish(c: Context<AppEnv>, provider: SocialProvider, app: boolean, result: Outcome, reason?: string) {
  return app ? appDonePage(c, provider, result, reason) : backToSettings(c, provider, result, reason);
}

const NONCE_COOKIE = "wn_social";

/**
 * Connected social accounts (owner 2026-09-30): verified reporters connect Instagram / a Facebook Page, then their
 * stories are posted there automatically (queries/social-accounts.ts).
 *
 *   GET    /api/social/:provider/connect    → 302 to Meta's login (website: the "Connect" buttons are plain links;
 *                                             the phone app: opened in the phone's browser with `?ticket=`)
 *   POST   /api/social/:provider/ticket     → { ticket } — the phone app's one-time pass (5 minutes)
 *   GET    /api/social/:provider/callback   → 302 back to Edit profile (website) / a "go back to the app" page
 *   GET    /api/social                      → SocialStatus
 *   PATCH  /api/social/:provider            { autoPost?, pageId? }
 *   DELETE /api/social/:provider
 *   GET    /api/social/poster/:articleId    → { wanted } — the composer uploads the poster only when it's needed
 *   POST   /api/social/poster/:articleId    (multipart `file`, JPEG / PNG) → the story's auto-posts go out with it
 */
export function socialRoutes() {
  const app = new Hono<AppEnv>();

  app.get("/", requireOnboarded, async (c) => c.json(await getSocialStatus(mustViewer(c))));

  app.get("/poster/:articleId", requireOnboarded, async (c) => c.json({ wanted: await wantsSocialImage(c.req.param("articleId"), mustViewer(c).id) }));

  app.post("/poster/:articleId", requireOnboarded, async (c) => {
    const viewer = mustViewer(c);
    const form = await c.req.parseBody().catch(() => null);
    const file = form?.file;
    if (!(file instanceof File)) throw new ApiError(400, "validation_error", "Send the poster as `file`", { file: "Missing" });
    if (file.size > SOCIAL_IMAGE_MAX_BYTES) throw new ApiError(413, "payload_too_large", "The poster image is too large");
    return c.json(await attachSocialImage(c.req.param("articleId"), viewer.id, Buffer.from(await file.arrayBuffer())));
  });

  // POST /api/social/:provider/ticket — the phone app's one-time pass (Meta's login can't run inside the app).
  app.post("/:provider/ticket", requireOnboarded, async (c) => {
    const provider = providerOf(c);
    const viewer = mustViewer(c);
    if (!isVerifiedReporter(viewer)) throw new ApiError(403, "not_verified", "Only verified reporters can connect accounts");
    return c.json({ ticket: makeConnectTicket(viewer.id, provider) });
  });

  app.get("/:provider/connect", async (c) => {
    const provider = providerOf(c);
    // The phone app opens this in the phone's browser with a pass; on the website the login session says who it is.
    const ticketUser = readConnectTicket(c.req.query("ticket"), provider);
    const viewer = c.get("viewer");
    const userId = ticketUser ?? viewer?.id ?? null;
    // `web=1`: the website's own hop through the Instagram test tunnel (below), not the phone app.
    const app = ticketUser !== null && c.req.query("web") !== "1";
    if (!userId) return c.redirect(`${env.FRONTEND_URL}/login?next=${encodeURIComponent("/settings/profile")}`, 302);
    // Testing Instagram on this Mac: start again on the https tunnel with a one-time pass, so the browser's nonce
    // cookie is set where Instagram sends the login back (the session cookie stays on localhost).
    if (provider === "instagram" && env.instagramTunnelUrl && !ticketUser) {
      const ticket = makeConnectTicket(userId, provider);
      return c.redirect(`${env.instagramTunnelUrl}/api/social/instagram/connect?${new URLSearchParams({ ticket, web: "1" }).toString()}`, 302);
    }
    const account = ticketUser ? await findUserById(ticketUser) : null;
    const eligible = ticketUser
      ? Boolean(account?.onboardedAt && account.reporterLevel === "verified" && !account.suspendedAt)
      : viewer !== null && isVerifiedReporter(viewer);
    if (!eligible) return finish(c, provider, app, "error", "Only verified reporters can connect accounts");
    const configured = provider === "facebook" ? env.facebookEnabled : env.instagramEnabled;
    if (!configured) return finish(c, provider, app, "error", "Connecting isn't set up on this site yet");
    // This browser's nonce: the callback must come back here (nobody can attach their account to someone else's).
    const nonce = newNonce();
    setCookie(c, NONCE_COOKIE, nonce, {
      path: "/api/social",
      httpOnly: true,
      sameSite: "Lax",
      secure: env.secureCookies,
      maxAge: 10 * 60,
    });
    const state = makeOAuthState(userId, provider, nonce, app);
    return c.redirect(provider === "facebook" ? facebookLoginUrl(state) : instagramLoginUrl(state), 302);
  });

  app.get("/:provider/callback", async (c) => {
    const provider = providerOf(c);
    const state = readOAuthState(c.req.query("state"), provider);
    const nonce = getCookie(c, NONCE_COOKIE);
    deleteCookie(c, NONCE_COOKIE, { path: "/api/social" });
    if (!state || !nonce || nonce !== state.nonce) {
      return finish(c, provider, state?.app ?? false, "error", "The login link expired — try Connect again");
    }
    // Logged in as someone else on the website meanwhile: don't connect to the wrong account.
    const viewer = c.get("viewer");
    if (!state.app && viewer && viewer.id !== state.userId) return finish(c, provider, false, "error", "You're logged in as someone else — try Connect again");
    if (c.req.query("error") || !c.req.query("code")) return finish(c, provider, state.app, "cancelled");
    const account = await findUserById(state.userId);
    if (!account?.onboardedAt || account.reporterLevel !== "verified" || account.suspendedAt) {
      return finish(c, provider, state.app, "error", "Only verified reporters can connect accounts");
    }
    const code = c.req.query("code") ?? "";
    try {
      if (provider === "facebook") await saveFacebookConnection(state.userId, await facebookPagesFromCode(code));
      else await saveInstagramConnection(state.userId, await instagramAccountFromCode(code));
      return finish(c, provider, state.app, "connected");
    } catch (error) {
      if (error instanceof MetaError || error instanceof ApiError) return finish(c, provider, state.app, "error", error.message);
      console.error(`[social] ${provider} connect failed:`, error);
      return finish(c, provider, state.app, "error", "Something went wrong. Please try again.");
    }
  });

  app.patch("/:provider", requireOnboarded, async (c) => {
    const viewer = mustViewer(c);
    await updateSocialConnection(viewer.id, providerOf(c), await readJson(c, updateSocialSchema));
    return c.json(await getSocialStatus(viewer));
  });

  app.delete("/:provider", requireOnboarded, async (c) => {
    const viewer = mustViewer(c);
    await disconnectSocial(viewer.id, providerOf(c));
    return c.json(await getSocialStatus(viewer));
  });

  return app;
}
