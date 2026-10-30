import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, count, desc, eq, gt, inArray, isNotNull, isNull, lte, notInArray, or, sum, type SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import { article, pressPass, publisherSite, siteAd, user, type PublisherSiteRecord, type SiteAdRecord } from "../db/schema.js";
import { env } from "../env.js";
import { ApiError, isUniqueViolation, notFound, validationError } from "../lib/errors.js";
import {
  CATEGORY_VALUES,
  SITE_AD_POSITION_KEYS,
  type Category,
  SITE_LIMITS,
  type ArticleCard,
  type MySiteResponse,
  type PublicSite,
  type SiteAd,
  type SiteAdminData,
  type SiteAdminStory,
  type SiteAdsByPosition,
  type SiteArticle,
  type SiteConnection,
  type SiteDnsRecord,
  type SiteHome,
  type SiteSource,
  type SiteStoryFlagsInput,
  type siteAdSchema,
  type siteSettingsSchema,
  type siteSetupSchema,
} from "../shared/contracts.js";
import { getSiteStoryDetail, selectCards, toCard, visibleWhere } from "./articles.js";
import { listMemberGroups } from "./groups.js";
import { dnsHost, pointingRecords } from "./press-pass.js";
import { descNullsLast, isUuid } from "./shared.js";
import type { z } from "zod";

/*
 * Publisher websites (owner 2026-10-29): a verified domain's news site in the webnews.in layout. The owner sets it up
 * on WebNEWS (/site-setup); visitors read it on the domain; its admin manages it at `<domain>/admin` with a separate
 * email + password. Stories open on WebNEWS (`/pub/<domain>/article/<slug>`) so their views count there.
 */

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const LATEST_LIMIT = 40;
const TRENDING_LIMIT = 8;
const TRENDING_DAYS = 30;
const ADMIN_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;


type Person = { id: string; name: string; username: string | null; image: string | null };

/* ─────────────── Passwords + admin tokens ─────────────── */

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

const sign = (payload: string) => createHmac("sha256", env.BETTER_AUTH_SECRET).update(`site-admin:${payload}`).digest("base64url");

/** `<siteId>.<tokenVersion>.<expiresMs>.<signature>` — stateless; a password change bumps the version. */
function issueAdminToken(site: Pick<PublisherSiteRecord, "id" | "adminTokenVersion">): { token: string; expiresAt: string } {
  const expires = Date.now() + ADMIN_TOKEN_TTL_MS;
  const payload = `${site.id}.${site.adminTokenVersion}.${expires}`;
  return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(expires).toISOString() };
}

/** The site an admin token (for `domain`) belongs to; 401 when it's missing, forged, expired or outdated. */
export async function siteFromAdminToken(domain: string, token: string | undefined): Promise<PublisherSiteRecord> {
  const unauthorized = new ApiError(401, "site_admin_required", "Please log in to your site's admin");
  if (!token) throw unauthorized;
  const parts = token.split(".");
  if (parts.length !== 4) throw unauthorized;
  const [siteId, version, expires, signature] = parts as [string, string, string, string];
  const expected = sign(`${siteId}.${version}.${expires}`);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw unauthorized;
  if (Number(expires) < Date.now()) throw unauthorized;
  const site = await findSiteByDomain(domain);
  if (!site || site.id !== siteId || String(site.adminTokenVersion) !== version) throw unauthorized;
  return site;
}

export async function siteAdminLogin(domain: string, email: string, password: string) {
  const site = await findSiteByDomain(domain);
  // Same answer for an unknown site, email or password.
  const wrong = new ApiError(401, "invalid_credentials", "Wrong email or password");
  if (!site) throw wrong;
  const ok = (await passwordMatches(password, site.adminPasswordHash)) && site.adminEmail === email;
  if (!ok) throw wrong;
  return issueAdminToken(site);
}

/* ─────────────── Lookups ─────────────── */

/** Lower-cased, without `www.` (the www address redirects to the bare domain). */
export const normalizeDomain = (domain: string) => domain.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");

/**
 * The site served on `domain`. Offline while its owner has no domain on their Press Pass (owner 2026-10-30: Remove
 * takes the site down, settings kept); during a change to a new domain the old one keeps serving until it's verified.
 */
export async function findSiteByDomain(domain: string): Promise<PublisherSiteRecord | null> {
  const [row] = await db
    .select({ site: publisherSite })
    .from(publisherSite)
    .innerJoin(pressPass, and(eq(pressPass.userId, publisherSite.ownerId), isNull(pressPass.revokedAt), isNotNull(pressPass.domain)))
    .where(eq(publisherSite.domain, normalizeDomain(domain)))
    .limit(1);
  return row?.site ?? null;
}

