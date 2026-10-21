import { describe, expect, it } from "vitest";
import { LINK_REL, sanitizeArticleHtml } from "../../src/lib/sanitize.js";

describe("sanitizeArticleHtml", () => {
  it("keeps the composer's allowlisted tags", () => {
    const html =
      "<p><strong>b</strong> <em>i</em> <u>u</u> <s>s</s> <code>c</code></p><h2>H2</h2><h3>H3</h3><ul><li>a</li></ul><ol><li>b</li></ol><blockquote><p>q</p></blockquote><pre><code>x</code></pre><hr />";
    expect(sanitizeArticleHtml(html)).toBe(html);
  });

  it("drops script and style elements including their content", () => {
    const out = sanitizeArticleHtml("<p>ok</p><script>alert('x')</script><style>p{color:red}</style><p>fine</p>");
    expect(out).toBe("<p>ok</p><p>fine</p>");
    expect(out).not.toMatch(/alert|color/);
  });

  it("removes on* event handlers and other attributes", () => {
    const out = sanitizeArticleHtml('<p onclick="steal()" class="x" style="color:red">hi</p><img src=x onerror="steal()">');
    expect(out).toBe("<p>hi</p>");
  });

  it("strips javascript: and data: links", () => {
    const out = sanitizeArticleHtml('<p><a href="javascript:alert(1)">a</a><a href="JaVaScRiPt:alert(1)">b</a><a href="data:text/html,x">c</a></p>');
    expect(out).not.toMatch(/javascript|data:/i);
  });

  it("forces rel and target on links and keeps http/https/mailto", () => {
    const out = sanitizeArticleHtml(
      '<p><a href="https://example.com" rel="opener" target="_self">x</a> <a href="mailto:hi@example.com">m</a> <a href="http://a.test">h</a></p>',
    );
    expect(out).toContain(`<a rel="${LINK_REL}" target="_blank" href="https://example.com">x</a>`);
    expect(out).toContain(`href="mailto:hi@example.com"`);
    expect(out).toContain(`href="http://a.test"`);
    expect(out).not.toContain("opener\"");
    expect(out).not.toContain("_self");
  });

  it("maps legacy tags and unwraps unknown ones", () => {
    expect(sanitizeArticleHtml("<b>x</b><i>y</i><h1>t</h1><span>z</span>")).toBe("<strong>x</strong><em>y</em><h2>t</h2>z");
  });

  it("drops iframes and svg entirely", () => {
    expect(sanitizeArticleHtml('<iframe src="https://evil.test"></iframe><svg><script>x</script></svg><p>a</p>')).toBe("<p>a</p>");
  });

  it("trims trailing empty paragraphs", () => {
    expect(sanitizeArticleHtml("<p>a</p><p></p><p><br></p>")).toBe("<p>a</p>");
  });
});
