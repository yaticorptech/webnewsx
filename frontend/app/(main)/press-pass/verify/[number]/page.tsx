import type { Metadata } from "next";
import { BadgeCheck, ShieldX } from "lucide-react";
import { notFound } from "next/navigation";
import { PressPassCard } from "@/components/presspass/press-pass-card";
import { regionLabel } from "@/components/presspass/press-format";
import { Button } from "@/components/ui/button";
import { getPublicPressPass } from "@/lib/server-api";

export const metadata: Metadata = { title: "Verify Press Pass", robots: { index: false, follow: false } };

/**
 * Where a Press Pass's QR code leads (owner 2026-10-31: "when scanning the QR, show the press pass"): the card as it
 * is now, and whether the pass is valid. Public — whoever scans it needs no account. Never the private application.
 */
export default async function VerifyPressPassPage({ params }: PageProps<"/press-pass/verify/[number]">) {
  const { number } = await params;
  const pass = await getPublicPressPass(decodeURIComponent(number));
  if (!pass) notFound();
  const valid = pass.status === "active";

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-5 py-2">
      <div
        className={
          valid
            ? "flex items-start gap-3 rounded-2xl border border-success/30 bg-success-soft px-4 py-3.5 text-success-strong"
            : "flex items-start gap-3 rounded-2xl border border-brand/30 bg-tint px-4 py-3.5 text-brand-strong"
        }
      >
        {valid ? <BadgeCheck aria-hidden className="mt-0.5 size-5 shrink-0" /> : <ShieldX aria-hidden className="mt-0.5 size-5 shrink-0" />}
        <div>
          <p className="font-bold">{valid ? "Valid WebNEWS Press Pass" : "This Press Pass is no longer valid"}</p>
          <p className="mt-0.5 text-sm opacity-90">
            {pass.passNumber} · {pass.level === "verified" ? "Verified reporter" : "Trainee reporter"}
            {valid ? "" : " · revoked"}
          </p>
        </div>
      </div>

      <PressPassCard
        animateIn={false}
        data={{
          passNumber: pass.passNumber,
          level: pass.level,
          status: pass.status,
          holder: pass.holder,
          region: regionLabel(pass),
          languages: pass.languages,
          issuedAt: pass.issuedAt,
          editorDesk: pass.editorDesk,
          pledgeSigned: pass.pledgeSigned,
        }}
      />

      {pass.holder.username && (
        <div>
          <Button href={`/${pass.holder.username}`} variant="outline">
            View {pass.holder.name}&rsquo;s profile
          </Button>
        </div>
      )}
    </section>
  );
}
