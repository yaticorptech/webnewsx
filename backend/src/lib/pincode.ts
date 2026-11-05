import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { cached } from "./cache.js";
import { fromBackendRoot } from "./paths.js";
import { searchPlaces } from "./places.js";
import { INDIAN_REGIONS, KARNATAKA_DISTRICTS } from "../shared/contracts.js";

/*
 * PIN code → state, district and town (owner 2026-11-05: "after PIN code is added, state, district and town auto
 * fill, but editable"). India Post's directory via api.postalpincode.in (free, no key); the taluk ("Block") is the
 * town. Karnataka names are turned into the form's spellings through the place directory (Mysore → Mysuru,
 * Bangalore South → Bengaluru, district Bangalore → Bengaluru Urban). A day's cache per PIN; null when unknown.
 */

export type PincodePlace = { state: string; district: string; city: string };

/**
 * Every PIN code in India → [state code, district] (data/pincodes.json.gz, scripts/build-pincodes.ts; owner
 * 2026-11-05: "all India PIN codes accept and validate"). Loaded once, on first use.
 */
let directory: Map<string, [string, string]> | null = null;
function pins(): Map<string, [string, string]> {
  if (!directory) {
    const raw = JSON.parse(gunzipSync(readFileSync(fromBackendRoot("data/pincodes.json.gz"))).toString("utf8")) as Record<string, [string, string]>;
    directory = new Map(Object.entries(raw));
  }
  return directory;
}

/** A real Indian PIN code (in India Post's directory). */
export function isKnownPincode(pin: string): boolean {
  return /^[1-9][0-9]{5}$/.test(pin) && pins().has(pin);
}

const TTL = 24 * 60 * 60;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s(.-])([a-z])/g, (_, before: string, ch: string) => before + ch.toUpperCase());

/** India Post's older Karnataka district names → KARNATAKA_DISTRICTS. */
const KA_DISTRICTS: Readonly<Record<string, string>> = {
  bangalore: "Bengaluru Urban",
  bangalorerural: "Bengaluru Rural",
  bengaluru: "Bengaluru Urban",
  mysore: "Mysuru",
  belgaum: "Belagavi",
  bellary: "Ballari",
  bijapur: "Vijayapura",
  chikmagalur: "Chikkamagaluru",
  gulbarga: "Kalaburagi",
  shimoga: "Shivamogga",
  tumkur: "Tumakuru",
  davangere: "Davanagere",
  bagalkot: "Bagalkote",
  chamrajnagar: "Chamarajanagar",
  chamarajanagara: "Chamarajanagar",
  chikkaballapura: "Chikkaballapur",
  ramanagar: "Ramanagara (Bengaluru South)",
  ramanagara: "Ramanagara (Bengaluru South)",
  yadgiri: "Yadgir",
  vijaynagar: "Vijayanagara",
};

export function kaDistrict(raw: string): string | null {
  const key = norm(raw);
  return KA_DISTRICTS[key] ?? KARNATAKA_DISTRICTS.find((d) => norm(d) === key) ?? null;
}

/** "Bangalore South" → "Bangalore"; "Mysore Taluk" → "Mysore". */
const taluk = (block: string) => block.replace(/\b(north|south|east|west|rural|urban|taluk|city)\b/gi, "").replace(/\s+/g, " ").trim();

type PostOffice = { Name: string; Block: string; District: string; State: string; DeliveryStatus: string; BranchType: string };

async function load(pin: string): Promise<PincodePlace | null> {
  const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, { signal: AbortSignal.timeout(8_000) }).catch(() => null);
  if (!res?.ok) throw new Error("pincode lookup unavailable"); // not cached: tried again next time
  const body = (await res.json().catch(() => null)) as { Status?: string; PostOffice?: PostOffice[] | null }[] | null;
  const offices = body?.[0]?.PostOffice ?? [];
  if (body?.[0]?.Status !== "Success" || offices.length === 0) return null;
  // A town office first (head / sub post office), then any delivery office.
  const office = offices.find((o) => o.BranchType !== "Branch Post Office" && o.DeliveryStatus === "Delivery") ?? offices.find((o) => o.DeliveryStatus === "Delivery") ?? offices[0];
  if (!office) return null;
  const region = INDIAN_REGIONS.find((r) => norm(r.name) === norm(office.State));
  if (!region) return null;
  const block = office.Block && office.Block !== "NA" ? taluk(office.Block) : "";
  if (region.code !== "KA") {
    return { state: region.code, district: titleCase(office.District), city: titleCase(block || office.Name) };
  }
  const district = kaDistrict(office.District);
  // The town in the place directory's spelling, preferring one in the PIN's own district.
  for (const candidate of [block, office.Name].filter(Boolean)) {
    const matches = searchPlaces({ q: candidate, state: "KA", limit: 20 }).filter((p) => norm(p.matchedAka ?? p.name) === norm(candidate) || norm(p.name) === norm(candidate));
    const place = matches.find((p) => p.district === district) ?? matches[0];
    if (place) return { state: "KA", district: place.district, city: place.name };
  }
  return { state: "KA", district: district ?? "", city: titleCase(block || office.Name) };
}

/**
 * `valid` false = not an Indian PIN code. Otherwise its place: the live lookup's (with the town), or — when India
 * Post's service is down — the directory's state and district without a town.
 */
export async function lookupPincode(pin: string): Promise<{ valid: boolean; place: PincodePlace | null }> {
  const known = isKnownPincode(pin) ? pins().get(pin) : undefined;
  if (!known) return { valid: false, place: null };
  const live = await cached(`pincode:${pin}`, TTL, () => load(pin)).catch(() => null);
  return { valid: true, place: live ?? { state: known[0], district: known[1], city: "" } };
}
