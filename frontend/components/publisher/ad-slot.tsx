"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { SITE_AD_POSITIONS, SITE_AD_ROTATE_MS, type SiteAdPosition, type SiteAdsByPosition } from "@/lib/shared/contracts";

/** Where an empty position's "Advertise here" card leads (the site's contact, from SiteChrome); null: not a link. */
const AdBookingContext = createContext<string | null>(null);
export const AdBooking = AdBookingContext.Provider;

/** webnews.in's "Advertise here" cards (its public/ad-*.svg, owner 2026-10-30: "same like that"), one per shape. */
const BANNERS: Partial<Record<SiteAdPosition, string>> = {
  "logo-left": "/pub-ads/ad-logo.svg",
  "logo-right": "/pub-ads/ad-logo.svg",
  "article-strip": "/pub-ads/ad-logo.svg",
  "hero-left": "/pub-ads/ad-hero.svg",
  "hero-right": "/pub-ads/ad-hero.svg",
  "mid-page": "/pub-ads/ad-newsletter.svg",
  "newsletter-left": "/pub-ads/ad-newsletter.svg",
  "trending-sidebar": "/pub-ads/ad-trending.svg",
  "in-article": "/pub-ads/ad-article.svg",
};

/**
 * One webnews.in ad position (its AdSlotView): the live ads there rotate every few seconds. Empty: webnews.in's
 * "Advertise here" card at the position's own shape — on the live site it books the spot (mail to the site), in the
 * setup preview it only shows where ads go.
 */
export function AdSlot({ position, ads, preview = false, className }: { position: SiteAdPosition; ads: SiteAdsByPosition; preview?: boolean; className?: string }) {
  if (position === "logo-left" || position === "logo-right") {
    return <LogoBanners side={position === "logo-left" ? "left" : "right"} ads={ads} className={className} />;
  }
  return <AdRotation position={position} ads={ads} preview={preview} className={className} />;
}

/**
 * webnews.in's banners beside the logo (its LogoPSA, owner 2026-10-30): government / public-service banners rotating
 * on each side, with any ads booked on the two logo positions merged in. The sides run on different clocks and start
 * on different banners, so they never show the same one or change at the same moment.
 */
const PSA: { src: string; url: string }[] = [
  { src: "/pub-ads/psa/psa-voter.svg", url: "https://voters.eci.gov.in" },
  { src: "/pub-ads/psa/psa-ayushman.svg", url: "https://pmjay.gov.in" },
  { src: "/pub-ads/psa/psa-aadhaar.svg", url: "https://uidai.gov.in" },
  { src: "/pub-ads/psa/psa-pmkisan.svg", url: "https://pmkisan.gov.in" },
  { src: "/pub-ads/psa/psa-itr.svg", url: "https://www.incometax.gov.in" },
  { src: "/pub-ads/psa/psa-digilocker.svg", url: "https://www.digilocker.gov.in" },
  { src: "/pub-ads/psa/psa-scholarship.svg", url: "https://scholarships.gov.in" },
  { src: "/pub-ads/psa/psa-sevasindhu.svg", url: "https://sevasindhu.karnataka.gov.in" },
  { src: "/pub-ads/psa/psa-sakala.svg", url: "https://sakala.kar.nic.in" },
  { src: "/pub-ads/psa/psa-shakti.svg", url: "https://ksrtc.karnataka.gov.in" },
  { src: "/pub-ads/psa/psa-kaveri.svg", url: "https://kaveri.karnataka.gov.in" },
  { src: "/pub-ads/psa/psa-bhoomi.svg", url: "https://landrecords.karnataka.gov.in" },
  { src: "/pub-ads/psa/psa-nadakacheri.svg", url: "https://nadakacheri.karnataka.gov.in" },
];
const PSA_PERIOD = { left: 5000, right: 6800 };
const PSA_START = { left: 0, right: 2600 };

