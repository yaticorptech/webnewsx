"use client";

import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useRealtimeEvent } from "@/components/providers/realtime-provider";
import { Activity, MousePointerClick, RotateCcw, Search, Smartphone, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Split } from "@/components/insights/story-insights";
import { EmptyNote, Panel, PersonLine, SimpleTable, StatTile, dateText, useShowMore } from "@/components/memberships/dashboard-parts";
import { LineChart } from "@/components/newsroom/charts";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { CATEGORY_LABELS, type ActionCount, type BehaviourOverview, type Category, type PersonBehaviour } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./section-header";

/*
 * Desk → Behaviour (owner 2026-10-16: "save every button's data with the profile; show the admins how many used
 * auto-scroll and all"): site-wide activity, feature usage, the most-tapped buttons and pages, the most active people,
 * and — per person — everything they did. The data is kept for behaviour-based features later.
 */

const RANGES = [1, 7, 30, 90] as const;
const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
const TIME = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const dayLabel = (date: string) => DAY.format(new Date(`${date}T00:00:00`));
const duration = (seconds: number | null) =>
  seconds === null ? "—" : seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
export const behaviourPersonHref = (username: string) => `/admin/behaviour/${encodeURIComponent(username)}`;

export function BehaviourView() {
  const router = useRouter();
  const [days, setDays] = useState<(typeof RANGES)[number]>(7);
  const [who, setWho] = useState("");
  const query = useQuery({
    queryKey: ["admin", "behaviour", days],
    queryFn: ({ signal }) => api.admin.behaviour(days, signal),
    // Switching the period keeps the numbers on screen until the new ones arrive (no flash).
    placeholderData: keepPreviousData,
    // A safety net if the live connection drops.
    refetchInterval: 60_000,
  });
  const updatedAt = useLiveBehaviour(query.dataUpdatedAt, (queryClient) => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "behaviour", days] });
  });

  const find = (event: FormEvent) => {
    event.preventDefault();
    const username = who.trim().replace(/^@/, "");
    if (username) router.push(behaviourPersonHref(username));
  };

  return (
    <div className="animate-fade-up flex flex-col gap-8">
      <SectionHeader
        title="Analytics"
        description={
          <>
            Every tap on WebNEWS, with who made it: which features people use, the buttons and pages they use most, and each person&rsquo;s
            activity. <LiveTag updatedAt={updatedAt} />
          </>
        }
        actions={
          <div role="tablist" aria-label="Period" className="flex gap-1 rounded-lg bg-surface-2 p-0.5">
            {RANGES.map((range) => (
              <button
                key={range}
                type="button"
                role="tab"
                aria-selected={days === range}
                onClick={() => setDays(range)}
                className={cn("rounded-md px-3 py-1.5 text-xs font-medium", days === range ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}
              >
                {range === 1 ? "Today" : `${range} days`}
              </button>
            ))}
          </div>
        }
      />

      <PersonSearch value={who} onChange={setWho} onSubmit={find} onPick={(username) => router.push(behaviourPersonHref(username))} />

      {query.isPending ? (
        <div aria-hidden className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="skeleton h-24 rounded-2xl" />
            ))}
          </div>
          <div className="skeleton h-64 rounded-2xl" />
        </div>
      ) : query.isError ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-8 text-center">
          <p className="text-sm text-muted">Couldn&rsquo;t load behaviour. {errorMessage(query.error)}</p>
          <Button variant="outline" size="sm" leftIcon={<RotateCcw aria-hidden />} onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <Overview data={query.data} />
      )}
    </div>
  );
}

/**
 * Find a person (owner 2026-10-16: "it should suggest as I type"): name, username or email; matches drop down under the
 * field (↑ ↓ and Enter, or a click), Enter with no pick opens the typed username.
 */
