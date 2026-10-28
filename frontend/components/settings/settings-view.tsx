"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  BellRing,
  Bot,
  ChevronDown,
  ChevronRight,
  Crown,
  FilePen,
  IndianRupee,
  KeyRound,
  LifeBuoy,
  MousePointerClick,
  Link2,
  Mail,
  Sparkles,
  type LucideIcon,
  Gem,
  BadgeCheck,
  Check,
  Lock,
  Globe,
} from "lucide-react";
import { AI_STATUS_KEY, GeminiKeyGuide } from "@/components/composer/ai-writer";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useId, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { SpeedLines } from "@/components/brand/speed-lines";
import { BackButton } from "@/components/layout/back-button";
import { mapAuthError, PASSWORD_MAX, PASSWORD_MIN } from "@/components/auth/auth-errors";
import { FormAlert } from "@/components/auth/form-bits";
import { PasswordInput } from "@/components/auth/password-input";
import { PasswordStrengthMeter } from "@/components/auth/password-strength";
import { useViewer } from "@/components/providers/viewer-provider";
import { restartTour } from "@/components/tour/guided-tour";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { COMPANY } from "@/lib/company";
import { isNativeApp } from "@/lib/native-app";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import {
  MEMBERSHIP_DAYS,
  MEMBERSHIP_FEE_PERCENT,
  MEMBERSHIP_PRICE_MAX,
  MEMBERSHIP_PRICE_MIN,
  membershipSplit,
  PRESS_MEET_PRICE_MAX,
  TRAINEE_APPROVALS_TO_VERIFY,
  WEAK_PASSWORD_MESSAGE,
  canPublish,
  isPasswordStrongEnough,
  type AccountSettings,
  type MembershipEligibility,
  isPhoneAccountEmail,
} from "@/lib/shared/contracts";
import { EarningsDashboard } from "@/components/memberships/earnings-dashboard";
import { MyMembershipsCard } from "@/components/memberships/my-memberships";
import { ConnectedAccounts } from "./connected-accounts";
import { DomainSettings } from "./domain-settings";
import { DraftsCard } from "./drafts-card";
import { NewsroomCard } from "./newsroom-card";
import { NotificationsCard } from "./notifications-card";
import { SpotlightCard } from "./spotlight-card";

type SectionKey = "drafts" | "my-memberships" | "newsroom" | "spotlight" | "press-meet" | "membership" | "ai" | "domain" | "notifications" | "connected" | "password" | "help";
/** `href`: an option that opens its own page (Newsroom — owner 2026-10-09, moved here from the account menu). */
type Section = { key: SectionKey; label: string; hint: string; icon: LucideIcon; href?: string };

const noopSubscribe = () => () => {};

const SECTIONS: Record<SectionKey, Section> = {
  drafts: { key: "drafts", label: "Drafts", hint: "Drafts and stories in review", icon: FilePen },
  "my-memberships": { key: "my-memberships", label: "My memberships", hint: "Reporters you're a member of, validity", icon: Gem },
  newsroom: { key: "newsroom", label: "Newsroom", hint: "Your stories, their numbers and notices", icon: BarChart3 },
  spotlight: { key: "spotlight", label: "Spotlight", hint: "Boost a story to more readers", icon: Sparkles },
  "press-meet": { key: "press-meet", label: "Advertorial price", hint: "What you charge to cover a press meet", icon: IndianRupee },
  membership: { key: "membership", label: "Premium membership", hint: "Your price, members and earnings", icon: Crown },
  ai: { key: "ai", label: "Gemini AI key", hint: "Your key for “Generate with AI”", icon: Bot },
  domain: { key: "domain", label: "Your domain", hint: "Verify your website with DNS", icon: Globe },
  notifications: { key: "notifications", label: "Notifications", hint: "Push on this phone, on or off", icon: BellRing },
  connected: { key: "connected", label: "Connected accounts", hint: "Instagram, Facebook, log out", icon: Link2 },
  password: { key: "password", label: "Reset password", hint: "Change your login password", icon: KeyRound },
  help: { key: "help", label: "Help center", hint: "Answers and how to reach us", icon: LifeBuoy },
};

