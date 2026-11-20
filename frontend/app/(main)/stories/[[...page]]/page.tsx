import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/layout/site-footer";
import { SITE_NAME } from "@/lib/config";
import { getSitemapData } from "@/lib/server-api";

export const dynamic = "force-dynamic";

const PER_PAGE = 60;

type Props = { params: Promise<{ page?: string[] }> };

/** "/stories" → 1, "/stories/2" → 2; anything else (incl. "/stories/1", a duplicate of page 1) → null. */
function pageNumber(segments: string[] | undefined): number | null {
  if (!segments?.length) return 1;
  if (segments.length !== 1 || !/^[1-9]\d*$/.test(segments[0]) || segments[0] === "1") return null;
  return Number(segments[0]);
}

const pathOf = (page: number) => (page === 1 ? "/stories" : `/stories/${page}`);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = pageNumber((await params).page);
  if (!page) return { title: "Not found", robots: { index: false } };
  return {
    title: page === 1 ? "All stories" : `All stories · page ${page}`,
    description: `Every story published on ${SITE_NAME}, newest first.`,
    alternates: { canonical: pathOf(page) },
  };
}

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

/**
 * /stories — a plain, server-rendered archive of every public story (newest first, 60 a page, grouped by day). The
 * feeds load more on scroll, which search engines don't do, so without this most stories were reachable only from
 * the sitemap and Google left them "crawled — currently not indexed" (owner 2026-11-20).
 */
export default async function StoriesArchive({ params }: Props) {
  const page = pageNumber((await params).page);
  if (!page) notFound();
  const { articles } = await getSitemapData();
  const pages = Math.max(1, Math.ceil(articles.length / PER_PAGE));
  if (page > pages) notFound();
  const slice = articles.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const groups: { day: string; stories: typeof slice }[] = [];
  for (const story of slice) {
    const day = dayLabel(story.publishedAt);
    const last = groups.at(-1);
    if (last?.day === day) last.stories.push(story);
    else groups.push({ day, stories: [story] });
  }

  return (
    <section aria-labelledby="stories-heading" className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="flex items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 id="stories-heading" className="font-wide text-2xl font-black tracking-[-0.02em] text-ink">
            All stories
          </h1>
          <p className="mt-1 text-sm text-muted">
            {articles.length.toLocaleString("en-IN")} stories · page {page} of {pages}
          </p>
        </div>
      </header>

      {groups.map((group) => (
        <div key={group.day} className="mt-7">
          <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-muted">{group.day}</h2>
          <ul className="mt-2 divide-y divide-border">
            {group.stories.map((story) => (
              <li key={story.slug}>
                <Link href={`/a/${story.slug}`} dir="auto" className="block py-3 text-[0.9375rem] font-semibold leading-snug text-ink transition-colors hover:text-brand focus-visible:text-brand">
                  {story.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <nav aria-label="Archive pages" className="mt-10 flex items-center justify-between gap-3 border-t border-border pt-5 text-sm font-bold">
        {page > 1 ? (
          <Link href={pathOf(page - 1)} rel="prev" className="rounded-full border border-border px-4 py-2.5 text-ink-2 hover:text-brand">
            ← Newer stories
          </Link>
        ) : (
          <span />
        )}
        {page < pages ? (
          <Link href={pathOf(page + 1)} rel="next" className="rounded-full bg-brand px-4 py-2.5 text-brand-contrast hover:bg-brand-hover">
            Older stories →
          </Link>
        ) : (
          <span />
        )}
      </nav>
      <SiteFooter className="mt-10" />
    </section>
  );
}
