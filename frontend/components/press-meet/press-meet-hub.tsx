"use client";

import { useQuery } from "@tanstack/react-query";
import { Mail, Mic, Play, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { SpeedLines } from "@/components/brand/speed-lines";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { MeetRow } from "./meet-row";
import { usePressMeetLive } from "./use-press-meet-live";

/**
 * /press-meet (owner 2026-10-01, from the profile's "Press meet" button; redesigned 2026-10-10 from the owner's
 * reference): a centered landing — picture, heading, Invitations (reporters) and Schedule — then other organizers' public press meets as rows. Your own
 * press meets are on the profile's press meet tab (no Upcoming / Past tabs here, owner 2026-10-10). Full screen width (`data-grid-page`).
 */
export function PressMeetHub({ username, reporter }: { username: string; reporter: boolean }) {
  usePressMeetLive();
  // Public press meets anyone can join (owner 2026-10-07): coming up and live, other organizers' ones.
  const publicMeets = useQuery({
    queryKey: qk.pressMeets("public"),
    queryFn: ({ signal }) => api.pressMeets.list("public", signal),
    refetchInterval: 60_000,
  });
  const open = (publicMeets.data?.items ?? []).filter((meet) => meet.role !== "organizer");


  return (
    <div data-grid-page="" className="flex flex-col gap-5">
      {/* A centered landing (owner 2026-10-10): the picture, the title, the line and the two buttons, in the middle of the
          screen; the back arrow stays at the top left. */}
      <header className="flex min-h-[calc(100dvh-var(--nav-h)-9rem)] flex-col">
        <div data-own-back="" className="flex items-center gap-3">
          <BackButton fallback="/" />
          <p className="kicker flex items-center gap-2 text-brand">
            <SpeedLines />
            Press meet
          </p>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <MeetArt className="relative scale-90 sm:scale-100" />
          <h1 className="mt-4 font-wide text-[1.875rem] leading-[1.04] font-black tracking-tight text-ink sm:text-[2.375rem]">
            Your press meets
          </h1>
          <p className="mt-2 max-w-md text-[0.9375rem] leading-relaxed text-muted">
            Book a time on the calendar, invite Verified reporters and hold it live — on camera in WebNEWS Live or on Google
            Meet.
          </p>
          <div className="mt-6 flex w-full max-w-sm gap-2 sm:w-auto sm:max-w-none">
            {reporter && (
              <Button
                href={`/${username}?tab=press-meet`}
                variant="outline"
                leftIcon={<Mail aria-hidden />}
                className="border-tint-border bg-tint text-brand hover:border-brand hover:bg-tint-2 hover:text-brand max-sm:flex-1"
              >
                Invitations
              </Button>
            )}
            <Button href="/press-meet/new" leftIcon={<Plus aria-hidden strokeWidth={2.75} />} className="max-sm:flex-1">
              Schedule
            </Button>
          </div>
        </div>
      </header>

      {open.length > 0 && (
        <section aria-labelledby="pm-public" className="flex flex-col gap-3">
          <div>
            <h2 id="pm-public" className="font-wide text-lg font-black tracking-tight text-ink">
              Public press meets
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              {reporter ? "Any reporter can join these." : "Reporters with a Press Pass can join these."}
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {open.map((meet) => (
              <MeetRow key={meet.id} meet={meet} />
            ))}
          </ul>
        </section>
      )}

    </div>
  );
}

/** The heading's picture (owner's reference): a calendar, a red play tile, a microphone and a note on a soft pink blob. */
function MeetArt({ className }: { className?: string }): ReactNode {
  return (
    <div aria-hidden className={cn("h-40 w-72", className)}>
      <span className="absolute inset-x-6 inset-y-0 rounded-[48%_52%_58%_42%/55%_48%_52%_45%] bg-[radial-gradient(circle_at_40%_40%,var(--tint-3),var(--tint)_70%)]" />
      {/* Calendar */}
      <span className="absolute left-[5.5rem] top-3 flex h-28 w-32 flex-col overflow-hidden rounded-2xl bg-white shadow-pop">
        <span className="relative h-7 bg-brand">
          <span className="absolute -top-1.5 left-6 h-4 w-1.5 rounded-full bg-[#b80010]" />
          <span className="absolute -top-1.5 left-14 h-4 w-1.5 rounded-full bg-[#b80010]" />
          <span className="absolute -top-1.5 right-6 h-4 w-1.5 rounded-full bg-[#b80010]" />
        </span>
        <span className="grid flex-1 grid-cols-4 gap-1.5 p-2.5">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className={cn("rounded-[0.2rem]", i === 6 ? "bg-brand/80" : "bg-tint-3")} />
          ))}
        </span>
      </span>
      {/* Play tile */}
      <span className="absolute bottom-5 left-12 flex size-14 -rotate-6 items-center justify-center rounded-2xl bg-brand shadow-[0_10px_24px_-10px_rgb(227_6_19/0.9)]">
        <Play className="ml-0.5 size-6 fill-white text-white" />
      </span>
      {/* Microphone */}
      <span className="absolute bottom-3 left-[12.5rem] flex size-12 items-center justify-center rounded-full bg-white shadow-card">
        <Mic className="size-6 text-ink" strokeWidth={2.25} />
      </span>
      {/* Note */}
      <span className="absolute right-4 top-12 flex h-12 w-20 rotate-6 flex-col justify-center gap-1.5 rounded-lg bg-white px-2.5 shadow-card">
        <span className="h-1.5 w-10 rounded-full bg-brand/70" />
        <span className="h-1.5 w-14 rounded-full bg-tint-3" />
      </span>
    </div>
  );
}
