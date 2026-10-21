"use client";

import { useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { ArrowRight, BarChart3, Check, CircleAlert, Clock3, Eye, ShieldCheck, TrendingUp } from "lucide-react";
import { motion } from "motion/react";
import { useId, useState, type ReactNode } from "react";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, isApiError } from "@/lib/api";
import { useNow } from "@/lib/hooks/use-now";
import { qk } from "@/lib/query-keys";
import {
  SPOTLIGHT_PENDING_MESSAGE,
  SPOTLIGHT_RANKING,
  type NewsroomSpotlight,
  type NewsroomStory,
  type Page,
  type SpotlightOrder,
  type SpotlightOrderResponse,
  type SpotlightPackage,
} from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import {
  durationLabel,
  formatInr,
  formatShortDateTime,
  isOpenOrder,
  SPOTLIGHT_WINDOW_DAYS,
  spotlightEligible,
  spotlightState,
  timeLeft,
} from "./format";
import { SpotlightMark, SpotlightStatusChip } from "./spotlight-status";

/**
 * Puts a new / changed order into the Newsroom caches at once (story row + Spotlight history), before the
 * refetch that `qk.newsroomAll` invalidation triggers lands.
 */
export function applyOrderToCache(queryClient: QueryClient, order: SpotlightOrder): void {
  const summary = { id: order.id, status: order.status, active: order.active, endsAt: order.endsAt };
  queryClient.setQueryData<InfiniteData<Page<NewsroomStory>>>(qk.newsroomStories, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((story) => (story.id === order.article.id ? { ...story, spotlight: summary } : story)),
          })),
        }
      : data,
  );
  queryClient.setQueryData<NewsroomSpotlight>(qk.newsroomSpotlight, (data) =>
    data ? { ...data, orders: [order, ...data.orders.filter((o) => o.id !== order.id)] } : data,
  );
  void queryClient.invalidateQueries({ queryKey: qk.newsroomAll });
}

/** The story being boosted (feed card, article page or a Newsroom row). */
export type SpotlightStory = {
  id: string;
  title: string | null;
  coverUrl: string | null;
  coverBlur?: string | null;
  publishedAt: string | null;
};

export type SpotlightSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Story to boost. `null` = pick one of `candidates` first (Newsroom "Boost a story"). */
  story: SpotlightStory | null;
  candidates?: SpotlightStory[];
  /** Opened from the Newsroom: no "Open Newsroom" link. */
  inNewsroom?: boolean;
};

/**
 * Spotlight purchase flow (SPEC §3.11): package picker with INR prices → "Continue to payment". Payments
 * aren't connected yet, so the order is created as `pending` and the sheet says the request went to the
 * Editor Desk. A story with a pending request shows it (with "Withdraw request"); a running boost shows
 * its countdown. Stories older than the For You window can't be boosted.
 */
