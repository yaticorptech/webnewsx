"use client";

import { Globe, LogIn, Smartphone, UserRound, UsersRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { TimeAgo } from "@/components/ui/time-ago";
import { api } from "@/lib/api";
import { compactNumber } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import type { LoginRow, VisitorRow, VisitorWho, VisitorsReport } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { ListEmpty, ListError, ListLoading, LoadMore, SearchBox, Segmented } from "./list-parts";
import { SectionHeader } from "./section-header";
import { useDeskList } from "./use-desk-list";

type Tab = "visitors" | "logins";
type Days = "1" | "7" | "30";

const DAY_LABEL: Record<Days, string> = { "1": "Today", "7": "Last 7 days", "30": "Last 30 days" };
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

/**
 * Desk → Visitors (owner 2026-11-11): how many people opened WebNewsX — guests (not signed in) and signed-in — with the
 * IP address and device of each, and every sign-in. Plain words, one number per question.
 */
export function VisitorsView() {
  const [tab, setTab] = useState<Tab>("visitors");
  return (
    <div className="animate-fade-up flex flex-col gap-8">
      <SectionHeader
        title="Visitors"
        description="Everyone who opened WebNewsX, with or without signing in — their IP address, device and what they looked at. Phones and browsers never share a MAC address with websites, so each guest is counted by their browser or app."
      />
      <Segmented<Tab>
        label="Show"
        value={tab}
        onChange={setTab}
        options={[
          { value: "visitors", label: "Who visited" },
          { value: "logins", label: "Sign-ins" },
        ]}
      />
      {tab === "visitors" ? <VisitorsTab /> : <LoginsTab />}
    </div>
  );
}

function VisitorsTab() {
  const [days, setDays] = useState<Days>("1");
  const [who, setWho] = useState<VisitorWho>("all");
  const [q, setQ] = useState("");
  const list = useDeskList<VisitorRow>({
    queryKey: qk.adminVisitors(Number(days), who, q),
    fetchPage: (cursor, signal) => api.admin.visitors({ days: Number(days), who, q, cursor }, signal),
  });
  const report = list.data?.pages[0] as VisitorsReport | undefined;
  const t = report?.totals;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<Days>
          label="Period"
          value={days}
          onChange={setDays}
          options={(["1", "7", "30"] as const).map((value) => ({ value, label: DAY_LABEL[value] }))}
        />
      </div>

      {/* The three numbers that answer "how many?" — total, without sign-in, signed in. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={<UsersRound aria-hidden />} label="People visited" value={t?.visitors} hint={t ? `${compactNumber(t.pageViews)} pages opened` : undefined} strong />
        <Stat icon={<Globe aria-hidden />} label="Without sign-in (guests)" value={t?.guests} hint={t && t.visitors ? `${Math.round((t.guests / t.visitors) * 100)}% of visitors` : undefined} />
        <Stat icon={<UserRound aria-hidden />} label="Signed in" value={t?.signedIn} hint={t ? `${compactNumber(t.app)} on the app · ${compactNumber(t.web)} on the web` : undefined} />
      </div>

      {report && report.daily.length > 1 && <DailyBars daily={report.daily} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<VisitorWho>
          label="Who"
          value={who}
          onChange={setWho}
          options={[
            { value: "all", label: "Everyone" },
            { value: "guests", label: "Guests" },
            { value: "signed-in", label: "Signed in" },
          ]}
        />
        <SearchBox label="Search visitors" placeholder="IP address or username" value={q} onSearch={setQ} />
      </div>

      {list.isPending ? (
        <ListLoading label="Loading visitors" />
      ) : list.isError && list.items.length === 0 ? (
        <ListError message="Visitors didn't load." onRetry={() => void list.refetch()} />
      ) : list.items.length === 0 ? (
        <ListEmpty icon={<UsersRound aria-hidden />} title={q ? "Nobody matches" : "No visitors in this period"} description="Visits appear here as soon as someone opens a page." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="border-b border-border bg-surface-2 text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Visitor</th>
                <th className="px-4 py-3">IP address</th>
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3 text-right">Pages</th>
                <th className="px-4 py-3">Last page</th>
                <th className="px-4 py-3">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.items.map((row) => (
                <tr key={`${row.visitorId}-${row.lastAt}`} className="align-middle">
                  <td className="px-4 py-3">
                    {row.person ? (
                      <div className="flex items-center gap-2.5">
                        <Avatar src={row.person.image} name={row.person.name} size={28} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-ink">{row.person.name}</div>
                          <div className="text-xs text-muted">@{row.person.username}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-7 place-items-center rounded-full bg-surface-2 text-muted">
                          <Globe aria-hidden className="size-3.5" />
                        </span>
                        <div>
                          <div className="font-semibold text-ink">Guest</div>
                          <div className="font-mono text-xs text-muted">#{row.visitorId}</div>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink">{row.ip ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      {row.platform === "app" && <Smartphone aria-hidden className="size-3.5 text-brand" />}
                      {row.device}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">{row.pages}</td>
                  <td className="max-w-[16rem] truncate px-4 py-3 text-xs text-muted" title={row.lastPath}>
                    {row.lastPath}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    <span title={`First seen ${when(row.firstAt)}`}>
                      <TimeAgo date={row.lastAt} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore hasMore={Boolean(list.hasNextPage)} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} label="Show more visitors" />
    </>
  );
}

function LoginsTab() {
  const [q, setQ] = useState("");
  const list = useDeskList<LoginRow>({
    queryKey: qk.adminLogins(q),
    fetchPage: (cursor, signal) => api.admin.logins({ q, cursor }, signal),
  });
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Every time someone signs in — newest first.</p>
        <SearchBox label="Search sign-ins" placeholder="IP address or username" value={q} onSearch={setQ} />
      </div>
      {list.isPending ? (
        <ListLoading label="Loading sign-ins" />
      ) : list.isError && list.items.length === 0 ? (
        <ListError message="Sign-ins didn't load." onRetry={() => void list.refetch()} />
      ) : list.items.length === 0 ? (
        <ListEmpty icon={<LogIn aria-hidden />} title={q ? "Nothing matches" : "No sign-ins yet"} description="Each sign-in appears here with its IP address and device." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-border bg-surface-2 text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">IP address</th>
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.items.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar src={row.person.image} name={row.person.name} size={28} />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-ink">{row.person.name}</div>
                        <div className="text-xs text-muted">@{row.person.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink">{row.ip ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">{row.device}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    <TimeAgo date={row.at} />
                    <div className="text-xs">{when(row.at)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore hasMore={Boolean(list.hasNextPage)} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} label="Show older sign-ins" />
    </>
  );
}

function Stat({ icon, label, value, hint, strong = false }: { icon: ReactNode; label: string; value: number | undefined; hint?: string; strong?: boolean }) {
  return (
    <div className={cn("rounded-xl border px-5 py-4", strong ? "border-brand/30 bg-tint" : "border-border bg-surface")}>
      <div className="flex items-center gap-2 text-sm font-semibold text-muted [&_svg]:size-4">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-display text-3xl font-bold tabular-nums text-ink">{value === undefined ? "—" : value.toLocaleString("en-IN")}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** One stacked bar per day: guests (light) under signed-in (brand). */
function DailyBars({ daily }: { daily: VisitorsReport["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => d.guests + d.signedIn));
  return (
    <figure className="rounded-xl border border-border bg-surface px-5 py-4">
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-ink">
        Visitors per day
        <span className="flex items-center gap-4 text-xs font-normal text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-brand" /> Signed in
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-border-strong" /> Guests
          </span>
        </span>
      </figcaption>
      <div className="flex h-36 items-end gap-1" role="list">
        {daily.map((d) => {
          const total = d.guests + d.signedIn;
          const label = `${new Date(`${d.day}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}: ${total} visitors (${d.guests} guests, ${d.signedIn} signed in)`;
          return (
            <div key={d.day} role="listitem" aria-label={label} title={label} className="flex h-full min-w-0 flex-1 flex-col justify-end">
              <div className="w-full rounded-t-sm bg-brand" style={{ height: `${(d.signedIn / max) * 100}%` }} />
              <div className={cn("w-full bg-border-strong", d.signedIn === 0 && "rounded-t-sm")} style={{ height: `${(d.guests / max) * 100}%` }} />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[0.6875rem] text-muted">
        <span>{new Date(`${daily[0]!.day}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
        <span>{new Date(`${daily.at(-1)!.day}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
      </div>
    </figure>
  );
}
