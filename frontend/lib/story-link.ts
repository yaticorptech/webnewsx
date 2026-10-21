import type { MouseEvent } from "react";
import { askPremium } from "@/components/feed/premium-gate";
import type { ArticleCard } from "@/lib/shared/contracts";

/**
 * Where a tap on a story goes (owner 2026-10-15): a story filed with a "Read more link" opens that link — from every
 * spot on its card (photo, headline, blurb, Read more) — and a written story opens its page. A members-only story the
 * viewer can't read yet still goes to its page (which offers premium), never straight to the link.
 */
type Linkable = Pick<ArticleCard, "slug" | "linkUrl" | "locked"> & Partial<Pick<ArticleCard, "title" | "author">>;
type Gate = { title: string; slug: string; author: ArticleCard["author"] };

/** A locked members-only story (with what the popup needs), or null. */
const gateOf = (article: Linkable): Gate | null =>
  article.locked && article.author ? { title: article.title ?? "", slug: article.slug, author: article.author } : null;

export function storyHref(article: Linkable): { href: string; external: boolean; gate: Gate | null } {
  const gate = gateOf(article);
  if (article.linkUrl && !article.locked) return { href: article.linkUrl, external: true, gate };
  return { href: `/a/${article.slug}`, external: false, gate };
}

/**
 * Props for a `<Link>` / `<a>`: the link opens in a new tab, the story page in place — and (owner 2026-10-15) a
 * members-only story the viewer can't read yet opens the "buy premium" popup instead (a new-tab click still opens it).
 */
export function storyLinkProps(article: Linkable) {
  const { href, external, gate } = storyHref(article);
  if (gate) {
    return {
      href,
      onClick: (event: MouseEvent) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        askPremium(gate);
      },
    };
  }
  return external ? { href, target: "_blank", rel: "noopener noreferrer" } : { href };
}

/**
 * Opens a story from a script (a tap on a photo). The link goes in a new tab when the tap itself opens it; after a
 * delay (the double-tap window) a new tab would be blocked, so it opens in place (the app hands it to the browser).
 */
export function openStoryHref(target: { href: string; external: boolean; gate?: Gate | null }, push: (href: string) => void, delayed = false) {
  if (target.gate) askPremium(target.gate);
  else if (!target.external) push(target.href);
  else if (delayed) window.location.assign(target.href);
  else window.open(target.href, "_blank", "noopener");
}
