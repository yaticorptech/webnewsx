import { describe, expect, it } from "vitest";
import { countWords, extractDomain, htmlToExcerptText, htmlToText, makeExcerpt, readingMinutes } from "../../src/lib/format.js";

describe("htmlToText", () => {
  it("turns block boundaries into spaces and decodes entities", () => {
    expect(htmlToText("<p>Hello&nbsp;<strong>world</strong></p><p>A &amp; B &lt;3 &#39;q&#39; &#x2014;</p>")).toBe("Hello world A & B <3 'q' —");
  });
  it("handles lists and headings", () => {
    expect(htmlToText("<h2>Title</h2><ul><li>one</li><li>two</li></ul>")).toBe("Title one two");
  });
});

describe("htmlToExcerptText", () => {
  it("reads block boundaries as sentence breaks", () => {
    expect(htmlToExcerptText("<p>Opens next week.</p><h2>What next</h2><p>More detail follows</p>")).toBe(
      "Opens next week. What next. More detail follows",
    );
    expect(htmlToExcerptText("<ul><li>Six stops</li><li>Every 7 minutes</li></ul><p>Done!</p>")).toBe("Six stops. Every 7 minutes. Done!");
    expect(htmlToExcerptText("<p>Line one<br>line two</p><blockquote>“Quoted.”</blockquote><p>After</p>")).toBe(
      "Line one. line two. “Quoted.” After",
    );
    expect(htmlToExcerptText("<p></p><p>Only &amp; this</p><p></p>")).toBe("Only & this");
  });
});

describe("makeExcerpt", () => {
  it("returns short text unchanged", () => {
    expect(makeExcerpt("Short and sweet.")).toBe("Short and sweet.");
  });
  it("cuts at a word boundary with an ellipsis, max 280 chars", () => {
    const text = "lorem ipsum dolor ".repeat(40);
    const excerpt = makeExcerpt(text);
    expect(excerpt.length).toBeLessThanOrEqual(280);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt).not.toMatch(/\s…$/);
  });
});

describe("readingMinutes", () => {
  it("is at least one minute", () => {
    expect(readingMinutes("")).toBe(1);
    expect(readingMinutes("just a few words")).toBe(1);
  });
  it("uses ~220 words per minute, rounded up", () => {
    expect(readingMinutes("word ".repeat(220 * 4))).toBe(4);
    expect(readingMinutes("word ".repeat(220))).toBe(1);
    expect(readingMinutes("word ".repeat(221))).toBe(2);
    expect(countWords("  a  b\nc ")).toBe(3);
  });
});

describe("extractDomain", () => {
  it("strips www and lowercases", () => {
    expect(extractDomain("https://WWW.BBC.co.uk/news/1")).toBe("bbc.co.uk");
    expect(extractDomain("http://example.com")).toBe("example.com");
  });
  it("rejects non-http(s) and garbage", () => {
    expect(extractDomain("javascript:alert(1)")).toBeNull();
    expect(extractDomain("ftp://x.test")).toBeNull();
    expect(extractDomain("not a url")).toBeNull();
    expect(extractDomain(null)).toBeNull();
  });
});
