"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Briefcase, Check, Languages, Map as MapIcon, MapPin, Search, UsersRound, X } from "lucide-react";
import { useState } from "react";
import { UserHandle } from "@/components/brand/user-handle";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import { useDebounced } from "@/components/messages/people-picker";
import { CityInput } from "@/components/presspass/city-input";
import { experienceLabel, languageLabels, regionLabel, reporterTypeLabel } from "@/components/presspass/press-format";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { compactNumber } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import {
  INDIAN_REGIONS,
  KARNATAKA_DISTRICTS,
  PRESS_LANGUAGE_LABELS,
  PRESS_LANGUAGE_VALUES,
  PRESS_MEET,
  regionName,
  type PlaceSuggestion,
  type PressMeetReporter,
} from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { inr } from "../format";

const FIELD =
  "flex h-11 min-w-0 items-center gap-2 rounded-xl border border-border-strong bg-surface px-3.5 transition-[border-color,box-shadow] focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--tint-3)]";

/**
 * Step 2 — who (owner 2026-10-01): every Verified reporter with their basic details and the advertorial price they set
 * in Settings; pick several (up to PRESS_MEET.reportersMax). Reporters without a price yet are listed but can't be
 * picked. The event's location first (owner 2026-10-05, e.g. Mangaluru Dasara): three boxes, State · District · City —
 * typing a city suggests every city, town and village starting with those letters ("ba" → Bantwal, Bajpe …) and
 * picking one fills in its state and district. Only reporters based there are listed (their Press Pass state, district
 * and — once a place is picked, not while typing — city). The choice survives searching and filtering.
 */
