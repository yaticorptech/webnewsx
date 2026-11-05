/**
 * Builds data/pincodes.json.gz — every PIN code in India with its state and district (owner 2026-11-05: "all India
 * PIN codes accept and validate"). The Press Pass form rejects a PIN that isn't here, and fills state + district from
 * it when India Post's live lookup is down (lib/pincode.ts).
 *
 * Source: India Post's All India Pincode Directory (data.gov.in, Open Government Data Licence – India), as bundled in
 * the npm package `india-pincode` 2.5.9 (MIT) — the same file as scripts/build-places.ts.
 *
 *   npm pack india-pincode@2.5.9 && tar -xzf india-pincode-2.5.9.tgz
 *   node --import tsx scripts/build-pincodes.ts package/data/pincodes.json.gz
 *
 * Output: { "<pin>": [state code, district] } — the district most of the PIN's post offices are in.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { kaDistrict } from "../src/lib/pincode.js";
import { fromBackendRoot } from "../src/lib/paths.js";
import { INDIAN_REGIONS } from "../src/shared/contracts.js";

type Office = { p: string | number; i: string; s: string };
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s(.-])([a-z])/g, (_, before: string, ch: string) => before + ch.toUpperCase());

const input = process.argv[2];
if (!input) throw new Error("Usage: node --import tsx scripts/build-pincodes.ts <india-pincode>/data/pincodes.json.gz");
const offices = JSON.parse(gunzipSync(readFileSync(input)).toString("utf8")) as Office[];
const stateCode = new Map(INDIAN_REGIONS.map((r) => [r.name.toUpperCase(), r.code]));
stateCode.set("THE DADRA AND NAGAR HAVELI AND DAMAN AND DIU", "DH");

/** pin → "state|district" → offices. */
const counts = new Map<string, Map<string, number>>();
for (const office of offices) {
  const pin = String(office.p);
  if (!/^[1-9][0-9]{5}$/.test(pin)) continue;
  const state = stateCode.get(office.s);
  if (!state) continue;
  const district = state === "KA" ? (kaDistrict(office.i) ?? titleCase(office.i)) : titleCase(office.i.trim());
  const key = `${state}|${district}`;
  const byPlace = counts.get(pin) ?? new Map<string, number>();
  byPlace.set(key, (byPlace.get(key) ?? 0) + 1);
  counts.set(pin, byPlace);
}
const out: Record<string, [string, string]> = {};
for (const [pin, byPlace] of [...counts.entries()].sort()) {
  const [best] = [...byPlace.entries()].sort((a, b) => b[1] - a[1]);
  if (best) out[pin] = best[0].split("|") as [string, string];
}
const file = fromBackendRoot("data/pincodes.json.gz");
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, gzipSync(JSON.stringify(out), { level: 9 }));
console.log(`[build-pincodes] ${Object.keys(out).length} PIN codes → ${file}`);
