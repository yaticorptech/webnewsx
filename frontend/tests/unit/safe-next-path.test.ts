import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/utils";

describe("safeNextPath", () => {
  it("keeps same-site paths (normalised) with their query and hash", () => {
    expect(safeNextPath("/harbor.ledger")).toBe("/harbor.ledger");
    expect(safeNextPath("/?tab=following")).toBe("/?tab=following");
    expect(safeNextPath("/a/some-story-abc123#comments")).toBe("/a/some-story-abc123#comments");
    expect(safeNextPath("/publish/../press-pass")).toBe("/press-pass");
  });

  it("refuses anything a browser would resolve off-site", () => {
    for (const evil of [
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example/phish",
      "/\n/evil.example",
      "/\r\n/evil.example",
      "/ /evil.example",
      "/ /evil.example",
      "/​/evil.example",
      "https://evil.example",
      "evil.example",
      "javascript:alert(1)",
      "/%09/evil.example".replace("%09", "\t"),
    ]) {
      expect(safeNextPath(evil), JSON.stringify(evil)).toBe("/");
    }
  });

  it("refuses API routes, empty values and uses the fallback", () => {
    expect(safeNextPath("/api/auth/sign-out")).toBe("/");
    expect(safeNextPath("/api")).toBe("/");
    expect(safeNextPath("/x/../api/me")).toBe("/");
    expect(safeNextPath(null, "/onboarding")).toBe("/onboarding");
    expect(safeNextPath("", "/login")).toBe("/login");
  });
});