function LogoBanners({ side, ads, className }: { side: "left" | "right"; ads: SiteAdsByPosition; className?: string }) {
  const booked = [...(ads["logo-left"] ?? []), ...(ads["logo-right"] ?? [])]
    .filter((ad) => ad.creativeUrl && !ad.video)
    .map((ad) => ({ src: ad.creativeUrl!, url: ad.targetUrl ?? "" }));
  const items = [...booked, ...PSA];
  const [idx, setIdx] = useState(() => (side === "right" ? Math.floor(items.length / 2) : 0));
  const [prevIdx, setPrevIdx] = useState<number | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const advance = () =>
      setIdx((i) => {
        setPrevIdx(i);
        return (i + 1) % items.length;
      });
    const start = window.setTimeout(() => {
      advance();
      timer = window.setInterval(advance, PSA_PERIOD[side]);
    }, PSA_START[side]);
    return () => {
      window.clearTimeout(start);
      if (timer) window.clearInterval(timer);
    };
  }, [side, items.length]);

  const cur = items[idx % items.length]!;
  const prev = prevIdx !== null ? items[prevIdx % items.length] : null;
  return (
    <a
      href={cur.url || undefined}
      target={cur.url ? "_blank" : undefined}
      rel="noopener noreferrer sponsored"
      aria-label="Public service banner"
      className={`block overflow-hidden rounded-lg ${className ?? ""}`}
    >
      <div className="relative w-full overflow-hidden rounded-lg" style={{ aspectRatio: "4 / 1" }}>
        {prev && <img key={`p-${prevIdx}`} src={prev.src} alt="" aria-hidden className="pub-imgout absolute inset-0 size-full object-cover" />}
        <img key={`c-${idx}`} src={cur.src} alt="Public service announcement" className="pub-imgin absolute inset-0 size-full object-cover" />
      </div>
    </a>
  );
}

function AdRotation({ position, ads, preview, className }: { position: SiteAdPosition; ads: SiteAdsByPosition; preview: boolean; className?: string }) {
  const list = ads[position] ?? [];
  const spec = SITE_AD_POSITIONS.find((p) => p.key === position)!;
  const bookHref = useContext(AdBookingContext);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (list.length < 2) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % list.length), SITE_AD_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [list.length]);

  if (list.length === 0) {
    const banner = (
      <img
        src={BANNERS[position] ?? "/pub-ads/ad-hero.svg"}
        alt={preview ? `Ad space · ${spec.recW}×${spec.recH}` : "Advertise here — click to book this spot"}
        className="size-full object-cover"
      />
    );
    return (
      <div className={`overflow-hidden rounded-lg ${className ?? ""}`} style={{ aspectRatio: spec.ratio }}>
        {bookHref && !preview ? (
          <a href={bookHref} className="block size-full transition hover:opacity-90">
            {banner}
          </a>
        ) : (
          banner
        )}
      </div>
    );
  }

  const ad = list[index % list.length]!;
  const body = ad.creativeUrl ? (
    ad.video ? (
      <video src={ad.creativeUrl} autoPlay muted loop playsInline className="size-full bg-black object-contain" />
    ) : (
      <img src={ad.creativeUrl} alt={ad.title} className="size-full bg-white object-contain" />
    )
  ) : (
    <span className="flex size-full items-center justify-center bg-pub/5 p-3 text-center font-pub-head text-base font-bold text-pub-ink">{ad.title}</span>
  );

  return (
    <div className={`relative overflow-hidden rounded border border-gray-200 ${className ?? ""}`} style={{ aspectRatio: spec.ratio }}>
      {ad.targetUrl ? (
        <a href={ad.targetUrl} target="_blank" rel="noopener noreferrer sponsored" className="block size-full">
          {body}
        </a>
      ) : (
        body
      )}
      <span className="absolute right-1 top-1 rounded bg-black/50 px-1 text-[9px] font-semibold uppercase tracking-wider text-white">Ad</span>
    </div>
  );
}