export function ReporterPicker({
  selected,
  onToggle,
  invited,
  max = PRESS_MEET.reportersMax,
}: {
  selected: ReadonlyMap<string, PressMeetReporter>;
  onToggle: (reporter: PressMeetReporter) => void;
  /** Already invited (inviting more after booking): shown as "Invited", not pickable. */
  invited?: ReadonlySet<string>;
  /** How many can still be picked. */
  max?: number;
}) {
  const [text, setText] = useState("");
  const [language, setLanguage] = useState("");
  const [state, setState] = useState("");
  const [districtText, setDistrictText] = useState("");
  const [cityText, setCityText] = useState("");
  // The city filters only once a place is picked from the suggestions (owner 2026-10-05).
  const [picked, setPicked] = useState<PlaceSuggestion | null>(null);
  const q = useDebounced(text.trim(), 300);
  const district = useDebounced(districtText.trim(), 300);
  const city = picked?.name ?? "";
  // Karnataka has a fixed district list (a select; also offered for "Anywhere in India" — picking one sets Karnataka);
  // elsewhere the district is free text, as on the Press Pass.
  const districts = state === "KA" || state === "" ? KARNATAKA_DISTRICTS : null;
  const place = [city, city ? null : district, regionName(state)].filter(Boolean).join(", ");
  const located = Boolean(state || city);
  const filtered = Boolean(q || language || located);

  const list = useInfiniteQuery({
    queryKey: qk.pressMeetReporters(q, language, state, district, city),
    queryFn: ({ pageParam, signal }) => api.pressMeets.reporters({ q, language, state, district, city, cursor: pageParam }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  const toggle = (reporter: PressMeetReporter) => {
    if (!selected.has(reporter.id) && selected.size >= max) {
      toast.error(
        max < PRESS_MEET.reportersMax ? `You can invite ${max} more ${max === 1 ? "reporter" : "reporters"}` : `You can invite up to ${max} reporters`,
        { description: `A press meet has at most ${PRESS_MEET.reportersMax} reporters. Remove someone to add another.` },
      );
      return;
    }
    onToggle(reporter);
  };

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold text-ink">
          Event location <span className="font-normal text-muted">— see reporters based there</span>
        </legend>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <label className={cn(FIELD, "sm:w-56 sm:shrink-0")}>
            <MapPin aria-hidden className="size-4.5 shrink-0 text-muted" />
            <select
              value={state}
              onChange={(event) => {
                setState(event.target.value);
                setDistrictText("");
                setCityText("");
                setPicked(null);
              }}
              aria-label="State"
              className="min-w-0 flex-1 bg-transparent text-[0.9375rem] font-semibold text-ink outline-none"
            >
              <option value="">Anywhere in India</option>
              {INDIAN_REGIONS.map((region) => (
                <option key={region.code} value={region.code}>
                  {region.name}
                </option>
              ))}
            </select>
          </label>
          <label className={cn(FIELD, "flex-1")}>
            <MapIcon aria-hidden className="size-4.5 shrink-0 text-muted" />
            {districts ? (
              <select
                value={districtText}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next && !state) setState("KA");
                  setDistrictText(next);
                  // A place in another district no longer fits.
                  if (next && picked && picked.district !== next) {
                    setPicked(null);
                    setCityText("");
                  }
                }}
                aria-label="District"
                className="min-w-0 flex-1 bg-transparent text-[0.9375rem] font-semibold text-ink outline-none"
              >
                <option value="">{state ? "All districts" : "Any district"}</option>
                {districts.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input
                  value={districtText}
                  onChange={(event) => setDistrictText(event.target.value)}
                  placeholder="District (optional)"
                  aria-label="District"
                  className="min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink outline-none placeholder:text-muted"
                />
                {districtText && (
                  <button type="button" onClick={() => setDistrictText("")} aria-label="Clear district" className="text-muted hover:text-ink">
                    <X aria-hidden className="size-4" />
                  </button>
                )}
              </>
            )}
          </label>
          {/* Places of the chosen state (anywhere in India: all of them); picking one sets its state and district. */}
          <CityInput
            value={cityText}
            onChange={(next) => {
              setCityText(next);
              if (picked && next !== picked.name) setPicked(null);
            }}
            onPick={(place) => {
              setPicked(place);
              setState(place.state);
              setDistrictText(place.district);
            }}
            state={state}
            district={state === "KA" ? districtText : ""}
            selected={picked !== null}
            icon
            placeholder="City or town, e.g. Mangaluru"
            className="flex-1"
          />
        </div>
      </fieldset>

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <label className={cn(FIELD, "flex-1 gap-2.5")}>
          <Search aria-hidden className="size-4.5 shrink-0 text-muted" />
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Search by name, @username, district or outlet"
            aria-label="Search reporters"
            className="min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink outline-none placeholder:text-muted"
          />
          {text && (
            <button type="button" onClick={() => setText("")} aria-label="Clear search" className="text-muted hover:text-ink">
              <X aria-hidden className="size-4" />
            </button>
          )}
        </label>
        <label className={cn(FIELD, "sm:w-52")}>
          <Languages aria-hidden className="size-4.5 shrink-0 text-muted" />
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            aria-label="Language"
            className="min-w-0 flex-1 bg-transparent text-[0.9375rem] font-semibold text-ink outline-none"
          >
            <option value="">Any language</option>
            {PRESS_LANGUAGE_VALUES.map((value) => (
              <option key={value} value={value}>
                {PRESS_LANGUAGE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selected.size > 0 && (
        <ul aria-label="Chosen reporters" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {[...selected.values()].map((reporter) => (
            <li key={reporter.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onToggle(reporter)}
                className="flex h-9 items-center gap-2 rounded-full bg-tint pl-1 pr-3 text-sm font-semibold text-ink ring-1 ring-inset ring-tint-border transition-colors hover:ring-brand"
                aria-label={`Remove ${reporter.name}`}
              >
                <Avatar src={reporter.image} name={reporter.name} size={28} decorative />
                <span className="max-w-32 truncate">{reporter.name}</span>
                <X aria-hidden className="size-3.5 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {list.isPending ? (
        <ul aria-hidden className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="card h-36 animate-pulse bg-skeleton/40" />
          ))}
        </ul>
      ) : list.isError ? (
        <p className="card px-5 py-8 text-center text-sm text-muted">Couldn&rsquo;t load reporters. {errorMessage(list.error)}</p>
      ) : items.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<UsersRound aria-hidden />}
          title={located && !q && !language ? `No reporters in ${place} yet` : filtered ? "No reporters match" : "No Verified reporters yet"}
          description={
            located
              ? "Try a nearby city, the whole district or Anywhere in India."
              : filtered
                ? "Try another name, district or language."
                : "Verified reporters will show up here."
          }
        />
      ) : (
        <>
          <ul className="grid gap-3 md:grid-cols-2">
            {items.map((reporter) => (
              <ReporterCard
                key={reporter.id}
                reporter={reporter}
                selected={selected.has(reporter.id)}
                invited={invited?.has(reporter.id) ?? false}
                onToggle={() => toggle(reporter)}
              />
            ))}
          </ul>
          {list.hasNextPage && (
            <Button variant="outline" onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage} className="self-center">
              Show more reporters
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function ReporterCard({
  reporter,
  selected,
  invited,
  onToggle,
}: {
  reporter: PressMeetReporter;
  selected: boolean;
  invited: boolean;
  onToggle: () => void;
}) {
  const priced = reporter.price !== null;
  const pickable = priced && !invited;
  const region = regionLabel(reporter);
  const languages = languageLabels(reporter.languages);
  const work = [reporterTypeLabel(reporter), experienceLabel(reporter.experience)].filter(Boolean).join(" · ");
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        disabled={!pickable}
        aria-pressed={selected || invited}
        className={cn(
          "card relative flex h-full w-full flex-col gap-3 p-4 text-left transition-[border-color,box-shadow,background-color]",
          selected
            ? "border-brand bg-tint/60 ring-1 ring-brand"
            : invited
              ? "cursor-default border-tint-border bg-tint/40 opacity-75"
              : priced
                ? "hover:border-tint-border hover:shadow-pop"
                : "cursor-not-allowed opacity-60",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute right-3 top-3 flex size-6 items-center justify-center rounded-full border-2 transition-colors",
            selected || invited ? "border-brand bg-brand text-brand-contrast" : "border-border-strong bg-surface",
          )}
        >
          {(selected || invited) && <Check className="size-3.5" strokeWidth={3.5} />}
        </span>
        <span className="flex min-w-0 items-center gap-3 pr-8">
          <Avatar src={reporter.image} name={reporter.name} size={52} decorative />
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[0.9375rem] font-bold text-ink">{reporter.name}</span>
              <VerifiedBadge size={16} tooltip={false} focusable={false} animate={false} />
            </span>
            <UserHandle username={reporter.username} truncate className="block text-sm font-semibold text-brand" />
            <span className="mt-0.5 block text-xs text-muted">
              {compactNumber(reporter.followers)} followers · {compactNumber(reporter.articles)} stories
            </span>
          </span>
        </span>
        <span className="flex flex-col gap-1.5 text-xs text-ink-2 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted">
          {region && (
            <span className="flex min-w-0 items-center gap-2">
              <MapPin aria-hidden />
              <span className="truncate">{region}</span>
            </span>
          )}
          {languages.length > 0 && (
            <span className="flex min-w-0 items-center gap-2">
              <Languages aria-hidden />
              <span className="truncate">{languages.join(", ")}</span>
            </span>
          )}
          {work && (
            <span className="flex min-w-0 items-center gap-2">
              <Briefcase aria-hidden />
              <span className="truncate">{work}</span>
            </span>
          )}
        </span>
        <span className="mt-auto flex items-end justify-between gap-2 border-t border-dashed border-border pt-3">
          <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-muted">{invited ? "Already invited" : "Advertorial price"}</span>
          {priced ? (
            <span className="font-wide text-lg font-black text-ink tabular-nums">{inr(reporter.price!)}</span>
          ) : (
            <span className="text-xs font-semibold text-muted">Not set yet</span>
          )}
        </span>
      </button>
    </li>
  );
}
