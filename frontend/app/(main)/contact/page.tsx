import { Clock3, Mail } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { SpeedLines } from "@/components/brand/speed-lines";
import { ContactForm } from "@/components/contact/contact-form";
import { InfoPagesNav } from "@/components/layout/info-pages-nav";
import { SiteFooter } from "@/components/layout/site-footer";
import { SocialLinks } from "@/components/layout/social-links";
import { COMPANY } from "@/lib/company";
import { SITE_NAME } from "@/lib/config";
import { requireOnboardedViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Contact us",
  description: `Write to the ${SITE_NAME} team.`,
  robots: { index: false, follow: false },
};

/**
 * /contact (owner 2026-10-02): signed-in members only (logged out → /login?next=/contact). Full width like About: the
 * pink hero, then the form (email and username read-only from the account, the message) beside the office details.
 */
export default async function ContactPage() {
  const viewer = await requireOnboardedViewer("/contact");
  return (
    <article data-grid-page="" className="flex flex-col gap-10 sm:gap-12 lg:gap-14">
      <header className="panel-tint relative isolate overflow-hidden px-6 py-10 text-center sm:px-10 sm:py-14 lg:py-16">
        <SpeedLines
          variant="bars"
          className="pointer-events-none absolute -right-8 -bottom-6 -z-10 w-40 opacity-[0.07] sm:w-56 lg:w-80"
        />
        <BrandLockup size="xs" className="sm:lockup-sm" />
        <p className="kicker mt-8 text-brand-strong">Contact us</p>
        <h1 className="mx-auto mt-3 max-w-3xl text-[clamp(1.75rem,1.2rem+2.4vw,3.5rem)] leading-[1.06] font-black tracking-[-0.02em] text-ink font-wide">
          Talk to the newsroom.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-2 sm:text-base lg:text-lg">
          Questions about a story, a takedown request, your Press Pass or the app — send us a message and we&rsquo;ll
          reply to the email on your account.
        </p>
        <InfoPagesNav current="contact" className="mt-7" />
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start lg:gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <ContactForm email={viewer.email} username={viewer.username} />

        <aside className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--nav-h)+1.5rem)]">
          <div className="card flex flex-col gap-5 p-6">
            <Info icon={<Clock3 aria-hidden />} title="Reply time">
              Usually within 2 working days.
            </Info>
            <Info icon={<Mail aria-hidden />} title="Email">
              <a href={`mailto:${COMPANY.email}`} className="font-semibold text-brand-strong underline-offset-4 hover:underline">
                {COMPANY.email}
              </a>
            </Info>
          </div>
          <div className="card flex flex-col gap-3 p-6">
            <p className="kicker text-muted">Follow {SITE_NAME}</p>
            <SocialLinks />
          </div>
        </aside>
      </div>

      <SiteFooter className="rounded-2xl border" />
    </article>
  );
}

function Info({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-tint-border bg-tint text-brand [&_svg]:size-4.5">
        {icon}
      </span>
      <div className="min-w-0 text-sm leading-relaxed text-ink-2">
        <p className="font-wide text-[0.9375rem] font-extrabold text-ink">{title}</p>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}
