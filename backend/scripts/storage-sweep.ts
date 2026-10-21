/**
 * Deletes uploaded avatars/covers that nothing references any more (older than 24 h). The API server already
 * does this every 6 hours; run it by hand after bulk deletes.
 *
 *   npm --prefix backend run storage:sweep
 */
import { closeDatabase } from "../src/db/client.js";
import { storage } from "../src/lib/storage.js";
import { sweepOrphanUploads } from "../src/lib/upload-sweep.js";
import { databaseName, databaseUrl } from "./lib.js";

console.log(`[storage:sweep] ${databaseName(databaseUrl())} · storage: ${storage.kind}`);
try {
  const { scanned, deleted } = await sweepOrphanUploads();
  console.log(`[storage:sweep] scanned ${scanned} upload(s), removed ${deleted} unused one(s)`);
} catch (error) {
  console.error("[storage:sweep] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
