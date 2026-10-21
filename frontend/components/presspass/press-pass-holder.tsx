"use client";

import { ArrowRight, BarChart3, CalendarDays, Download, ExternalLink, FilePen, FileText, Link2, Maximize2, PenLine, Plus, ScrollText, ShieldAlert, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { SpeedLinesSweep } from "@/components/brand/speed-lines-motion";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { PulseDot } from "@/components/ui/pulse-dot";
import { toast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { COMPANY } from "@/lib/company";
import type { PressPass } from "@/lib/shared/contracts";
import { passDate, regionLabel } from "./press-format";
import { PressPassCard, type PressPassCardData } from "./press-pass-card";
import { downloadPressPass } from "./press-pass-image";
import { PressPassZoom } from "./press-pass-zoom";
import { ReviewProgress } from "./review-progress";

export function cardDataOf(pass: PressPass, editorDesk = false): PressPassCardData {
  return {
    passNumber: pass.passNumber,
    level: pass.level,
    status: pass.status,
    holder: {
      name: pass.holder.name,
      username: pass.holder.username,
      image: pass.holder.image,
    },
    region: regionLabel(pass),
    languages: pass.languages,
    issuedAt: pass.issuedAt,
    editorDesk,
    pledgeSigned: Boolean(pass.pledgeSignedAt),
  };
}

export type PressPassHolderProps = {
  pass: PressPass;
  /** Just issued: celebratory heading + speed-lines sweep. */
  justIssued?: boolean;
  editorDesk?: boolean;
  onEdit: (mode: "complete" | "edit") => void;
};

const EASE = [0.2, 0.8, 0.2, 1] as const;

/**
 * A holder's Press Pass page, after the owner's reference (2026-10-08): the heading (owner 2026-10-09: without the
 * reference's red swoosh and DIGITAL PRESS CREDENTIAL); the ID card on the left with New story · Download PNG under it; on the
 * right "Your identity is verified" (Trainees: the Review Desk progress), "Complete your Press Pass" for migrated
 * passes, and Additional Information (why I report, links, the pledge, the issue date). Revoked passes show the
 * greyed card and how to appeal. Full page width (owner 2026-10-02, `data-grid-page`); ≥1024px the card stays in
 * view while the right column scrolls.
 */
export function PressPassHolder({ pass, justIssued = false, editorDesk = false, onEdit }: PressPassHolderProps) {
  const reduce = useReducedMotion();
  const [downloading, setDownloading] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const revoked = pass.status === "revoked";
  const data = cardDataOf(pass, editorDesk);

  const download = async () => {
    setDownloading(true);
    try {
      await downloadPressPass(data);
    } catch (error) {
      toast.error("Couldn't create the image", {
        description: errorMessage(error),
      });
    } finally {
      setDownloading(false);
    }
  };

  const reveal = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { delay, duration: 0.4, ease: EASE },
        };

  return (
    // The card and the right column start well below the heading (owner 2026-10-09: "make this entire part a little down").
    <div data-grid-page="" className="flex flex-col gap-10 sm:gap-12 lg:gap-14">
      <header className="relative isolate">
        {justIssued && (
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <SpeedLinesSweep className="opacity-60" duration={1} />
          </div>
        )}
        {/* The back arrow shares the kicker's line (owner 2026-10-07). */}
        <div className="flex items-center gap-3">
          <BackButton fallback="/" />
          <p className="kicker flex items-center gap-2 text-brand">
            {justIssued ? (
              <>
                <PulseDot size="sm" /> Issued just now
              </>
            ) : (
              <>
                Press Pass · {revoked ? "Revoked" : pass.level === "verified" ? "Verified reporter" : "Trainee reporter"}
              </>
            )}
          </p>
        </div>
        <h1 className="mt-2 font-wider text-[2rem] font-black leading-[0.98] tracking-[-0.02em] text-ink sm:text-[2.75rem]">
          {justIssued ? (
            <>
              Your <span className="text-brand">Press Pass</span> is issued
            </>
          ) : (
            <>
              Your <span className="text-brand">Press Pass</span>
            </>
          )}
        </h1>
        <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-muted sm:text-base" role={justIssued ? "status" : undefined}>
          {revoked
            ? "The Editor Desk revoked this pass, so you're a Reader again. Your published stories stay up unless the desk removes them."
            : justIssued
              ? "Welcome to the newsroom. You're a Trainee reporter — publish your first article and the Review Desk will take it from there."
              : pass.level === "verified"
                ? "You're a verified reporter — your stories go live the moment you publish."
                : "You're a Trainee reporter: each story goes to the Review Desk before it goes live."}
        </p>
      </header>

      <div className="grid gap-7 sm:gap-9 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:items-start lg:gap-10 xl:grid-cols-[minmax(0,40rem)_minmax(0,1fr)] xl:gap-12">
        {/* Left: the pass and what to do with it (stays in view while the right column scrolls). */}
        <div className="flex flex-col gap-6 sm:gap-7 lg:sticky lg:top-[calc(var(--nav-h)+1.5rem)]">
          <PressPassCard data={data} className="mx-auto w-full max-w-xl lg:max-w-none" />
          <PressPassZoom data={data} open={zoomed} onClose={() => setZoomed(false)} />

          <motion.div {...reveal(0.35)} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              {/* "+ New story" together in the middle, no arrow (owner 2026-10-09); opens the story composer. */}
              {!revoked && (
                <Button href="/publish" size="lg" leftIcon={<Plus aria-hidden strokeWidth={2.75} />} className="rounded-2xl px-6 max-sm:flex-1 sm:min-w-[14rem]">
                  {justIssued ? "Publish your first article" : "New story"}
                </Button>
              )}
              <Button
                variant="outline"
                size="lg"
                loading={downloading}
                leftIcon={<Download aria-hidden />}
                onClick={() => void download()}
                className="rounded-2xl px-6 max-sm:flex-1"
              >
                Download PNG
              </Button>
            </div>
            {/* One line at every width (owner 2026-10-09): on phones the three spread across the row, a little tighter. */}
            <div className="flex items-center justify-between gap-1 sm:-ml-3 sm:justify-start">
              {/* Phones: the card is small — this shows it as large as the screen allows (press-pass-zoom.tsx). */}
              <Button variant="ghost" size="sm" leftIcon={<Maximize2 aria-hidden />} onClick={() => setZoomed(true)} className={LINK_FIT}>
                View full size
              </Button>
              {!revoked && (
                <Button href="/newsroom" variant="ghost" size="sm" leftIcon={<BarChart3 aria-hidden />} className={LINK_FIT}>
                  Newsroom
                </Button>
              )}
              {!revoked && pass.complete && (
                <Button variant="ghost" size="sm" leftIcon={<FilePen aria-hidden />} onClick={() => onEdit("edit")} className={LINK_FIT}>
                  Edit details
                </Button>
              )}
            </div>
          </motion.div>
        </div>

        {/* Right: status and the pass's details. */}
        <div className="flex flex-col gap-6 sm:gap-7">
          {/* A card like the others, without the "Verified reporter" label (owner 2026-10-09); compact on phones. */}
          {!revoked && (
            <motion.section {...reveal(0.45)} aria-label="Reporter level" className="card px-5 py-5 sm:px-6 sm:py-6">
              {pass.level === "verified" ? (
                <div className="flex items-center gap-4 sm:gap-6">
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-tint-3/70 sm:size-24">
                    <ShieldCheck aria-hidden className="size-7 fill-brand text-white sm:size-10" strokeWidth={1.75} />
                  </span>
                  <span aria-hidden className="hidden h-24 w-px shrink-0 bg-tint-border sm:block" />
                  <div className="min-w-0">
                    <h2 className="font-wide text-xl font-black tracking-tight text-ink sm:text-2xl">Your identity is verified</h2>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted sm:mt-2 sm:text-[0.9375rem]">
                      You can publish stories, cover press meets and access the reporter desk. Keep your details updated for
                      uninterrupted access.
                    </p>
                  </div>
                </div>
              ) : (
                <ReviewProgress approved={pass.approvedCount} required={pass.approvalsToVerify} />
              )}
            </motion.section>
          )}

          {!revoked && !pass.complete && (
            <motion.section {...reveal(0.5)} aria-labelledby="complete-pass" className="card flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:gap-5 sm:px-6">
              <IconDisc>
                <FileText aria-hidden className="size-9 text-brand" strokeWidth={1.75} />
              </IconDisc>
              <div className="min-w-0 flex-1">
                <h2 id="complete-pass" className="font-wide text-lg font-extrabold text-ink">
                  Complete your Press Pass
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  WebNEWS now keeps every reporter&apos;s personal details — your full name, date of birth, address and a
                  government ID — plus your mobile number and reporting background. Only the Editor Desk sees them.
                </p>
              </div>
              <Button size="lg" rightIcon={<ArrowRight aria-hidden />} onClick={() => onEdit("complete")} className="shrink-0 rounded-2xl px-6">
                Complete it
              </Button>
            </motion.section>
          )}

          {revoked && (
            <section className="panel-tint flex items-start gap-3 px-5 py-4 text-sm leading-relaxed text-ink-2">
              <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-brand" />
              <p>
                Think this is a mistake? Write to{" "}
                <a href={`mailto:${COMPANY.email}`} className="font-bold text-brand underline underline-offset-4">
                  {COMPANY.email}
                </a>{" "}
                with your pass number <strong className="tabular-nums">{pass.passNumber}</strong> — only the Editor Desk
                can reinstate it.
              </p>
            </section>
          )}

          <motion.section {...reveal(0.55)} aria-labelledby="pass-details" className="card">
            <h2 id="pass-details" className="border-b border-border px-5 py-4 font-wide text-xl font-black tracking-tight text-ink sm:px-6">
              Additional Information
            </h2>
            <dl className="divide-y divide-border">
              {pass.about && (
                <DetailRow icon={FileText} label="Why I report">
                  &ldquo;{pass.about}&rdquo;
                </DetailRow>
              )}
              {pass.links.length > 0 && (
                <DetailRow icon={Link2} label="Links">
                  <ul className="flex flex-col gap-1.5">
                    {pass.links.map((link) => (
                      <li key={link} className="min-w-0">
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer nofollow ugc"
                          className="inline-flex max-w-full items-center gap-1.5 font-semibold text-brand underline-offset-4 hover:underline"
                        >
                          <span className="truncate">{link.replace(/^https?:\/\/(www\.)?/i, "")}</span>
                          <ExternalLink aria-hidden className="size-3.5 shrink-0" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </DetailRow>
              )}
              <DetailRow icon={ScrollText} label="Reporter Pledge">
                {pass.pledgeSignedAt ? (
                  <>
                    Signed <strong className="font-bold tabular-nums text-ink">{passDate(pass.pledgeSignedAt)}</strong>
                    {pass.pledgeSignature ? (
                      <>
                        {" "}
                        as <span className="font-serif text-base italic text-ink">{pass.pledgeSignature}</span>
                      </>
                    ) : null}
                  </>
                ) : (
                  <span className="text-muted">Not signed yet</span>
                )}
              </DetailRow>
              <DetailRow icon={CalendarDays} label="Issued on">
                <span className="tabular-nums">{passDate(pass.issuedAt)}</span>
                {pass.revokedAt && (
                  <>
                    {" "}
                    · revoked <span className="tabular-nums">{passDate(pass.revokedAt)}</span>
                  </>
                )}
              </DetailRow>
              {!pass.complete && !revoked && (
                <div className="px-5 py-3 sm:px-6">
                  <Button variant="ghost" size="sm" leftIcon={<PenLine aria-hidden />} onClick={() => onEdit("complete")}>
                    Add your details
                  </Button>
                </div>
              )}
            </dl>
          </motion.section>
        </div>
      </div>
    </div>
  );
}

/** The links under the card on phones: smaller text and padding so all three fit one line. */
const LINK_FIT = "max-sm:min-w-0 max-sm:gap-1 max-sm:px-1.5 max-sm:text-xs";

/** The reference's pink disc behind a card's icon. */
function IconDisc({ children }: { children: ReactNode }) {
  return <span className="flex size-20 shrink-0 items-center justify-center rounded-full bg-tint-3/70 sm:size-24">{children}</span>;
}

function DetailRow({ icon: Icon, label, children }: { icon: ComponentType<SVGProps<SVGSVGElement>>; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-1 px-5 py-4 sm:grid-cols-[auto_10rem_minmax(0,1fr)] sm:items-center sm:px-6">
      <Icon aria-hidden className="size-6 text-ink-2 max-sm:row-span-2" strokeWidth={1.75} />
      <dt className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-muted">{label}</dt>
      <dd className="min-w-0 text-[0.9375rem] leading-relaxed text-ink-2 wrap-break-word max-sm:col-start-2">{children}</dd>
    </div>
  );
}