function toPublicSite(site: PublisherSiteRecord): PublicSite {
  return {
    domain: site.domain,
    title: site.title,
    tagline: site.tagline,
    logoUrl: site.logoUrl,
    city: site.city,
    contactEmail: site.contactEmail,
    contactPhone: site.contactPhone,
    address: site.address,
    articleBase: `${env.FRONTEND_URL}/pub/${site.domain}/article`,
  };
}

/* ─────────────── Stories ─────────────── */

/** The source's visible stories (read as the source itself, so premium stories keep their text — owner: all open). */
async function sourceCards(
  sourceId: string,
  opts: { exclude?: string[]; only?: string[]; trending?: boolean; category?: Category; limit: number },
): Promise<ArticleCard[]> {
  const conditions: SQL[] = [visibleWhere(), eq(article.authorId, sourceId)];
  if (opts.category) conditions.push(eq(article.category, opts.category));
  if (opts.exclude?.length) conditions.push(notInArray(article.id, opts.exclude));
  if (opts.only) {
    if (opts.only.length === 0) return [];
    conditions.push(inArray(article.id, opts.only));
  }
  if (opts.trending) conditions.push(gt(article.publishedAt, new Date(Date.now() - TRENDING_DAYS * 24 * 60 * 60 * 1000)));
  const rows = await selectCards(sourceId)
    .where(and(...conditions))
    .orderBy(...(opts.trending ? [desc(article.viewCount)] : []), descNullsLast(article.publishedAt), descNullsLast(article.id))
    .limit(opts.limit);
  return rows.map((row) => toCard(row, sourceId));
}

async function liveAds(siteId: string): Promise<SiteAdsByPosition> {
  const now = new Date();
  const rows = await db
    .select()
    .from(siteAd)
    .where(and(eq(siteAd.siteId, siteId), lte(siteAd.startsAt, now), or(isNull(siteAd.endsAt), gt(siteAd.endsAt, now))))
    .orderBy(siteAd.createdAt);
  const ads: SiteAdsByPosition = {};
  for (const row of rows) {
    (ads[row.position] ??= []).push({ id: row.id, title: row.title, creativeUrl: row.creativeUrl, video: row.video, targetUrl: row.targetUrl });
  }
  return ads;
}

/** The categories the source has posted in (owner 2026-10-30: the site's menu), most stories first. */
async function sourceCategories(sourceId: string, exclude: string[]): Promise<Category[]> {
  const conditions: SQL[] = [visibleWhere(), eq(article.authorId, sourceId), isNotNull(article.category)];
  if (exclude.length) conditions.push(notInArray(article.id, exclude));
  const rows = await db
    .select({ category: article.category, stories: count() })
    .from(article)
    .where(and(...conditions))
    .groupBy(article.category)
    .orderBy(desc(count()));
  return rows.map((r) => r.category).filter((c): c is Category => isCategory(c));
}

const isCategory = (value: unknown): value is Category => (CATEGORY_VALUES as readonly unknown[]).includes(value);

/** Home, or one category's page (`category`: its stories only; an unknown category is a 404). */
export async function siteHome(domain: string, category?: string): Promise<SiteHome> {
  const site = await findSiteByDomain(domain);
  if (!site) throw notFound("No site on this domain");
  if (category !== undefined && !isCategory(category)) throw notFound("No such section");
  const hidden = site.hiddenArticleIds;
  const [latest, trending, breaking, ads, categories] = await Promise.all([
    sourceCards(site.sourceId, { exclude: hidden, category, limit: LATEST_LIMIT }),
    sourceCards(site.sourceId, { exclude: hidden, trending: true, category, limit: TRENDING_LIMIT }),
    sourceCards(site.sourceId, { exclude: hidden, only: site.breakingArticleIds, limit: 10 }),
    liveAds(site.id),
    sourceCategories(site.sourceId, hidden),
  ]);
  return { site: toPublicSite(site), latest, trending, breaking, ads, categories, category: category ?? null };
}

