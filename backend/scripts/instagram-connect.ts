/**
 * Connects an Instagram account by hand (owner 2026-11-12, when Instagram's login page refused the redirect address):
 * saves the token on a WebNEWS account so every story it publishes from now on is posted to Instagram.
 *
 *   npm --prefix backend run instagram:connect -- <username> <token> [page-or-instagram-id] [--story]
 *
 * Token: an Instagram Login token ("IGAA…", from the Meta app's Instagram → API setup → Generate token), or a Facebook
 * token ("EAA…") with the Facebook Page id (or the Instagram account id). Posts go to the feed unless --story.
 * Run against production with DATABASE_URL + BETTER_AUTH_SECRET (tokens are encrypted with it) of the live server.
 */
import { eq } from "drizzle-orm";
import { closeDatabase, db } from "../src/db/client.js";
import { user } from "../src/db/schema.js";
import { instagramAccountFromToken } from "../src/lib/meta.js";
import { saveInstagramConnection } from "../src/queries/social-accounts.js";
import { databaseName, databaseUrl } from "./lib.js";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const story = process.argv.includes("--story");
const [username, token, id] = args;
if (!username || !token) {
  console.error("Usage: npm --prefix backend run instagram:connect -- <username> <token> [page-or-instagram-id] [--story]");
  process.exit(1);
}

console.log(`[instagram:connect] ${databaseName(databaseUrl())}`);
try {
  const [account] = await db
    .select({ id: user.id, username: user.username, reporterLevel: user.reporterLevel, onboardedAt: user.onboardedAt })
    .from(user)
    .where(eq(user.username, username.replace(/^@/, "")))
    .limit(1);
  if (!account) throw new Error(`no WebNEWS account @${username}`);
  const ig = await instagramAccountFromToken(token.trim(), id?.trim());
  await saveInstagramConnection(account.id, ig, story ? "story" : "feed");
  console.log(`[instagram:connect] @${account.username} → Instagram @${ig.username} (${ig.id}), ${story ? "Stories" : "feed posts"}, token ${ig.expiresAt ? `until ${ig.expiresAt.toISOString().slice(0, 10)} (auto-renewed)` : "doesn't expire"}`);
  if (account.reporterLevel !== "verified" || !account.onboardedAt) {
    console.warn(`[instagram:connect] ⚠ @${account.username} isn't a verified reporter yet — nothing is posted until it is.`);
  }
} catch (error) {
  console.error(`[instagram:connect] failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
