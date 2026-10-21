import sanitizeHtml from "sanitize-html";

/** Tags the Tiptap composer can produce (SPEC §5.6). Everything else is unwrapped or dropped. */
export const ALLOWED_TAGS = ["p", "br", "strong", "em", "u", "s", "h2", "h3", "ul", "ol", "li", "blockquote", "a", "code", "pre", "hr"];

export const LINK_REL = "noopener noreferrer nofollow ugc";

const options: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: { a: ["href", "rel", "target"] },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  // Content of these is dropped entirely (not unwrapped).
  nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "object", "embed", "svg", "math", "template", "title"],
  disallowedTagsMode: "discard",
  transformTags: {
    b: "strong",
    i: "em",
    strike: "s",
    del: "s",
    h1: "h2",
    h4: "h3",
    h5: "h3",
    h6: "h3",
    div: "p",
    a: (tagName, attribs) => {
      const forced: sanitizeHtml.Attributes = { rel: LINK_REL, target: "_blank" };
      const href = attribs.href?.trim();
      if (href) forced.href = href;
      return { tagName, attribs: forced };
    },
  },
  exclusiveFilter: (frame) => frame.tag === "a" && !frame.attribs.href && !frame.text.trim(),
};

/** Sanitizes composer HTML against the allowlist; links get rel/target forced. */
export function sanitizeArticleHtml(html: string): string {
  const clean = sanitizeHtml(html, options).trim();
  // Drop trailing empty paragraphs Tiptap tends to leave behind.
  return clean.replace(/(?:<p>(?:\s|&nbsp;|<br \/>)*<\/p>\s*)+$/g, "").trim();
}
