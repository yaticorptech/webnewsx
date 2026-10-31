"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { SITE_AD_POSITIONS, SITE_AD_ROTATE_MS, type SiteAdPosition, type SiteAdsByPosition, type SiteLanguage } from "@/lib/shared/contracts";

/**
 * What the "Advertise here" card needs from the site (SiteChrome): where it books (mail to the site; null in the
 * setup preview: not a link) and the site's logo / name, shown in place of WebNEWS's (owner 2026-10-31).
 */
export type AdBookingInfo = { href: string | null; logoUrl: string | null; name: string; lang: SiteLanguage };
const AdBookingContext = createContext<AdBookingInfo>({ href: null, logoUrl: null, name: "", lang: "en" });
export const AdBooking = AdBookingContext.Provider;

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

/**
 * webnews.in's "Advertise here" card (owner 2026-10-31: with the site's own logo in place of WebNEWS's): soft pink
 * card, red bar with a shine, "Advertise Here", "Book this spot in seconds" and the red "Click to Book" button.
 */
function AdvertiseCard() {
  const { logoUrl, name, lang } = useContext(AdBookingContext);
  const kn = lang === "kn";
  return (
    <div className="pub-adcard">
      <span aria-hidden className="pub-adcard__bar" />
      <span aria-hidden className="pub-adcard__blob" style={{ width: "62%", aspectRatio: "1", top: "-18%", right: "-18%" }} />
      <span aria-hidden className="pub-adcard__blob" style={{ width: "58%", aspectRatio: "1", bottom: "-24%", left: "-16%", animationDelay: "-3s" }} />
      <span aria-hidden className="pub-adcard__blob" style={{ width: "30%", aspectRatio: "1", top: "44%", left: "36%", animationDelay: "-5s", opacity: 0.05 }} />
      <span aria-hidden className="pub-adcard__spark" style={{ top: "40%", left: "20%" }}>
        ✦
      </span>
      <span aria-hidden className="pub-adcard__spark" style={{ top: "40%", right: "16%", animationDelay: "-1s" }}>
        ✦
      </span>
      <span aria-hidden className="pub-adcard__spark" style={{ top: "58%", right: "20%", animationDelay: "-2s" }}>
        ✦
      </span>
      <div className="pub-adcard__body">
        {logoUrl ? <img src={logoUrl} alt={name} className="pub-adcard__logo" /> : name ? <span className="pub-adcard__name">{name}</span> : null}
        <span className="pub-adcard__title">{kn ? "ಜಾಹೀರಾತು ನೀಡಿ" : "Advertise Here"}</span>
        <span className="pub-adcard__sub">{kn ? "ಈ ಸ್ಥಳವನ್ನು ಕ್ಷಣಗಳಲ್ಲಿ ಕಾಯ್ದಿರಿಸಿ" : "Book this spot in seconds"}</span>
        <span className="pub-adcard__cta">
          {kn ? "ಕಾಯ್ದಿರಿಸಿ" : "Click to Book"} <span aria-hidden>→</span>
        </span>
      </div>
    </div>
  );
}

/** The card as a link that books the spot (not a link in the setup preview). */
function BookCard({ preview, label }: { preview: boolean; label: string }) {
  const { href } = useContext(AdBookingContext);
  return href && !preview ? (
    <a href={href} aria-label="Advertise here — click to book this spot" className="block size-full rounded-[inherit]">
      <AdvertiseCard />
    </a>
  ) : (
    <div role="img" aria-label={label} className="size-full rounded-[inherit]">
      <AdvertiseCard />
    </div>
  );
}

type PositionAd = NonNullable<SiteAdsByPosition[SiteAdPosition]>[number];

function AdCreative({ ad }: { ad: PositionAd }) {
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
    <div className="relative size-full overflow-hidden rounded-[inherit] border border-gray-200">
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

/**
 * A position's cards: its booked ads one after another, then the "Advertise here" card (owner 2026-10-31: "show ads
 * then flip and this card"), each flipping in after SITE_AD_ROTATE_MS. With no ads only the card shows.
 */
function AdRotation({ position, ads, preview, className }: { position: SiteAdPosition; ads: SiteAdsByPosition; preview: boolean; className?: string }) {
  const list = ads[position] ?? [];
  const spec = SITE_AD_POSITIONS.find((p) => p.key === position)!;
  const slides = list.length + 1;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides < 2) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % slides), SITE_AD_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [slides]);

  const at = index % slides;
  const ad = at < list.length ? list[at] : undefined;
  return (
    <div className={`overflow-hidden rounded-lg ${className ?? ""}`} style={{ aspectRatio: spec.ratio }}>
      <div key={`${at}-${slides}`} className={`size-full rounded-[inherit] ${slides > 1 ? "pub-adflip" : ""}`}>
        {ad ? <AdCreative ad={ad} /> : <BookCard preview={preview} label={`Ad space · ${spec.recW}×${spec.recH}`} />}
      </div>
    </div>
  );
}
