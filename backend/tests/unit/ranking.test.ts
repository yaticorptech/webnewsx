import { describe, expect, it } from "vitest";
import {
  ageHours,
  decodeRankCursor,
  diversify,
  encodeRankCursor,
  engagementOf,
  hotScore,
  orderWithFreshSlots,
  percentileCont,
  personalMultiplier,
  RANKING,
  withColdStart,
} from "../../src/lib/ranking.js";

const none = { follows: false, likedAuthor: false, seen: false, own: false };

describe("engagement + hot score", () => {
  it("weights views 1, likes 4, shares 6", () => {
    expect(engagementOf({ viewCount: 10, likeCount: 2, shareCount: 1 })).toBe(10 + 8 + 6);
    expect(engagementOf({ viewCount: 0, likeCount: 0, shareCount: 0 })).toBe(0);
  });

  it("is (engagement + 1)^0.9 / (ageHours + 2)^1.4", () => {
    expect(hotScore(0, 0)).toBeCloseTo(1 / Math.pow(2, 1.4), 12);
    expect(hotScore(99, 8)).toBeCloseTo(Math.pow(100, 0.9) / Math.pow(10, 1.4), 12);
  });

  it("decays with age: the same engagement scores lower as the story gets older", () => {
    const scores = [0, 1, 6, 24, 72, 24 * 14].map((h) => hotScore(50, h));
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeLessThan(scores[i - 1] as number);
    // Gravity 1.4: a day-old story needs far more engagement than a fresh one to keep up.
    expect(hotScore(50, 24)).toBeLessThan(hotScore(5, 1));
  });

  it("grows sub-linearly with engagement, so likes/shares beat raw views", () => {
    expect(hotScore(200, 5)).toBeGreaterThan(hotScore(100, 5));
    expect(hotScore(200, 5) / hotScore(100, 5)).toBeLessThan(2);
    const liked = engagementOf({ viewCount: 20, likeCount: 10, shareCount: 0 });
    const viewed = engagementOf({ viewCount: 50, likeCount: 0, shareCount: 0 });
    expect(hotScore(liked, 3)).toBeGreaterThan(hotScore(viewed, 3));
  });

  it("an engaged older story outranks a newer unengaged one", () => {
    const older = hotScore(engagementOf({ viewCount: 40, likeCount: 6, shareCount: 2 }), 5);
    const newer = hotScore(0, 0.1);
    expect(older).toBeGreaterThan(newer);
  });

  it("measures age against asOf and never goes negative", () => {
    const asOf = new Date("2026-09-24T12:00:00Z");
    expect(ageHours(new Date("2026-09-24T09:30:00Z"), asOf)).toBe(2.5);
    expect(ageHours(new Date("2026-09-24T13:00:00Z"), asOf)).toBe(0);
  });
});

describe("personalization", () => {
  it("multiplies follow 1.6, liked author 1.25, seen 0.5, own 0.8", () => {
    expect(personalMultiplier(none)).toBe(1);
    expect(personalMultiplier({ ...none, follows: true })).toBe(1.6);
    expect(personalMultiplier({ ...none, likedAuthor: true })).toBe(1.25);
    expect(personalMultiplier({ ...none, seen: true })).toBe(0.5);
    expect(personalMultiplier({ ...none, own: true })).toBe(0.8);
    expect(personalMultiplier({ follows: true, likedAuthor: true, seen: true, own: false })).toBeCloseTo(1.6 * 1.25 * 0.5, 12);
  });

  it("lets a followed author's story overtake a slightly hotter stranger's", () => {
    const stranger = hotScore(60, 4);
    const followed = hotScore(45, 4) * personalMultiplier({ ...none, follows: true });
    expect(followed).toBeGreaterThan(stranger);
  });

  it("pushes already-seen stories down", () => {
    const seen = hotScore(80, 3) * personalMultiplier({ ...none, seen: true });
    expect(seen).toBeLessThan(hotScore(50, 3));
  });
});

