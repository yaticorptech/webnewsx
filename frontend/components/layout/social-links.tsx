import type { JSX } from "react";
import { COMPANY } from "@/lib/company";
import { cn } from "@/lib/utils";

type Network = (typeof COMPANY.social)[number]["key"];

/* Brand glyphs as inline SVG (lucide v1 ships no brand icons). */
export function FacebookGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className} fill="currentColor">
      <path d="M13.5 21.9v-7.4h2.5l.4-3h-2.9V9.6c0-.9.3-1.5 1.5-1.5h1.5V5.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8.1v3h2.5v7.4a10 10 0 1 1 2.9 0Z" />
    </svg>
  );
}

export function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className} fill="none" stroke="currentColor" strokeWidth={1.9}>
      <rect x="3" y="3" width="18" height="18" rx="5.2" />
      <circle cx="12" cy="12" r="4.1" />
      <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

const GLYPHS: Record<Network, (props: { className?: string }) => JSX.Element> = {
  facebook: FacebookGlyph,
  instagram: InstagramGlyph,
};

export type SocialLinksProps = {
  /** `md` = 44px buttons (footer, /about) · `sm` = 36px (right-rail footer). */
  size?: "sm" | "md";
  className?: string;
};

/**
 * WebNEWS on social media (SPEC §3.10): outlined rounded-square buttons with a crimson
 * hover/focus state, opening in a new tab. Data comes from COMPANY.social.
 */
export function SocialLinks({ size = "md", className }: SocialLinksProps) {
  return (
    <ul className={cn("flex items-center gap-2.5", className)}>
      {COMPANY.social.map((network) => {
        const Glyph = GLYPHS[network.key];
        return (
          <li key={network.key}>
            <a
              href={network.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={network.label}
              title={network.label}
              className={cn(
                "inline-flex items-center justify-center rounded-xl border border-border bg-surface text-muted transition-[color,border-color,background-color,transform] duration-150 ease-snap",
                "hover:-translate-y-0.5 hover:border-brand hover:bg-tint hover:text-brand focus-visible:border-brand focus-visible:text-brand motion-reduce:hover:translate-y-0",
                size === "md" ? "size-11 [&_svg]:size-5" : "size-9 [&_svg]:size-4",
              )}
            >
              <Glyph />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
