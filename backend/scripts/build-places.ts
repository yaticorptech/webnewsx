/**
 * Builds data/places.json.gz — every city, town and village the City boxes suggest (owner 2026-10-05: "not only taluk
 * towns, small to small places too"; Press Pass form + press meet reporter picker, via GET /api/places).
 *
 * Source: India Post's All India Pincode Directory (data.gov.in, Open Government Data Licence – India), as bundled in
 * the npm package `india-pincode` 2.5.9 (MIT) — its data/pincodes.json.gz. Every post office is a place: branch
 * offices (B.O) are villages, sub / head offices (S.O / H.O) towns and city areas. On top, Karnataka's taluk towns with
 * their modern names and old spellings (Mangaluru · Mangalore), which also replace the post office's own spelling.
 *
 *   npm pack india-pincode@2.5.9 && tar -xzf india-pincode-2.5.9.tgz
 *   node --import tsx scripts/build-places.ts package/data/pincodes.json.gz
 *
 * Output rows: [name, district, state code, rank, ...other spellings]. Rank: 0 district headquarters · 1 taluk town ·
 * 2 town (sub / head post office) · 3 village (branch post office) — suggestions list lower ranks first.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { dirname } from "node:path";
import { fromBackendRoot } from "../src/lib/paths.js";
import { INDIAN_REGIONS, KARNATAKA_DISTRICTS } from "../src/shared/contracts.js";

/** Karnataka's taluk towns by district; the first is the headquarters; after "|": other spellings. */
const KARNATAKA_TOWNS: Readonly<Record<string, readonly string[]>> = {
  Bagalkote: ["Bagalkote|Bagalkot", "Badami", "Bilagi", "Guledagudda|Guledgudda", "Hunagunda|Hungund", "Ilkal", "Jamakhandi|Jamkhandi", "Mudhol", "Rabakavi Banahatti|Rabkavi Banhatti", "Terdal"],
  Ballari: ["Ballari|Bellary", "Kampli", "Kurugodu", "Sanduru|Sandur", "Siruguppa"],
  Belagavi: ["Belagavi|Belgaum", "Athani", "Bailhongal", "Chikkodi|Chikodi", "Gokak", "Hukkeri", "Kagawad|Kagwad", "Khanapur", "Kittur", "Mudalagi", "Nippani|Nipani", "Raibag", "Ramdurg", "Savadatti|Saundatti", "Yaragatti"],
  "Bengaluru Rural": ["Doddaballapura|Doddaballapur", "Devanahalli", "Hoskote", "Nelamangala"],
  "Bengaluru Urban": ["Bengaluru|Bangalore", "Anekal", "Yelahanka"],
  Bidar: ["Bidar", "Aurad", "Basavakalyan", "Bhalki", "Chitaguppa|Chitgoppa", "Hulsoor", "Humnabad|Homnabad", "Kamalnagar"],
  Chamarajanagar: ["Chamarajanagar|Chamrajnagar", "Gundlupet", "Hanur", "Kollegal|Kollegala", "Yelandur"],
  Chikkaballapur: ["Chikkaballapur|Chickballapur", "Bagepalli", "Cheluru", "Chintamani", "Gauribidanur", "Gudibande", "Sidlaghatta|Shidlaghatta"],
  Chikkamagaluru: ["Chikkamagaluru|Chikmagalur", "Ajjampura", "Kadur", "Kalasa", "Koppa", "Mudigere", "Narasimharajapura|N R Pura", "Sringeri", "Tarikere"],
  Chitradurga: ["Chitradurga", "Challakere", "Hiriyur", "Holalkere", "Hosadurga", "Molakalmuru"],
  "Dakshina Kannada": ["Mangaluru|Mangalore", "Bantwal|Bantval", "Belthangady|Beltangadi", "Kadaba", "Moodbidri|Moodabidri|Mudbidri", "Mulki|Mulky", "Puttur", "Sullia|Sulya", "Ullal", "Vitla|Vittal"],
  Davanagere: ["Davanagere|Davangere", "Channagiri", "Harihar", "Honnali", "Jagalur", "Nyamati"],
  Dharwad: ["Dharwad", "Alnavar", "Annigeri", "Hubballi|Hubli", "Kalghatgi", "Kundgol", "Navalgund"],
  Gadag: ["Gadag", "Gajendragad", "Laxmeshwar|Lakshmeshwar", "Mundargi", "Naragund|Nargund", "Ron", "Shirahatti"],
  Hassan: ["Hassan", "Alur", "Arkalgud", "Arsikere", "Belur", "Channarayapatna", "Holenarasipura|Holenarsipur", "Sakleshpur"],
  Haveri: ["Haveri", "Byadgi|Byadagi", "Hanagal|Hangal", "Hirekerur", "Ranebennur|Ranibennur", "Rattihalli", "Savanur", "Shiggaon"],
  Kalaburagi: ["Kalaburagi|Gulbarga", "Afzalpur", "Aland", "Chincholi", "Chittapur", "Jevargi", "Kalagi", "Kamalapur", "Sedam", "Shahabad", "Yadrami"],
  Kodagu: ["Madikeri|Mercara", "Kushalnagar", "Ponnampet", "Somwarpet|Somavarapete", "Virajpet|Virajpete"],
  Kolar: ["Kolar", "Bangarapet", "Kolar Gold Fields|KGF|Robertsonpet", "Malur", "Mulbagal", "Srinivasapura|Srinivaspur"],
  Koppal: ["Koppal", "Gangavathi|Gangavati", "Kanakagiri", "Karatagi", "Kukanoor", "Kushtagi", "Yelburga"],
  Mandya: ["Mandya", "Krishnarajpet|K R Pet", "Maddur", "Malavalli", "Nagamangala", "Pandavapura", "Srirangapatna|Srirangapatnam|Seringapatam"],
  Mysuru: ["Mysuru|Mysore", "Heggadadevanakote|H D Kote", "Hunsur", "Krishnarajanagara|K R Nagar", "Nanjangud", "Periyapatna", "Saligrama", "Sargur", "Tirumakudalu Narasipura|T Narasipura"],
  Raichur: ["Raichur", "Devadurga", "Lingasugur|Lingsugur", "Manvi", "Maski", "Sindhanur|Sindhnur", "Sirwar"],
  "Ramanagara (Bengaluru South)": ["Ramanagara", "Channapatna", "Harohalli", "Kanakapura", "Magadi"],
  Shivamogga: ["Shivamogga|Shimoga", "Bhadravati", "Hosanagara", "Sagara|Sagar", "Shikaripura|Shikaripur", "Soraba|Sorab", "Thirthahalli|Tirthahalli"],
  Tumakuru: ["Tumakuru|Tumkur", "Chikkanayakanahalli|C N Halli", "Gubbi", "Koratagere", "Kunigal", "Madhugiri", "Pavagada", "Sira", "Tiptur", "Turuvekere"],
  Udupi: ["Udupi", "Brahmavar", "Byndoor|Baindur", "Hebri", "Kapu|Kaup", "Karkala|Karkal", "Kundapura|Kundapur|Coondapur"],
  "Uttara Kannada": ["Karwar", "Ankola", "Bhatkal", "Dandeli", "Haliyal", "Honnavar", "Joida", "Kumta", "Mundgod", "Siddapur", "Sirsi", "Yellapur"],
  Vijayanagara: ["Hosapete|Hospet", "Hagaribommanahalli|H B Halli", "Harapanahalli", "Hoovina Hadagali|Hadagali", "Kotturu|Kottur", "Kudligi"],
  Vijayapura: ["Vijayapura|Bijapur", "Almel", "Babaleshwar", "Basavana Bagewadi", "Chadachan", "Devara Hippargi", "Indi", "Kolhar", "Muddebihal", "Nidagundi", "Sindagi", "Talikota", "Tikota"],
  Yadgir: ["Yadgir", "Gurmitkal", "Hunasagi", "Shahapur", "Shorapur|Surpur", "Vadagera"],
};