export async function siteArticle(domain: string, slug: string): Promise<SiteArticle> {
  const site = await findSiteByDomain(domain);
  if (!site) throw notFound("No site on this domain");
  const detail = await getSiteStoryDetail(slug.toLowerCase(), site.sourceId);
  if (!detail || site.hiddenArticleIds.includes(detail.id)) throw notFound("Story not found");
  const [more, breaking, ads, categories] = await Promise.all([
    sourceCards(site.sourceId, { exclude: [...site.hiddenArticleIds, detail.id], limit: 13 }),
    sourceCards(site.sourceId, { exclude: site.hiddenArticleIds, only: site.breakingArticleIds, limit: 10 }),
    liveAds(site.id),
    sourceCategories(site.sourceId, site.hiddenArticleIds),
  ]);
  return { site: toPublicSite(site), article: detail, more, breaking, ads, categories };
}

/* ─────────────── The owner's setup (WebNEWS, /site-setup) ─────────────── */

async function verifiedDomain(personId: string): Promise<string | null> {
  const [row] = await db
    .select({ domain: pressPass.domain })
    .from(pressPass)
    .where(and(eq(pressPass.userId, personId), isNull(pressPass.revokedAt), isNotNull(pressPass.domainVerifiedAt)))
    .limit(1);
  return row?.domain ?? null;
}

/** The person's own account, then the groups they own (owner 2026-10-29: a linked group shows all its stories). */
async function sourcesOf(person: Person): Promise<SiteSource[]> {
  const groups = (await listMemberGroups(person.id)).filter((g) => g.role === "owner" && !g.deactivated);
  return [
    { id: person.id, name: person.name, username: person.username ?? "", image: person.image, kind: "person" },
    ...groups.map((g): SiteSource => ({ id: g.id, name: g.name, username: g.username, image: g.image, kind: "group" })),
  ];
}


async function ownSite(personId: string): Promise<PublisherSiteRecord | null> {
  const [row] = await db.select().from(publisherSite).where(eq(publisherSite.ownerId, personId)).limit(1);
  return row ?? null;
}

export async function mySite(person: Person, previewSourceId?: string): Promise<MySiteResponse> {
  const [domain, saved, sources] = await Promise.all([verifiedDomain(person.id), ownSite(person.id), sourcesOf(person)]);
  let site = saved;
  // Not on Vercel yet (the save's attempt failed, or the token came later): try again.
  if (site && !site.connectedAt && env.vercelEnabled) {
    try {
      await connectSite(site);
      site = await ownSite(person.id);
    } catch {
      /* stays "not connected"; the next visit retries */
    }
  }
  const source = sources.find((s) => s.id === previewSourceId)?.id ?? site?.sourceId ?? person.id;
  const [latest, trending, connection, extraDns] = await Promise.all([
    sourceCards(source, { exclude: site?.hiddenArticleIds, limit: LATEST_LIMIT }),
    sourceCards(source, { exclude: site?.hiddenArticleIds, trending: true, limit: TRENDING_LIMIT }),
    site ? connectionOf(site) : Promise.resolve<SiteConnection>("not_connected"),
    site?.connectedAt ? vercelVerificationRecords(site.domain) : Promise.resolve([]),
  ]);
  return {
    domain,
    site: site
      ? {
          title: site.title,
          tagline: site.tagline,
          logoUrl: site.logoUrl,
          city: site.city,
          contactEmail: site.contactEmail,
          contactPhone: site.contactPhone,
          address: site.address,
          sourceId: site.sourceId,
          adminEmail: site.adminEmail,
          connection,
        }
      : null,
    sources,
    dns: domain ? [...pointingRecords(domain), ...extraDns] : [],
    preview: { latest, trending },
  };
}

type SetupData = z.output<typeof siteSetupSchema>;

