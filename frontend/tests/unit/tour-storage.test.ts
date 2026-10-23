import { describe, expect, it } from "vitest";
import {
  clearTour,
  guideToOffer,
  isMarked,
  markGuide,
  readProgress,
  readTour,
  writeProgress,
  writeTour,
  type OfferContext,
  type TourViewer,
} from "@/components/tour/tour-storage";

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  };
}

const reader: TourViewer = { id: "u1", onboarded: true, username: "asha", role: "reader" };
const reporter: TourViewer = { id: "u2", onboarded: true, username: "ravi", role: "reporter" };
const admin: TourViewer = { id: "a1", onboarded: true, username: "desk", role: "admin" };
const unfinished: TourViewer = { id: "u3", onboarded: false, username: null, role: "reader" };

const offer = (over: Partial<OfferContext>) =>
  guideToOffer({ viewer: null, canPublish: false, pathname: "/", onFeed: true, record: {}, feedOfferedThisSession: false, ...over });

describe("guideToOffer", () => {
  it("offers the basics on the feed to a first-time visitor, and nothing once marked", () => {
    expect(offer({})).toBe("basics");
    expect(offer({ pathname: "/category/sports" })).toBe("basics");
    expect(offer({ onFeed: false, pathname: "/about" })).toBeNull();
    expect(offer({ record: { basics: "done" } })).toBeNull();
    expect(offer({ record: { basics: "skipped" } })).toBeNull();
  });

  it("offers the engagement guide to a signed-in person only after the basics, one feed guide per session", () => {
    expect(offer({ viewer: reader })).toBe("basics");
    expect(offer({ viewer: reader, record: { basics: "done" } })).toBe("engage");
    expect(offer({ viewer: reader, record: { basics: "done" }, feedOfferedThisSession: true })).toBeNull();
    expect(offer({ viewer: reader, record: { basics: "done", members: { u1: { engage: "skipped" } } } })).toBeNull();
    expect(offer({ viewer: unfinished, record: { basics: "done" } })).toBeNull();
  });

  it("keeps each account's guides separate on a shared device", () => {
    const record = { basics: "done" as const, members: { u1: { engage: "done" as const } } };
    expect(offer({ viewer: reader, record })).toBeNull();
    expect(offer({ viewer: reporter, canPublish: true, record })).toBe("engage");
  });

  it("offers the Press Pass guide to a Reader on that page, once", () => {
    expect(offer({ viewer: reader, pathname: "/press-pass", onFeed: false })).toBe("press-pass");
    expect(offer({ viewer: reader, pathname: "/press-pass", onFeed: false, feedOfferedThisSession: true })).toBe("press-pass");
    expect(offer({ viewer: reporter, canPublish: true, pathname: "/press-pass", onFeed: false })).toBeNull();
    expect(offer({ viewer: reader, pathname: "/press-pass", onFeed: false, record: { members: { u1: { "press-pass": "done" } } } })).toBeNull();
    expect(offer({ viewer: null, pathname: "/press-pass", onFeed: false })).toBeNull();
  });

  it("offers the publish guide to a reporter opening a new story, once", () => {
    expect(offer({ viewer: reporter, canPublish: true, pathname: "/publish", onFeed: false })).toBe("publish");
    expect(offer({ viewer: reader, pathname: "/publish", onFeed: false })).toBeNull();
    expect(offer({ viewer: reporter, canPublish: true, pathname: "/publish/abc", onFeed: false })).toBeNull();
    expect(offer({ viewer: reporter, canPublish: true, pathname: "/publish", onFeed: false, record: { members: { u2: { publish: "skipped" } } } })).toBeNull();
  });

  it("offers each page's own guide the first time that page opens", () => {
    const page = (pathname: string, extra: Partial<OfferContext> = {}) => offer({ pathname, onFeed: false, ...extra });
    expect(page("/asha", { viewer: reader })).toBe("profile");
    expect(page("/someone-else", { viewer: reader })).toBeNull();
    expect(page("/settings/profile", { viewer: reader })).toBe("edit-profile");
    expect(page("/settings", { viewer: reader })).toBe("settings");
    expect(page("/notifications", { viewer: reader })).toBe("notifications");
    expect(page("/messages", { viewer: reader })).toBe("messages");
    expect(page("/press-meet", { viewer: reader })).toBe("press-meet");
    expect(page("/communities", { viewer: reader })).toBe("communities");
    expect(page("/newsroom", { viewer: reporter, canPublish: true })).toBe("newsroom");
    expect(page("/newsroom", { viewer: reader })).toBeNull();
    expect(page("/settings", { viewer: null })).toBeNull();
    expect(page("/asha", { viewer: reader, record: { members: { u1: { profile: "done" } } } })).toBeNull();
  });

  it("keeps a visitor's Market guide on the device", () => {
    expect(offer({ pathname: "/market", onFeed: false })).toBe("market");
    const record = markGuide({}, "market", null, "done");
    expect(record).toEqual({ pages: { market: "done" } });
    expect(offer({ pathname: "/market", onFeed: false, record })).toBeNull();
    expect(offer({ viewer: reader, pathname: "/market", onFeed: false, record })).toBe("market");
  });

  it("never tours the Editor Desk", () => {
    expect(offer({ viewer: admin, canPublish: true })).toBeNull();
    expect(offer({ viewer: admin, canPublish: true, pathname: "/publish", onFeed: false })).toBeNull();
  });
});

describe("markGuide / isMarked", () => {
  it("marks the basics on the device and the other guides per account", () => {
    let record = markGuide({}, "basics", null, "skipped");
    expect(record).toEqual({ basics: "skipped" });
    record = markGuide(record, "engage", "u1", "done");
    record = markGuide(record, "publish", "u2", "done");
    expect(record).toEqual({ basics: "skipped", members: { u1: { engage: "done" }, u2: { publish: "done" } } });
    expect(isMarked(record, "engage", "u1")).toBe(true);
    expect(isMarked(record, "engage", "u2")).toBe(false);
    expect(isMarked(record, "press-pass", "u1")).toBe(false);
    expect(isMarked(record, "basics", null)).toBe(true);
    // An account guide without an account changes nothing.
    expect(markGuide(record, "engage", null, "done")).toEqual(record);
  });
});

describe("storage", () => {
  it("round-trips the record and the progress, and survives junk", () => {
    const storage = fakeStorage();
    expect(readTour(storage)).toEqual({});
    writeTour(storage, { basics: "done" });
    expect(readTour(storage)).toEqual({ basics: "done" });
    storage.setItem("webnews:tour", "{not json");
    expect(readTour(storage)).toEqual({});

    const progress = { guide: "basics" as const, stepId: "radio", viewerId: "u1" };
    writeProgress(storage, progress);
    expect(readProgress(storage)).toEqual(progress);
    storage.setItem("webnews:tour-progress", JSON.stringify({ stepId: 3 }));
    expect(readProgress(storage)).toBeNull();
    writeProgress(storage, null);
    expect(readProgress(storage)).toBeNull();

    writeTour(storage, { basics: "done" });
    clearTour(storage);
    expect(readTour(storage)).toEqual({});
    expect(readTour(null)).toEqual({});
  });
});
