"use client";

import { useEffect, useState } from "react";
import { SITE_AD_POSITIONS, SITE_AD_ROTATE_MS, type SiteAdPosition, type SiteAdsByPosition } from "@/lib/shared/contracts";

/**
 * One webnews.in ad position (its AdSlotView): the live ads there rotate every few seconds. Empty: nothing on the live
 * site; a dashed "Ad space" box in the setup preview so the owner sees where ads go.
 */
export function AdSlot({ position, ads, preview = false, className }: { position: SiteAdPosition; ads: SiteAdsByPosition; preview?: boolean; className?: string }) {
  const list = ads[position] ?? [];
  const spec = SITE_AD_POSITIONS.find((p) => p.key === position)!;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (list.length < 2) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % list.length), SITE_AD_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [list.length]);

  if (list.length === 0) {
    if (!preview) return null;
    return (
      <div
        className={`flex flex-col items-center justify-center rounded border-2 border-dashed border-gray-300 bg-gray-50 p-2 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-400 ${className ?? ""}`}
        style={{ aspectRatio: spec.ratio }}
      >
        Ad space
        <span className="mt-0.5 font-normal normal-case tracking-normal">
          {spec.label.split(" — ")[0]} · {spec.recW}×{spec.recH}
        </span>
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
