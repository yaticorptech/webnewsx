"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import {
  DEFAULT_MEMBERSHIP_RULES,
  MEMBERSHIP_RULE_METRICS,
  MEMBERSHIP_RULE_METRIC_VALUES,
  membershipRuleTitle,
  type MembershipRule,
  type MembershipRuleMetric,
} from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/*
 * Desk → Memberships → Rules (owner 2026-10-16: "editable in the admin panel, and new rules can be added"): who may
 * start a premium membership. Each rule is one measurable thing with its number; switch it on / off, change the number,
 * move it, remove it, or add one from the list. Saved together (audited); reporters' Settings show the new rules at once.
 */

const KEY = ["admin", "membership-rules"] as const;
const same = (a: MembershipRule[], b: MembershipRule[]) => JSON.stringify(a) === JSON.stringify(b);

export function MembershipRulesEditor() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: ({ signal }) => api.admin.membershipRules(signal) });
  const saved = query.data?.rules ?? null;
  const [draft, setDraft] = useState<MembershipRule[] | null>(null);
  const rules = draft ?? saved ?? [];
  const dirty = draft !== null && saved !== null && !same(draft, saved);
  const unused = MEMBERSHIP_RULE_METRIC_VALUES.filter((metric) => !rules.some((rule) => rule.metric === metric));
  const [adding, setAdding] = useState<MembershipRuleMetric | "">("");

  const save = useMutation({
    mutationFn: (next: MembershipRule[]) => api.admin.setMembershipRules(next),
    onSuccess: (result) => {
      queryClient.setQueryData(KEY, result);
      setDraft(null);
      toast.success("Membership rules saved", { description: "Reporters see the new rules in Settings right away." });
    },
    onError: (err) => toast.error("Couldn't save the rules", { description: errorMessage(err) }),
  });

  const update = (index: number, change: Partial<MembershipRule>) =>
    setDraft(rules.map((rule, i) => (i === index ? { ...rule, ...change } : rule)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...rules];
    const [rule] = next.splice(index, 1);
    next.splice(index + by, 0, rule!);
    setDraft(next);
  };
  const add = (metric: MembershipRuleMetric) => {
    const defaults: Record<MembershipRuleMetric, number> = {
      verified: 1,
      followers: 100,
      posting_days: 30,
      stories: 50,
      views: 10_000,
      likes: 500,
      account_age_days: 90,
      no_warnings_days: 60,
    };
    setDraft([...rules, { metric, value: defaults[metric], enabled: true }]);
    setAdding("");
  };
  const invalid = rules.some((rule) => MEMBERSHIP_RULE_METRICS[rule.metric].hasValue && (!Number.isInteger(rule.value) || rule.value < 1));
  const on = rules.filter((rule) => rule.enabled);

  return (
    <section aria-labelledby="membership-rules" className="rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgb(16_24_40/0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="flex size-8 items-center justify-center rounded-lg bg-tint text-brand">
            <ShieldCheck className="size-4.5" />
          </span>
          <div>
            <h2 id="membership-rules" className="text-sm font-semibold text-ink">
              Who can start a premium membership
            </h2>
            <p className="text-xs text-muted">Reporters must meet every rule that&rsquo;s on.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <Button variant="ghost" size="sm" leftIcon={<RotateCcw aria-hidden />} onClick={() => setDraft(null)}>
              Undo changes
            </Button>
          )}
          <Button size="sm" disabled={!dirty || invalid} loading={save.isPending} onClick={() => save.mutate(rules)}>
            Save rules
          </Button>
        </div>
      </div>

      {query.isPending ? (
        <div className="skeleton m-5 h-40 rounded-lg" />
      ) : query.isError ? (
        <p className="px-5 py-6 text-sm text-muted">{errorMessage(query.error)}</p>
      ) : (
        <div className="flex flex-col">
          <ul className="divide-y divide-border">
            {rules.map((rule, index) => {
              const info = MEMBERSHIP_RULE_METRICS[rule.metric];
              return (
                <li key={rule.metric} className={cn("flex flex-wrap items-center gap-3 px-5 py-3", !rule.enabled && "bg-[#fafafa]")}>
                  {/* On / off */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={rule.enabled}
                    aria-label={`${info.label}: ${rule.enabled ? "on" : "off"}`}
                    onClick={() => update(index, { enabled: !rule.enabled })}
                    className={cn(
                      "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors",
                      rule.enabled ? "bg-brand" : "bg-border-strong",
                    )}
                  >
                    {/* Pinned to the left edge, then slid right when on — it stays inside the track. */}
                    <span
                      aria-hidden
                      className={cn(
                        "block size-5 rounded-full bg-white shadow-[0_1px_3px_rgb(16_24_40/0.3)] transition-transform duration-200",
                        rule.enabled ? "translate-x-4" : "translate-x-0",
                      )}
                    />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-medium", rule.enabled ? "text-ink" : "text-muted")}>{info.label}</p>
                    <p className="text-xs text-muted">Reporters see: “{membershipRuleTitle(rule)}”</p>
                  </div>
                  {info.hasValue && (
                    <label className="flex items-center gap-2">
                      <span className="text-xs text-muted">At least</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={Number.isNaN(rule.value) ? "" : rule.value}
                        onChange={(event) => update(index, { value: event.target.value === "" ? Number.NaN : Math.floor(Number(event.target.value)) })}
                        aria-label={`${info.label} — at least`}
                        className={cn(
                          "h-9 w-28 rounded-lg border bg-surface px-3 text-right text-sm font-semibold tabular-nums text-ink focus:border-brand focus:outline-none",
                          !Number.isInteger(rule.value) || rule.value < 1 ? "border-brand" : "border-border-strong",
                        )}
                      />
                      {info.unit && <span className="w-14 text-xs text-muted">{info.unit}</span>}
                    </label>
                  )}
                  <div className="flex items-center gap-0.5">
                    <IconButton label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>
                      <ArrowUp aria-hidden className="size-4" />
                    </IconButton>
                    <IconButton label="Move down" disabled={index === rules.length - 1} onClick={() => move(index, 1)}>
                      <ArrowDown aria-hidden className="size-4" />
                    </IconButton>
                    <IconButton label={`Remove ${info.label}`} onClick={() => setDraft(rules.filter((_, i) => i !== index))} danger>
                      <Trash2 aria-hidden className="size-4" />
                    </IconButton>
                  </div>
                </li>
              );
            })}
            {rules.length === 0 && <li className="px-5 py-6 text-center text-sm text-muted">No rules — any reporter can start a membership.</li>}
          </ul>

          <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3.5">
            {unused.length > 0 && (
              <>
                <select
                  value={adding}
                  onChange={(event) => setAdding(event.target.value as MembershipRuleMetric | "")}
                  aria-label="Rule to add"
                  className="h-9 min-w-56 rounded-lg border border-border-strong bg-surface px-3 text-sm text-ink focus:border-brand focus:outline-none"
                >
                  <option value="">Add a rule…</option>
                  {unused.map((metric) => (
                    <option key={metric} value={metric}>
                      {MEMBERSHIP_RULE_METRICS[metric].label}
                    </option>
                  ))}
                </select>
                <Button variant="outline" size="sm" leftIcon={<Plus aria-hidden />} disabled={!adding} onClick={() => adding && add(adding)}>
                  Add
                </Button>
              </>
            )}
            <button
              type="button"
              onClick={() => setDraft(DEFAULT_MEMBERSHIP_RULES)}
              className="ml-auto text-xs font-medium text-muted hover:text-ink"
            >
              Reset to defaults
            </button>
          </div>
          <p className="border-t border-border bg-[#fafafa] px-5 py-3 text-xs text-muted">
            {on.length === 0
              ? "With no rules on, every reporter can start a membership."
              : `Reporters need: ${on.map(membershipRuleTitle).join(" · ")}`}
            {dirty && <span className="ml-1 font-semibold text-brand">· not saved yet</span>}
          </p>
        </div>
      )}
    </section>
  );
}

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors disabled:opacity-30",
        danger ? "hover:bg-tint hover:text-brand" : "hover:bg-surface-2 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
