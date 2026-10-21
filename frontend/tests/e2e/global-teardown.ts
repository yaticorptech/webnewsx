import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import type { FullConfig } from "@playwright/test";

/**
 * Deletes exactly the users this run created (`pw.<runTag>.*@test.webnews.local`) and everything
 * they own, via the backend's purge script (direct DB access; it can only ever match
 * @test.webnews.local accounts). Other test runs, demo content and real accounts are untouched.
 */
export default async function globalTeardown(config: FullConfig): Promise<void> {
  const tag = process.env.E2E_RUN_TAG;
  if (!tag || !/^[a-z]+$/.test(tag)) {
    console.warn("[e2e teardown] E2E_RUN_TAG missing; nothing removed (run `npm --prefix backend run db:clean-test`).");
    return;
  }
  const frontendDir = config.configFile ? dirname(config.configFile) : process.cwd();
  const backendDir = resolve(frontendDir, "../backend");
  try {
    // The purge script reads DATABASE_URL from backend/.env.
    execFileSync("npm", ["--prefix", backendDir, "run", "--silent", "db:clean-test", "--", `--prefix=pw.${tag}.`], {
      stdio: "inherit",
    });
  } catch (error) {
    console.error(`[e2e teardown] cleanup failed — run \`npm --prefix backend run db:clean-test -- --prefix=pw.${tag}.\``, error);
  }
}
