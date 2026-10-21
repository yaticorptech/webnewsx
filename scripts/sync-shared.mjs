#!/usr/bin/env node
// Copies shared/contracts.ts into each app so backend/ and frontend/ stay independently deployable.
// Usage: node scripts/sync-shared.mjs          → write copies
//        node scripts/sync-shared.mjs --check  → exit 1 if any copy drifted
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "shared/contracts.ts"), "utf8");
const header = "// GENERATED from /shared/contracts.ts by scripts/sync-shared.mjs — DO NOT EDIT. Edit the source and run `npm run sync:shared`.\n";
const content = header + source;
const targets = ["backend/src/shared/contracts.ts", "frontend/lib/shared/contracts.ts"];
const check = process.argv.includes("--check");

let drift = false;
for (const rel of targets) {
  const file = join(root, rel);
  if (!existsSync(join(root, rel.split("/")[0]))) continue; // app folder not created yet
  const current = existsSync(file) ? readFileSync(file, "utf8") : null;
  if (current === content) continue;
  if (check) {
    console.error(`✗ ${rel} is out of sync with shared/contracts.ts`);
    drift = true;
  } else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    console.log(`✓ wrote ${rel}`);
  }
}
if (drift) process.exit(1);
if (check) console.log("✓ shared contracts in sync");
