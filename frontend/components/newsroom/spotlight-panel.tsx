"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useNow } from "@/lib/hooks/use-now";
import { SPOTLIGHT_RANKING, SPOTLIGHT_SHOW_CAP, type NewsroomSpotlight, type SpotlightOrder, type SpotlightResults } from "@/lib/shared/contracts";
import { formatNumber } from "@/lib/format";
import { applyOrderToCache } from "./spotlight-sheet";
import { durationLabel, formatInr, formatShortDateTime, spotlightState, timeLeft } from "./format";
import { SpotlightMark, SpotlightStatusChip } from "./spotlight-status";

export type SpotlightPanelProps = {
  data: NewsroomSpotlight;
  /** Opens the purchase sheet with the story picker. */
  onBoost: () => void;
  /** Opens the sheet for one story (history rows). */
  onOpenStory: (order: SpotlightOrder) => void;
};

/**
 * Newsroom Spotlight section: what a boost does, the price list (INR), "Boost a story", and the
 * reporter's Spotlight history — pending (withdrawable), live (countdown), ended, declined, withdrawn.
 */
export function SpotlightPanel({ data, onBoost, onOpenStory }: SpotlightPanelProps) {
  const packages = [...data.packages].filter((p) => p.active).sort((a, b) => a.sort - b.sort);
  return (
    <section aria-labelledby="newsroom-spotlight" className="card overflow-hidden">
      <div className="relative isolate overflow-hidden border-b border-tint-border bg-tint px-5 py-5 sm:px-6">
        <SpeedBarsSvg className="pointer-events-none absolute -right-8 -top-6 -z-10 w-44 text-brand opacity-[0.07]" />
        <div className="flex items-start gap-4">
          <SpotlightMark />
          <div className="min-w-0 flex-1">
            <h2 id="newsroom-spotlight" className="font-wide text-lg font-extrabold leading-tight text-ink">
              Spotlight
            </h2>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-2">
              Put a story in front of more readers: it appears between stories on Home, every category and under articles, ranks
              ×{SPOTLIGHT_RANKING.multiplier} higher in For You and is marked “Spotlighted”. Each reader sees it up to{" "}
              {SPOTLIGHT_SHOW_CAP} times, so every showing reaches someone new.
            </p>
          </div>
        </div>
        <ul aria-label="Spotlight packages" className="mt-4 grid grid-cols-3 gap-2">
          {packages.map((pkg) => (
            <li key={pkg.id} className="rounded-xl border border-tint-border bg-surface px-3 py-2.5">
              <p className="kicker truncate text-muted">{pkg.name}</p>
              <p className="mt-1 font-wide text-lg font-black leading-none text-ink sm:text-xl">{formatInr(pkg.priceInr)}</p>
              <p className="mt-1 text-xs font-semibold text-ink-2">{durationLabel(pkg.hours)}</p>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button onClick={onBoost} leftIcon={<Sparkles aria-hidden />} data-boost-story>
            Boost a story
          </Button>
          <p className="text-xs leading-relaxed text-muted">{data.paymentsEnabled ? "Pay securely at checkout." : "Payments launch soon — requests go to the Editor Desk."}</p>
        </div>
      </div>

      <div className="px-5 py-4 sm:px-6">
        <h3 className="kicker text-muted">Spotlight history</h3>
        {data.orders.length === 0 ? (
          <p className="mt-2 text-sm leading-relaxed text-muted">No Spotlight requests yet. Your boosts and their status will show here.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {data.orders.map((order) => (
              <OrderRow key={order.id} order={order} onOpen={() => onOpenStory(order)} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function OrderRow({ order, onOpen }: { order: SpotlightOrder; onOpen: () => void }) {
  const queryClient = useQueryClient();
  const mounted = useMounted();
  const now = useNow();
  const state = spotlightState(order);
  const cancel = useMutation({
    mutationFn: () => api.spotlight.cancel(order.id),
    onSuccess: ({ order: cancelled }) => {
      applyOrderToCache(queryClient, cancelled);
      toast("Spotlight request withdrawn", { description: "Nothing was charged." });
    },
    onError: (err) => toast.error("Couldn't withdraw the request", { description: errorMessage(err) }),
  });

  let when = "";
  if (mounted) {
    if (state === "active" && order.endsAt) when = `Until ${formatShortDateTime(order.endsAt)}${now ? ` · ${timeLeft(order.endsAt, now)}` : ""}`;
    else if (state === "expired" && order.endsAt) when = `Ended ${formatShortDateTime(order.endsAt)}`;
    else if (state === "pending") when = `Requested ${formatShortDateTime(order.createdAt)}`;
    else if (order.decidedAt) when = `${state === "declined" ? "Declined" : "Withdrawn"} ${formatShortDateTime(order.decidedAt)}`;
  }

  return (
    <li data-spotlight-order={order.id} className="flex items-start gap-3 py-3.5">
      <span className="relative block aspect-video w-16 shrink-0 overflow-hidden rounded-md bg-surface-2">
        {order.article.coverUrl && (
          <img src={order.article.coverUrl} alt="" width={128} height={72} loading="lazy" className="absolute inset-0 size-full object-cover" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        {order.article.slug ? (
          <Link href={`/a/${order.article.slug}`} className="line-clamp-2 text-sm font-bold leading-snug text-ink transition-colors hover:text-brand">
            {order.article.title || "Untitled story"}
          </Link>
        ) : (
          <p className="line-clamp-2 text-sm font-bold leading-snug text-ink">{order.article.title || "Untitled story"}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-muted">
          <SpotlightStatusChip state={state} />
          <span>
            {order.packageName} · {durationLabel(order.hours)} · {formatInr(order.priceInr)}
          </span>
          {when && <span className="text-ink-2">{when}</span>}
        </div>
        {order.note && state === "declined" && <p className="mt-1.5 text-xs leading-relaxed text-ink-2">Editor Desk: {order.note}</p>}
        {order.results && (state === "active" || state === "expired") && <Results results={order.results} live={state === "active"} />}
      </div>
      {state === "pending" ? (
        <Button variant="ghost" size="sm" onClick={() => cancel.mutate()} loading={cancel.isPending} className="text-muted hover:text-brand">
          Withdraw
        </Button>
      ) : state === "active" ? (
        <Button variant="ghost" size="sm" onClick={onOpen}>
          Details
        </Button>
      ) : null}
    </li>
  );
}

/** What the boost did (owner 2026-10-16): showings, readers reached, opens (and the open rate), likes, comments, followers. */
function Results({ results, live }: { results: SpotlightResults; live: boolean }) {
  const rate = results.reached > 0 ? Math.round((results.opens / results.reached) * 100) : null;
  const cells: { label: string; value: string }[] = [
    { label: "Shown", value: formatNumber(results.shown) },
    { label: "Readers reached", value: formatNumber(results.reached) },
    { label: "Opened", value: `${formatNumber(results.opens)}${rate !== null ? ` · ${rate}%` : ""}` },
    { label: "Likes", value: formatNumber(results.likes) },
    { label: "Comments", value: formatNumber(results.comments) },
    { label: "New followers", value: formatNumber(results.newFollowers) },
  ];
  return (
    <div className="mt-2.5 rounded-lg border border-border bg-surface-2/50 p-2.5">
      <p className="text-[0.6875rem] font-extrabold uppercase tracking-wide text-muted">{live ? "Results so far" : "Results"}</p>
      <dl className="mt-1.5 grid grid-cols-3 gap-x-3 gap-y-2">
        {cells.map((cell) => (
          <div key={cell.label} className="min-w-0">
            <dt className="truncate text-[0.6875rem] text-muted">{cell.label}</dt>
            <dd className="font-wide text-sm font-extrabold tabular-nums text-ink">{cell.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
