import { Hono, type Context } from "hono";
import { ApiError, validationError } from "../lib/errors.js";
import { processImage } from "../lib/images.js";
import { RATE_LIMITS } from "../lib/rate-limit.js";
import { storage } from "../lib/storage.js";
import { readJson } from "../lib/validate.js";
import { mustViewer, requireOnboarded } from "../middleware/guards.js";
import { rateLimit } from "../middleware/rate-limit.js";
import {
  addSiteAd,
  changeSitePassword,
  connectMySite,
  mySite,
  removeSiteAd,
  saveMySite,
  setSiteStoryFlags,
  siteAdminData,
  siteAdminLogin,
  siteAdminStories,
  siteArticle,
  siteFromAdminToken,
  siteHome,
  updateSiteSettings,
} from "../queries/sites.js";
import {
  siteAdminLoginSchema,
  siteAdSchema,
  sitePasswordSchema,
  siteSettingsSchema,
  siteSetupSchema,
  siteStoryFlagsSchema,
} from "../shared/contracts.js";
import type { AppEnv } from "../types.js";
import type { RouteDeps } from "./deps.js";

const VIDEO_AD_MAX_BYTES = 50 * 1024 * 1024;
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;

/** The person signed in — never while posting as a group (a site belongs to a Press Pass holder). */
function sitePerson(c: Context<AppEnv>) {
  const viewer = mustViewer(c);
  if (viewer.actor) throw new ApiError(403, "group_role_forbidden", `You're posting as ${viewer.name}. Switch back to your own account to set up your website.`);
  return { id: viewer.id, name: viewer.name, username: viewer.username, image: viewer.image };
}

const bearer = (c: Context<AppEnv>) => c.req.header("authorization")?.replace(/^Bearer\s+/i, "") || undefined;

export function siteRoutes({ limiter }: RouteDeps) {
  const app = new Hono<AppEnv>();

  /* ── The owner's setup (WebNEWS /site-setup) ── */

  // GET /api/sites/mine?source=<id> — the site (null until saved), the verified domain, sources, DNS records, preview stories.
  app.get("/mine", requireOnboarded, async (c) => c.json(await mySite(sitePerson(c), c.req.query("source"))));

  // PUT /api/sites/mine — create / update (title, tagline, logo, contact, source, admin email; password the first time).
  app.put("/mine", requireOnboarded, rateLimit(limiter, "site-setup", RATE_LIMITS.siteSetup, "user"), async (c) => {
    const person = sitePerson(c);
    await saveMySite(person, await readJson(c, siteSetupSchema));
    return c.json(await mySite(person));
  });

  // POST /api/sites/mine/connect — adds the domain to the Vercel project (then it opens once its DNS points there).
  app.post("/mine/connect", requireOnboarded, rateLimit(limiter, "site-setup", RATE_LIMITS.siteSetup, "user"), async (c) => {
    const person = sitePerson(c);
    await connectMySite(person.id);
    return c.json(await mySite(person));
  });

  /* ── The public site ── */

  // GET /api/sites/d/:domain — home page data.
  app.get("/d/:domain", async (c) => {
    c.header("Cache-Control", "public, max-age=30");
    return c.json(await siteHome(c.req.param("domain")));
  });

  // GET /api/sites/d/:domain/category/:category — one menu section: the site's stories in that category.
  app.get("/d/:domain/category/:category", async (c) => {
    c.header("Cache-Control", "public, max-age=30");
    return c.json(await siteHome(c.req.param("domain"), c.req.param("category")));
  });

  // GET /api/sites/d/:domain/articles/:slug — a story in the site's layout (premium stories open in full).
  app.get("/d/:domain/articles/:slug", async (c) => c.json(await siteArticle(c.req.param("domain"), c.req.param("slug"))));

  /* ── The site's admin (`<domain>/admin`, its own email + password; Bearer token) ── */

  app.post("/d/:domain/admin/login", rateLimit(limiter, "site-login", RATE_LIMITS.siteLogin, "ip"), async (c) => {
    const { email, password } = await readJson(c, siteAdminLoginSchema);
    return c.json(await siteAdminLogin(c.req.param("domain"), email, password));
  });

  const admin = (c: Context<AppEnv>) => siteFromAdminToken(c.req.param("domain") ?? "", bearer(c));

  app.get("/d/:domain/admin", async (c) => c.json(await siteAdminData(await admin(c))));

  app.patch("/d/:domain/admin/settings", async (c) => {
    const site = await admin(c);
    await updateSiteSettings(site, await readJson(c, siteSettingsSchema));
    return c.json(await siteAdminData(await admin(c)));
  });

  app.put("/d/:domain/admin/password", async (c) => {
    const site = await admin(c);
    const { currentPassword, newPassword } = await readJson(c, sitePasswordSchema);
    return c.json(await changeSitePassword(site, currentPassword, newPassword));
  });

  app.get("/d/:domain/admin/stories", async (c) => c.json({ stories: await siteAdminStories(await admin(c)) }));

  app.patch("/d/:domain/admin/stories/:id", async (c) => {
    const site = await admin(c);
    await setSiteStoryFlags(site, c.req.param("id"), await readJson(c, siteStoryFlagsSchema));
    return c.json({ stories: await siteAdminStories(await admin(c)) });
  });

  app.post("/d/:domain/admin/ads", async (c) => {
    const site = await admin(c);
    return c.json({ ad: await addSiteAd(site, await readJson(c, siteAdSchema)) }, 201);
  });

  app.delete("/d/:domain/admin/ads/:id", async (c) => {
    await removeSiteAd(await admin(c), c.req.param("id"));
    return c.json({ ok: true });
  });

  // POST /api/sites/d/:domain/admin/upload — multipart `file`: an image (≤ 8 MB, any shape → webp) or an MP4 (≤ 50 MB).
  app.post("/d/:domain/admin/upload", rateLimit(limiter, "upload", RATE_LIMITS.upload, "ip"), async (c) => {
    const site = await admin(c);
    let form: Record<string, string | File | (string | File)[]>;
    try {
      form = await c.req.parseBody({ all: false });
    } catch {
      throw new ApiError(400, "invalid_upload", "Could not read the upload");
    }
    const file = form.file;
    if (!(file instanceof File) || file.size === 0) throw validationError({ file: "Choose a file to upload" });
    if (file.type === "video/mp4") {
      if (file.size > VIDEO_AD_MAX_BYTES) throw new ApiError(413, "file_too_large", "Videos must be 50 MB or smaller");
      const key = `videos/${site.id}/${crypto.randomUUID()}.mp4`;
      const url = await storage.put(key, Buffer.from(await file.arrayBuffer()), "video/mp4");
      return c.json({ url, key, video: true }, 201);
    }
    if (file.size > IMAGE_MAX_BYTES) throw new ApiError(413, "file_too_large", "Images must be 8 MB or smaller");
    const processed = await processImage(Buffer.from(await file.arrayBuffer()), "article");
    const key = `covers/${site.id}/${crypto.randomUUID()}.webp`;
    const url = await storage.put(key, processed.buffer, processed.contentType);
    return c.json({ url, key, video: false }, 201);
  });

  return app;
}
