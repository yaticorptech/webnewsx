"use client";

import { Eye, FlaskConical, Heart, Lock, RotateCcw, Share2, Sparkles, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import type { DemoAction, DemoEngagementStatus } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./section-header";

const DONE: Record<DemoAction, string> = {
  enable: "Demo counts are showing",
  disable: "Real counts only",
  generate: "New demo numbers generated",
  reset: "Demo numbers cleared",
};

/**
 * Demo engagement (owner 2026-11-02): generated views / likes / shares for testing how the UI looks with numbers, on
 * local development and staging only. Real counts are never changed; the server refuses every change on the public
 * site, so there this page only explains that it's locked.
 */
export function DemoView({ initial }: { initial: DemoEngagementStatus }) {
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState<DemoAction | null>(null);

  const run = async (action: DemoAction) => {
    if (action === "reset" && !window.confirm("Clear every demo number? Real counts stay as they are.")) return;
    setBusy(action);
    try {
      setStatus(await api.admin.demoAction(action));
      toast.success(DONE[action], { id: "demo" });
    } catch (error) {
      toast.error("Couldn't do that", { id: "demo", description: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  const generated = status.demo.views + status.demo.likes + status.demo.shares + status.demo.followers > 0;

  return (
    <div className="animate-fade-up flex flex-col gap-8">
      <SectionHeader
        title="Demo engagement"
        description="Generated views, likes and shares (1–200 per story) and followers (1–200 per account), growing every minute while on, for testing the design. Real counts are never changed, and badges keep using real followers."
      />

      {!status.allowed && (
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-5 py-4">
          <Lock aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
          <div>
            <p className="font-semibold text-ink">Locked on the public site</p>
            <p className="mt-1 text-sm text-muted">
              This deployment serves webnewsx.com, so it always shows real counts only. Use these controls on your local setup or a staging
              deployment (set <code className="rounded bg-surface-2 px-1">ALLOW_DEMO_ENGAGEMENT=1</code> there).
            </p>
          </div>
        </div>
      )}

      <section className="card flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold",
              status.enabled ? "bg-success-soft text-success-strong" : "bg-surface-2 text-muted",
            )}
          >
            <span className={cn("size-2 rounded-full", status.enabled ? "bg-success" : "bg-muted")} />
            {status.enabled ? "Showing real + demo counts" : "Showing real counts only"}
          </span>
          <span className="text-sm text-muted">
            {status.generatedAt
              ? `Last generated ${new Date(status.generatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · ${formatNumber(status.stories)} stories · ${formatNumber(status.accounts)} accounts`
              : "No demo numbers generated yet"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button
            leftIcon={<Sparkles aria-hidden />}
            loading={busy === "generate"}
            disabled={!status.allowed || busy !== null}
            onClick={() => void run("generate")}
          >
            {generated ? "Regenerate demo counts" : "Generate demo counts"}
          </Button>
          {status.enabled ? (
            <Button variant="outline" loading={busy === "disable"} disabled={!status.allowed || busy !== null} onClick={() => void run("disable")}>
              Disable demo engagement
            </Button>
          ) : (
            <Button
              variant="outline"
              leftIcon={<FlaskConical aria-hidden />}
              loading={busy === "enable"}
              disabled={!status.allowed || busy !== null || !generated}
              onClick={() => void run("enable")}
            >
              Enable demo engagement
            </Button>
          )}
          <Button
            variant="ghost"
            leftIcon={<RotateCcw aria-hidden />}
            loading={busy === "reset"}
            disabled={!status.allowed || busy !== null || !generated}
            onClick={() => void run("reset")}
          >
            Reset demo counts
          </Button>
        </div>
      </section>

      <section aria-label="Engagement totals" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Totals icon={<Eye aria-hidden />} label="Views" actual={status.actual.views} demo={status.demo.views} shown={status.shown.views} />
        <Totals icon={<Heart aria-hidden />} label="Likes" actual={status.actual.likes} demo={status.demo.likes} shown={status.shown.likes} />
        <Totals icon={<Share2 aria-hidden />} label="Shares" actual={status.actual.shares} demo={status.demo.shares} shown={status.shown.shares} />
        <Totals icon={<Users aria-hidden />} label="Followers" actual={status.actual.followers} demo={status.demo.followers} shown={status.shown.followers} />
      </section>
    </div>
  );
}

function Totals({ icon, label, actual, demo, shown }: { icon: ReactNode; label: string; actual: number; demo: number; shown: number }) {
  return (
    <div className="card flex flex-col gap-3 p-5">
      <p className="flex items-center gap-2 text-sm font-bold text-ink [&_svg]:size-4.5 [&_svg]:text-brand">
        {icon}
        {label}
      </p>
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-[0.68rem] font-bold uppercase tracking-wide text-muted">Actual</dt>
          <dd className="mt-1 font-wide text-xl font-black text-ink">{formatNumber(actual)}</dd>
        </div>
        <div>
          <dt className="text-[0.68rem] font-bold uppercase tracking-wide text-muted">Demo</dt>
          <dd className="mt-1 font-wide text-xl font-black text-muted">{formatNumber(demo)}</dd>
        </div>
        <div>
          <dt className="text-[0.68rem] font-bold uppercase tracking-wide text-muted">Shown</dt>
          <dd className="mt-1 font-wide text-xl font-black text-brand">{formatNumber(shown)}</dd>
        </div>
      </dl>
    </div>
  );
}