/** The directory's Karnataka district spellings that differ from KARNATAKA_DISTRICTS. */
const KA_DISTRICT_FIXES: Readonly<Record<string, string>> = {
  BAGALKOT: "Bagalkote",
  CHAMARAJANAGARA: "Chamarajanagar",
  CHIKKABALLAPURA: "Chikkaballapur",
  DAVANGERE: "Davanagere",
  VIJAYNAGAR: "Vijayanagara",
  RAMANAGARA: "Ramanagara (Bengaluru South)",
};

const STATE_FIXES: Readonly<Record<string, string>> = { "THE DADRA AND NAGAR HAVELI AND DAMAN AND DIU": "DH" };

type Office = { o: string; t: string; i: string; s: string };
type Row = [name: string, district: string, state: string, rank: number, ...aka: string[]];

const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
const titleCase = (text: string) => text.toLowerCase().replace(/(^|[\s(.-])([a-z])/g, (_, before: string, ch: string) => before + ch.toUpperCase());

/** Post office names that are offices, not places. */
const NOT_A_PLACE = /\b(collectorate|complex|secretariat|court|soudha|office|treasury|cantonment)\b/i;

/** "Kuthethur Bajav B.O" → "Kuthethur Bajav"; "Kadaba S.O (Dakshina Kannada)" → "Kadaba"; "NAYANDAHALLI" → "Nayandahalli". */
function placeName(raw: string, district: string): string | null {
  let name = raw
    // The office type, wherever it is: B.O, BO, S.O, S. O, SO, H.O, P.O, PO, DBO, NDBO, MDG.
    .replace(/(^|\s|\()(N?D?B\.?\s?O|S\.?\s?O|H\.?\s?O|P\.?\s?O|MDG)\.?(?=$|\s|\()/g, "$1")
    .replace(/\s*\(\s*/g, " (")
    .replace(/\s*\)\s*/g, ") ")
    .replace(/\s+/g, " ")
    .trim();
  // Qualifiers that only repeat the district or are numbers: "(Dakshina Kannada)", "(34)".
  name = name.replace(/\s?\(([^)]*)\)/g, (whole, inner: string) => (norm(inner) === norm(district) || /^\d+$/.test(inner.trim()) ? "" : whole)).trim();
  name = name.replace(/\(\s*\)/g, "").trim();
  if (!name || NOT_A_PLACE.test(name)) return null;
  if (name === name.toUpperCase()) name = titleCase(name);
  return name;
}

const input = process.argv[2];
if (!input) throw new Error("Usage: node --import tsx scripts/build-places.ts <india-pincode>/data/pincodes.json.gz");
const offices = JSON.parse(gunzipSync(readFileSync(input)).toString("utf8")) as Office[];

const stateCode = new Map(INDIAN_REGIONS.map((region) => [region.name.toUpperCase(), region.code]));
for (const [name, code] of Object.entries(STATE_FIXES)) stateCode.set(name, code);
const kaDistrict = (raw: string) =>
  KA_DISTRICT_FIXES[raw] ?? KARNATAKA_DISTRICTS.find((district) => district.toUpperCase() === raw) ?? null;

const rows: Row[] = [];
/** state|district|spelling → taken (towns first, then offices by rank). */
const taken = new Set<string>();
const keyOf = (state: string, district: string, spelling: string) => `${state}|${district}|${norm(spelling)}`;

for (const [district, towns] of Object.entries(KARNATAKA_TOWNS)) {
  if (!KARNATAKA_DISTRICTS.includes(district)) throw new Error(`Unknown district ${district}`);
  towns.forEach((entry, i) => {
    const [name, ...aka] = entry.split("|") as [string, ...string[]];
    rows.push([name, district, "KA", i === 0 ? 0 : 1, ...aka]);
    for (const spelling of [name, ...aka]) taken.add(keyOf("KA", district, spelling));
  });
}

const unknown = new Set<string>();
// Towns (sub / head offices) before villages, so a place keeps its better rank.
const ordered = [...offices].sort((a, b) => Number(a.t === "BO") - Number(b.t === "BO"));
for (const office of ordered) {
  const state = stateCode.get(office.s);
  if (!state) {
    unknown.add(`state ${office.s}`);
    continue;
  }
  const district = state === "KA" ? kaDistrict(office.i) : titleCase(office.i.trim());
  if (!district) {
    unknown.add(`KA district ${office.i}`);
    continue;
  }
  const name = placeName(office.o, district);
  if (!name) continue;
  const key = keyOf(state, district, name);
  if (taken.has(key)) continue;
  taken.add(key);
  rows.push([name, district, state, office.t === "BO" ? 3 : 2]);
}

const out = fromBackendRoot("data/places.json.gz");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, gzipSync(JSON.stringify(rows), { level: 9 }));
console.log(`[places] ${rows.length} places (${rows.filter((r) => r[2] === "KA").length} in Karnataka) → ${out}`);
if (unknown.size) console.log(`[places] skipped: ${[...unknown].join(", ")}`);
