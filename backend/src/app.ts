import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { auth } from "./auth.js";
import { env } from "./env.js";
import { toAuthRequest } from "./lib/auth-request.js";
import { ApiError } from "./lib/errors.js";
import { RateLimiter } from "./lib/rate-limit.js";
import type { RealtimeBus } from "./lib/realtime.js";
import { clientIpMiddleware, originGuard } from "./middleware/request-context.js";
import { VIEW_AS_VISITOR_HEADER, sessionMiddleware } from "./middleware/session.js";
import { actingGuard } from "./middleware/acting-guard.js";
import { fromNativeApp, withBrowserSessionCookies } from "./lib/browser-session-cookie.js";
import { markOffline } from "./lib/presence.js";
import { adminRoutes } from "./routes/admin.js";
import { articleRoutes } from "./routes/articles.js";
import { communityRoutes } from "./routes/communities.js";
import type { RouteDeps } from "./routes/deps.js";
import { feedRoutes } from "./routes/feed.js";
import { groupRoutes } from "./routes/groups.js";
import { healthRoutes } from "./routes/health.js";
import { searchRoutes } from "./routes/search.js";
import { socialRoutes } from "./routes/social.js";
import { sitemapRoutes } from "./routes/sitemap.js";
import { mediaRoutes } from "./routes/media.js";
import { meRoutes } from "./routes/me.js";
import { membershipRoutes } from "./routes/memberships.js";
import { marketRoutes } from "./routes/market.js";
import { aiRoutes } from "./routes/ai.js";
import { messageRoutes } from "./routes/messages.js";
import { newsroomRoutes } from "./routes/newsroom.js";
import { onboardingRoutes } from "./routes/onboarding.js";
import { phoneAuthRoutes, whatsAppWebhookRoutes } from "./routes/phone-auth.js";
import { pressMeetRoutes } from "./routes/press-meets.js";
import { placeRoutes } from "./routes/places.js";
import { pressPassRoutes } from "./routes/press-pass.js";
import { spotlightRoutes } from "./routes/spotlight.js";
import { streamRoutes } from "./routes/stream.js";
import { uploadRoutes } from "./routes/upload.js";
import { userRoutes } from "./routes/users.js";
import { usernameRoutes } from "./routes/username.js";
import { eventRoutes } from "./routes/events.js";
import { viewRoutes } from "./routes/views.js";
import { LIMITS, PRESS_MEET, PRESS_MEET_REPORT, type ApiErrorBody } from "./shared/contracts.js";
import type { AppEnv } from "./types.js";

const JSON_BODY_LIMIT = 1024 * 1024; // 1 MB
// Videos are the largest upload (200 MB); /api/upload itself holds images to 8 MB.
const UPLOAD_BODY_LIMIT = LIMITS.videoUploadMaxBytes + 512 * 1024; // file + multipart overhead
const SOCIAL_POSTER_BODY_LIMIT = 8 * 1024 * 1024 + 64 * 1024;
const REPORT_BODY_LIMIT = PRESS_MEET_REPORT.maxBytes + 64 * 1024;

export type CreateAppOptions = {
  /** Per-request access log (default: env LOG_REQUESTS, off under tests). */
  logRequests?: boolean;
  /** Realtime bus used by GET /api/stream (default: the process-wide one). */
  bus?: RealtimeBus;
};

const tooLarge = (message: string) => {
  throw new ApiError(413, "payload_too_large", message);
};

/** 1 MB for JSON, 200 MB (+ overhead) for /api/upload (images 8 MB, checked there). Better Auth routes use the JSON limit too. */
const bodyLimits: MiddlewareHandler<AppEnv> = (c, next) => {
  const isUpload = c.req.path === "/api/upload";
  // The composer's poster for auto-posting (a 1080×1920 image, checked there).
  const isPoster = c.req.path.startsWith("/api/social/poster/");
  // Press meet recordings arrive in pieces of a few seconds each (owner 2026-10-01).
  const isRecordingPiece = c.req.path.startsWith("/api/press-meets/") && c.req.path.endsWith("/pieces");
  // The press meet report an organizer attaches when booking (owner 2026-10-05).
  const isReport = c.req.path === "/api/press-meets/report";
  return bodyLimit({
    maxSize: isUpload
      ? UPLOAD_BODY_LIMIT
      : isPoster
        ? SOCIAL_POSTER_BODY_LIMIT
        : isRecordingPiece
          ? PRESS_MEET.chunkMaxBytes
          : isReport
            ? REPORT_BODY_LIMIT
            : JSON_BODY_LIMIT,
    onError: () =>
      tooLarge(isUpload ? "Videos must be 200 MB or smaller, images 8 MB" : isReport ? "The report must be 10 MB or smaller" : "Request body too large"),
  })(c, next);
};

