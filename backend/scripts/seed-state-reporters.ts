/**
 * Demo reporters for every state (owner 2026-10-05: "create dummy reporters, 2 each for all states"): two Verified
 * Reporters per state (28 states → 56), each with a Press Pass (state, district, city, languages), an advertorial price
 * and a generated avatar — so the press meet reporter picker has someone in every state. Demo accounts only
 * (@demo.webnews.local, password "webnews-demo-2026"; `npm run db:seed -- --force-seed --reset` removes them).
 * Idempotent: existing accounts are left as they are. Local development only.
 *
 *   node --import tsx scripts/seed-state-reporters.ts
 */
import { generateRandomString, hashPassword } from "better-auth/crypto";
import { eq, or } from "drizzle-orm";
import { closeDatabase, db } from "../src/db/client.js";
import { DEMO_EMAIL_DOMAIN } from "../src/db/purge.js";
import { account, pressPass, user } from "../src/db/schema.js";
import { env } from "../src/env.js";
import { isUniqueViolation } from "../src/lib/errors.js";
import { processImage } from "../src/lib/images.js";
import { newImageKey, storage } from "../src/lib/storage.js";
import { newPassNumber } from "../src/queries/press-pass.js";
import { TERMS_VERSION, type PressLanguage, type ReporterType, type ReportingExperience } from "../src/shared/contracts.js";
import { renderAvatar } from "./seed-art.js";

type Reporter = { name: string; district: string; city: string; languages: PressLanguage[] };