export function SpotlightSheet({ open, onOpenChange, story, candidates = [], inNewsroom = false }: SpotlightSheetProps) {
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<SpotlightStory | null>(story);
  const [choice, setChoice] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [result, setResult] = useState<SpotlightOrderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fresh flow each time the sheet opens (state adjusted during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPicked(story);
      setChoice(null);
      setCandidate(null);
      setResult(null);
      setError(null);
    }
  }

  const data = useQuery({
    queryKey: qk.newsroomSpotlight,
    queryFn: ({ signal }) => api.newsroom.spotlight(signal),
    enabled: open,
    staleTime: 15_000,
  });

  const packages = [...(data.data?.packages ?? [])].filter((p) => p.active).sort((a, b) => a.sort - b.sort);
  const selectedId = choice ?? packages[Math.min(1, packages.length - 1)]?.id ?? null;
  const selected = packages.find((p) => p.id === selectedId) ?? null;
  const existing = picked ? (data.data?.orders ?? []).find((order) => order.article.id === picked.id) ?? null : null;

  const order = useMutation({
    mutationFn: (input: { articleId: string; packageId: string }) => api.spotlight.order(input.articleId, input.packageId),
    onSuccess: (response) => {
      setResult(response);
      applyOrderToCache(queryClient, response.order);
    },
    onError: (err) => {
      if (isApiError(err) && err.code === "spotlight_exists") {
        void queryClient.invalidateQueries({ queryKey: qk.newsroomAll });
        setError("This story already has a Spotlight request or boost.");
        return;
      }
      setError(errorMessage(err, "Couldn't send your Spotlight request. Please try again."));
    },
  });

  const cancel = useMutation({
    mutationFn: (orderId: string) => api.spotlight.cancel(orderId),
    onSuccess: ({ order: cancelled }) => {
      applyOrderToCache(queryClient, cancelled);
      toast("Spotlight request withdrawn", { description: "Nothing was charged. You can request a new boost any time." });
    },
    onError: (err) => toast.error("Couldn't withdraw the request", { description: errorMessage(err) }),
  });

  const busy = order.isPending || cancel.isPending;
  const close = () => onOpenChange(false);

  let view: "sent" | "pick" | "loading" | "error" | "status" | "ineligible" | "choose";
  if (result) view = "sent";
  else if (!picked) view = "pick";
  else if (data.isPending) view = "loading";
  else if (data.isError) view = "error";
  else if (existing && isOpenOrder(existing)) view = "status";
  else if (!spotlightEligible(picked.publishedAt)) view = "ineligible";
  else view = "choose";

  const title =
    view === "sent"
      ? "Request sent"
      : view === "status"
        ? existing?.status === "pending"
          ? "Spotlight requested"
          : "Spotlight running"
        : "Spotlight this story";

  let footer: ReactNode;
  switch (view) {
    case "sent":
      footer = (
        <>
          {!inNewsroom && (
            <Button href="/newsroom" variant="outline" leftIcon={<BarChart3 aria-hidden />} onClick={close}>
              Open Newsroom
            </Button>
          )}
          <Button onClick={close}>Done</Button>
        </>
      );
      break;
    case "pick":
      footer = (
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={!candidate}
            rightIcon={<ArrowRight aria-hidden />}
            onClick={() => setPicked(candidates.find((c) => c.id === candidate) ?? null)}
          >
            Choose a package
          </Button>
        </>
      );
      break;
    case "status":
      footer =
        existing?.status === "pending" ? (
          <>
            <Button variant="outline" onClick={() => existing && cancel.mutate(existing.id)} loading={cancel.isPending}>
              Withdraw request
            </Button>
            <Button onClick={close} disabled={busy}>
              Close
            </Button>
          </>
        ) : (
          <Button onClick={close}>Close</Button>
        );
      break;
    case "choose":
      footer = (
        <>
          <Button variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!picked || !selected) return;
              setError(null);
              order.mutate({ articleId: picked.id, packageId: selected.id });
            }}
            disabled={!selected}
            loading={order.isPending}
            rightIcon={<ArrowRight aria-hidden />}
          >
            Continue to payment{selected ? ` · ${formatInr(selected.priceInr)}` : ""}
          </Button>
        </>
      );
      break;
    default:
      footer = <Button onClick={close}>Close</Button>;
  }

  const description = view === "choose" || view === "pick" ? "Boost your story to more readers in For You." : undefined;
  const body = (
    <div data-spotlight-sheet={view} className="flex flex-col gap-5">
      {picked && view !== "sent" && <StoryStrip story={picked} />}
      {view === "pick" && <PickStory candidates={candidates} value={candidate} onChange={setCandidate} />}
      {view === "loading" && <ChooseSkeleton />}
      {view === "error" && (
        <Notice icon={<CircleAlert aria-hidden />}>
          Couldn&apos;t load the Spotlight packages.{" "}
          <button type="button" className="font-bold text-brand underline-offset-2 hover:underline" onClick={() => void data.refetch()}>
            Try again
          </button>
        </Notice>
      )}
      {view === "status" && existing && <OpenOrderStatus order={existing} />}
      {view === "ineligible" && (
        <Notice icon={<Clock3 aria-hidden />}>
          Spotlight is available for your live stories from the last {SPOTLIGHT_WINDOW_DAYS} days. This one is older — boost a newer
          story instead.
        </Notice>
      )}
      {view === "choose" && (
        <ChoosePackage
          packages={packages}
          selectedId={selectedId}
          onSelect={(id) => {
            setChoice(id);
            setError(null);
          }}
          previous={existing}
          error={error}
        />
      )}
      {view === "sent" && result && <SentState result={result} />}
    </div>
  );

  return (
    <Modal
      open={open}
      onOpenChange={(value) => !busy && onOpenChange(value)}
      title={title}
      description={description}
      size="lg"
      dismissible={!busy}
      footer={footer}
    >
      {body}
    </Modal>
  );
}

function StoryStrip({ story }: { story: SpotlightStory }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5 pr-4">
      <span
        className="relative block aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-surface-2 bg-cover bg-center"
        style={story.coverBlur ? { backgroundImage: `url("${story.coverBlur}")` } : undefined}
      >
        {story.coverUrl && <img src={story.coverUrl} alt="" width={192} height={108} className="absolute inset-0 size-full object-cover" />}
      </span>
      <p className="line-clamp-2 min-w-0 font-wide text-[0.9375rem] font-extrabold leading-snug text-ink">{story.title || "Untitled story"}</p>
    </div>
  );
}

function Notice({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div role="status" className="panel-tint flex items-start gap-3 px-4 py-3.5 text-sm leading-relaxed text-ink-2 [&>svg]:mt-0.5 [&>svg]:size-4.5 [&>svg]:shrink-0 [&>svg]:text-brand">
      {icon}
      <p>{children}</p>
    </div>
  );
}

