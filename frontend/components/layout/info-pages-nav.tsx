import Link from "next/link";
import { cn } from "@/lib/utils";

export type InfoPage = "about" | "terms" | "privacy" | "contact";

const PAGES: { key: InfoPage; href: string; label: string }[] = [
  { key: "about", href: "/about", label: "About" },
  { key: "terms", href: "/terms", label: "Terms" },
  { key: "privacy", href: "/privacy", label: "Privacy" },
  { key: "contact", href: "/contact", label: "Contact us" },
];

/**
 * The pills between WebNEWS's own pages (owner 2026-10-02): About · Terms · Privacy · Contact us, in each one's hero;
 * the page you're on is the red one. Server-safe.
 */
export function InfoPagesNav({ current, className }: { current: InfoPage; className?: string }) {
  return (
    <nav aria-label="About WebNEWS" className={cn("flex flex-wrap items-center justify-center gap-2", className)}>
      {PAGES.map((page) => (
        <Link
          key={page.key}
          href={page.href}
          aria-current={page.key === current ? "page" : undefined}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-bold transition-colors",
            page.key === current ? "bg-brand text-brand-contrast" : "border border-tint-border bg-surface text-ink-2 hover:text-brand",
          )}
        >
          {page.label}
        </Link>
      ))}
    </nav>
  );
}