/** Two reporters per state: [state code, first reporter, second reporter]. Names and places only; outlets are fictional. */
const STATES: [string, Reporter, Reporter][] = [
  ["AP", { name: "Srinivas Reddy", district: "Visakhapatnam", city: "Visakhapatnam", languages: ["te", "en"] }, { name: "Lakshmi Prasanna", district: "Krishna", city: "Vijayawada", languages: ["te", "en"] }],
  ["AR", { name: "Tage Rinchin", district: "Papum Pare", city: "Itanagar", languages: ["en", "hi"] }, { name: "Nabam Yami", district: "Papum Pare", city: "Naharlagun", languages: ["en", "hi"] }],
  ["AS", { name: "Pranjal Bora", district: "Kamrup Metropolitan", city: "Guwahati", languages: ["as", "en"] }, { name: "Moitrayee Das", district: "Dibrugarh", city: "Dibrugarh", languages: ["as", "bn"] }],
  ["BR", { name: "Ravi Ranjan", district: "Patna", city: "Patna", languages: ["hi", "bho"] }, { name: "Anjali Kumari", district: "Darbhanga", city: "Darbhanga", languages: ["hi", "mai"] }],
  ["CG", { name: "Vikas Sahu", district: "Raipur", city: "Raipur", languages: ["hi", "en"] }, { name: "Neha Verma", district: "Durg", city: "Bhilai", languages: ["hi"] }],
  ["GA", { name: "Savio Fernandes", district: "North Goa", city: "Panaji", languages: ["kok", "en"] }, { name: "Pooja Naik", district: "South Goa", city: "Margao", languages: ["kok", "mr"] }],
  ["GJ", { name: "Hardik Patel", district: "Ahmedabad", city: "Ahmedabad", languages: ["gu", "en"] }, { name: "Kinjal Shah", district: "Surat", city: "Surat", languages: ["gu", "hi"] }],
  ["HR", { name: "Sandeep Yadav", district: "Gurugram", city: "Gurugram", languages: ["hi", "en"] }, { name: "Pooja Malik", district: "Karnal", city: "Karnal", languages: ["hi", "pa"] }],
  ["HP", { name: "Rohit Thakur", district: "Shimla", city: "Shimla", languages: ["hi", "en"] }, { name: "Kavita Negi", district: "Kangra", city: "Dharamshala", languages: ["hi"] }],
  ["JH", { name: "Amit Oraon", district: "Ranchi", city: "Ranchi", languages: ["hi", "sat"] }, { name: "Sunita Murmu", district: "East Singhbhum", city: "Jamshedpur", languages: ["sat", "hi"] }],
  ["KA", { name: "Prajwal Shetty", district: "Dakshina Kannada", city: "Mangaluru", languages: ["kn", "tcy", "en"] }, { name: "Kavya Gowda", district: "Mysuru", city: "Mysuru", languages: ["kn", "en"] }],
  ["KL", { name: "Arjun Menon", district: "Ernakulam", city: "Kochi", languages: ["ml", "en"] }, { name: "Fathima Nasreen", district: "Thiruvananthapuram", city: "Thiruvananthapuram", languages: ["ml"] }],
  ["MP", { name: "Rahul Chouhan", district: "Indore", city: "Indore", languages: ["hi", "en"] }, { name: "Priya Joshi", district: "Bhopal", city: "Bhopal", languages: ["hi"] }],
  ["MH", { name: "Aditya Kulkarni", district: "Pune", city: "Pune", languages: ["mr", "en"] }, { name: "Sneha Patil", district: "Mumbai City", city: "Mumbai", languages: ["mr", "hi"] }],
  ["MN", { name: "Tomba Singh", district: "Imphal West", city: "Imphal", languages: ["mni", "en"] }, { name: "Bembem Devi", district: "Imphal East", city: "Imphal", languages: ["mni"] }],
  ["ML", { name: "Wanshan Lyngdoh", district: "East Khasi Hills", city: "Shillong", languages: ["en"] }, { name: "Daphira Kharkongor", district: "West Jaintia Hills", city: "Jowai", languages: ["en"] }],
  ["MZ", { name: "Lalrinmawia Ralte", district: "Aizawl", city: "Aizawl", languages: ["en"] }, { name: "Lalnunpuii Hnamte", district: "Lunglei", city: "Lunglei", languages: ["en"] }],
  ["NL", { name: "Vikheto Sema", district: "Kohima", city: "Kohima", languages: ["en"] }, { name: "Akhrieno Angami", district: "Dimapur", city: "Dimapur", languages: ["en", "hi"] }],
  ["OD", { name: "Subhransu Mohanty", district: "Khordha", city: "Bhubaneswar", languages: ["or", "en"] }, { name: "Smruti Das", district: "Cuttack", city: "Cuttack", languages: ["or"] }],
  ["PB", { name: "Gurpreet Singh", district: "Ludhiana", city: "Ludhiana", languages: ["pa", "en"] }, { name: "Harleen Kaur", district: "Amritsar", city: "Amritsar", languages: ["pa", "hi"] }],
  ["RJ", { name: "Mahendra Rathore", district: "Jaipur", city: "Jaipur", languages: ["hi", "raj"] }, { name: "Sunita Sharma", district: "Jodhpur", city: "Jodhpur", languages: ["hi", "raj"] }],
  ["SK", { name: "Karma Bhutia", district: "Gangtok", city: "Gangtok", languages: ["ne", "en"] }, { name: "Pema Lepcha", district: "Namchi", city: "Namchi", languages: ["ne"] }],
  ["TN", { name: "Karthik Subramanian", district: "Chennai", city: "Chennai", languages: ["ta", "en"] }, { name: "Divya Lakshmi", district: "Coimbatore", city: "Coimbatore", languages: ["ta"] }],
  ["TG", { name: "Naveen Goud", district: "Hyderabad", city: "Hyderabad", languages: ["te", "en"] }, { name: "Sameera Begum", district: "Hanumakonda", city: "Warangal", languages: ["te", "ur"] }],
  ["TR", { name: "Biplab Debnath", district: "West Tripura", city: "Agartala", languages: ["bn", "en"] }, { name: "Moumita Saha", district: "Gomati", city: "Udaipur", languages: ["bn"] }],
  ["UP", { name: "Abhishek Tiwari", district: "Lucknow", city: "Lucknow", languages: ["hi", "en"] }, { name: "Shalini Mishra", district: "Varanasi", city: "Varanasi", languages: ["hi", "ur"] }],
  ["UK", { name: "Deepak Rawat", district: "Dehradun", city: "Dehradun", languages: ["hi", "en"] }, { name: "Meenakshi Bisht", district: "Nainital", city: "Haldwani", languages: ["hi"] }],
  ["WB", { name: "Sourav Banerjee", district: "Kolkata", city: "Kolkata", languages: ["bn", "en"] }, { name: "Rituparna Ghosh", district: "Darjeeling", city: "Siliguri", languages: ["bn", "ne"] }],
];

