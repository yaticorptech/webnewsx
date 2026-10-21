/**
 * Demo data for the roles model (SPEC §3.11): Press Pass details of the demo publishers (all Verified
 * Reporters), a Trainee with stories in every Review Desk state, a Reader, the demo Editor Desk account,
 * a pending Spotlight request and a few reader reports. Places, wards and people are fictional
 * (only the pass regions use real Indian states / districts).
 */
import type { FlagReason, PressLanguage, ReporterType, ReportingExperience } from "../src/shared/contracts.js";
import type { Block } from "./seed-data.js";

export type DemoPress = {
  /** Placeholder numbers (+91 90000 000xx), demo only. */
  mobile: string;
  reporterType: ReporterType;
  outlet: string | null;
  experience: ReportingExperience;
  state: string;
  district: string | null;
  city: string | null;
  languages: PressLanguage[];
  about: string;
};

/** Verification details + home region of every demo publisher (their passes are Verified). Outlets are fictional. */
export const DEMO_PRESS: Record<string, DemoPress> = {
  "harbor.ledger": {
    mobile: "+919000000001",
    reporterType: "staff",
    outlet: "The Harbor Ledger",
    experience: "6_10",
    state: "KA",
    district: "Dakshina Kannada",
    city: "Mangaluru",
    languages: ["en", "kn"],
    about: "Foreign desk out of the coast: ports, trade routes and the politics around them.",
  },
  "circuit.desk": {
    mobile: "+919000000002",
    reporterType: "staff",
    outlet: "Circuit Desk",
    experience: "3_5",
    state: "KA",
    district: "Bengaluru Urban",
    city: "Bengaluru",
    languages: ["en", "kn"],
    about: "Plain-English tech reporting from the startup corridors — no hype, no press-release rewrites.",
  },
  "final.whistle": {
    mobile: "+919000000003",
    reporterType: "freelance",
    outlet: null,
    experience: "3_5",
    state: "MH",
    district: "Mumbai",
    city: "Mumbai",
    languages: ["en", "hi"],
    about: "Match reports and the stories behind the scoreline, from school grounds to stadiums.",
  },
  "market.pulse": {
    mobile: "+919000000004",
    reporterType: "staff",
    outlet: "Market Pulse",
    experience: "10_plus",
    state: "KA",
    district: "Mysuru",
    city: "Mysuru",
    languages: ["kn", "en"],
    about: "Markets, prices and the small businesses that keep our cities running.",
  },
  "field.notes": {
    mobile: "+919000000005",
    reporterType: "freelance",
    outlet: "Field Notes Review",
    experience: "1_2",
    state: "KL",
    district: "Thiruvananthapuram",
    city: "Thiruvananthapuram",
    languages: ["en"],
    about: "Science explained without the jargon — from the lab bench to the ocean floor.",
  },
  "the.back.page": {
    mobile: "+919000000006",
    reporterType: "citizen",
    outlet: null,
    experience: "3_5",
    state: "KA",
    district: "Dharwad",
    city: "Hubballi",
    languages: ["kn", "en"],
    about: "Film, books, music and the city after dark.",
  },
};

export type DemoPerson = { username: string; name: string; bio: string };

/** Demo Editor Desk account (email admin.demo@demo.webnews.local) — try the console before creating the real admin. */
export const DEMO_ADMIN: DemoPerson = {
  username: "admin.demo",
  name: "Demo Editor Desk",
  bio: "Demo Editor Desk account. Reviews Trainee stories, handles reader reports and Spotlight requests.",
};

/** A Trainee reporter: one approved story, one waiting at the Review Desk, one returned with a note. */
export const DEMO_TRAINEE: DemoPerson & { press: DemoPress } = {
  username: "ward.watch",
  name: "Ward Watch",
  bio: "Civic reporting from the wards of Kaveripura.\nTrainee reporter on WebNEWS.",
  press: {
    mobile: "+919000000007",
    reporterType: "citizen",
    outlet: null,
    experience: "new",
    state: "KA",
    district: "Mysuru",
    city: "Mysuru",
    languages: ["kn", "en"],
    about: "I attend every ward committee meeting so my neighbours don't have to — and write down what was decided.",
  },
};

/** A Reader (no Press Pass): follows, saves and reports stories. */
export const DEMO_READER: DemoPerson = {
  username: "daily.reader",
  name: "Daily Reader",
  bio: "Reads everything, reports nothing (yet). Morning coffee and the front page.",
};

export type TraineeStory = {
  title: string;
  state: "published" | "in_review" | "returned";
  hoursAgo: number;
  body: Block[];
  /** Review Desk note (approval note or what to fix). */
  note?: string;
};

export const TRAINEE_STORIES: TraineeStory[] = [
  {
    title: "Kaveripura ward 12 finally gets its streetlights after a two-year wait",
    state: "published",
    hoursAgo: 20,
    note: "Good sourcing — thanks for quoting the committee minutes.",
    body: [
      { p: "Forty-two new streetlights were switched on along the canal road in Kaveripura’s ward 12 on Tuesday night, two years after residents first petitioned the ward committee." },
      { p: "The committee’s minutes show the project was approved in the first year but stalled while two departments argued over who would pay for the poles. The final bill was split between them." },
      { quote: "My daughter walks back from tuition at eight. For two years I waited at the corner with a torch.", by: "Resident Savitha M." },
      { p: "The committee says the next phase covers the lanes behind the bus stand and should be finished before the monsoon." },
    ],
  },
  {
    title: "Parents ask for a second bus as Kaveripura’s government school doubles its intake",
    state: "in_review",
    hoursAgo: 3,
    body: [
      { p: "Enrolment at the government higher primary school on Temple Street has nearly doubled this year after the school added English-medium sections, but it still has one bus." },
      { p: "At Saturday’s parents’ meeting, families from the outer wards said children are leaving home before 7 a.m. to make the single run, and asked the education office for a second route." },
      { h2: "What the school says" },
      { p: "The headmistress said a request for a second bus has been filed and that the school has offered its playground for a pick-up point in the meantime." },
    ],
  },
  {
    title: "Ward committee votes to move the Sunday market",
    state: "returned",
    hoursAgo: 30,
    note: "Please add who voted and quote a trader who is affected — right now it reads like a rumour.",
    body: [
      { p: "The ward committee has voted to move the Sunday vegetable market from the bus stand to the old mill grounds, according to members present at the meeting." },
      { p: "Traders were not consulted, some say. The committee is expected to publish its decision next week." },
    ],
  },
];

/** The Spotlight request waiting for the Editor Desk (pending; payments aren't connected). */
export const DEMO_SPOTLIGHT = { author: "circuit.desk", packageHours: 24 };

export type DemoFlag = { by: string; storyAuthor: string; reason: FlagReason; note: string | null };

/** Reader reports on the newest story of `storyAuthor` (open, waiting in the Editor Desk's Flags queue). */
export const DEMO_FLAGS: DemoFlag[] = [
  {
    by: "daily.reader",
    storyAuthor: "harbor.ledger",
    reason: "misinformation",
    note: "The tonnage figure in the second paragraph doesn't match the port authority's own report.",
  },
  { by: "market.pulse", storyAuthor: "harbor.ledger", reason: "other", note: "The headline overstates what the minister actually said." },
  { by: "daily.reader", storyAuthor: "final.whistle", reason: "spam", note: null },
];

/** Who the demo Reader follows and which stories (newest of each author) they saved. */
export const READER_FOLLOWS = ["harbor.ledger", "field.notes", "ward.watch"];
export const READER_SAVES = ["circuit.desk", "the.back.page"];
