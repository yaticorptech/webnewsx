"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { SpeedLines } from "@/components/brand/speed-lines";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { qk } from "@/lib/query-keys";
import type { PressPass, PressPassApplyResponse, PressPassOptions, Role } from "@/lib/shared/contracts";
import { PressPassForm, type PressPassFormMode } from "./press-pass-form";
import { PressPassHolder } from "./press-pass-holder";

export type PressPassViewProps = {
  viewer: { name: string; username: string; image: string | null; role: Role };
  pass: PressPass | null;
  options: PressPassOptions;
};

/**
 * /press-pass (SPEC §3.11). Readers apply (3 steps → pass issued instantly as Trainee); holders see
 * their animated pass (download, progress, complete/edit); revoked holders see how to appeal; the
 * Editor Desk (no pass needed) gets its own note. Issuing refreshes the server-rendered shell so the
 * masthead "+" and the profile's "+ New story" appear right away.
 */
export function PressPassView({ viewer, pass: initialPass, options }: PressPassViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pass, setPass] = useState(initialPass);
  const [justIssued, setJustIssued] = useState(false);
  const [editing, setEditing] = useState<Exclude<PressPassFormMode, "apply"> | null>(null);
  const holder = { name: viewer.name, username: viewer.username, image: viewer.image };

  const refreshShell = (next: PressPass) => {
    queryClient.setQueryData(qk.pressPass, { pressPass: next });
    void queryClient.invalidateQueries({ queryKey: qk.profile(viewer.username) });
    void queryClient.invalidateQueries({ queryKey: qk.pressPass });
    router.refresh();
  };

  const onIssued = (response: PressPassApplyResponse) => {
    setPass(response.pressPass);
    setJustIssued(true);
    window.scrollTo({ top: 0, behavior: "instant" });
    refreshShell(response.pressPass);
    toast.success("Press Pass issued", {
      id: "press-pass-issued",
      description: `${response.pressPass.passNumber} · You're a Trainee reporter.`,
    });
  };

  const onSaved = (saved: PressPass) => {
    setPass(saved);
    setEditing(null);
    window.scrollTo({ top: 0, behavior: "instant" });
    refreshShell(saved);
    toast.success(editing === "complete" ? "Press Pass completed" : "Press Pass updated", { id: "press-pass-saved" });
  };

  if (pass && editing) {
    return (
      <PressPassForm
        mode={editing}
        holder={holder}
        options={options}
        pass={pass}
        onSaved={onSaved}
        onCancel={() => setEditing(null)}
        layout={wideLayout(
          <PageIntro
            kicker="Press Pass"
            title={editing === "complete" ? "Complete your Press Pass" : "Edit your Press Pass"}
            lede="Your region and languages print on your pass and your profile. Your verification details stay private to the Editor Desk."
          />,
        )}
      />
    );
  }

  if (pass) {
    return <PressPassHolder pass={pass} justIssued={justIssued} editorDesk={viewer.role === "admin"} onEdit={setEditing} />;
  }

  if (viewer.role === "admin") return <EditorDeskNote />;

  // Full page width (owner 2026-10-07): the intro across the top (owner 2026-10-08: no perk cards), then the form. No pass card until one is
  // issued (owner 2026-10-08: "without applying, why show the card?").
  return (
    <PressPassForm
      mode="apply"
      holder={holder}
      options={options}
      pass={null}
      onIssued={onIssued}
      layout={wideLayout(
        <PageIntro kicker="Press Pass" title="Get your Press Pass" />,
        { card: false },
      )}
    />
  );
}

/**
 * Full page width (owner 2026-10-07: "make entire full screen", no side column): the intro across the top, then the
 * live pass (editing a pass that exists; `card: false` while applying) and the form under it, all using the full width.
 */
function wideLayout(intro: ReactNode, { card: showCard = true }: { card?: boolean } = {}) {
  function WideLayout({ card, form }: { card: ReactNode; form: ReactNode }) {
    return (
      <div data-grid-page="" className="flex flex-col gap-6 sm:gap-8">
        {intro}
        {/* The live pass at a card's size, not the page's width (owner 2026-10-09: it filled the screen). */}
        {showCard && <div className="w-full max-w-2xl">{card}</div>}
        {form}
      </div>
    );
  }
  return WideLayout;
}

function PageIntro({ kicker, title, lede, children }: { kicker: string; title: string; lede?: string; children?: ReactNode }) {
  return (
    <header>
      {/* The back arrow shares the kicker's line (owner 2026-10-07). */}
      <div className="flex items-center gap-3">
        <BackButton fallback="/" />
        <p className="kicker flex items-center gap-2 text-brand">
          <SpeedLines className="text-[0.8rem]" />
          {kicker}
        </p>
      </div>
      <h1 className="mt-2 font-wider text-[2rem] font-black leading-[0.98] tracking-[-0.02em] text-ink sm:text-[2.75rem]">{title}</h1>
      {lede && <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-muted">{lede}</p>}
      {children}
    </header>
  );
}

/** Editor Desk accounts publish with Verified rights and don't need a pass. */
function EditorDeskNote() {
  return (
    <div data-grid-page="" className="flex flex-col gap-8">
      <PageIntro
        kicker="Press Pass"
        title="You're on the Editor Desk"
        lede="Editor Desk accounts publish with Verified rights — no Press Pass needed. Reporters' passes are issued, verified and revoked from the console."
      />
      <div className="card flex flex-col gap-5 px-5 py-6 sm:flex-row sm:items-center sm:px-6">
        <VerifiedBadge size={44} label="Verified — Editor Desk" />
        <div className="min-w-0 flex-1">
          <p className="font-wide text-lg font-extrabold text-ink">Verified publishing rights</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">Your stories go live instantly and carry the Verified badge.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button href="/publish" size="lg" leftIcon={<Plus aria-hidden strokeWidth={2.75} />}>
          New story
        </Button>
        <Button href="/newsroom" size="lg" variant="ghost" leftIcon={<BarChart3 aria-hidden />}>
          Newsroom
        </Button>
      </div>
    </div>
  );
}