describe("cold start", () => {
  it("lifts stories younger than 2h to the floor, never lowers them", () => {
    expect(withColdStart(0.1, 1.5, 0.4)).toBe(0.4);
    expect(withColdStart(0.9, 1.5, 0.4)).toBe(0.9);
    expect(withColdStart(0.1, RANKING.coldStartHours, 0.4)).toBe(0.1);
    expect(withColdStart(0.1, 30, 0.4)).toBe(0.1);
  });

  it("uses percentile_cont semantics for the floor", () => {
    expect(percentileCont([], 0.2)).toBe(0);
    expect(percentileCont([5], 0.2)).toBe(5);
    expect(percentileCont([1, 2, 3, 4, 5], 0.2)).toBeCloseTo(1.8, 12);
    expect(percentileCont([10, 0, 20], 0.5)).toBe(10);
  });

  it("guarantees fresh stories a slot on the first page: the best one, then the newest", () => {
    const established = Array.from({ length: 12 }, (_, i) => ({ id: `old${i}`, score: 100 - i, publishedAt: 0, fresh: false }));
    const fresh = [
      { id: "engaged", score: 3, publishedAt: 1, fresh: true }, // oldest fresh, but the best-scoring
      { id: "f3", score: 0.3, publishedAt: 2, fresh: true },
      { id: "f2", score: 0.4, publishedAt: 3, fresh: true },
      { id: "f1", score: 0.35, publishedAt: 4, fresh: true }, // newest
    ];
    const order = orderWithFreshSlots([...fresh, ...established]).map((e) => e.id);
    expect(order.indexOf("engaged")).toBe(1);
    expect(order.indexOf("f1")).toBe(4);
    expect(order.indexOf("f2")).toBe(8);
    // Only three slots: the remaining fresh story keeps its natural place by score.
    expect(order.at(-1)).toBe("f3");
    expect(order.filter((id) => id.startsWith("old"))).toEqual(established.map((e) => e.id));
  });

  it("never demotes a fresh story that already ranks higher", () => {
    const order = orderWithFreshSlots([
      { id: "a", score: 40, publishedAt: 0, fresh: false },
      { id: "hot-fresh", score: 50, publishedAt: 1, fresh: true },
    ]).map((e) => e.id);
    expect(order).toEqual(["hot-fresh", "a"]);
  });
});

describe("diversity", () => {
  const item = (id: string, author: string) => ({ id, author });
  const authors = (items: { author: string }[]) => items.map((i) => i.author).join("");

  it("never shows the same author more than twice in a row", () => {
    const page = [item("1", "A"), item("2", "A"), item("3", "A"), item("4", "A"), item("5", "B"), item("6", "C")];
    const out = diversify(page, (i) => i.author);
    expect(authors(out)).toBe("AABAAC");
    expect(out.map((i) => i.id)).toEqual(["1", "2", "5", "3", "4", "6"]);
  });

  it("keeps the ranked order when there is nothing to fix", () => {
    const page = [item("1", "A"), item("2", "B"), item("3", "A"), item("4", "A"), item("5", "C")];
    expect(diversify(page, (i) => i.author)).toEqual(page);
  });

  it("keeps an unavoidable run when no other author is left", () => {
    const page = [item("1", "A"), item("2", "A"), item("3", "A")];
    expect(diversify(page, (i) => i.author).map((i) => i.id)).toEqual(["1", "2", "3"]);
  });

  it("keeps every item exactly once", () => {
    const page = Array.from({ length: 10 }, (_, i) => item(String(i), i < 7 ? "A" : String.fromCharCode(66 + i)));
    const out = diversify(page, (i) => i.author);
    expect(new Set(out.map((i) => i.id)).size).toBe(10);
    expect(authors(out)).not.toMatch(/AAA(?=.*[^A])/);
  });
});

describe("rank cursor", () => {
  it("round-trips { asOf, offset }", () => {
    const cursor = { asOf: new Date("2026-09-24T10:00:00.123Z"), offset: 20 };
    expect(decodeRankCursor(encodeRankCursor(cursor))).toEqual(cursor);
    expect(decodeRankCursor(undefined)).toBeNull();
    expect(decodeRankCursor("")).toBeNull();
  });

  it("clamps a future asOf to now", () => {
    const now = new Date("2026-09-24T10:00:00Z");
    const raw = encodeRankCursor({ asOf: new Date("2030-01-01T00:00:00Z"), offset: 10 });
    expect(decodeRankCursor(raw, now)).toEqual({ asOf: now, offset: 10 });
  });

  it("rejects garbage, negative and huge offsets with 400 invalid_cursor", () => {
    const bad = [
      "garbage",
      Buffer.from(JSON.stringify({ asOf: "yesterday", offset: 0 })).toString("base64url"),
      Buffer.from(JSON.stringify({ asOf: "2026-09-24T10:00:00Z", offset: -1 })).toString("base64url"),
      Buffer.from(JSON.stringify({ asOf: "2026-09-24T10:00:00Z", offset: RANKING.maxOffset + 1 })).toString("base64url"),
      Buffer.from(JSON.stringify(["2026-09-24T10:00:00Z", "id"])).toString("base64url"),
    ];
    for (const raw of bad) expect(() => decodeRankCursor(raw)).toThrowError(expect.objectContaining({ status: 400, code: "invalid_cursor" }));
  });
});