export async function saveMySite(person: Person, input: SetupData): Promise<void> {
  const domain = await verifiedDomain(person.id);
  if (!domain) throw new ApiError(409, "domain_not_verified", "Verify your domain first (Settings → Your domain)");
  const sources = await sourcesOf(person);
  if (!sources.some((s) => s.id === input.sourceId)) throw validationError({ sourceId: "Pick your account or a group you own" });
  const existing = await ownSite(person.id);
  const password = input.adminPassword;
  if (!existing && !password) throw validationError({ adminPassword: "Set a password for your site's admin" });

  const values = {
    domain,
    sourceId: input.sourceId,
    title: input.title,
    tagline: input.tagline ?? null,
    logoUrl: input.logoUrl ?? null,
    logoKey: input.logoUrl ? (input.logoKey ?? null) : null,
    city: input.city ?? null,
    contactEmail: input.contactEmail ?? null,
    contactPhone: input.contactPhone ?? null,
    address: input.address ?? null,
    adminEmail: input.adminEmail,
    updatedAt: new Date(),
  };
  try {
    if (existing) {
      await db
        .update(publisherSite)
        .set({
          ...values,
          // A new domain on the pass: the old one's connection doesn't carry over.
          ...(existing.domain !== domain ? { connectedAt: null } : {}),
          ...(password ? { adminPasswordHash: await hashPassword(password), adminTokenVersion: existing.adminTokenVersion + 1 } : {}),
        })
        .where(eq(publisherSite.id, existing.id));
    } else if (password) {
      await db.insert(publisherSite).values({ ...values, ownerId: person.id, adminPasswordHash: await hashPassword(password) });
    }
  } catch (error) {
    if (isUniqueViolation(error, "publisher_site_domain_unique")) {
      throw new ApiError(409, "domain_taken", `${domain} already has a site on WebNEWS`);
    }
    throw error;
  }
  // One step for the publisher (owner 2026-10-30): saving connects the domain to Vercel — no separate button. A
  // failure here doesn't fail the save; the next save (or the status check) tries again.
  const saved = await ownSite(person.id);
  if (saved && !saved.connectedAt && env.vercelEnabled) {
    try {
      await connectSite(saved);
    } catch (error) {
      console.warn(`[sites] could not connect ${saved.domain}:`, error instanceof Error ? error.message : error);
    }
  }
}

/* ─────────────── Vercel (the domain → the frontend project) ─────────────── */

