import type { JSX } from "react";
import { FacebookIcon, InstagramIcon } from "@/components/feed/share-glyphs";
import { COMPANY } from "@/lib/company";
import { cn } from "@/lib/utils";

type Network = (typeof COMPANY.social)[number]["key"];

/** The networks' own icons in their colours (owner 2026-10-22: "everywhere the real icons only"). */
const ICONS: Record<Network, (props: { size?: number }) => JSX.Element> = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
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
        const Icon = ICONS[network.key];
        return (
          <li key={network.key}>
            <a
              href={network.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={network.label}
              title={network.label}
              className={cn(
                "inline-flex items-center justify-center rounded-xl border border-border bg-surface transition-[border-color,background-color,transform] duration-150 ease-snap",
                "hover:-translate-y-0.5 hover:border-brand hover:bg-tint focus-visible:border-brand motion-reduce:hover:translate-y-0",
                size === "md" ? "size-11" : "size-9",
              )}
            >
              <Icon size={size === "md" ? 24 : 20} />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