/** API responses are personalised: never cache unless a route says otherwise. */
const noStoreByDefault: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
};

/**
 * Builds the Hono application. Tests call `createApp().request(...)`; src/index.ts serves it.
 */
export function createApp(options: CreateAppOptions = {}) {
  const app = new Hono<AppEnv>();
  const deps: RouteDeps = { limiter: new RateLimiter() };
  const logRequests = options.logRequests ?? (env.LOG_REQUESTS && !env.isTest);

  if (logRequests) app.use(logger());
  app.use(
    secureHeaders({
      crossOriginResourcePolicy: "cross-origin",
      crossOriginOpenerPolicy: "same-origin",
      referrerPolicy: "strict-origin-when-cross-origin",
      xFrameOptions: "DENY",
      // HSTS only makes sense on a real HTTPS deployment (browsers ignore it on http://localhost anyway).
      strictTransportSecurity: env.isProduction ? "max-age=15552000; includeSubDomains" : false,
    }),
  );
  app.use(
    "/api/*",
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", VIEW_AS_VISITOR_HEADER],
      maxAge: 600,
    }),
  );
  app.use("*", clientIpMiddleware);
  app.use("/api/*", bodyLimits);
  app.use("/api/*", noStoreByDefault);

  // Better Auth owns /api/auth/* (its own CSRF/origin checks + rate limiting keyed by our client IP).
  // Every login lasts only for the browsing session — in the app, until Log out (lib/browser-session-cookie.ts).
  app.on(["GET", "POST"], "/api/auth/*", async (c) => {
    // Logging out goes offline at once (lib/presence.ts) — found before the session it names is deleted.
    const leaving = c.req.path.endsWith("/sign-out")
      ? ((await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null))?.user.id ?? null)
      : null;
    const response = await auth.handler(await toAuthRequest(c));
    if (leaving && response.ok) await markOffline(leaving).catch(() => {});
    return fromNativeApp(c.req.header("user-agent")) ? response : withBrowserSessionCookies(response);
  });

  app.use("/api/*", originGuard);
  app.use("/api/*", sessionMiddleware);
  // Posting as a group account: what the member's role allows (owner 2026-10-23).
  app.use("/api/*", actingGuard);

  app.route("/api/health", healthRoutes());
  app.route("/api/sitemap", sitemapRoutes());
  app.route("/api/search", searchRoutes(deps));
  app.route("/api/me", meRoutes(deps));
  app.route("/api/username", usernameRoutes(deps));
  app.route("/api/onboarding", onboardingRoutes(deps));
  app.route("/api/phone-auth", phoneAuthRoutes(deps));
  app.route("/api/groups", groupRoutes(deps));
  app.route("/api/whatsapp", whatsAppWebhookRoutes());
  app.route("/api/upload", uploadRoutes(deps));
  app.route("/api/feed", feedRoutes());
  app.route("/api/market", marketRoutes());
  app.route("/api/articles", articleRoutes(deps));
  app.route("/api/views", viewRoutes(deps));
  app.route("/api/events", eventRoutes(deps));
  app.route("/api/users", userRoutes(deps));
  app.route("/api/messages", messageRoutes(deps));
  app.route("/api/communities", communityRoutes(deps));
  app.route("/api/social", socialRoutes());
  app.route("/api/press-pass", pressPassRoutes(deps));
  app.route("/api/press-meets", pressMeetRoutes(deps));
  app.route("/api/places", placeRoutes());
  app.route("/api/newsroom", newsroomRoutes());
  app.route("/api/spotlight", spotlightRoutes(deps));
  app.route("/api/memberships", membershipRoutes(deps));
  app.route("/api/ai", aiRoutes(deps));
  app.route("/api/admin", adminRoutes());
  app.route("/api/stream", streamRoutes(options.bus));
  app.route("/media", mediaRoutes());

  app.notFound((c) => c.json<ApiErrorBody>({ error: { code: "not_found", message: "Not found" } }, 404));

  app.onError((error, c) => {
    if (error instanceof ApiError) return c.json(error.toBody(), error.status);
    if (error instanceof HTTPException) {
      const status = error.status;
      return c.json<ApiErrorBody>(
        { error: { code: status === 413 ? "payload_too_large" : "http_error", message: error.message || "Request failed" } },
        status,
      );
    }
    console.error(`[api] ${c.req.method} ${c.req.path} failed:`, error);
    return c.json<ApiErrorBody>({ error: { code: "internal_error", message: "Something went wrong. Please try again." } }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
