"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Building2, Check, CircleAlert, Clock3, CreditCard, Eye, ImageOff, Lock, PartyPopper, ShieldCheck, Smartphone, TrendingUp, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { durationLabel, formatInr, formatShortDay, isOpenOrder, spotlightState, timeLeft } from "@/components/newsroom/format";
import { applyOrderToCache } from "@/components/newsroom/spotlight-sheet";
import { SpotlightMark, SpotlightStatusChip } from "@/components/newsroom/spotlight-status";
import { canBoost, useNewsroomStories } from "@/components/newsroom/stories-table";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, isApiError } from "@/lib/api";
import { useNow } from "@/lib/hooks/use-now";
import { qk } from "@/lib/query-keys";
import { SPOTLIGHT_RANKING, type NewsroomSpotlight, type NewsroomStory, type Page, type SpotlightOrder, type SpotlightPackage } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/** The checkout bill (owner 2026-10-12: "bill and GST, platform fees"): a flat platform fee, then 18% GST on both. */
const PLATFORM_FEE_INR = 29;
const GST_RATE = 0.18;

function billOf(price: number) {
  const subtotal = price + PLATFORM_FEE_INR;
  const gst = Math.round(subtotal * GST_RATE * 100) / 100;
  return { price, fee: PLATFORM_FEE_INR, subtotal, gst, total: Math.round((subtotal + gst) * 100) / 100 };
}

const inrPaise = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Settings → Spotlight (owner 2026-10-12: its own option, "no popup", "fewer steps"): one screen — pick a story, pick a
 * boost, one button sends it — with your boosts (live, pending, past) under it. Payments aren't connected yet, so a
 * request waits for the Editor Desk.
 */
export function SpotlightCard() {
  const spotlight = useQuery({ queryKey: qk.newsroomSpotlight, queryFn: ({ signal }) => api.newsroom.spotlight(signal), staleTime: 15_000 });
  const firstStories = useQuery({
    queryKey: ["settings-spotlight-stories"],
    queryFn: ({ signal }) => api.newsroom.stories(null, signal),
    staleTime: 30_000,
  });
  if (spotlight.isError || firstStories.isError) {
    return (
      <p className="card px-5 py-8 text-center text-sm text-muted">
        Couldn&rsquo;t load Spotlight. {errorMessage(spotlight.error ?? firstStories.error)}
      </p>
    );
  }
  if (!spotlight.data || !firstStories.data) {
    return (
      <div className="flex flex-col gap-5" aria-busy>
        <Skeleton className="h-36 rounded-3xl" />
        <Skeleton className="h-96 rounded-3xl" />
      </div>
    );
  }
  return <Studio data={spotlight.data} firstStories={firstStories.data} />;
}

