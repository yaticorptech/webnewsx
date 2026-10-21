"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type LegalTocItem = { id: string; title: string };

/** Sticky contents list (≥1024px) that highlights the section being read. */
export function LegalToc({ items, className }: { items: LegalTocItem[]; className?: string }) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const targets = items.map((item) => document.getElementById(item.id)).filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-12% 0px -70% 0px" },
    );
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label="On this page" className={className}>
      <p className="kicker mb-3 text-muted">On this page</p>
      <ol className="flex flex-col border-l border-border">
        {items.map((item, index) => {
          const current = item.id === active;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={current ? "location" : undefined}
                className={cn(
                  "-ml-px flex gap-2.5 border-l-2 py-1.5 pr-2 pl-3.5 text-[0.8125rem] leading-snug transition-colors duration-150",
                  current ? "border-brand font-bold text-brand" : "border-transparent text-muted hover:border-tint-border hover:text-brand",
                )}
              >
                <span className={cn("w-5 shrink-0 font-wide text-[0.6875rem] leading-5 font-black tabular-nums", current ? "text-brand" : "text-faint")}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{item.title}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
