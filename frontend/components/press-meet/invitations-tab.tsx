"use client";

import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, CalendarPlus, IndianRupee, Plus, Presentation } from "lucide-react";
import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SpeedLinesLoader } from "@/components/ui/speed-lines-loader";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { PressMeetSummary } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { MeetRow } from "./meet-row";
import { MeetSections } from "./parts";
import { usePressMeetLive } from "./use-press-meet-live";

type Section = "invited" | "attended" | "organizing";

const SECTIONS: Array<{ value: Section; label: ReactNode }> = [
  { value: "invited", label: "To attend" },
  { value: "attended", label: "Attended" },
  {
    value: "organizing",
    label: (
      <>
        Scheduled<span className="max-sm:hidden"> by you</span>
      </>
    ),
  },
];

const upcoming = (meet: PressMeetSummary) => meet.status === "scheduled" || meet.status === "live";

/**
 * The reporter's "Press meet" tab on their own profile (owner 2026-10-01): a nudge to set an advertorial price if they haven't
 * (organizers can only invite reporters with one), then three sections (owner 2026-10-02) — "To attend": the press
 * meets other organizers invited them to that haven't happened yet (answer, join); "Attended": the ones they joined,
 * once over (send the story in, get paid) — with the ones they missed or that were cancelled under them; and
 * "Scheduled by you": the ones they organize.
 */
export function PressMeetInvitationsTab() {
  usePressMeetLive();
  const [section, setSection] = useState<Section>("invited");
  const invited = useQuery({ queryKey: qk.pressMeets("invited"), queryFn: ({ signal }) => api.pressMeets.list("invited", signal) });
  const organizing = useQuery({ queryKey: qk.pressMeets("organizing"), queryFn: ({ signal }) => api.pressMeets.list("organizing", signal) });
  const list = section === "organizing" ? organizing : invited;
  const invitedItems = invited.data?.items ?? [];
  const toAttend = invitedItems.filter(upcoming);
  // Joined the room (myInvite.joinedAt, set on entering) and it's over — in the order they happened, the earliest
  // first (owner 2026-10-05: 11 AM, then 12 PM, then 4 PM).
  const byTime = (a: { startsAt: string }, b: { startsAt: string }) => Date.parse(a.startsAt) - Date.parse(b.startsAt);
  const attended = invitedItems.filter((m) => !upcoming(m) && m.status !== "cancelled" && Boolean(m.myInvite?.joinedAt)).sort(byTime);
  const missed = invitedItems.filter((m) => !upcoming(m) && !attended.includes(m)).sort(byTime);
  const counts: Record<Section, number | undefined> = {
    invited: invited.data ? toAttend.length : undefined,
    attended: invited.data ? attended.length : undefined,
    organizing: organizing.data?.items.length,
  };
  const account = useQuery({ queryKey: qk.account, queryFn: ({ signal }) => api.account(signal), staleTime: 60_000 });
  const price = account.data?.pressMeetPrice ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* Only the nudge to set a price (owner 2026-10-12: once set, it's not shown here — it's in Settings). */}
      {account.data && price === null && (
        <div className="flex flex-col gap-3 rounded-2xl border border-tint-border bg-tint px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2.5 text-sm text-ink-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-brand">
              <IndianRupee aria-hidden className="size-4" />
            </span>
            <span>
              <strong className="font-bold text-ink">Set your advertorial price</strong> so organizers can invite you to cover their press meets.
            </span>
          </p>
          <Button href="/settings?section=press-meet" size="sm" className="self-start sm:self-auto">
            Set price
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Press meets" className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1 max-sm:w-full sm:min-w-[30rem]">
          {SECTIONS.map(({ value, label }) => {
            const active = value === section;
            const count = counts[value];
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSection(value)}
                className={cn(
                  "relative flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-bold transition-colors",
                  active ? "text-brand-contrast" : "text-ink-2 hover:text-ink",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="pm-profile-section"
                    aria-hidden
                    className="absolute inset-0 rounded-xl bg-brand shadow-[0_1px_2px_rgb(227_6_19/0.3)]"
                    transition={{ type: "spring", stiffness: 520, damping: 40 }}
                  />
                )}
                <span className="relative">{label}</span>
                {count !== undefined && count > 0 && (
                  <span
                    className={cn(
                      "relative min-w-5 rounded-full px-1.5 text-[0.6875rem] tabular-nums",
                      active ? "bg-white/20 text-white" : "bg-tint-2 text-brand",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {section === "organizing" && (
          <Button href="/press-meet/new" size="sm" leftIcon={<Plus aria-hidden strokeWidth={2.75} />} className="max-sm:w-full">
            Schedule
          </Button>
        )}
      </div>
      {list.isPending ? (
        <div className="flex justify-center py-10">
          <SpeedLinesLoader size="sm" label="Loading your press meets" />
        </div>
      ) : list.isError ? (
        <p className="card px-5 py-8 text-center text-sm text-muted">Couldn&rsquo;t load your press meets. {errorMessage(list.error)}</p>
      ) : section === "attended" && attended.length > 0 ? (
        <section aria-labelledby="pm-attended" className="flex flex-col gap-3">
          <h2 id="pm-attended" className="kicker text-muted">
            Attended · {attended.length}
          </h2>
          <ul className="flex flex-col gap-3">
            {attended.map((meet) => (
              <MeetRow key={meet.id} meet={meet} />
            ))}
          </ul>
        </section>
      ) : (
        <MeetSections
          key={section}
          renderItem={(meet) => <MeetRow key={meet.id} meet={meet} />}
          items={section === "invited" ? toAttend : section === "attended" ? attended : list.data.items}
          empty={
            section === "invited" ? (
              <EmptyState
                icon={<Presentation aria-hidden />}
                kicker="Press meet"
                title="Nothing coming up"
                description="When an organizer invites you to cover their press meet, it shows up here and in your notifications. Ones you've joined move to Attended."
              />
            ) : section === "attended" ? (
              <EmptyState
                icon={<BadgeCheck aria-hidden />}
                kicker="Press meet"
                title="None attended yet"
                description="Press meets you join show up here once they're over — send your story in and get paid from here."
              />
            ) : (
              <EmptyState
                icon={<CalendarPlus aria-hidden />}
                kicker="Press meet"
                title="You haven't scheduled one"
                description="Book a time, invite Verified reporters and hold it live on WebNEWS or Google Meet."
              />
            )
          }
        />
      )}
      {section === "attended" && invited.data && missed.length > 0 && (
        <section aria-labelledby="pm-missed" className="flex flex-col gap-3">
          <h2 id="pm-missed" className="kicker text-muted">
            Missed or cancelled · {missed.length}
          </h2>
          <ul className="flex flex-col gap-3 opacity-80">
            {missed.map((meet) => (
              <MeetRow key={meet.id} meet={meet} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
