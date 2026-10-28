"use client";

import { BadgeCheck, Copy, Globe, RefreshCw, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, isApiError } from "@/lib/api";
import type { PressDomain, PressPass } from "@/lib/shared/contracts";
import { passDate } from "./press-format";

/**
 * "Your domain" (owner 2026-10-28): a holder adds their site (e.g. an outlet like VK Mangalore's), publishes the TXT
 * record we show at their DNS provider, then taps Verify. What a verified domain unlocks comes later.
 */
export function DomainCard({ domain, onChange }: { domain: PressDomain | null; onChange: (pass: PressPass) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "verify" | "remove" | null>(null);
  const [changing, setChanging] = useState(false);

  const run = async (kind: NonNullable<typeof busy>, call: () => Promise<{ pressPass: PressPass | null }>, done?: string) => {
    setBusy(kind);
    setError(null);
    try {
      const { pressPass } = await call();
      if (pressPass) onChange(pressPass);
      if (done) toast.success(done);
      return true;
    } catch (err) {
      if (isApiError(err) && err.fields?.domain) setError(err.fields.domain);
      else if (kind === "verify") toast.error("Not verified yet", { description: errorMessage(err) });
      else toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (await run("save", () => api.setPressDomain({ domain: value }))) {
      setChanging(false);
      setValue("");
    }
  };

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(() => toast.success("Copied"));
  };

  const verified = Boolean(domain?.verifiedAt);

  return (
    <section aria-labelledby="pass-domain" className="card px-5 py-5 sm:px-6 sm:py-6">
      <div className="flex items-center gap-3">
        <Globe aria-hidden className="size-6 shrink-0 text-ink-2" strokeWidth={1.75} />
        <h2 id="pass-domain" className="font-wide text-lg font-extrabold text-ink">
          Your domain
        </h2>
        {verified && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-tint-3/70 px-2.5 py-1 text-xs font-bold text-brand">
            <BadgeCheck aria-hidden className="size-4" /> Verified
          </span>
        )}
      </div>

      {!domain || changing ? (
        <form onSubmit={(event) => void save(event)} className="mt-3 flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-muted">
            Own a news website? Add its domain and prove it&apos;s yours with a DNS record.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="yoursite.com"
              aria-label="Domain"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              invalid={Boolean(error)}
              className="flex-1"
            />
            <div className="flex gap-2">
              <Button type="submit" loading={busy === "save"} disabled={!value.trim()} className="rounded-2xl px-6 max-sm:flex-1">
                Add domain
              </Button>
              {changing && (
                <Button type="button" variant="ghost" onClick={() => setChanging(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
          {error && <p className="text-sm font-semibold text-brand">{error}</p>}
        </form>
      ) : verified ? (
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">
          <strong className="font-bold text-ink">{domain.name}</strong> is verified as yours since{" "}
          <span className="tabular-nums">{passDate(domain.verifiedAt!)}</span>.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-muted">
            Sign in to where you manage DNS for <strong className="text-ink">{domain.name}</strong> (GoDaddy, Cloudflare,
            Hostinger…) and add this TXT record, then tap Verify. DNS changes can take a few minutes to a few hours.
          </p>
          <dl className="grid gap-2 rounded-xl border border-border bg-surface p-3 text-sm">
            <RecordRow label="Type" value="TXT" />
            <RecordRow
              label="Host / Name"
              value={domain.host}
              hint={`(${domain.name})`}
              onCopy={() => copy(domain.host)}
            />
            <RecordRow label="Value" value={domain.value} onCopy={() => copy(domain.value)} />
          </dl>
          {error && <p className="text-sm font-semibold text-brand">{error}</p>}
        </div>
      )}

      {domain && !changing && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!verified && (
            <Button
              loading={busy === "verify"}
              leftIcon={<RefreshCw aria-hidden />}
              onClick={() => void run("verify", api.verifyPressDomain, "Domain verified")}
              className="rounded-2xl px-6"
            >
              Verify
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setChanging(true)}>
            Change domain
          </Button>
          <Button
            variant="ghost"
            size="sm"
            loading={busy === "remove"}
            leftIcon={<Trash2 aria-hidden />}
            onClick={() => void run("remove", api.removePressDomain, "Domain removed")}
          >
            Remove
          </Button>
        </div>
      )}
    </section>
  );
}

function RecordRow({ label, value, hint, onCopy }: { label: string; value: string; hint?: string; onCopy?: () => void }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-2">
      <dt className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className="min-w-0 break-all font-mono text-[0.8125rem] text-ink">
        {value} {hint && <span className="font-sans text-xs text-muted">{hint}</span>}
      </dd>
      {onCopy ? (
        <button type="button" onClick={onCopy} aria-label={`Copy ${label}`} className="rounded-md p-1.5 text-muted hover:bg-tint-3/60 hover:text-brand">
          <Copy aria-hidden className="size-4" />
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}
