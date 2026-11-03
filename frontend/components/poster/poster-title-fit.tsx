"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Below a design's smallest size, shrink by these factors before giving way to the ellipsis. */
const EXTRA_SHRINK = [0.9, 0.8, 0.72] as const;

/** `text-[8cqw] line-clamp-7` → { size: 8, lines: 7 }. */
function parseSize(classes: string): { size: number; lines: number } | null {
  const size = /text-\[([\d.]+)cqw\]/.exec(classes)?.[1];
  const lines = /line-clamp-(\d+)/.exec(classes)?.[1];
  return size && lines ? { size: Number(size), lines: Number(lines) } : null;
}

/**
 * The whole headline on the poster (owner 2026-11-03): length alone guesses the size wrong for the wide font, so the
 * title steps down through the design's smaller sizes (then a little below the smallest) until nothing is cut off.
 * Measured after layout, again when the poster resizes and once the fonts load.
 */
export function PosterTitleFit({
  sizes,
  step,
  className,
  children,
  ...rest
}: {
  sizes: readonly [string, string, string, string];
  step: 0 | 1 | 2 | 3;
  className: string;
  children: ReactNode;
  id?: string;
  dir?: string;
  "data-poster-text"?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const key = sizes.join("|");

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parsed = sizes.map(parseSize);
    const candidates: { size: number; lines: number }[] = [];
    for (const size of parsed.slice(step)) if (size) candidates.push(size);
    const last = parsed[3];
    if (last) for (const factor of EXTRA_SHRINK) candidates.push({ size: last.size * factor, lines: last.lines });

    const fit = () => {
      el.style.fontSize = "";
      el.style.webkitLineClamp = "";
      if (el.scrollHeight <= el.clientHeight + 1) return;
      for (const { size, lines } of candidates) {
        el.style.fontSize = `${size}cqw`;
        el.style.webkitLineClamp = String(lines);
        if (el.scrollHeight <= el.clientHeight + 1) return;
      }
    };
    fit();
    let frame = 0;
    const refit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };
    // The parent, not the title: the title's own size changes as it fits.
    const observer = el.parentElement ? new ResizeObserver(refit) : null;
    if (el.parentElement) observer?.observe(el.parentElement);
    void document.fonts?.ready.then(refit);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `sizes`; children = the title text.
  }, [key, step, children]);

  return (
    <p ref={ref} className={className} {...rest}>
      {children}
    </p>
  );
}