const PERKS = [
  { icon: <TrendingUp aria-hidden />, text: `Ranks ×${SPOTLIGHT_RANKING.multiplier} higher in For You while it runs` },
  { icon: <Eye aria-hidden />, text: "Clearly labelled “Spotlight” on the story — readers always know" },
  { icon: <ShieldCheck aria-hidden />, text: `Never a wall of ads: at most one Spotlight in every ${SPOTLIGHT_RANKING.blockSize} stories` },
  { icon: <Clock3 aria-hidden />, text: "The clock starts when the Editor Desk approves your request" },
];

function ChoosePackage({
  packages,
  selectedId,
  onSelect,
  previous,
  error,
}: {
  packages: SpotlightPackage[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  previous: SpotlightOrder | null;
  error: string | null;
}) {
  const groupId = useId();
  if (packages.length === 0) {
    return <Notice icon={<CircleAlert aria-hidden />}>No Spotlight packages are on sale right now. Check back soon.</Notice>;
  }
  return (
    <>
      {previous && (
        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
          Last request:
          <SpotlightStatusChip state={spotlightState(previous)} />
          {previous.packageName} · {formatInr(previous.priceInr)}
        </p>
      )}
      <fieldset>
        <legend className="kicker mb-2.5 text-ink">Choose your boost</legend>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {packages.map((pkg) => {
            const checked = pkg.id === selectedId;
            return (
              <label
                key={pkg.id}
                data-spotlight-package={pkg.hours}
                className={cn(
                  "group relative flex cursor-pointer items-center gap-4 rounded-2xl border px-4 py-3.5 transition-[border-color,background-color,box-shadow,transform] duration-200 ease-snap sm:flex-col sm:items-start sm:gap-1 sm:px-4 sm:pb-4 sm:pt-3.5",
                  "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand",
                  checked
                    ? "border-brand bg-tint-2 shadow-[0_10px_24px_-14px_rgb(227_6_19/0.55)]"
                    : "border-border bg-surface hover:-translate-y-0.5 hover:border-tint-border hover:bg-tint motion-reduce:hover:translate-y-0",
                )}
              >
                <input
                  type="radio"
                  name={`${groupId}-package`}
                  value={pkg.id}
                  checked={checked}
                  onChange={() => onSelect(pkg.id)}
                  className="sr-only"
                />
                <span className="min-w-0 flex-1 sm:flex-none">
                  <span className={cn("kicker block", checked ? "text-brand" : "text-muted")}>{pkg.name}</span>
                  <span className="mt-0.5 block font-wide text-base font-extrabold text-ink">{durationLabel(pkg.hours)}</span>
                </span>
                <span className="font-wide text-2xl font-black tracking-[-0.02em] text-ink sm:mt-2 sm:text-[1.75rem]">
                  {formatInr(pkg.priceInr)}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "flex size-5.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors sm:absolute sm:right-3 sm:top-3",
                    checked ? "border-brand bg-brand text-brand-contrast" : "border-border-strong bg-surface",
                  )}
                >
                  {checked && (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 600, damping: 20 }}>
                      <Check className="size-3.5" strokeWidth={3.5} />
                    </motion.span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <ul className="grid gap-2 sm:grid-cols-2">
        {PERKS.map((perk) => (
          <li key={perk.text} className="flex items-start gap-2.5 text-[0.8125rem] leading-snug text-ink-2 [&_svg]:mt-px [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-brand">
            {perk.icon}
            {perk.text}
          </li>
        ))}
      </ul>
      <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-xs leading-relaxed text-muted">
        <strong className="font-bold text-ink">Payments launch soon.</strong> You won&apos;t be charged today — your request goes straight to
        the Editor Desk, who can approve it by hand.
      </p>
      <div aria-live="polite">
        {error && (
          <p className="flex items-start gap-1.5 text-sm font-semibold text-brand">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}
      </div>
    </>
  );
}

function OpenOrderStatus({ order }: { order: SpotlightOrder }) {
  const now = useNow();
  const state = spotlightState(order);
  return (
    <div className="panel-tint relative isolate overflow-hidden p-5">
      <SpeedBarsSvg className="pointer-events-none absolute -right-8 -bottom-8 -z-10 w-40 text-brand opacity-[0.07]" />
      <div className="flex items-start gap-4">
        <SpotlightMark />
        <div className="min-w-0 flex-1">
          <SpotlightStatusChip state={state} />
          <p className="mt-2 font-wide text-lg font-extrabold leading-tight text-ink">
            {state === "active" ? "Your Spotlight is live" : "Waiting for the Editor Desk"}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
            {state === "active" && order.endsAt
              ? `${order.packageName} · runs until ${formatShortDateTime(order.endsAt)}${now ? ` (${timeLeft(order.endsAt, now)})` : ""}.`
              : `${order.packageName} · ${durationLabel(order.hours)} · ${formatInr(order.priceInr)}. Requested ${formatShortDateTime(order.createdAt)}. ${SPOTLIGHT_PENDING_MESSAGE}`}
          </p>
        </div>
      </div>
    </div>
  );
}

function SentState({ result }: { result: SpotlightOrderResponse }) {
  const { order } = result;
  return (
    <div role="status" className="relative isolate overflow-hidden rounded-2xl border border-tint-border bg-tint px-5 pb-6 pt-8 text-center sm:px-8">
      <SpeedBarsSvg className="pointer-events-none absolute -left-10 -top-10 -z-10 w-48 text-brand opacity-[0.06]" />
      <motion.span
        aria-hidden
        className="mx-auto inline-flex -rotate-6 items-center gap-2 rounded-lg border-[3px] border-brand px-4 py-1.5 font-wide text-lg font-black uppercase tracking-[0.14em] text-brand"
        initial={{ scale: 1.8, opacity: 0, rotate: -14 }}
        animate={{ scale: 1, opacity: 1, rotate: -6 }}
        transition={{ type: "spring", stiffness: 380, damping: 16, mass: 0.8 }}
      >
        <Check className="size-5" strokeWidth={3.5} />
        Request sent
      </motion.span>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.3 }}>
        <p className="mx-auto mt-5 max-w-md font-wide text-lg font-extrabold leading-snug text-ink">{result.message || SPOTLIGHT_PENDING_MESSAGE}</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
          Nothing was charged. Once the Editor Desk approves it, your story is labelled “Spotlight” and ranks higher for{" "}
          {durationLabel(order.hours)}.
        </p>
        <dl className="mx-auto mt-5 grid max-w-md divide-y divide-tint-border rounded-xl border border-tint-border bg-surface text-left sm:grid-cols-[1.4fr_1fr_1.2fr] sm:divide-x sm:divide-y-0">
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 sm:block">
            <dt className="kicker text-muted">Package</dt>
            <dd className="text-sm font-bold text-ink sm:mt-1">
              {order.packageName} · {durationLabel(order.hours)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 sm:block">
            <dt className="kicker text-muted">Price</dt>
            <dd className="text-sm font-bold text-ink sm:mt-1">{formatInr(order.priceInr)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 sm:block">
            <dt className="kicker text-muted">Status</dt>
            <dd className="sm:mt-1">
              <SpotlightStatusChip state={spotlightState(order)} />
            </dd>
          </div>
        </dl>
      </motion.div>
    </div>
  );
}

function PickStory({
  candidates,
  value,
  onChange,
}: {
  candidates: SpotlightStory[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const groupId = useId();
  const eligible = candidates.filter((story) => spotlightEligible(story.publishedAt));
  if (eligible.length === 0) {
    return (
      <Notice icon={<Clock3 aria-hidden />}>
        Spotlight works on your live stories from the last {SPOTLIGHT_WINDOW_DAYS} days. Publish a story, then boost it here.
      </Notice>
    );
  }
  return (
    <fieldset>
      <legend className="kicker mb-2.5 text-ink">Which story?</legend>
      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto overscroll-contain">
        {eligible.map((story) => {
          const checked = value === story.id;
          return (
            <label
              key={story.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 pr-4 transition-colors",
                "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand",
                checked ? "border-brand bg-tint-2" : "border-border hover:border-tint-border hover:bg-tint",
              )}
            >
              <input type="radio" name={`${groupId}-story`} value={story.id} checked={checked} onChange={() => onChange(story.id)} className="sr-only" />
              <span
                className="relative block aspect-video w-20 shrink-0 overflow-hidden rounded-md bg-surface-2 bg-cover bg-center"
                style={story.coverBlur ? { backgroundImage: `url("${story.coverBlur}")` } : undefined}
              >
                {story.coverUrl && <img src={story.coverUrl} alt="" width={160} height={90} loading="lazy" className="absolute inset-0 size-full object-cover" />}
              </span>
              <span className="line-clamp-2 min-w-0 flex-1 text-sm font-bold leading-snug text-ink">{story.title || "Untitled story"}</span>
              <span
                aria-hidden
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                  checked ? "border-brand bg-brand text-brand-contrast" : "border-border-strong",
                )}
              >
                {checked && <Check className="size-3" strokeWidth={3.5} />}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function ChooseSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading Spotlight packages" className="grid gap-2.5 sm:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2 rounded-2xl border border-border p-4">
          <Skeleton shape="pill" className="h-3 w-16" />
          <Skeleton className="h-4 w-20 rounded-sm" />
          <Skeleton className="mt-2 h-7 w-16 rounded-sm" />
        </div>
      ))}
    </div>
  );
}
