import { describe, expect, it } from "vitest";
import { kebab, makeShortCode, makeSlug, shortId } from "../../src/lib/slug.js";
import { SHORT_CODE_REGEX } from "../../src/shared/contracts.js";

describe("slug", () => {
  it("kebab-cases titles", () => {
    expect(kebab("Hello, World!")).toBe("hello-world");
    expect(kebab("  Élan & Co.: 2026 — review  ")).toBe("elan-and-co-2026-review");
    expect(kebab("It's the economy")).toBe("its-the-economy");
  });

  it("limits the base to ~80 chars on a word boundary", () => {
    const base = kebab("word ".repeat(40));
    expect(base.length).toBeLessThanOrEqual(80);
    expect(base.endsWith("-")).toBe(false);
  });

  it("appends a 6-char id", () => {
    expect(makeSlug("Big News", "abc123")).toBe("big-news-abc123");
    expect(makeSlug("Big News")).toMatch(/^big-news-[a-z0-9]{6}$/);
    expect(shortId()).toMatch(/^[a-z0-9]{6}$/);
  });

  it("draws 7-char share-link codes the short-link lookup accepts", () => {
    for (let i = 0; i < 20; i++) {
      const code = makeShortCode();
      expect(code).toMatch(/^[a-z0-9]{7}$/);
      expect(SHORT_CODE_REGEX.test(code)).toBe(true);
    }
  });

  it("falls back for titles without ASCII letters", () => {
    expect(makeSlug("日本語のニュース", "zzzzzz")).toBe("story-zzzzzz");
  });
});