const PASSWORD = "webnews-demo-2026";
const DAY = 86_400_000;
const TYPES: ReporterType[] = ["staff", "freelance", "citizen"];
const EXPERIENCE: ReportingExperience[] = ["3_5", "6_10", "1_2", "10_plus"];
const newId = () => generateRandomString(32, "a-z", "A-Z", "0-9");
const usernameOf = (name: string) => name.toLowerCase().replace(/[^a-z ]/g, "").trim().replace(/\s+/g, ".");

async function main() {
  if (env.isProduction || !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(env.FRONTEND_URL)) {
    throw new Error("Demo reporters are for local development only");
  }
  const passwordHash = await hashPassword(PASSWORD);
  let created = 0;
  let index = 0;
  for (const [state, ...pair] of STATES) {
    for (const r of pair) {
      index++;
      const username = usernameOf(r.name);
      const email = `${username}@${DEMO_EMAIL_DOMAIN}`;
      const [taken] = await db.select({ id: user.id }).from(user).where(or(eq(user.email, email), eq(user.username, username))).limit(1);
      if (taken) continue;

      const id = newId();
      const joined = new Date(Date.now() - (30 + (index % 40) * 3) * DAY);
      const avatar = await processImage(await renderAvatar(200 + index), "avatar");
      const image = await storage.put(newImageKey("avatar", id), avatar.buffer, avatar.contentType);
      const outlet = index % 3 === 2 ? null : `${r.city} ${index % 2 ? "Times" : "Herald"}`;
      for (let attempt = 0; ; attempt++) {
        try {
          await db.transaction(async (tx) => {
            await tx.insert(user).values({
              id,
              name: r.name,
              email,
              emailVerified: true,
              image,
              username,
              bio: `Reporter in ${r.city}. Local news, civic issues and culture.`,
              role: "reporter",
              reporterLevel: "verified",
              pressMeetPrice: 500 + ((index * 137) % 26) * 100,
              onboardedAt: joined,
              termsAcceptedAt: joined,
              termsVersion: TERMS_VERSION,
              createdAt: joined,
              updatedAt: joined,
            });
            await tx.insert(account).values({ id: newId(), accountId: id, providerId: "credential", userId: id, password: passwordHash, createdAt: joined, updatedAt: joined });
            await tx.insert(pressPass).values({
              userId: id,
              passNumber: newPassNumber(state),
              mobile: `+91900010${String(index).padStart(4, "0")}`,
              reporterType: TYPES[index % TYPES.length]!,
              outlet,
              experience: EXPERIENCE[index % EXPERIENCE.length]!,
              state,
              district: r.district,
              city: r.city,
              languages: r.languages,
              about: `Covers ${r.city} and the rest of ${r.district} district.`,
              pledgeSignedAt: new Date(joined.getTime() + DAY),
              pledgeSignature: r.name,
              level: "verified",
              approvedCount: 5 + (index % 12),
              issuedAt: new Date(joined.getTime() + DAY),
            });
          });
          created++;
          break;
        } catch (error) {
          if (attempt < 4 && isUniqueViolation(error, "press_pass_pass_number_unique")) continue;
          throw error;
        }
      }
    }
  }
  console.log(`[seed-state-reporters] ${created} new reporters (${STATES.length * 2 - created} already there) · password "${PASSWORD}"`);
}

try {
  await main();
} catch (error) {
  console.error("[seed-state-reporters] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
