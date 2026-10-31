import {
  BadgeCheck,
  Ban,
  CircleCheck,
  CircleSlash,
  Eye,
  EyeOff,
  FileX2,
  Flag,
  FolderInput,
  IdCard,
  MessageSquareWarning,
  Package,
  PenLine,
  Pin,
  PinOff,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  UserCheck,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { UserHandle } from "@/components/brand/user-handle";
import { TimeAgo } from "@/components/ui/time-ago";
import { formatNumber, pluralize } from "@/lib/format";
import { ROLE_LABELS, categoryLabel, isCategory, type AuditAction, type AuditEntry, type Role } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { deskPersonHref } from "./nav";

type Described = { icon: LucideIcon; tone: "brand" | "live" | "muted"; text: ReactNode; note?: string | null };

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const roleLabel = (value: unknown): string => (typeof value === "string" && value in ROLE_LABELS ? ROLE_LABELS[value as Role] : String(value ?? "—"));
const rupees = (value: unknown): string => (num(value) === null ? "" : `₹${formatNumber(num(value)!)}`);

function Target({ children }: { children: ReactNode }) {
  return <strong className="font-bold text-ink">{children}</strong>;
}

/**
 * The target's name as shown in the console: account targets that carry a username render as a
 * handle ("@name" — older entries stored "@name" already, so a leading "@" is stripped first); e-mails,
 * story titles and package names stay plain text.
 */
export function auditTargetLabel(entry: Pick<AuditEntry, "targetType" | "targetLabel">, fallback = "an item that no longer exists"): ReactNode {
  const label = entry.targetLabel;
  if (!label) return fallback;
  const username = entry.targetType === "user" ? label.replace(/^@+/, "") : null;
  return username && !username.includes("@") ? <UserHandle username={username} /> : label;
}

/** Plain-language sentence for one audit entry (the actor is rendered separately). */
export function describeAudit(entry: AuditEntry): Described {
  const meta = entry.meta ?? {};
  const label = entry.targetLabel ?? "an item that no longer exists";
  const quoted = <Target>“{label}”</Target>;
  const who = <Target>{auditTargetLabel(entry)}</Target>;
  const reason = str(meta.reason);
  const note = str(meta.note);

  const table: Record<AuditAction, () => Described> = {
    "review.approve": () => ({ icon: CircleCheck, tone: "live", text: <>approved {quoted} at the Review Desk — it&apos;s live</>, note }),
    "review.return": () => ({ icon: Undo2, tone: "brand", text: <>returned {quoted} to the reporter</>, note }),
    "reporter.auto_verify": () => ({
      icon: BadgeCheck,
      tone: "live",
      text: <>{who} became a Verified Reporter after {num(meta.approvedCount) ?? 3} approved stories</>,
    }),
    "reporter.verify": () => ({ icon: BadgeCheck, tone: "live", text: <>verified {who}</>, note: reason }),
    "reporter.downgrade": () => ({ icon: IdCard, tone: "brand", text: <>moved {who} back to Trainee</>, note: reason }),
    "reporter.revoke": () => ({ icon: CircleSlash, tone: "brand", text: <>revoked the Press Pass of {who}</>, note: reason }),
    "story.hide": () => ({ icon: EyeOff, tone: "brand", text: <>hid {quoted}</>, note: reason }),
    "story.auto_warn": () => ({
      icon: MessageSquareWarning,
      tone: "brand",
      // The automatic first-hour warning ended 2026-09-30 (every report now warns); older log entries keep this line.
      text: <>warned the reporter of {quoted} after {num(meta.reports) ?? 5} reader reports in its first hour live</>,
      note: str(meta.reasons),
    }),
    "story.auto_delete": () => ({
      icon: Trash2,
      tone: "brand",
      // The first-hour auto-delete rule was replaced by auto-hide (2026-09-28); older log entries keep this line.
      text: <>deleted {quoted} after {num(meta.reports) ?? 10} reader reports in its first hour live</>,
      note: str(meta.reasons),
    }),
    "story.auto_hide": () => ({
      icon: EyeOff,
      tone: "brand",
      text: (
        <>
          {/* Automatic hiding ended 2026-09-30 (the desk decides); older log entries keep this line. */}
          hid {quoted} for good after {num(meta.reports) ?? 6} reader reports
        </>
      ),
      note: str(meta.reasons),
    }),
    "story.unhide": () => ({ icon: Eye, tone: "live", text: <>restored {quoted}</> }),
    "story.unpublish": () => ({ icon: FileX2, tone: "brand", text: <>unpublished {quoted}</>, note: reason }),
    "story.delete": () => ({ icon: Trash2, tone: "brand", text: <>deleted {quoted}</>, note: reason }),
    "story.pin": () => ({ icon: Pin, tone: "live", text: <>made {quoted} an Editor&apos;s Pick</> }),
    "story.unpin": () => ({ icon: PinOff, tone: "muted", text: <>removed {quoted} from Editor&apos;s Picks</> }),
    "story.pins_reorder": () => ({ icon: Pin, tone: "muted", text: <>reordered the Editor&apos;s Picks</> }),
    "story.category": () => {
      const to = str(meta.to);
      const section = isCategory(to) ? categoryLabel(to, str(meta.district)) : "another section";
      return { icon: FolderInput, tone: "muted", text: <>moved {quoted} to <Target>{section}</Target></> };
    },
    "story.edit": () => ({ icon: PenLine, tone: "muted", text: <>edited {quoted}</> }),
    "flags.resolve": () => {
      const count = num(meta.flags) ?? 0;
      const reports = `${count} report${count === 1 ? "" : "s"}`;
      const action = str(meta.action);
      const text =
        action === "hide" ? (
          <>hid {quoted} after {reports}</>
        ) : action === "warn" ? (
          <>warned the reporter of {quoted} ({reports})</>
        ) : action === "suspend" ? (
          <>suspended the reporter of {quoted} ({reports})</>
        ) : (
          <>dismissed {reports} on {quoted}</>
        );
      return { icon: Flag, tone: action === "dismiss" ? "muted" : "brand", text, note };
    },
    "user.role": () => ({
      icon: UserCog,
      tone: "muted",
      text: (
        <>
          changed {who} from {roleLabel(meta.from)} to <Target>{roleLabel(meta.to)}</Target>
        </>
      ),
    }),
    "user.auto_admin": () => ({ icon: ShieldCheck, tone: "live", text: <>{who} joined the Editor Desk (ADMIN_EMAILS)</> }),
    "user.suspend": () => ({ icon: Ban, tone: "brand", text: <>suspended {who}</>, note: reason }),
    "user.unsuspend": () => ({ icon: UserCheck, tone: "live", text: <>lifted the suspension of {who}</> }),
    "user.warn": () => ({ icon: MessageSquareWarning, tone: "brand", text: <>warned {who}</>, note }),
    "user.delete": () => ({
      icon: Trash2,
      tone: "brand",
      text: (
        <>
          deleted the account {who}
          {num(meta.stories) ? <> and {pluralize(num(meta.stories) ?? 0, "story", "stories")}</> : null}
        </>
      ),
    }),
    "spotlight.grant": () => ({
      icon: Sparkles,
      tone: "live",
      text: (
        <>
          granted a {num(meta.hours) ?? "?"}h Spotlight {rupees(meta.priceInr) && <>({rupees(meta.priceInr)}) </>}for {quoted}
        </>
      ),
      note,
    }),
    "spotlight.decline": () => ({ icon: Sparkles, tone: "muted", text: <>declined a Spotlight request for {quoted}</>, note }),
    "spotlight.package_create": () => ({
      icon: Package,
      tone: "live",
      text: (
        <>
          added the {quoted} package ({num(meta.hours) ?? "?"}h · {rupees(meta.priceInr)})
        </>
      ),
    }),
    "spotlight.package_update": () => {
      const before = num(meta.previousPriceInr);
      const after = num(meta.priceInr);
      return {
        icon: Package,
        tone: "muted",
        text:
          before !== null && after !== null && before !== after ? (
            <>
              repriced {quoted}: {rupees(before)} → <Target>{rupees(after)}</Target>
            </>
          ) : (
            <>updated the {quoted} package</>
          ),
      };
    },
    "spotlight.package_delete": () => ({ icon: Trash2, tone: "muted", text: <>deleted the {quoted} package</> }),
    "press_meet.platform_fee": () => {
      const before = num(meta.previousAmountInr);
      const after = num(meta.amountInr);
      return {
        icon: Package,
        tone: "muted",
        text: (
          <>
            set the press meet platform fee{before !== null ? <> from {rupees(before)}</> : null} to <Target>{rupees(after ?? 0)}</Target>
          </>
        ),
      };
    },
    // Premium membership rules (owner 2026-10-16): before → after, in the words reporters see.
    "membership.rules": () => ({
      icon: Package,
      tone: "muted",
      text: (
        <>
          changed the premium membership rules to <Target>{typeof meta.rules === "string" ? meta.rules : "new rules"}</Target>
        </>
      ),
      note: typeof meta.previous === "string" ? `Before: ${meta.previous}` : null,
    }),
    // Group accounts (owner 2026-10-23).
    "group.approve": () => ({ icon: BadgeCheck, tone: "live", text: <>approved the group account {who}</> }),
    "group.reject": () => ({ icon: CircleSlash, tone: "brand", text: <>turned down the group account {who}</>, note }),
    "group.delete": () => ({ icon: Trash2, tone: "brand", text: <>deleted the group account {who}{num(meta.stories) ? ` and its ${num(meta.stories)} stories` : ""}</> }),
  };

  return (table[entry.action] ?? (() => ({ icon: Flag, tone: "muted" as const, text: <>{entry.action} on {quoted}</> })))();
}

/** Actions the platform takes by itself (actor null by design). */
const AUTOMATIC = new Set<AuditAction>(["reporter.auto_verify", "user.auto_admin", "story.auto_warn", "story.auto_delete"]);

const ICON_TONE = {
  brand: "border-tint-border bg-tint text-brand",
  live: "border-success/25 bg-success-soft text-success-strong",
  muted: "border-border bg-surface-2 text-muted",
} as const;

/** One audit line: icon disc · "<actor> <what happened>" · note · time. */
export function AuditLine({ entry, compact = false, onTarget }: { entry: AuditEntry; compact?: boolean; onTarget?: (entry: AuditEntry) => void }) {
  const { icon: Icon, tone, text, note } = describeAudit(entry);
  const automatic = AUTOMATIC.has(entry.action);
  const actor = entry.actor ? (
    entry.actor.username ? (
      <Link href={deskPersonHref(entry.actor.username)} className="font-bold text-ink hover:text-brand">
        <UserHandle username={entry.actor.username} />
      </Link>
    ) : (
      <span className="font-bold text-ink">{entry.actor.name}</span>
    )
  ) : automatic ? (
    <span className="font-bold text-ink">WebNEWS</span>
  ) : (
    // The acting admin's account no longer exists (e.g. removed test accounts).
    <span className="font-bold text-muted">A deleted account</span>
  );

  return (
    <div className={cn("flex gap-3", compact ? "py-3" : "py-4")}>
      <span aria-hidden className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border", ICON_TONE[tone])}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-ink-2 wrap-anywhere">
          {actor} {text}
          {!entry.actor && automatic && <span className="text-muted"> (automatic)</span>}
        </p>
        {note && (
          <p className="mt-1.5 border-l-2 border-tint-border pl-2.5 text-[0.8125rem] italic leading-snug text-muted wrap-anywhere">
            {note}
          </p>
        )}
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <TimeAgo date={entry.createdAt} />
          {onTarget && (
            <>
              <span aria-hidden>·</span>
              <button type="button" onClick={() => onTarget(entry)} className="font-semibold text-muted underline-offset-2 hover:text-brand hover:underline">
                History of this {TARGET_NOUN[entry.targetType]}
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

const TARGET_NOUN: Record<AuditEntry["targetType"], string> = {
  article: "story",
  user: "account",
  press_pass: "Press Pass",
  spotlight_order: "Spotlight request",
  spotlight_package: "package",
  setting: "setting",
};
