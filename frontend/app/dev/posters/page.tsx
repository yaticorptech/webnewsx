import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { SpeedLines } from "@/components/brand/speed-lines";
import { MinimalHeader } from "@/components/layout/minimal-header";
import { POSTER_TEMPLATES, StoryPoster, toPosterStory, type PosterStory } from "@/components/poster/story-poster";
import { hasIndicScript } from "@/components/feed/script";
import { getFeedPage } from "@/lib/server-api";
import { DEFAULT_POSTER_TEMPLATE, type ArticleCard } from "@/lib/shared/contracts";

export const metadata: Metadata = {
  title: "Poster templates",
  robots: { index: false, follow: false },
};

/** A long English headline (≈ the 150-character limit, long words) to prove the longest size step fits its clamp. */
const LONG_TITLE =
  "Karnataka cabinet clears ₹4,200-crore Bengaluru suburban rail extension to Hosakote and Devanahalli, with tenders to open before the monsoon session";

/** A long Kannada headline (≈ the 150-character limit) to prove wrapping, clamping and the Indic leading. */
const KANNADA_TITLE =
  "ಬೆಂಗಳೂರಿನಲ್ಲಿ ಭಾರೀ ಮಳೆ: ನಗರದ ಹಲವು ಬಡಾವಣೆಗಳು ಜಲಾವೃತ, ಸಂಚಾರ ಅಸ್ತವ್ಯಸ್ತ; ಮುಂದಿನ ಮೂರು ದಿನ ಕರಾವಳಿ ಸೇರಿ ರಾಜ್ಯದ ಹಲವೆಡೆ ಯೆಲ್ಲೋ ಅಲರ್ಟ್ ಘೋಷಿಸಿದ ಹವಾಮಾನ ಇಲಾಖೆ";

type Sample = { key: string; kicker: string; story: PosterStory };

/** Three real stories with different headline lengths (shortest, middle, longest of the latest 20). */
function pickReal(items: ArticleCard[]): ArticleCard[] {
  const sorted = [...items.slice(0, 20)].sort((a, b) => a.title.length - b.title.length);
  if (sorted.length <= 3) return sorted;
  return [sorted[0]!, sorted[Math.floor(sorted.length / 2)]!, sorted[sorted.length - 1]!];
}

