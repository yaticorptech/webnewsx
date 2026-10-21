import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { PlaceSuggestion } from "../shared/contracts.js";
import { fromBackendRoot } from "./paths.js";

/*
 * Every city, town and village in India for the City boxes (owner 2026-10-05) — data/places.json.gz, built by
 * scripts/build-places.ts from India Post's directory. Loaded on first use (~160k places), kept in memory.
 */

type Place = { name: string; district: string; state: string; rank: number; aka: string[]; keys: string[] };

/** Letters and digits only, lower case: "K.R. Pet" and "kr pet" match. */
const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

let byState: Map<string, Place[]> | null = null;

function places(): Map<string, Place[]> {
  if (byState) return byState;
  const rows = JSON.parse(gunzipSync(readFileSync(fromBackendRoot("data/places.json.gz"))).toString("utf8")) as [
    string,
    string,
    string,
    number,
    ...string[],
  ][];
  const map = new Map<string, Place[]>();
  for (const [name, district, state, rank, ...aka] of rows) {
    const place: Place = { name, district, state, rank, aka, keys: [name, ...aka].map(norm) };
    const list = map.get(state);
    if (list) list.push(place);
    else map.set(state, [place]);
  }
  // Headquarters, then taluk towns, then towns, then villages; A–Z within each.
  for (const list of map.values()) list.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  byState = map;
  return map;
}

/**
 * Places whose name (or an older spelling) STARTS with `q` — only those (owner 2026-10-05: "ba" never lists Kadaba).
 * `state` / `district` narrow the list; with nothing typed and a district chosen, its towns first.
 */
export function searchPlaces({ q, state, district, limit = 50 }: { q: string; state?: string; district?: string; limit?: number }): PlaceSuggestion[] {
  const prefix = norm(q);
  if (!prefix && !district) return [];
  const all = places();
  const pools = state ? [all.get(state) ?? []] : [...all.values()];
  const inDistrict = district?.trim().toLowerCase();
  const found: PlaceSuggestion[] = [];
  const candidates: { place: Place; key: number }[] = [];
  for (const pool of pools) {
    for (const place of pool) {
      if (inDistrict && place.district.toLowerCase() !== inDistrict) continue;
      const key = prefix ? place.keys.findIndex((k) => k.startsWith(prefix)) : 0;
      if (key === -1) continue;
      candidates.push({ place, key });
      // Each pool is already in rank order: one state needs no more than `limit`.
      if (state && candidates.length >= limit) break;
    }
  }
  candidates.sort((a, b) => a.place.rank - b.place.rank || a.place.name.localeCompare(b.place.name));
  for (const { place, key } of candidates.slice(0, limit)) {
    found.push({ name: place.name, district: place.district, state: place.state, matchedAka: key > 0 ? (place.aka[key - 1] ?? null) : null });
  }
  return found;
}
