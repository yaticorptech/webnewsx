import { env } from "../env.js";

/*
 * Meta's APIs for auto-posting (owner 2026-09-30):
 * - Facebook Login → a long-lived user token → the Pages the person manages, each with its own (non-expiring) Page
 *   token → photo posts on the chosen Page.
 * - Instagram Login (Instagram API with Instagram Login; Professional accounts) → a long-lived token (60 days,
 *   refreshed by the worker) → the story's poster published as an Instagram Story.
 */

const TIMEOUT_MS = 20_000;
const graph = (path: string) => `https://graph.facebook.com/${env.META_GRAPH_VERSION}${path}`;
const igGraph = (path: string) => `https://graph.instagram.com/${env.META_GRAPH_VERSION}${path}`;

/** A Meta API refusal. `auth` = the token no longer works (the person must connect again). */
export class MetaError extends Error {
  constructor(
    message: string,
    readonly auth: boolean,
  ) {
    super(message);
    this.name = "MetaError";
  }
}

type MetaErrorBody = { error?: { message?: string; code?: number; type?: string; error_subcode?: number }; error_message?: string };

async function call<T>(url: string, init: { method?: "GET" | "POST"; form?: Record<string, string> } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? (init.form ? "POST" : "GET"),
      body: init.form ? new URLSearchParams(init.form) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new MetaError("Couldn't reach Meta. Try again in a moment.", false);
  }
  const data = (await res.json().catch(() => ({}))) as T & MetaErrorBody;
  if (!res.ok || data.error) {
    const code = data.error?.code;
    // 190 = invalid / expired token; 10 / 200-299 = permission missing.
    const auth = code === 190 || code === 10 || (typeof code === "number" && code >= 200 && code < 300) || data.error?.type === "OAuthException";
    throw new MetaError(data.error?.message ?? data.error_message ?? `Meta answered ${res.status}`, auth);
  }
  return data;
}

const q = (params: Record<string, string>) => new URLSearchParams(params).toString();

export function callbackUrl(provider: "facebook" | "instagram"): string {
  // Instagram on this Mac comes back through the https test tunnel (INSTAGRAM_TUNNEL_URL).
  const base = provider === "instagram" && env.instagramTunnelUrl ? env.instagramTunnelUrl : env.FRONTEND_URL;
  return `${base}/api/social/${provider}/callback`;
}

/* ─────────────── Facebook Pages ─────────────── */

export const FACEBOOK_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"];

export function facebookLoginUrl(state: string): string {
  return `https://www.facebook.com/${env.META_GRAPH_VERSION}/dialog/oauth?${q({
    client_id: env.META_APP_ID ?? "",
    redirect_uri: callbackUrl("facebook"),
    state,
    response_type: "code",
    scope: FACEBOOK_SCOPES.join(","),
  })}`;
}

/** The person's Pages with their Page tokens (from a long-lived user token they never expire). */
export async function facebookPagesFromCode(code: string): Promise<Array<{ id: string; name: string; token: string }>> {
  const short = await call<{ access_token: string }>(
    graph(`/oauth/access_token?${q({ client_id: env.META_APP_ID ?? "", client_secret: env.META_APP_SECRET ?? "", redirect_uri: callbackUrl("facebook"), code })}`),
  );
  const long = await call<{ access_token: string }>(
    graph(
      `/oauth/access_token?${q({ grant_type: "fb_exchange_token", client_id: env.META_APP_ID ?? "", client_secret: env.META_APP_SECRET ?? "", fb_exchange_token: short.access_token })}`,
    ),
  );
  const pages = await call<{ data: Array<{ id: string; name: string; access_token?: string }> }>(
    graph(`/me/accounts?${q({ fields: "id,name,access_token", limit: "100", access_token: long.access_token })}`),
  );
  return pages.data.filter((p) => p.access_token).map((p) => ({ id: p.id, name: p.name, token: p.access_token ?? "" }));
}

/** A photo post on the Page. Returns the post id. */
export async function postFacebookPhoto(pageId: string, pageToken: string, imageUrl: string, caption: string): Promise<string> {
  const result = await call<{ id: string; post_id?: string }>(graph(`/${pageId}/photos`), {
    form: { url: imageUrl, caption, published: "true", access_token: pageToken },
  });
  return result.post_id ?? result.id;
}

/* ─────────────── Instagram (Professional accounts) ─────────────── */

export const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];

export function instagramLoginUrl(state: string): string {
  return `https://www.instagram.com/oauth/authorize?${q({
    client_id: env.INSTAGRAM_APP_ID ?? "",
    redirect_uri: callbackUrl("instagram"),
    response_type: "code",
    scope: INSTAGRAM_SCOPES.join(","),
    state,
  })}`;
}

/** Long-lived token (60 days) + the account's id and @username. */
export async function instagramAccountFromCode(code: string): Promise<{ id: string; username: string; token: string; expiresAt: Date }> {
  const short = await call<{ access_token: string; user_id: number | string }>("https://api.instagram.com/oauth/access_token", {
    form: {
      client_id: env.INSTAGRAM_APP_ID ?? "",
      client_secret: env.INSTAGRAM_APP_SECRET ?? "",
      grant_type: "authorization_code",
      redirect_uri: callbackUrl("instagram"),
      code: code.replace(/#_$/, ""),
    },
  });
  const long = await call<{ access_token: string; expires_in: number }>(
    `https://graph.instagram.com/access_token?${q({ grant_type: "ig_exchange_token", client_secret: env.INSTAGRAM_APP_SECRET ?? "", access_token: short.access_token })}`,
  );
  const me = await call<{ user_id?: string; id?: string; username: string }>(igGraph(`/me?${q({ fields: "user_id,username", access_token: long.access_token })}`));
  return {
    id: String(me.user_id ?? me.id ?? short.user_id),
    username: me.username,
    token: long.access_token,
    expiresAt: new Date(Date.now() + long.expires_in * 1000),
  };
}

/** A fresh 60-day token (the current one must be at least a day old and still valid). */
export async function refreshInstagramToken(token: string): Promise<{ token: string; expiresAt: Date }> {
  const result = await call<{ access_token: string; expires_in: number }>(
    `https://graph.instagram.com/refresh_access_token?${q({ grant_type: "ig_refresh_token", access_token: token })}`,
  );
  return { token: result.access_token, expiresAt: new Date(Date.now() + result.expires_in * 1000) };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Publishes a 9:16 JPEG as an Instagram Story. Returns the media id. */
export async function postInstagramStory(accountId: string, token: string, imageUrl: string): Promise<string> {
  const container = await call<{ id: string }>(igGraph(`/${accountId}/media`), {
    form: { image_url: imageUrl, media_type: "STORIES", access_token: token },
  });
  // Instagram fetches and processes the image first (seconds for a photo).
  for (let i = 0; i < 10; i++) {
    const { status_code } = await call<{ status_code?: string }>(igGraph(`/${container.id}?${q({ fields: "status_code", access_token: token })}`));
    if (status_code === "FINISHED" || status_code === undefined) break;
    if (status_code === "ERROR" || status_code === "EXPIRED") throw new MetaError("Instagram couldn't process the image", false);
    await sleep(3_000);
  }
  const published = await call<{ id: string }>(igGraph(`/${accountId}/media_publish`), { form: { creation_id: container.id, access_token: token } });
  return published.id;
}