async function vercel<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const team = env.VERCEL_TEAM.startsWith("team_") ? `teamId=${env.VERCEL_TEAM}` : `slug=${env.VERCEL_TEAM}`;
  const res = await fetch(`https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}${team}`, {
    method,
    headers: { authorization: `Bearer ${env.VERCEL_TOKEN}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}

type VercelDomain = { name?: string; verified?: boolean; verification?: { type: string; domain: string; value: string }[]; error?: { code?: string; message?: string } };

async function addVercelDomain(name: string, redirect?: string): Promise<void> {
  const project = encodeURIComponent(env.VERCEL_PROJECT_ID);
  const { status, data } = await vercel<VercelDomain>("POST", `/v10/projects/${project}/domains`, { name, ...(redirect ? { redirect, redirectStatusCode: 308 } : {}) });
  // Already on this project: fine.
  if (status < 300 || data.error?.code === "domain_already_in_use_by_project" || data.error?.code === "domain_already_exists") return;
  throw new ApiError(502, "domain_connect_failed", data.error?.message ?? `Vercel couldn't add ${name}`);
}

/** Adds the domain (and www → domain for a root domain) to the Vercel project. */
export async function connectMySite(personId: string): Promise<void> {
  const site = await ownSite(personId);
  if (!site) throw new ApiError(409, "site_not_set_up", "Save your site first");
  if (!env.vercelEnabled) {
    throw new ApiError(503, "domain_connect_unavailable", "Connecting domains isn't switched on yet. Ask WebNEWS to add your domain.");
  }
  await connectSite(site);
}

async function connectSite(site: PublisherSiteRecord): Promise<void> {
  await addVercelDomain(site.domain);
  if (dnsHost(site.domain) === "@") await addVercelDomain(`www.${site.domain}`, site.domain);
  await db.update(publisherSite).set({ connectedAt: new Date(), updatedAt: new Date() }).where(eq(publisherSite.id, site.id));
}

async function removeVercelDomain(name: string): Promise<void> {
  const { status, data } = await vercel<VercelDomain>("DELETE", `/v9/projects/${encodeURIComponent(env.VERCEL_PROJECT_ID)}/domains/${encodeURIComponent(name)}`);
  if (status < 300 || status === 404) return;
  throw new ApiError(502, "domain_disconnect_failed", data.error?.message ?? `Vercel couldn't remove ${name}`);
}

/** Takes the domain (and its www redirect, first) off the Vercel project; a Vercel failure is logged, not thrown. */
async function disconnectSite(site: PublisherSiteRecord): Promise<void> {
  if (site.connectedAt && env.vercelEnabled) {
    try {
      if (dnsHost(site.domain) === "@") await removeVercelDomain(`www.${site.domain}`);
      await removeVercelDomain(site.domain);
    } catch (error) {
      console.warn(`[sites] could not disconnect ${site.domain}:`, error instanceof Error ? error.message : error);
    }
  }
  await db.update(publisherSite).set({ connectedAt: null, updatedAt: new Date() }).where(eq(publisherSite.id, site.id));
}

/** The Press Pass domain was removed: the site goes offline (findSiteByDomain) and its domain leaves Vercel. */
export async function takeSiteOffline(ownerId: string): Promise<void> {
  const site = await ownSite(ownerId);
  if (site) await disconnectSite(site);
}

/**
 * A domain was verified on the Press Pass: an existing site moves onto it (the old domain leaves Vercel) and is
 * connected again — also when the same domain comes back after a Remove. Failures are logged; the setup page retries.
 */
export async function moveSiteToVerifiedDomain(ownerId: string): Promise<void> {
  const [site, domain] = await Promise.all([ownSite(ownerId), verifiedDomain(ownerId)]);
  if (!site || !domain) return;
  if (site.domain !== domain) {
    await disconnectSite(site);
    try {
      await db.update(publisherSite).set({ domain, connectedAt: null, updatedAt: new Date() }).where(eq(publisherSite.id, site.id));
    } catch (error) {
      if (isUniqueViolation(error, "publisher_site_domain_unique")) {
        console.warn(`[sites] ${domain} already has another site; ${site.domain}'s site not moved`);
        return;
      }
      throw error;
    }
  }
  const current = await ownSite(ownerId);
  if (current && !current.connectedAt && env.vercelEnabled) {
    try {
      await connectSite(current);
    } catch (error) {
      console.warn(`[sites] could not connect ${current.domain}:`, error instanceof Error ? error.message : error);
    }
  }
}

/** TXT records Vercel asks for when the domain is also on another Vercel account. */
async function vercelVerificationRecords(domain: string): Promise<SiteDnsRecord[]> {
  if (!env.vercelEnabled) return [];
  try {
    const { data } = await vercel<VercelDomain>("GET", `/v9/projects/${encodeURIComponent(env.VERCEL_PROJECT_ID)}/domains/${encodeURIComponent(domain)}`);
    if (data.verified !== false) return [];
    return (data.verification ?? [])
      .filter((v) => v.type === "TXT")
      .map((v) => ({ type: "TXT" as const, host: v.domain.endsWith(`.${domain}`) ? v.domain.slice(0, -domain.length - 1) : v.domain, value: v.value }));
  } catch {
    return [];
  }
}

async function connectionOf(site: PublisherSiteRecord): Promise<SiteConnection> {
  if (!site.connectedAt) return "not_connected";
  if (!env.vercelEnabled) return "pending_dns";
  try {
    const [config, domain] = await Promise.all([
      vercel<{ misconfigured?: boolean }>("GET", `/v6/domains/${encodeURIComponent(site.domain)}/config`),
      vercel<VercelDomain>("GET", `/v9/projects/${encodeURIComponent(env.VERCEL_PROJECT_ID)}/domains/${encodeURIComponent(site.domain)}`),
    ]);
    if (domain.data.verified === false) {
      // Vercel re-checks its TXT record only when asked.
      await vercel("POST", `/v9/projects/${encodeURIComponent(env.VERCEL_PROJECT_ID)}/domains/${encodeURIComponent(site.domain)}/verify`);
      return "pending_dns";
    }
    return config.data.misconfigured === false ? "live" : "pending_dns";
  } catch {
    return "pending_dns";
  }
}

/* ─────────────── The site's admin (`<domain>/admin`) ─────────────── */

function toSiteAd(row: SiteAdRecord): SiteAd {
  return {
    id: row.id,
    position: row.position,
    title: row.title,
    creativeUrl: row.creativeUrl,
    video: row.video,
    targetUrl: row.targetUrl,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function siteAdminData(site: PublisherSiteRecord): Promise<SiteAdminData> {
  const now = new Date();
  const [[totals], ads] = await Promise.all([
    db
      .select({ stories: count(), views: sum(article.viewCount) })
      .from(article)
      .where(and(eq(article.authorId, site.sourceId), eq(article.status, "published"), isNull(article.hiddenAt))),
    db.select().from(siteAd).where(eq(siteAd.siteId, site.id)).orderBy(desc(siteAd.createdAt)),
  ]);
  return {
    site: toPublicSite(site),
    adminEmail: site.adminEmail,
    stats: {
      stories: totals?.stories ?? 0,
      views: Number(totals?.views ?? 0),
      activeAds: ads.filter((a) => a.startsAt <= now && (!a.endsAt || a.endsAt > now)).length,
    },
    ads: ads.map(toSiteAd),
  };
}

export async function updateSiteSettings(site: PublisherSiteRecord, input: z.output<typeof siteSettingsSchema>): Promise<void> {
  await db
    .update(publisherSite)
    .set({
      title: input.title,
      tagline: input.tagline ?? null,
      logoUrl: input.logoUrl ?? null,
      logoKey: input.logoUrl ? (input.logoKey ?? null) : null,
      city: input.city ?? null,
      contactEmail: input.contactEmail ?? null,
      contactPhone: input.contactPhone ?? null,
      address: input.address ?? null,
      updatedAt: new Date(),
    })
    .where(eq(publisherSite.id, site.id));
}

/** Returns a fresh token (older ones stop working). */
export async function changeSitePassword(site: PublisherSiteRecord, current: string, next: string) {
  if (!(await passwordMatches(current, site.adminPasswordHash))) throw validationError({ currentPassword: "That's not the current password" });
  const version = site.adminTokenVersion + 1;
  await db
    .update(publisherSite)
    .set({ adminPasswordHash: await hashPassword(next), adminTokenVersion: version, updatedAt: new Date() })
    .where(eq(publisherSite.id, site.id));
  return issueAdminToken({ id: site.id, adminTokenVersion: version });
}

export async function siteAdminStories(site: PublisherSiteRecord): Promise<SiteAdminStory[]> {
  const rows = await db
    .select({ id: article.id, slug: article.slug, title: article.title, coverUrl: article.coverUrl, publishedAt: article.publishedAt, viewCount: article.viewCount })
    .from(article)
    .innerJoin(user, eq(user.id, article.authorId))
    .where(and(visibleWhere(), eq(article.authorId, site.sourceId)))
    .orderBy(descNullsLast(article.publishedAt))
    .limit(100);
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug ?? "",
    title: r.title ?? "",
    coverUrl: r.coverUrl ?? "",
    publishedAt: r.publishedAt?.toISOString() ?? "",
    viewCount: r.viewCount,
    hidden: site.hiddenArticleIds.includes(r.id),
    breaking: site.breakingArticleIds.includes(r.id),
  }));
}

export async function setSiteStoryFlags(site: PublisherSiteRecord, articleId: string, flags: SiteStoryFlagsInput): Promise<void> {
  if (!isUuid(articleId)) throw notFound("Story not found");
  const [own] = await db
    .select({ id: article.id })
    .from(article)
    .where(and(eq(article.id, articleId), eq(article.authorId, site.sourceId)))
    .limit(1);
  if (!own) throw notFound("Story not found");
  const toggle = (list: string[], on: boolean | undefined) =>
    on === undefined ? list : on ? [...new Set([...list, articleId])] : list.filter((id) => id !== articleId);
  await db
    .update(publisherSite)
    .set({
      hiddenArticleIds: toggle(site.hiddenArticleIds, flags.hidden),
      breakingArticleIds: toggle(site.breakingArticleIds, flags.breaking),
      updatedAt: new Date(),
    })
    .where(eq(publisherSite.id, site.id));
}

export async function addSiteAd(site: PublisherSiteRecord, input: z.output<typeof siteAdSchema>): Promise<SiteAd> {
  const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(siteAd).where(eq(siteAd.siteId, site.id));
  if (total >= SITE_LIMITS.adsPerSite) throw new ApiError(409, "too_many_ads", `A site can hold ${SITE_LIMITS.adsPerSite} ads — remove old ones first`);
  if (!(SITE_AD_POSITION_KEYS as readonly string[]).includes(input.position)) throw validationError({ position: "Pick a position" });
  const [row] = await db
    .insert(siteAd)
    .values({
      siteId: site.id,
      position: input.position,
      title: input.title,
      creativeUrl: input.creativeUrl ?? null,
      creativeKey: input.creativeUrl ? (input.creativeKey ?? null) : null,
      video: Boolean(input.creativeUrl && input.video),
      targetUrl: input.targetUrl ?? null,
      startsAt: input.startsAt ? new Date(input.startsAt) : new Date(),
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
    })
    .returning();
  if (!row) throw new ApiError(500, "internal_error", "Could not save the ad");
  return toSiteAd(row);
}

export async function removeSiteAd(site: PublisherSiteRecord, adId: string): Promise<void> {
  if (!isUuid(adId)) throw notFound("Ad not found");
  const deleted = await db.delete(siteAd).where(and(eq(siteAd.id, adId), eq(siteAd.siteId, site.id))).returning({ id: siteAd.id });
  if (deleted.length === 0) throw notFound("Ad not found");
}