function Studio({ data, firstStories }: { data: NewsroomSpotlight; firstStories: Page<NewsroomStory> }) {
  const queryClient = useQueryClient();
  const stories = useNewsroomStories(firstStories);
  const all = stories.data?.pages.flatMap((page) => page.items) ?? firstStories.items;
  const boostable = all.filter(canBoost);
  const packages = [...data.packages].filter((p) => p.active).sort((a, b) => a.sort - b.sort);
  const popular = packages[Math.min(1, packages.length - 1)]?.id ?? null;

  const [storyId, setStoryId] = useState<string | null>(null);
  const [packageId, setPackageId] = useState<string | null>(null);
  const [sent, setSent] = useState<{ order: SpotlightOrder; total: number } | null>(null);
  const [checkout, setCheckout] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Defaults: the newest boostable story and the most popular boost — often one tap is enough.
  const story = boostable.find((s) => s.id === storyId) ?? boostable[0] ?? null;
  const pkg = packages.find((p) => p.id === packageId) ?? packages.find((p) => p.id === popular) ?? null;

  const order = useMutation({
    mutationFn: (input: { articleId: string; packageId: string }) => api.spotlight.order(input.articleId, input.packageId),
    onSuccess: (response) => {
      applyOrderToCache(queryClient, response.order);
      setSent({ order: response.order, total: billOf(response.order.priceInr).total });
      setCheckout(false);
      setStoryId(null);
      setError(null);
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

  const live = data.orders.filter((o) => spotlightState(o) === "active").length;
  const pending = data.orders.filter((o) => o.status === "pending").length;

  return (
    <div className="flex flex-col gap-5">
      {/* Hero: what it is, and where you stand. */}
      <section className="relative isolate overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#e3061a_0%,#b80012_60%,#7a000c_100%)] px-5 py-6 text-white shadow-[0_18px_40px_-22px_rgb(184_0_18/0.8)] sm:px-7">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 -z-10 size-56 rounded-full bg-white/10 blur-2xl" />
        <div className="flex items-start gap-4">
          <SpotlightMark className="bg-white text-brand shadow-none" />
          <div className="min-w-0 flex-1">
            <h2 className="font-wide text-2xl font-black tracking-tight">Spotlight</h2>
            <p className="mt-1 text-sm leading-relaxed text-white/85">
              Put a story in front of more readers — it ranks ×{SPOTLIGHT_RANKING.multiplier} higher in For You while it runs.
            </p>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-2">
          <Stat label="Live now" value={live} />
          <Stat label="Pending" value={pending} />
          <Stat label="All boosts" value={data.orders.length} />
        </dl>
      </section>

      {/* One screen: story → boost → send. */}
      <section aria-labelledby="spotlight-boost" className="card overflow-hidden">
        <div className="px-5 pt-5 sm:px-7 sm:pt-6">
          <h3 id="spotlight-boost" className="font-wide text-lg font-black tracking-tight text-ink">
            Boost a story
          </h3>
          <p className="mt-0.5 text-sm text-muted">Your live stories from the last 2 weeks. Pick one, pick a boost, done.</p>
        </div>

        {sent && (
          <div role="status" className="mx-5 mt-4 flex items-start gap-3 rounded-2xl bg-success-soft px-4 py-3 sm:mx-7">
            <PartyPopper aria-hidden className="mt-0.5 size-5 shrink-0 text-success-strong" />
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink-2">
              <strong className="font-bold text-ink">Payment successful · {inrPaise.format(sent.total)}</strong> (test payment) for &ldquo;
              {sent.order.article.title ?? "your story"}&rdquo; · {sent.order.packageName}. Your boost starts once the Editor Desk approves it.
            </p>
            <button type="button" aria-label="Dismiss" onClick={() => setSent(null)} className="rounded-full p-1 text-muted hover:bg-surface-2">
              <X aria-hidden className="size-4" />
            </button>
          </div>
        )}

        {boostable.length === 0 ? (
          <div className="mx-5 my-5 rounded-2xl border border-dashed border-border px-4 py-8 text-center sm:mx-7">
            <p className="font-bold text-ink">No story to boost right now</p>
            <p className="mt-1 text-sm text-muted">Publish a story — anything from the last 2 weeks without a boost shows up here.</p>
            <Button href="/publish" size="sm" className="mt-4">
              Write a story
            </Button>
          </div>
        ) : (
          <>
            <Step n={1} label="Story" />
            <div role="radiogroup" aria-label="Story to boost" className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-5 pb-1 sm:px-7">
              {boostable.map((s) => {
                const on = s.id === story?.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setStoryId(s.id)}
                    className={cn(
                      "group relative w-40 shrink-0 snap-start overflow-hidden rounded-2xl text-left ring-2 transition-[box-shadow,transform] duration-200 sm:w-44",
                      on ? "ring-brand shadow-[0_12px_28px_-16px_rgb(227_6_19/0.7)]" : "ring-transparent hover:-translate-y-0.5",
                    )}
                  >
                    <span className="block aspect-[4/5] bg-surface-2">
                      {s.coverUrl ? (
                        <img src={s.coverUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <span className="flex size-full items-center justify-center text-muted">
                          <ImageOff aria-hidden className="size-6" />
                        </span>
                      )}
                    </span>
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-3 pt-10 pb-3">
                      <span className="line-clamp-2 text-[0.8125rem] font-bold leading-snug text-white">{s.title ?? "Untitled story"}</span>
                      {s.publishedAt && <span className="mt-1 block text-[0.6875rem] text-white/70">{formatShortDay(s.publishedAt)}</span>}
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "absolute top-2.5 right-2.5 flex size-6 items-center justify-center rounded-full border-2 transition-colors",
                        on ? "border-brand bg-brand text-white" : "border-white/80 bg-black/20",
                      )}
                    >
                      {on && <Check className="size-3.5" strokeWidth={3.5} />}
                    </span>
                  </button>
                );
              })}
            </div>

            <Step n={2} label="Boost" />
            {packages.length === 0 ? (
              <p className="mx-5 rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted sm:mx-7">No Spotlight packages are on sale right now. Check back soon.</p>
            ) : (
              <div role="radiogroup" aria-label="Boost length" className="grid grid-cols-1 gap-2.5 px-5 min-[420px]:grid-cols-3 sm:px-7">
                {packages.map((p) => {
                  const on = p.id === pkg?.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setPackageId(p.id)}
                      className={cn(
                        "relative flex items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-colors min-[420px]:flex-col min-[420px]:items-start min-[420px]:gap-1",
                        on ? "border-brand bg-tint" : "border-border bg-surface hover:border-tint-border",
                      )}
                    >
                      {p.id === popular && packages.length > 1 && (
                        <span className="absolute -top-2.5 right-3 rounded-full bg-brand px-2 py-0.5 text-[0.625rem] font-black uppercase tracking-wider text-white">
                          Popular
                        </span>
                      )}
                      <span>
                        <span className={cn("block text-xs font-bold uppercase tracking-wider", on ? "text-brand" : "text-muted")}>{p.name}</span>
                        <span className="block font-wide text-base font-extrabold text-ink">{durationLabel(p.hours)}</span>
                      </span>
                      <span className="font-wide text-xl font-black text-ink">{formatInr(p.priceInr)}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 px-5 text-xs text-muted sm:px-7 [&_svg]:size-3.5 [&_svg]:text-brand">
              <li className="flex items-center gap-1.5">
                <TrendingUp aria-hidden />×{SPOTLIGHT_RANKING.multiplier} reach in For You
              </li>
              <li className="flex items-center gap-1.5">
                <Eye aria-hidden />
                Labelled &ldquo;Spotlight&rdquo;
              </li>
              <li className="flex items-center gap-1.5">
                <ShieldCheck aria-hidden />
                Max 1 in {SPOTLIGHT_RANKING.blockSize} stories
              </li>
              <li className="flex items-center gap-1.5">
                <Clock3 aria-hidden />
                Starts once approved
              </li>
            </ul>

            {/* The one action, with what you're buying spelled out. */}
            <div className="mt-5 flex flex-col gap-3 border-t border-border bg-surface-2/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink">{story?.title ?? "Pick a story"}</p>
                <p className="text-xs text-muted">
                  {pkg ? `${pkg.name} · ${durationLabel(pkg.hours)} · + platform fee & GST` : "Pick a boost"}
                </p>
                {error && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-brand">
                    <CircleAlert aria-hidden className="size-3.5 shrink-0" />
                    {error}
                  </p>
                )}
              </div>
              <Button
                size="lg"
                disabled={!story || !pkg}
                loading={order.isPending}
                rightIcon={<ArrowRight aria-hidden />}
                onClick={() => {
                  setError(null);
                  setCheckout(true);
                }}
                className="shrink-0 max-sm:w-full"
              >
                Boost{pkg ? ` for ${formatInr(pkg.priceInr)}` : ""}
              </Button>
            </div>
          </>
        )}
      </section>

      <YourBoosts orders={data.orders} />

      {story && pkg && (
        <Checkout
          open={checkout}
          onOpenChange={(open) => !order.isPending && setCheckout(open)}
          story={story}
          pkg={pkg}
          paying={order.isPending}
          error={error}
          onPay={() => order.mutate({ articleId: story.id, packageId: pkg.id })}
        />
      )}
    </div>
  );
}

const METHODS = [
  { value: "upi", label: "UPI", hint: "GPay, PhonePe, Paytm", icon: Smartphone },
  { value: "card", label: "Card", hint: "Debit or credit", icon: CreditCard },
  { value: "netbanking", label: "Net banking", hint: "All major banks", icon: Building2 },
] as const;

/** The payment popup: what you're boosting, the bill (price, platform fee, GST, total), how to pay, and Pay. */
function Checkout({
  open,
  onOpenChange,
  story,
  pkg,
  paying,
  error,
  onPay,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  story: NewsroomStory;
  pkg: SpotlightPackage;
  paying: boolean;
  error: string | null;
  onPay: () => void;
}) {
  const [method, setMethod] = useState<(typeof METHODS)[number]["value"]>("upi");
  const bill = billOf(pkg.priceInr);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Checkout"
      description="Review your bill and pay to send your Spotlight."
      size="md"
      dismissible={!paying}
      footer={
        <Button size="lg" fullWidth loading={paying} leftIcon={<Lock aria-hidden />} onClick={onPay}>
          Pay {inrPaise.format(bill.total)}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
          <span className="size-14 shrink-0 overflow-hidden rounded-xl bg-surface">
            {story.coverUrl && <img src={story.coverUrl} alt="" className="size-full object-cover" />}
          </span>
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-bold text-ink">{story.title ?? "Untitled story"}</p>
            <p className="mt-0.5 text-xs text-muted">
              Spotlight · {pkg.name} · {durationLabel(pkg.hours)}
            </p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Bill</p>
          <dl className="rounded-2xl border border-border text-sm">
            <BillRow label={`Spotlight · ${durationLabel(pkg.hours)}`} value={inrPaise.format(bill.price)} />
            <BillRow label="Platform fee" value={inrPaise.format(bill.fee)} />
            <BillRow label="Subtotal" value={inrPaise.format(bill.subtotal)} muted />
            <BillRow label={`GST (${Math.round(GST_RATE * 100)}%)`} value={inrPaise.format(bill.gst)} />
            <div className="flex items-center justify-between rounded-b-2xl bg-tint px-4 py-3">
              <dt className="font-bold text-ink">Total</dt>
              <dd className="font-wide text-xl font-black tabular-nums text-ink">{inrPaise.format(bill.total)}</dd>
            </div>
          </dl>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Pay with</p>
          <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-3 gap-2">
            {METHODS.map(({ value, label, hint, icon: Icon }) => {
              const on = value === method;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setMethod(value)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-2xl border-2 px-3 py-2.5 text-left transition-colors",
                    on ? "border-brand bg-tint" : "border-border hover:border-tint-border",
                  )}
                >
                  <Icon aria-hidden className={cn("size-5", on ? "text-brand" : "text-ink-2")} />
                  <span className="text-sm font-bold text-ink">{label}</span>
                  <span className="text-[0.6875rem] leading-tight text-muted">{hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        <p className="flex items-start gap-2 rounded-xl bg-surface-2 px-3.5 py-2.5 text-xs leading-relaxed text-muted">
          <ShieldCheck aria-hidden className="mt-px size-4 shrink-0 text-success-strong" />
          <span>
            <strong className="font-bold text-ink">Test mode</strong> — no money is charged until online payments are connected. Your boost
            starts once the Editor Desk approves it.
          </span>
        </p>
        {error && (
          <p role="alert" className="flex items-center gap-1.5 text-sm font-semibold text-brand">
            <CircleAlert aria-hidden className="size-4 shrink-0" />
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function BillRow({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
      <dt className={muted ? "text-muted" : "text-ink-2"}>{label}</dt>
      <dd className={cn("tabular-nums", muted ? "text-muted" : "font-semibold text-ink")}>{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white/12 px-3 py-2.5 ring-1 ring-white/15 ring-inset">
      <dt className="text-[0.6875rem] font-bold uppercase tracking-wider text-white/75">{label}</dt>
      <dd className="font-wide text-2xl font-black tabular-nums">{value}</dd>
    </div>
  );
}

function Step({ n, label }: { n: number; label: string }) {
  return (
    <p className="mt-5 mb-2.5 flex items-center gap-2 px-5 text-xs font-bold uppercase tracking-wider text-ink sm:px-7">
      <span className="flex size-5 items-center justify-center rounded-full bg-ink text-[0.6875rem] text-surface">{n}</span>
      {label}
    </p>
  );
}

/** Every boost, the open ones first: live with the time left, pending with Withdraw, then the past ones. */
function YourBoosts({ orders }: { orders: SpotlightOrder[] }) {
  const queryClient = useQueryClient();
  const now = useNow();
  const cancel = useMutation({
    mutationFn: (orderId: string) => api.spotlight.cancel(orderId),
    onSuccess: ({ order }) => {
      applyOrderToCache(queryClient, order);
      toast("Spotlight request withdrawn", { description: "Nothing was charged." });
    },
    onError: (err) => toast.error("Couldn't withdraw the request", { description: errorMessage(err) }),
  });
  if (orders.length === 0) return null;
  const sorted = [...orders].sort((a, b) => Number(isOpenOrder(b)) - Number(isOpenOrder(a)));
  return (
    <section aria-labelledby="spotlight-yours" className="card px-5 py-5 sm:px-7">
      <h3 id="spotlight-yours" className="font-wide text-lg font-black tracking-tight text-ink">
        Your boosts
      </h3>
      <ul className="mt-3 flex flex-col divide-y divide-border">
        {sorted.map((o) => {
          const state = spotlightState(o);
          return (
            <li key={o.id} className="flex items-center gap-3 py-3">
              <span className="size-12 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                {o.article.coverUrl && <img src={o.article.coverUrl} alt="" className="size-full object-cover" />}
              </span>
              <div className="min-w-0 flex-1">
                {o.article.slug ? (
                  <Link href={`/a/${o.article.slug}`} className="line-clamp-1 text-sm font-bold text-ink hover:underline">
                    {o.article.title ?? "Untitled story"}
                  </Link>
                ) : (
                  <p className="line-clamp-1 text-sm font-bold text-ink">{o.article.title ?? "Untitled story"}</p>
                )}
                <p className="mt-0.5 text-xs text-muted">
                  {o.packageName} · {formatInr(o.priceInr)}
                  {state === "active" && o.endsAt && now ? ` · ${timeLeft(o.endsAt, now)}` : ` · ${formatShortDay(o.createdAt)}`}
                </p>
                {o.note && state === "declined" && <p className="mt-0.5 text-xs text-ink-2">&ldquo;{o.note}&rdquo;</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <SpotlightStatusChip state={state} />
                {o.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => cancel.mutate(o.id)}
                    disabled={cancel.isPending}
                    aria-label="Withdraw request"
                    title="Withdraw request"
                    className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                  >
                    <Undo2 aria-hidden className="size-4" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
