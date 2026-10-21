/**
 * Moves the images and videos stored on this server (LOCAL_UPLOAD_DIR, served at /media/…) to Cloudflare R2 — served by
 * Cloudflare's CDN — and points every link to them at R2 (owner 2026-10-16: "add a CDN for images").
 *
 *   npm run media:to-r2            preview: what would be uploaded and how many links change (nothing is changed)
 *   npm run media:to-r2 -- --apply do it
 *
 * Needs the five R2_* variables in backend/.env (then new uploads go to R2 by themselves). Safe to run again: files
 * already in R2 are skipped, and links are rewritten only where they still say /media/…. The local files are kept, so
 * going back is just clearing the R2_* variables and rewriting the links the other way.
 */
import { readFile } from "node:fs/promises";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { sql } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { env } from "../src/env.js";
import { LocalStorage, R2Storage, UPLOAD_FOLDERS, contentTypeForKey } from "../src/lib/storage.js";

const apply = process.argv.includes("--apply");

const { R2_ACCOUNT_ID: accountId, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey, R2_BUCKET: bucket, R2_PUBLIC_BASE_URL: publicUrl } =
  env;
if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
  console.error("Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_BASE_URL in backend/.env first.");
  process.exit(1);
}

const base = publicUrl.replace(/\/+$/, "");
const local = new LocalStorage(env.LOCAL_UPLOAD_DIR);
const r2 = new R2Storage({ accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl: base });
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

async function inR2(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

// 1. Files: every local upload not yet in R2.
let found = 0;
let uploaded = 0;
let skipped = 0;
for (const folder of UPLOAD_FOLDERS) {
  for await (const object of local.list(`${folder}/`)) {
    found++;
    if (await inR2(object.key)) {
      skipped++;
      continue;
    }
    if (apply) {
      const path = local.resolvePath(object.key);
      if (!path) continue;
      await r2.put(object.key, await readFile(path), contentTypeForKey(object.key));
      if (++uploaded % 50 === 0) console.log(`  uploaded ${uploaded}…`);
    } else uploaded++;
  }
}
console.log(`Files: ${found} on this server · ${skipped} already in R2 · ${uploaded} ${apply ? "uploaded" : "to upload"}`);

// 2. Links: every text / JSON column that still points at /media/… (covers, photos, videos, images inside stories).
// Only links that START with /media/ (at the start of the value, or right after a quote, bracket, space or =) change —
// an outside address that merely contains "/media/" is left alone.
const LINK = String.raw`(^|["'(\s=])/media/`;
const columns = [
  ...(await db.execute<{ table_name: string; column_name: string; data_type: string }>(sql`
    select c.table_name, c.column_name, c.data_type from information_schema.columns c
    join information_schema.tables t on t.table_name = c.table_name and t.table_schema = c.table_schema and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.data_type in ('text', 'character varying', 'jsonb')
      and c.table_name not like '\_\_%' and c.table_name not in ('user_event', 'admin_audit_log')`)),
];
let links = 0;
for (const { table_name: table, column_name: column, data_type: type } of columns) {
  const t = sql.identifier(table);
  const c = sql.identifier(column);
  const value = type === "jsonb" ? sql`${c}::text` : c;
  const [row] = [...(await db.execute<{ n: number }>(sql`select count(*)::int as n from ${t} where ${value} ~ ${LINK}`))];
  const n = Number(row?.n ?? 0);
  if (n === 0) continue;
  links += n;
  console.log(`  ${table}.${column}: ${n}`);
  if (!apply) continue;
  const replaced = sql`regexp_replace(${value}, ${LINK}, ${`\\1${base}/`}, 'g')`;
  await db.execute(sql`update ${t} set ${c} = ${type === "jsonb" ? sql`${replaced}::jsonb` : replaced} where ${value} ~ ${LINK}`);
}
console.log(`Links: ${links} ${apply ? "now point at" : "would point at"} ${base}/…`);
if (!apply) console.log("\nPreview only — nothing changed. Run again with --apply to do it.");
process.exit(0);