function PersonSearch({
  value,
  onChange,
  onSubmit,
  onPick,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onPick: (username: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const q = useDebounced(value.trim().replace(/^@/, ""), 200);
  const results = useQuery({
    queryKey: ["admin", "behaviour", "find", q],
    queryFn: ({ signal }) => api.admin.users({ q, limit: 8 }, signal),
    enabled: q.length >= 2,
    staleTime: 30_000,
  });
  const people = (q.length >= 2 ? (results.data?.items ?? []) : []).filter((p) => p.username);
  const open = focused && q.length >= 2;
  return (
    <form
      onSubmit={(event) => {
        const picked = people[active];
        if (picked?.username) {
          event.preventDefault();
          onPick(picked.username);
          return;
        }
        onSubmit(event);
      }}
      className="relative flex max-w-xl gap-2"
    >
      <div className="relative min-w-0 flex-1">
        <Input
          prefix={<Search aria-hidden className="size-4 text-muted" />}
          placeholder="Search a person by name, username or email"
          value={value}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          onChange={(event) => {
            onChange(event.target.value);
            setActive(-1);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(event) => {
            if (!open || people.length === 0) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const step = event.key === "ArrowDown" ? 1 : -1;
              setActive((current) => (current + step + people.length) % people.length);
            } else if (event.key === "Escape") setFocused(false);
          }}
        />
        {open && (
          <ul role="listbox" className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-lg">
            {results.isFetching && people.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-muted">Searching…</li>
            ) : people.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-muted">No one matches “{q}”.</li>
            ) : (
              people.map((p, index) => (
                <li key={p.id} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onPick(p.username!)}
                    onMouseEnter={() => setActive(index)}
                    className={cn("flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left", index === active ? "bg-surface-2" : "hover:bg-surface-2")}
                  >
                    <Avatar src={p.image} name={p.name} size={32} decorative />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{p.name}</span>
                      <span className="block truncate text-xs text-muted">
                        @{p.username} · {p.email}
                      </span>
                    </span>
                    <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[0.6875rem] font-medium capitalize text-muted">{p.role}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      <Button type="submit" variant="outline">
        See activity
      </Button>
    </form>
  );
}

/**
 * Live Analytics (owner 2026-10-16: "updated live, not by refreshing"): the server says when new activity is recorded
 * (`behaviour.changed`, Desk only) and `onChange` refetches in place — the numbers change on screen, nothing reloads.
 * Returns when the data last updated, for the Live tag.
 */
function useLiveBehaviour(dataUpdatedAt: number, onChange: (queryClient: QueryClient, userIds: string[]) => void): number {
  const queryClient = useQueryClient();
  useRealtimeEvent("behaviour.changed", ({ userIds }) => onChange(queryClient, userIds));
  return dataUpdatedAt;
}

const CLOCK = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" });

/** "● Live · updated 3:04:12 pm" — pulses briefly each time new numbers arrive. */
function LiveTag({ updatedAt }: { updatedAt: number }) {
  return (
    <span className="ml-1 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#effaf3] px-2 py-0.5 align-middle text-xs font-medium text-[#1f7a3d]">
      <span key={updatedAt} className="relative flex size-1.5">
        <span aria-hidden className="absolute inline-flex size-full animate-ping rounded-full bg-[#22a35a] opacity-70 [animation-iteration-count:2]" />
        <span className="relative inline-flex size-1.5 rounded-full bg-[#22a35a]" />
      </span>
      Live{updatedAt > 0 && <span className="text-[#1f7a3d]/70"> · updated {CLOCK.format(new Date(updatedAt))}</span>}
    </span>
  );
}

/** `value`, once it has stopped changing for `ms`. */
function useDebounced(value: string, ms: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

function Overview({ data }: { data: BehaviourOverview }) {
  const { totals } = data;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Taps & actions" value={formatNumber(totals.events)} icon={<MousePointerClick aria-hidden />} tone="brand" />
        <StatTile label="Active people" value={formatNumber(totals.people)} hint={`${formatNumber(totals.signedIn)} signed in · ${formatNumber(totals.visitors)} visitors`} icon={<UsersRound aria-hidden />} />
        <StatTile label="On the app" value={formatNumber(totals.app)} hint="People using the WebNEWS app" icon={<Smartphone aria-hidden />} />
        <StatTile label="On the website" value={formatNumber(totals.web)} icon={<Activity aria-hidden />} />
      </div>

      <Panel title="Activity per day">
        <LineChart
          points={data.daily.map((d) => ({ label: dayLabel(d.date), value: d.events }))}
          rowsFor={(i) => [
            { label: "Taps & actions", value: formatNumber(data.daily[i]!.events), strong: true },
            { label: "Active people", value: formatNumber(data.daily[i]!.people) },
          ]}
          ariaLabel="Taps and actions per day"
          announce={(i) => `${dayLabel(data.daily[i]!.date)}: ${formatNumber(data.daily[i]!.events)} actions by ${formatNumber(data.daily[i]!.people)} people`}
          animationKey={String(data.days)}
          emptyMessage="No activity recorded yet"
        />
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Feature usage">
          <FeatureTable features={data.features} />
        </Panel>
        <Panel title="Most-tapped buttons">
          <ActionTable actions={data.topActions} />
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Most active people">
          {data.topPeople.length === 0 ? <EmptyNote>No signed-in activity yet.</EmptyNote> : <PeopleList people={data.topPeople} />}
        </Panel>
        <Panel title="Pages used most">
          {data.topPages.length === 0 ? (
            <EmptyNote>No activity yet.</EmptyNote>
          ) : (
            <ShortSplit rows={data.topPages.map((p) => ({ label: p.path === "/" ? "Home" : p.path, value: p.count }))} />
          )}
        </Panel>
      </div>
    </>
  );
}

/** The features table: the first rows, then "View all". */
function FeatureTable({ features }: { features: BehaviourOverview["features"] }) {
  const { shown, more } = useShowMore(features);
  return (
    <>
      <SimpleTable head={["Feature", "Times", "People"]}>
        {shown.map((f) => (
          <tr key={f.name}>
            <td className="px-4 py-2.5 font-semibold text-ink">{f.label}</td>
            <td className="px-4 py-2.5 font-bold tabular-nums text-ink">{formatNumber(f.count)}</td>
            <td className="px-4 py-2.5 tabular-nums text-muted">{formatNumber(f.people)}</td>
          </tr>
        ))}
      </SimpleTable>
      {more}
    </>
  );
}

function PeopleList({ people }: { people: BehaviourOverview["topPeople"] }) {
  const { shown, more } = useShowMore(people);
  return (
    <>
      <ul className="flex flex-col divide-y divide-border">
        {shown.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <PersonLine person={p} href={p.username ? behaviourPersonHref(p.username) : null} size={32} />
            </div>
            <span className="text-right text-xs text-muted">
              <strong className="block text-sm font-extrabold tabular-nums text-ink">{formatNumber(p.events)}</strong>
              last {TIME.format(new Date(p.lastAt))}
            </span>
          </li>
        ))}
      </ul>
      {more}
    </>
  );
}

/** Rows with share bars, the first few then "View all". */
function ShortSplit({ rows }: { rows: { label: string; value: number }[] }) {
  const { shown, more } = useShowMore(rows);
  return (
    <>
      <Split rows={[...shown]} />
      {more}
    </>
  );
}

function ActionTable({ actions, people = true }: { actions: ActionCount[]; people?: boolean }) {
  const { shown, more } = useShowMore(actions);
  if (actions.length === 0) return <EmptyNote>No taps recorded yet.</EmptyNote>;
  const top = Math.max(...actions.map((a) => a.count), 1);
  return (
    <>
    <SimpleTable head={people ? ["Button", "Taps", "People"] : ["Button", "Taps"]}>
      {shown.map((action) => (
        <tr key={action.label}>
          <td className="px-4 py-2.5">
            <span className="block font-semibold text-ink">{action.label}</span>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2">
              <span className="block h-full rounded-full bg-brand/70" style={{ width: `${(action.count / top) * 100}%` }} />
            </span>
          </td>
          <td className="whitespace-nowrap px-4 py-2.5 font-bold tabular-nums text-ink">{formatNumber(action.count)}</td>
          {people && <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted">{formatNumber(action.people)}</td>}
        </tr>
      ))}
    </SimpleTable>
    {more}
    </>
  );
}

/* ─────────────── One person ─────────────── */

export function PersonBehaviourView({ username }: { username: string }) {
  const query = useQuery({
    queryKey: ["admin", "behaviour", "person", username],
    queryFn: ({ signal }) => api.admin.personBehaviour(username, signal),
    refetchInterval: 60_000,
  });
  const personId = query.data?.person.id ?? null;
  const updatedAt = useLiveBehaviour(query.dataUpdatedAt, (queryClient, userIds) => {
    // Only when this person did something.
    if (personId && userIds.includes(personId)) void queryClient.invalidateQueries({ queryKey: ["admin", "behaviour", "person", username] });
  });
  return (
    <div className="animate-fade-up flex flex-col gap-8">
      <SectionHeader
        kicker="Behaviour"
        title={query.data ? query.data.person.name : `@${username}`}
        description={
          <>
            Everything this person has done on WebNEWS while signed in, latest first. <LiveTag updatedAt={updatedAt} />
          </>
        }
        actions={
          <Button href="/admin/behaviour" variant="outline" size="sm">
            ← All behaviour
          </Button>
        }
      />
      {query.isPending ? (
        <div aria-hidden className="skeleton h-64 rounded-2xl" />
      ) : query.isError ? (
        <p className="card px-6 py-8 text-center text-sm text-muted">{errorMessage(query.error)}</p>
      ) : (
        <Person data={query.data} />
      )}
    </div>
  );
}

function Person({ data }: { data: PersonBehaviour }) {
  const { totals } = data;
  const usedFeatures = data.features.filter((f) => f.count > 0);
  return (
    <>
      <section className="card flex flex-wrap items-center gap-4 p-4">
        <div className="min-w-0 flex-1">
          <PersonLine person={data.person} size={44} />
        </div>
        <p className="text-sm text-muted">
          {data.person.email ?? "No email"} · joined {dateText(data.person.joinedAt)}
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Taps & actions" value={formatNumber(totals.events)} tone="brand" />
        <StatTile label="Active days" value={formatNumber(totals.days)} />
        <StatTile label="Stories read" value={formatNumber(totals.reads)} />
        <StatTile label="Avg. read time" value={duration(totals.avgReadSeconds)} />
        <StatTile label="App · Website" value={`${formatNumber(totals.app)} · ${formatNumber(totals.web)}`} hint="Actions on each" />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Features used">
          {usedFeatures.length === 0 ? (
            <EmptyNote>None yet.</EmptyNote>
          ) : (
            <ShortSplit rows={usedFeatures.map((f) => ({ label: f.label, value: f.count }))} />
          )}
        </Panel>
        <Panel title="Buttons they tap most">
          <ActionTable actions={data.topActions} people={false} />
        </Panel>
        <Panel title="Sections they read">
          {data.categories.length === 0 ? (
            <EmptyNote>No reads yet.</EmptyNote>
          ) : (
            <ShortSplit rows={data.categories.map((c) => ({ label: CATEGORY_LABELS[c.category as Category] ?? c.category, value: c.reads }))} />
          )}
        </Panel>
      </div>

      <Panel title={`Timeline (latest ${data.timeline.length})`}>
        {data.timeline.length === 0 ? <EmptyNote>No activity recorded yet.</EmptyNote> : <Timeline events={data.timeline} />}
      </Panel>
      <p className="text-xs text-muted">
        <Link href="/admin/behaviour" className="font-semibold hover:text-ink">
          ← Back to all behaviour
        </Link>
      </p>
    </>
  );
}

/** The person's latest activity: the first 10, then "View all". */
function Timeline({ events }: { events: PersonBehaviour["timeline"] }) {
  const { shown, more } = useShowMore(events, 10);
  return (
    <>
      <SimpleTable head={["When", "What", "Story", "Where"]}>
        {shown.map((e) => (
          <tr key={e.id}>
            <td className="whitespace-nowrap px-4 py-2 text-xs text-muted">{TIME.format(new Date(e.at))}</td>
            <td className="px-4 py-2">
              <span className="font-semibold text-ink">{e.name === "click" ? (e.label ?? "Tap") : (e.label ?? e.name.replace(/_/g, " "))}</span>
              {e.name !== "click" && <span className="ml-1.5 rounded bg-tint px-1.5 py-0.5 text-[0.625rem] font-bold uppercase text-brand">{e.name.replace(/_/g, " ")}</span>}
              {e.props?.seconds !== undefined && <span className="ml-1.5 text-xs text-muted">{duration(Number(e.props.seconds))}</span>}
            </td>
            <td className="max-w-64 truncate px-4 py-2 text-xs text-ink-2">{e.story?.title ?? "—"}</td>
            <td className="whitespace-nowrap px-4 py-2 text-xs text-muted">
              {e.path === "/" ? "Home" : e.path.length > 28 ? `${e.path.slice(0, 28)}…` : e.path} · {e.platform === "app" ? "App" : "Web"}
            </td>
          </tr>
        ))}
      </SimpleTable>
      {more}
    </>
  );
}