/**
 * /settings (owner 2026-10-01, from every account's menu) as options, one under the other below the "Settings"
 * heading (owner 2026-10-02: no "View profile" link here): **Drafts** (in the app only, owner 2026-10-09: moved here
 * from the profile's tabs) · **Advertorial price** (owner 2026-10-05, was "Press meet price"; reporters and the Editor Desk) · **Notifications** (in the WebNEWS app: push on / off,
 * owner 2026-10-02) · **Connected accounts** (Instagram / Facebook for
 * Verified reporters, then the Account card with Log out) · **Reset password** · **Help center**. ≥1024px: the full
 * screen width — heading and options on the left, the chosen one beside them; phones (owner 2026-10-02): every
 * option as a row with ›, like a phone's own settings, and Log out under them; an option opens on its own screen. The choice is in the URL (`?section=`), so Back and shared links keep it.
 */
export function SettingsView({ verifiedReporter }: { verifiedReporter: boolean }) {
  const account = useQuery({ queryKey: qk.account, queryFn: ({ signal }) => api.account(signal) });
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // Only the app gets push notifications (known after hydration: the server renders the website's sections).
  const inApp = useSyncExternalStore(noopSubscribe, isNativeApp, () => false);

  const viewer = useViewer();
  const writer = viewer !== null && canPublish(viewer);
  const sections: Section[] = [
    ...(inApp ? [SECTIONS.drafts] : []),
    // Everyone (owner 2026-10-15): the memberships they bought.
    SECTIONS["my-memberships"],
    ...(writer ? [SECTIONS.newsroom, SECTIONS.spotlight] : []),
    ...(account.data?.canSetPressMeetPrice ? [SECTIONS["press-meet"], SECTIONS.membership, SECTIONS.ai] : []),
    // Press Pass holders (owner 2026-10-28).
    ...(viewer?.role === "reporter" ? [SECTIONS.domain] : []),
    ...(inApp ? [SECTIONS.notifications] : []),
    SECTIONS.connected,
    SECTIONS.password,
    SECTIONS.help,
  ];
  const asked = params.get("section");
  const askedSection = sections.find((section) => section.key === asked && !section.href) ?? null;
  // Nothing asked: the first option that opens here (Newsroom is its own page, so it's never the open one).
  const current = askedSection ?? sections.find((section) => !section.href) ?? sections[0];
  // Phones: no option chosen = the list of options; one chosen = its own screen (Back returns to the list).
  const listing = askedSection === null;
  const pageOf = (key: SectionKey) => sections.find((section) => section.key === key)?.href ?? null;
  const choose = (key: SectionKey) => {
    const page = pageOf(key);
    if (page) router.push(page);
    else router.replace(`${pathname}?section=${key}`, { scroll: false });
  };
  const open = (key: SectionKey) => router.push(pageOf(key) ?? `${pathname}?section=${key}`);

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start lg:gap-10">
      {/* Left: the heading, then (≥1024px) the three options one under the other, sticky while the content scrolls. */}
      <div className="flex flex-col gap-6 lg:sticky lg:top-[calc(var(--nav-h)+1.5rem)]">
        <header className="min-w-0">
          {/* The back arrow shares the kicker's line (owner 2026-10-02); data-own-back hides the shell's own. On a phone
              inside an option it goes back to the list of options. */}
          <div data-own-back="" className="flex items-center gap-3">
            <BackButton fallback={listing ? "/" : pathname} />
            <p className="kicker flex items-center gap-2 text-brand">
              <SpeedLines />
              <span className={cn(!listing && "lg:hidden")}>{listing ? "Your account" : "Settings"}</span>
              {!listing && <span className="hidden lg:inline">Your account</span>}
            </p>
          </div>
          <h1 className="mt-3 font-wide text-[2rem] leading-[1.02] font-black tracking-tight text-ink sm:text-[2.5rem]">
            {listing ? (
              "Settings"
            ) : (
              <>
                <span className="lg:hidden">{current.label}</span>
                <span className="hidden lg:inline">Settings</span>
              </>
            )}
          </h1>
        </header>
        <nav aria-label="Settings" className="hidden lg:block">
          <ul className="flex flex-col gap-1.5">
            {sections.map((section) => {
              const active = section.key === current.key;
              const Icon = section.icon;
              return (
                <li key={section.key}>
                  <button
                    type="button"
                    onClick={() => choose(section.key)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors",
                      active ? "border-tint-border bg-tint" : "border-transparent hover:bg-surface",
                    )}
                  >
                    {active && <span aria-hidden className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-brand" />}
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-full [&_svg]:size-5",
                        active ? "bg-brand text-brand-contrast" : "bg-tint text-brand",
                      )}
                    >
                      <Icon />
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block text-[0.9375rem] font-bold font-wide", active ? "text-brand" : "text-ink")}>{section.label}</span>
                      <span className="block truncate text-xs text-muted">{section.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {/* Phones / tablets (owner 2026-10-02): every option as a row with ›, like a phone's own settings; tapping one opens
          it on its own screen. Log out is right under the list. */}
      {listing && (
        <div className="flex flex-col gap-5 lg:hidden">
          <nav aria-label="Settings">
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {sections.map((section) => {
                const Icon = section.icon;
                return (
                  <li key={section.key}>
                    <button
                      type="button"
                      onClick={() => open(section.key)}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-tint"
                    >
                      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tint text-brand [&_svg]:size-5">
                        <Icon />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.9375rem] font-bold text-ink">{section.label}</span>
                        <span className="block truncate text-xs text-muted">{section.hint}</span>
                      </span>
                      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <LogoutButton variant="danger" size="md" fullWidth />
        </div>
      )}
      <div className={cn("min-w-0 flex-col gap-8", listing ? "hidden lg:flex" : "flex")}>
        {current.key === "help" ? (
          <HelpCenterCard />
        ) : current.key === "my-memberships" ? (
          <MyMembershipsCard />
        ) : current.key === "drafts" ? (
          <DraftsCard />
        ) : current.key === "newsroom" && viewer ? (
          <NewsroomCard viewer={viewer} />
        ) : current.key === "spotlight" ? (
          <SpotlightCard />
        ) : current.key === "domain" ? (
          <DomainSettings />
        ) : account.isPending ? (
          <SettingsSkeleton />
        ) : account.isError ? (
          <p className="card px-5 py-8 text-center text-sm text-muted">Couldn&rsquo;t load your settings. {errorMessage(account.error)}</p>
        ) : current.key === "press-meet" ? (
          <PressMeetPriceCard price={account.data.pressMeetPrice} />
        ) : current.key === "ai" ? (
          <GeminiKeyCard />
        ) : current.key === "membership" ? (
          <>
            <MembershipRulesCard eligibility={account.data.membershipEligibility} hasPrice={account.data.membershipPrice !== null} />
            <MembershipPriceCard price={account.data.membershipPrice} eligible={account.data.membershipEligibility?.eligible ?? false} />
            {/* Members, earnings, payouts (owner 2026-10-15) — only once they qualify or already run a membership
                (owner 2026-10-16: not shown while the conditions aren't met). */}
            {(account.data.membershipEligibility?.eligible || account.data.membershipPrice !== null) && <EarningsDashboard />}
          </>
        ) : current.key === "notifications" ? (
          <NotificationsCard enabled={account.data.pushNotifications} />
        ) : current.key === "password" ? (
          // Phone accounts (owner 2026-10-22) sign in with a WhatsApp code: no password to change.
          isPhoneAccountEmail(account.data.email) ? null : <PasswordCard account={account.data} />
        ) : (
          <>
            {verifiedReporter ? (
              <Suspense>
                <ConnectedAccounts />
              </Suspense>
            ) : (
              <p className="card px-5 py-5 text-sm leading-relaxed text-muted sm:px-8">
                Connecting Instagram and Facebook (each story you publish posted there automatically) is for Verified reporters.
              </p>
            )}
            <AccountCard email={account.data.email} phoneNumber={account.data.phoneNumber} />
          </>
        )}
      </div>
    </div>
  );
}

function Card({ id, icon, title, description, children }: { id: string; icon: ReactNode; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="card px-5 py-6 sm:px-8">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tint text-brand [&_svg]:size-5">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 id={id} className="font-wide text-lg font-extrabold tracking-[-0.01em] text-ink">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/* ─────────────── Gemini AI key (owner 2026-10-14) ─────────────── */

function GeminiKeyCard() {
  const status = useQuery({ queryKey: AI_STATUS_KEY, queryFn: ({ signal }) => api.ai.status(signal), staleTime: 5 * 60_000 });
  const [open, setOpen] = useState(false);
  const hasKey = status.data?.hasKey ?? false;
  return (
    <Card
      id="settings-ai"
      icon={<Bot aria-hidden />}
      title="Gemini AI key"
      description="“Generate with AI” on the publish page writes your description with your own free Gemini API key from Google AI Studio. It's saved encrypted and used only for your stories."
    >
      {status.isPending ? (
        <Skeleton className="h-12 w-full rounded-xl" />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-full px-3 text-sm font-bold",
              hasKey ? "bg-success-soft text-success-strong" : "bg-surface-2 text-ink-2",
            )}
          >
            <span aria-hidden className={cn("size-2 rounded-full", hasKey ? "bg-success" : "bg-border-strong")} />
            {hasKey ? "Key added" : "No key added"}
          </span>
          <Button size="sm" variant={hasKey ? "outline" : "primary"} onClick={() => setOpen(true)} leftIcon={<KeyRound aria-hidden />}>
            {hasKey ? "Change or remove key" : "Add key in 3 steps"}
          </Button>
        </div>
      )}
      <GeminiKeyGuide open={open} onOpenChange={setOpen} hasKey={hasKey} />
    </Card>
  );
}

/* ─────────────── Premium membership price (owner 2026-10-14) ─────────────── */

function MembershipPriceCard({ price, eligible }: { price: number | null; eligible: boolean }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  // Sent here from the composer (owner 2026-10-15): the story was saved as a draft first; once the price is saved,
  // straight back to it — everything written is still there.
  const back = useSearchParams().get("back");
  const backToStory = back && /^\/publish(\/[\w-]+)?$/.test(back) ? back : null;
  const [value, setValue] = useState(price === null ? "" : String(price));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (next: number | null) => api.setMembershipPrice(next),
    onSuccess: ({ membershipPrice }) => {
      queryClient.setQueryData<AccountSettings>(qk.account, (data) => (data ? { ...data, membershipPrice } : data));
      setValue(membershipPrice === null ? "" : String(membershipPrice));
      toast.success(membershipPrice === null ? "Membership turned off" : "Membership price saved", {
        description:
          membershipPrice === null ? undefined : backToStory ? `${inr(membershipPrice)} a month — back to your story.` : `${inr(membershipPrice)} a month.`,
      });
      if (membershipPrice !== null && backToStory) router.push(backToStory);
    },
    onError: (err) => toast.error("Couldn't save your membership price", { description: errorMessage(err) }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const digits = value.replace(/[,\s₹]/g, "");
    if (digits === "") {
      save.mutate(null);
      return;
    }
    const amount = Number(digits);
    if (!Number.isInteger(amount) || amount < MEMBERSHIP_PRICE_MIN) {
      setError(`Enter whole rupees, at least ${inr(MEMBERSHIP_PRICE_MIN)}`);
      return;
    }
    if (amount > MEMBERSHIP_PRICE_MAX) {
      setError(`Keep it under ${inr(MEMBERSHIP_PRICE_MAX)}`);
      return;
    }
    save.mutate(amount);
  };

  const share = price === null ? null : membershipSplit(price);
  return (
    <Card
      id="settings-membership"
      icon={<Crown aria-hidden />}
      title="Premium membership"
      description={`Readers pay this every ${MEMBERSHIP_DAYS} days to read your members-only stories (tick “Premium” when you publish). WebNEWS keeps a ${MEMBERSHIP_FEE_PERCENT}% platform fee.`}
    >
      {backToStory && (
        <Link href={backToStory} className="-mt-1 inline-flex w-fit items-center gap-1 text-sm font-bold text-brand hover:text-brand-hover">
          ← Back to your story (saved as a draft)
        </Link>
      )}
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Field label="Membership price (₹ per month)" error={error} className="min-w-0 flex-1 sm:max-w-xs">
          <Input
            prefix={<span className="font-bold text-ink-2">₹</span>}
            inputMode="numeric"
            disabled={!eligible}
            placeholder={eligible ? "e.g. 49" : "Locked — meet the conditions above"}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError(null);
            }}
          />
        </Field>
        <div className="flex gap-2 sm:mt-7">
          <Button type="submit" loading={save.isPending && value !== ""} disabled={!eligible}>
            Save price
          </Button>
          {price !== null && (
            <Button variant="ghost" disabled={save.isPending} onClick={() => save.mutate(null)}>
              Turn off
            </Button>
          )}
        </div>
      </form>
      {price !== null && share && (
        <p className="mt-3 text-sm text-ink-2">
          Members pay <strong className="font-bold text-ink">{inr(price)}</strong> a month · you get{" "}
          <strong className="font-bold text-ink">₹{(share.reporterPaise / 100).toFixed(2)}</strong> after the {MEMBERSHIP_FEE_PERCENT}% platform fee
        </p>
      )}
    </Card>
  );
}

/**
 * What it takes to start a premium membership (owner 2026-10-16): the Editor Desk's rules (they can change), each with a
 * tick, how far along you are and one plain line on what to do next.
 */
function MembershipRulesCard({ eligibility, hasPrice }: { eligibility: MembershipEligibility | null; hasPrice: boolean }) {
  if (!eligibility) return null;
  const { postedToday, eligible } = eligibility;
  const fmt = (n: number) => n.toLocaleString("en-IN");
  const rules = eligibility.rules.map((rule) => {
    const left = Math.max(0, rule.target - rule.current);
    let detail = rule.done ? "Done" : `${fmt(left)} more to go`;
    let count: string | null = `${fmt(Math.min(rule.current, rule.target))} / ${fmt(rule.target)}`;
    switch (rule.metric) {
      case "verified":
        detail = rule.done ? "You're Verified" : "Get your Press Pass approvals to become Verified";
        count = null;
        break;
      case "posting_days":
        detail = rule.done
          ? "Done"
          : `At least 1 story a day, on any days · ${fmt(left)} more ${left === 1 ? "day" : "days"} to go${postedToday ? " · today counted" : ""}`;
        count = `${fmt(Math.min(rule.current, rule.target))} / ${fmt(rule.target)} days`;
        break;
      case "account_age_days":
        count = `${fmt(Math.min(rule.current, rule.target))} / ${fmt(rule.target)} days`;
        detail = rule.done ? "Done" : `${fmt(left)} more ${left === 1 ? "day" : "days"}`;
        break;
      case "no_warnings_days":
        count = null;
        detail = rule.done ? "No recent warnings" : `Your last warning was ${fmt(rule.current)} days ago — ${fmt(left)} more days to go`;
        break;
    }
    return { key: rule.metric, title: rule.title, detail, done: rule.done, progress: rule.target > 0 ? Math.min(1, rule.current / rule.target) : 1, count };
  });
  const doneCount = rules.filter((rule) => rule.done).length;
  return (
    <section aria-label="Who can start a premium membership" className={cn("card overflow-hidden", eligible ? "border-[#bfe3c8]" : "border-tint-border")}>
      <div className={cn("flex items-start gap-3 px-5 py-4", eligible ? "bg-[#f1faf3]" : "bg-tint/60")}>
        <span aria-hidden className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl text-white", eligible ? "bg-[#22a35a]" : "bg-brand")}>
          {eligible ? <BadgeCheck className="size-5" /> : <Lock className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-wide text-base font-extrabold text-ink">{eligible ? "You can start a premium membership" : "Unlock premium membership"}</h3>
          <p className="mt-0.5 text-sm text-ink-2">
            {eligible
              ? hasPrice
                ? "You meet every condition. Your membership is open to readers."
                : "You meet every condition — set your price below."
              : `Meet ${rules.length === 1 ? "this condition" : `all ${rules.length} conditions`} to start one · ${doneCount} of ${rules.length} done`}
          </p>
        </div>
      </div>
      <ol className="divide-y divide-border">
        {rules.map((rule, index) => (
          <li key={rule.key} className="flex items-start gap-3 px-5 py-3.5">
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                rule.done ? "bg-[#22a35a] text-white" : "bg-surface-2 text-muted ring-1 ring-border ring-inset",
              )}
            >
              {rule.done ? <Check className="size-3.5" strokeWidth={3.5} /> : index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-bold text-ink">{rule.title}</p>
                {rule.count && <span className="shrink-0 text-xs font-bold tabular-nums text-ink-2">{rule.count}</span>}
              </div>
              {rule.count && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={cn("h-full rounded-full transition-[width] duration-500", rule.done ? "bg-[#22a35a]" : "bg-brand")}
                    style={{ width: `${rule.progress * 100}%` }}
                  />
                </div>
              )}
              <p className={cn("mt-1.5 text-xs", rule.done ? "text-[#1f7a3d]" : "text-muted")}>{rule.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ─────────────── Advertorial price (stored as the press meet price) ─────────────── */

const inr = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;

function PressMeetPriceCard({ price }: { price: number | null }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(price === null ? "" : String(price));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (next: number | null) => api.setPressMeetPrice(next),
    onSuccess: ({ pressMeetPrice }) => {
      queryClient.setQueryData<AccountSettings>(qk.account, (data) => (data ? { ...data, pressMeetPrice } : data));
      setValue(pressMeetPrice === null ? "" : String(pressMeetPrice));
      toast.success(pressMeetPrice === null ? "Advertorial price removed" : "Advertorial price saved", {
        description: pressMeetPrice === null ? undefined : `${inr(pressMeetPrice)} per press meet.`,
      });
    },
    onError: (err) => toast.error("Couldn't save your advertorial price", { description: errorMessage(err) }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const digits = value.replace(/[,\s₹]/g, "");
    if (digits === "") {
      save.mutate(null);
      return;
    }
    const amount = Number(digits);
    if (!Number.isInteger(amount) || amount < 0) {
      setError("Enter the amount in whole rupees, e.g. 2500");
      return;
    }
    if (amount > PRESS_MEET_PRICE_MAX) {
      setError(`Keep it under ${inr(PRESS_MEET_PRICE_MAX)}`);
      return;
    }
    save.mutate(amount);
  };

  return (
    <Card
      id="settings-press-meet"
      icon={<IndianRupee aria-hidden />}
      title="Advertorial price"
      description="What you charge to attend and cover a press meet. It isn't on your profile — organizers see it when they choose reporters to invite."
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Field label="Your advertorial price (₹ per press meet)" error={error} className="min-w-0 flex-1 sm:max-w-xs">
          <Input
            prefix={<span className="font-bold text-ink-2">₹</span>}
            inputMode="numeric"
            placeholder="e.g. 2500"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError(null);
            }}
          />
        </Field>
        <div className="flex gap-2 sm:mt-7">
          <Button type="submit" loading={save.isPending && value !== ""}>
            Save price
          </Button>
          {price !== null && (
            <Button variant="ghost" disabled={save.isPending} onClick={() => save.mutate(null)}>
              Remove
            </Button>
          )}
        </div>
      </form>
      {price !== null && (
        <p className="mt-3 text-sm text-ink-2">
          Your advertorial price: <strong className="font-bold text-ink">{inr(price)}</strong> per press meet
        </p>
      )}
    </Card>
  );
}

/* ─────────────── Change password ─────────────── */

type PasswordErrors = { current?: string; next?: string; confirm?: string };

function PasswordCard({ account }: { account: AccountSettings }) {
  return (
    <Card
      id="settings-password"
      icon={<KeyRound aria-hidden />}
      title={account.hasPassword ? "Change password" : "Set a password"}
      description={
        account.hasPassword
          ? "Changing it signs you out on your other devices."
          : "You log in with Google, so your account has no password yet. We'll email you a link to set one — then you can also log in with your email."
      }
    >
      {account.hasPassword ? <ChangePasswordForm /> : <SetPasswordByEmail email={account.email} />}
    </Card>
  );
}

function ChangePasswordForm() {
  const meterId = useId();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const found: PasswordErrors = {};
    if (!current) found.current = "Enter your current password.";
    if (!next) found.next = "Choose a new password.";
    else if (next.length < PASSWORD_MIN) found.next = `Use at least ${PASSWORD_MIN} characters.`;
    else if (next.length > PASSWORD_MAX) found.next = `Use at most ${PASSWORD_MAX} characters.`;
    else if (!isPasswordStrongEnough(next, [])) found.next = WEAK_PASSWORD_MESSAGE;
    else if (next === current) found.next = "Pick a password different from your current one.";
    if (!confirm) found.confirm = "Confirm your new password.";
    else if (confirm !== next) found.confirm = "Passwords don't match.";
    setErrors(found);
    setFormError(null);
    if (found.current || found.next || found.confirm) {
      (found.current ? currentRef : found.next ? nextRef : confirmRef).current?.focus();
      return;
    }

    setPending(true);
    const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
    setPending(false);
    if (error) {
      if (error.code === "INVALID_PASSWORD") {
        setErrors({ current: "That's not your current password." });
        currentRef.current?.focus();
        return;
      }
      const mapped = mapAuthError(error, "We couldn't change your password. Please try again.");
      if (mapped.field === "password") {
        setErrors({ next: mapped.message });
        nextRef.current?.focus();
      } else setFormError(mapped.message);
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    toast.success("Password changed", { description: "You're still logged in here; your other devices were signed out." });
  };

  return (
    <form noValidate onSubmit={onSubmit} className="flex max-w-md flex-col gap-4" aria-label="Change password">
      <FormAlert message={formError} />
      <Field label="Current password" error={errors.current}>
        <PasswordInput
          ref={currentRef}
          name="current-password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => {
            setCurrent(event.target.value);
            if (errors.current) setErrors((prev) => ({ ...prev, current: undefined }));
          }}
        />
      </Field>
      <Field label="New password" error={errors.next}>
        <PasswordInput
          ref={nextRef}
          name="new-password"
          autoComplete="new-password"
          placeholder={`At least ${PASSWORD_MIN} characters`}
          maxLength={PASSWORD_MAX}
          aria-describedby={meterId}
          value={next}
          onChange={(event) => {
            setNext(event.target.value);
            if (errors.next) setErrors((prev) => ({ ...prev, next: undefined }));
          }}
        />
      </Field>
      <PasswordStrengthMeter id={meterId} value={next} className="-mt-1" />
      <Field label="Confirm new password" error={errors.confirm}>
        <PasswordInput
          ref={confirmRef}
          name="confirm-password"
          autoComplete="new-password"
          placeholder="Type it again"
          value={confirm}
          onChange={(event) => {
            setConfirm(event.target.value);
            if (errors.confirm) setErrors((prev) => ({ ...prev, confirm: undefined }));
          }}
        />
      </Field>
      <div>
        <Button type="submit" loading={pending} leftIcon={<KeyRound aria-hidden />}>
          Change password
        </Button>
      </div>
    </form>
  );
}

function SetPasswordByEmail({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const send = async () => {
    setPending(true);
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setPending(false);
    if (error) {
      toast.error("Couldn't send the email", { description: mapAuthError(error).message });
      return;
    }
    setSent(true);
  };
  return sent ? (
    <p className="rounded-xl bg-tint px-4 py-3 text-sm font-semibold text-ink">
      Check <span className="text-brand">{email}</span> — the link to set your password is on its way.
    </p>
  ) : (
    <Button variant="secondary" loading={pending} leftIcon={<Mail aria-hidden />} onClick={() => void send()}>
      Email me a link
    </Button>
  );
}

/* ─────────────── Help center ─────────────── */

const FAQ: ReadonlyArray<{ q: string; a: ReactNode }> = [
  {
    q: "How do I publish a story?",
    a: (
      <>
        Get your <Link href="/press-pass">Press Pass</Link> first. Then tap <strong>+</strong> (New story). As a Trainee, your stories go to the Editor Desk
        for review; after {TRAINEE_APPROVALS_TO_VERIFY} approved stories you become Verified and publish straight away.
      </>
    ),
  },
  {
    q: "Why was my story returned or hidden?",
    a: "The Editor Desk returns a story with a note when it needs changes — open it from your notifications, fix it and send it again. Stories that break the rules can be hidden; you'll see the reason in a notice.",
  },
  {
    q: "How do I edit or delete my story?",
    a: "Open the ⋮ menu on your story (on your profile or Home) — Delete is at the bottom. Drafts and returned stories open in the editor from the Drafts tab on your profile.",
  },
  {
    q: "How do I report a story?",
    a: "Tap Report (the flag) on the story and pick a reason. The writer never sees who reported it; the Editor Desk reviews reported stories.",
  },
  {
    q: "Who can message me?",
    a: "Anyone. Messages from people you don't follow wait in Requests until you accept them. In a chat's ⋮ menu you can clear the chat or delete it.",
  },
  {
    q: "What is News radio?",
    a: "Tap the radio icon and WebNEWS reads the headlines aloud one after another, moving to the next story on its own. Tap the red icon to stop.",
  },
];

function HelpCenterCard() {
  const router = useRouter();
  return (
    <Card id="settings-help" icon={<LifeBuoy aria-hidden />} title="Help center" description="Answers to common questions.">
      {/* The guided tour again (owner 2026-10-22): forgets that it was taken and opens it on Home. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-tint px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-[0.9375rem] font-bold text-ink">Guided tour</p>
          <p className="text-sm text-muted">Try every feature again, step by step — Reels, News radio, publishing.</p>
        </div>
        <Button variant="outline" size="sm" leftIcon={<MousePointerClick aria-hidden />} onClick={() => restartTour(router)}>
          Take the tour again
        </Button>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {FAQ.map((item) => (
          <details key={item.q} className="group self-start overflow-hidden rounded-xl border border-border">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-[0.9375rem] font-bold text-ink transition-colors hover:bg-tint [&::-webkit-details-marker]:hidden">
              {item.q}
              <ChevronDown aria-hidden className="size-4.5 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <div className="px-4 pb-4 text-sm leading-relaxed text-ink-2 [&_a]:font-semibold [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2">
              {item.a}
            </div>
          </details>
        ))}
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        Still need help? Write to us at{" "}
        <a href={`mailto:${COMPANY.email}`} className="font-semibold text-brand underline underline-offset-2 hover:text-brand-hover">
          {COMPANY.email}
        </a>{" "}
        or read <Link href="/about" className="font-semibold text-brand underline underline-offset-2 hover:text-brand-hover">About WebNEWS</Link>.
      </p>
    </Card>
  );
}

/* ─────────────── Account ─────────────── */

/** Moved here from Edit profile (owner 2026-10-01): your email, the Terms and Privacy Policy, and Log out. */
function AccountCard({ email, phoneNumber }: { email: string | null; phoneNumber: string | null }) {
  // A phone account's email is a placeholder (contracts PHONE_ACCOUNT_EMAIL_DOMAIN): show the WhatsApp number instead.
  const phoneAccount = isPhoneAccountEmail(email);
  return (
    <section aria-labelledby="settings-account" className="card relative overflow-hidden px-5 py-6 sm:px-8">
      <h2 id="settings-account" className="font-wide text-lg font-extrabold tracking-[-0.01em] text-ink">
        Account
      </h2>
      <dl className="mt-4 grid gap-3">
        {phoneNumber && (
          <div className="grid gap-1">
            <dt className="kicker text-muted">WhatsApp number</dt>
            <dd className="text-[0.9375rem] font-semibold text-ink tabular-nums">{phoneNumber}</dd>
          </div>
        )}
        {!phoneAccount && (
          <div className="grid gap-1">
            <dt className="kicker text-muted">Email</dt>
            <dd className="break-all text-[0.9375rem] font-semibold text-ink">{email ?? "—"}</dd>
          </div>
        )}
      </dl>
      <div className="mt-6 flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-muted">
          Read our{" "}
          <Link href="/terms" className="font-semibold text-brand underline underline-offset-2 hover:text-brand-hover">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-semibold text-brand underline underline-offset-2 hover:text-brand-hover">
            Privacy Policy
          </Link>
          .
        </p>
        <LogoutButton variant="danger" size="md" />
      </div>
    </section>
  );
}

function SettingsSkeleton() {
  return (
    <div role="status" aria-label="Loading settings" className="flex flex-col gap-8">
      {[0, 1].map((i) => (
        <div key={i} className="card flex flex-col gap-4 px-5 py-6 sm:px-8">
          <div className="flex items-center gap-3">
            <Skeleton shape="circle" className="size-10" />
            <Skeleton className="h-5 w-40 rounded-md" />
          </div>
          <Skeleton className="h-11 w-full max-w-xs rounded-xl" />
        </div>
      ))}
    </div>
  );
}
