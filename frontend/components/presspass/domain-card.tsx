"use client";

import { BadgeCheck, Copy, Globe, LayoutTemplate, RefreshCw, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, isApiError } from "@/lib/api";
import type { PressDomain, PressPass } from "@/lib/shared/contracts";
import { passDate } from "./press-format";

/**
 * "Your domain" (owner 2026-10-28): a holder adds their site (e.g. an outlet like VK Mangalore's), publishes the TXT
 * record we show at their DNS provider, then taps Verify. A verified domain can run their website (/site-setup).
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
            <BadgeCheck aria-hidden className="size-4" /> DNS verified
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
        // Verified (owner 2026-10-29): "DNS verified" with Set up website next to it — the publisher's own news site.
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-[0.9375rem] leading-relaxed text-ink-2">
            <strong className="font-bold text-ink">{domain.name}</strong> is verified as yours since{" "}
            <span className="tabular-nums">{passDate(domain.verifiedAt!)}</span>.
          </p>
          <Button href="/site-setup" leftIcon={<LayoutTemplate aria-hidden />} className="rounded-2xl px-6 max-sm:w-full">
            Set up website
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-muted">
            Sign in to where you manage DNS for <strong className="text-ink">{domain.name}</strong> (GoDaddy, Cloudflare,
            Hostinger…) and add {domain.pointing.length === 1 ? "both" : "these"} records, then tap Verify. The TXT proves the domain is
            yours; the {domain.pointing[0]?.type} opens your website on it. DNS changes can take a few minutes to a few hours.
          </p>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-muted">
                <tr>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Host / Name</th>
                  <th className="px-3 py-2">Value</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">Copy</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[{ type: "TXT", host: domain.host, value: domain.value }, ...domain.pointing].map((record) => (
                  <tr key={`${record.type}-${record.host}`}>
                    <td className="px-3 py-2.5 font-mono text-[0.8125rem] text-ink">{record.type}</td>
                    <td className="px-3 py-2.5 font-mono text-[0.8125rem] text-ink">{record.host}</td>
                    <td className="break-all px-3 py-2.5 font-mono text-[0.8125rem] text-ink">{record.value}</td>
                    <td className="px-2 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => copy(record.value)}
                        aria-label={`Copy the ${record.type} value`}
                        className="rounded-md p-1.5 text-muted hover:bg-tint-3/60 hover:text-brand"
                      >
                        <Copy aria-hidden className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">
            Host <span className="font-mono">@</span> means {domain.name.replace(/^www\./, "")} itself. Remove any other A / CNAME record on the same host.
          </p>
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