/** Dev-only gallery of the reel poster templates, filled with real stories. 404 in production builds. */
export default async function PostersPage() {
  if (process.env.NODE_ENV === "production") notFound();

  let items: ArticleCard[] = [];
  let failed = false;
  try {
    items = (await getFeedPage({ tab: "latest" })).items;
  } catch (error) {
    unstable_rethrow(error);
    failed = true;
  }

  const real = pickReal(items);
  const samples: Sample[] = real.map((article, i) => ({
    key: article.id,
    kicker: `Real story ${i + 1} · ${article.title.length} characters`,
    story: toPosterStory(article),
  }));
  // The long samples borrow real photos. The English one keeps its author; the Kannada one's author has no photo
  // (initials) and no badge.
  const photo = real[2] ?? real[0];
  if (real[0] && photo) {
    samples.push({
      key: "long",
      kicker: `Sample · longest step · ${LONG_TITLE.length} characters`,
      story: { ...toPosterStory(real[0]), title: LONG_TITLE, imageUrl: photo.coverUrl, imageBlur: photo.coverBlur },
    });
  }
  samples.push({
    key: "kannada",
    kicker: `Sample · Kannada · ${KANNADA_TITLE.length} characters · reporter without photo or badge`,
    story: {
      title: KANNADA_TITLE,
      imageUrl: real[1]?.coverUrl ?? real[0]?.coverUrl ?? "",
      imageBlur: real[1]?.coverBlur ?? real[0]?.coverBlur ?? null,
      author: { name: "ಮಾದರಿ ವರದಿಗಾರ", username: "sample", image: null, reporterLevel: "trainee" },
    },
  });
  const phone = samples[0]!;

  return (
    <>
      <MinimalHeader>
        <span className="kicker hidden text-muted md:inline">Poster templates · dev only</span>
      </MinimalHeader>

      <main id="main" className="mx-auto max-w-300 px-4 pb-24 sm:px-6">
        <header className="py-12 sm:py-16">
          <p className="kicker text-brand-strong">WebNEWS · Reel posters</p>
          <h1 className="mt-3 flex items-center gap-3 font-wide text-3xl font-extrabold tracking-[-0.015em] sm:text-4xl">
            <SpeedLines className="text-[0.9em]" />
            Poster templates
          </h1>
          <p className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-2">
            Each story in the reel is a 9:16 poster: logo, photo, headline and a small author line. The reporter picks
            one of six designs when publishing; stories without one use{" "}
            <strong className="font-bold text-ink">{POSTER_TEMPLATES.find((t) => t.value === DEFAULT_POSTER_TEMPLATE)?.label}</strong>.
            Every size is in container units, so a design looks the same at any width.
          </p>
          <ol className="mt-6 grid gap-x-8 gap-y-2 text-[0.875rem] sm:grid-cols-2 lg:grid-cols-3">
            {POSTER_TEMPLATES.map((t) => (
              <li key={t.value}>
                <span className="font-bold text-ink">{t.label}</span>
                <span className="text-muted"> — {t.description}</span>
              </li>
            ))}
          </ol>
          {failed && (
            <p className="mt-6 panel-tint px-4 py-3 text-[0.875rem] text-ink-2">
              The API could not be reached, so only the Kannada sample is shown (without a photo).
            </p>
          )}
        </header>

        {samples.map((sample) => (
          <section key={sample.key} aria-label={sample.kicker} className="border-t border-border py-12">
            <p className="kicker text-muted">{sample.kicker}</p>
            <h2
              dir="auto"
              className={
                hasIndicScript(sample.story.title)
                  ? "mt-2 max-w-3xl text-xl font-extrabold leading-[1.32]"
                  : "mt-2 max-w-3xl font-wide text-xl font-extrabold tracking-[-0.01em]"
              }
            >
              {sample.story.title}
            </h2>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-10">
              {POSTER_TEMPLATES.map((t, i) => (
                <figure key={t.value} className="flex w-75 max-w-full flex-col gap-3">
                  <figcaption className="flex items-baseline justify-between gap-2">
                    <span className="font-wide text-[0.9375rem] font-extrabold">{t.label}</span>
                    <code className="text-[0.75rem] text-muted">{t.value}</code>
                  </figcaption>
                  <StoryPoster
                    template={t.value}
                    story={sample.story}
                    priority={sample === samples[0] && i < 4}
                    className="rounded-[1.25rem] shadow-pop"
                  />
                </figure>
              ))}
            </div>

            <h3 className="kicker mt-12 text-muted">Thumbnails · 110px (publish form picker)</h3>
            <div className="mt-4 flex flex-wrap gap-4">
              {POSTER_TEMPLATES.map((t) => (
                <figure key={t.value} className="flex w-27.5 flex-col gap-2">
                  <StoryPoster template={t.value} story={sample.story} className="rounded-lg border border-border" />
                  <figcaption className="truncate text-center text-[0.75rem] font-semibold text-ink-2">{t.label}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        ))}

        <section aria-label="Phone size" className="border-t border-border py-12">
          <p className="kicker text-muted">Full phone width · 390px</p>
          <h2 className="mt-2 font-wide text-xl font-extrabold tracking-[-0.01em]">The first story, as the reel shows it</h2>
          <div className="no-scrollbar -mx-4 mt-8 flex snap-x gap-6 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
            {POSTER_TEMPLATES.map((t) => (
              <figure key={t.value} className="flex w-[390px] shrink-0 snap-start flex-col gap-3">
                <figcaption className="font-wide text-[0.9375rem] font-extrabold">{t.label}</figcaption>
                <StoryPoster template={t.value} story={phone.story} className="rounded-3xl shadow-pop" />
              </figure>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
