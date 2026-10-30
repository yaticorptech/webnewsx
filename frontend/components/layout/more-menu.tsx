"use client";

import { Download, FileText, Info, Mail, Menu, ShieldCheck } from "lucide-react";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { COMPANY } from "@/lib/company";
import { downloadApp, useCanGetApp } from "./get-app-banner";

/**
 * Compact-bar menu for logged-out readers on phones/tablets, so About, the legal pages and the
 * contact address stay reachable without a footer (the feed never ends). Signed-in readers get
 * the same links in the avatar menu.
 */
export function MoreMenu({ className }: { className?: string }) {
  const canGetApp = useCanGetApp();
  return (
    <DropdownMenu
      label="More"
      align="end"
      className={className}
      triggerClassName="relative inline-flex size-9 items-center justify-center rounded-full border border-border text-ink transition-colors hover:border-brand hover:text-brand aria-expanded:border-brand aria-expanded:text-brand max-md:after:absolute max-md:after:-inset-1.5 max-md:after:content-['']"
      trigger={<Menu aria-hidden className="size-4.5" />}
      items={[
        ...(canGetApp
          ? [
              { label: <span className="font-bold text-brand">Download app</span>, onSelect: () => downloadApp("get_app_menu"), icon: <Download aria-hidden /> },
              { type: "separator" as const },
            ]
          : []),
        { label: "About WebNEWS", href: "/about", icon: <Info aria-hidden /> },
        { label: "Terms & Conditions", href: "/terms", icon: <FileText aria-hidden /> },
        { label: "Privacy Policy", href: "/privacy", icon: <ShieldCheck aria-hidden /> },
        { type: "separator" },
        { label: COMPANY.email, href: `mailto:${COMPANY.email}`, icon: <Mail aria-hidden /> },
      ]}
    />
  );
}
