"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Globe, LockKeyhole, MonitorSmartphone } from "lucide-react";
import type { ReactNode } from "react";
import { UserHandle } from "@/components/brand/user-handle";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import { experienceLabel, formatMobile, languageLabels, reporterTypeLabel } from "@/components/presspass/press-format";
import { PressPassCard } from "@/components/presspass/press-pass-card";
import { cardDataOf } from "@/components/presspass/press-pass-holder";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { PRESS_ID_TYPE_LABELS, ageOn, formatIdNumber, type AdminPersonDetail } from "@/lib/shared/contracts";
import { Chip, LevelChip, RoleChip } from "./chips";
import { DeskDate } from "./desk-date";
import { ListError, ListLoading } from "./list-parts";
import { showsBadge } from "./person";

/*
 * The person popup on Readers / Reporters (owner 2026-11-04): click a name → the photo, everything they gave when
 * creating the account, how they sign in, the IP + browser of each login and of their activity, and — for reporters —
 * the Press Pass card with its private details.
 */

const SIGN_IN_LABELS: Record<string, string> = { credential: "Password", google: "Google", facebook: "Facebook", apple: "Apple" };

/** "Chrome on Android", "WebNewsX app on Android", "Safari on iPhone"… from a user agent (best effort). */
function deviceOf(ua: string | null): string {
  if (!ua) return "Unknown device";
  const os = /Android/i.test(ua)
    ? "Android"
    : /iPhone/i.test(ua)
      ? "iPhone"
      : /iPad/i.test(ua)
        ? "iPad"
        : /Windows/i.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/i.test(ua)
            ? "Mac"
            : /Linux/i.test(ua)
              ? "Linux"
              : null;
  const app = isApp(ua)
    ? "WebNewsX app"
    : /Edg\//.test(ua)
      ? "Edge"
      : /OPR\//.test(ua)
        ? "Opera"
        : /SamsungBrowser/.test(ua)
          ? "Samsung Internet"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : /Chrome\//.test(ua)
              ? "Chrome"
              : /Safari\//.test(ua)
                ? "Safari"
                : null;
  if (!app && !os) return ua.slice(0, 60);
  return [app, os].filter(Boolean).join(" on ");
}

/** The Android app adds "WebNewsXApp" to its user agent (mobile/capacitor.config.ts). */
const isApp = (ua: string | null) => Boolean(ua && /WebNewsXApp|; wv\)/.test(ua));

/** Web or App, at a glance (owner 2026-11-04). */
function ViaChip({ app }: { app: boolean }) {
  return app ? <Chip tone="brand">App</Chip> : <Chip tone="neutral">Web</Chip>;
}

function Rows({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="flex flex-col divide-y divide-border rounded-xl border border-border">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 px-3.5 py-2.5 text-sm max-sm:grid-cols-1 max-sm:gap-0.5">
          <dt className="text-xs font-bold uppercase tracking-wider text-muted">{label}</dt>
          <dd className="break-words text-ink">{value ?? <span className="italic text-faint">Not given</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

const verifiedTag = (yes: boolean) => (yes ? <Chip tone="live">Verified</Chip> : <Chip tone="muted">Not verified</Chip>);

function Body({ data }: { data: AdminPersonDetail }) {
  const u = data.user;
  const pass = data.pressPass;
  const age = pass?.dateOfBirth ? ageOn(pass.dateOfBirth) : null;
  const region = pass ? [pass.city, pass.district, pass.stateName].filter(Boolean).join(", ") : "";
  const languages = languageLabels(u.preferredLanguages);

  return (
    <div className="flex flex-col gap-6">
      {/* Who: the photo large, name, handle, role. */}
      <div className="flex items-center gap-4">
        <Avatar src={u.image} name={u.name || u.username || "?"} size={88} decorative className="ring-1 ring-border" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex items-center gap-1.5 text-lg font-bold text-ink">
            <span className="truncate">{u.name || "Unnamed"}</span>
            {showsBadge(u) && <VerifiedBadge size={18} />}
          </p>
          {u.username ? <UserHandle username={u.username} className="text-sm text-muted" /> : <span className="text-sm text-muted">No username yet</span>}
          <span className="flex flex-wrap items-center gap-1.5 pt-1">
            <RoleChip role={u.role} />
            {u.role === "reporter" && <LevelChip level={u.reporterLevel} />}
            {u.suspended ? <Chip tone="solid">Suspended</Chip> : <Chip tone="live">Active</Chip>}
            {u.addedByClaude && <Chip tone="muted">Added by Claude</Chip>}
          </span>
          {u.image && (
            <a href={u.image} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 pt-0.5 text-xs font-semibold text-brand hover:underline">
              Open full photo <ExternalLink aria-hidden className="size-3" />
            </a>
          )}
        </div>
      </div>

      <Section title="Account">
        <Rows
          rows={[
            ["Name", u.name],
            ["Username", u.username ? <UserHandle username={u.username} /> : null],
            ["Email", u.email ? <span className="flex flex-wrap items-center gap-2">{u.email} {verifiedTag(u.emailVerified)}</span> : null],
            [
              "WhatsApp number",
              u.phoneNumber ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="tabular-nums">{formatMobile(u.phoneNumber)}</span> {verifiedTag(u.phoneNumberVerified)}
                </span>
              ) : null,
            ],
            ["Bio", u.bio],
            ["Languages", languages.length > 0 ? languages.join(", ") : null],
            ["Signs in with", data.signIn.length > 0 ? data.signIn.map((p) => SIGN_IN_LABELS[p] ?? p).join(", ") : null],
            ["Joined", <DeskDate key="j" iso={u.createdAt} style="date-time" />],
            ["Profile finished", u.onboardedAt ? <DeskDate iso={u.onboardedAt} style="date-time" /> : <span className="font-semibold text-brand">Not yet</span>],
            ["Terms accepted", u.termsAcceptedAt ? <span><DeskDate iso={u.termsAcceptedAt} />{u.termsVersion ? ` · version ${u.termsVersion}` : ""}</span> : null],
            ["Last active", u.lastActiveAt ? <DeskDate iso={u.lastActiveAt} style="date-time" /> : null],
            ["Reach", `${u.published} stories · ${u.followers} followers`],
            ...(u.suspended ? ([["Suspended", u.suspendReason]] as Array<[string, ReactNode]>) : []),
          ]}
        />
      </Section>

      {pass && (
        <Section title="Press Pass">
          <PressPassCard data={cardDataOf(pass, u.role === "admin")} animateIn={false} scaled className="w-full" />
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
            <LockKeyhole aria-hidden className="mt-0.5 size-3.5 shrink-0 text-brand" />
            Private — kept for legal matters. Don&rsquo;t share them outside the Editor Desk.
          </p>
          <Rows
            rows={[
              ["Pass number", <span key="n" className="font-mono tracking-wide">{pass.passNumber}</span>],
              ["Issued", <DeskDate key="i" iso={pass.issuedAt} />],
              ["Full name", pass.legalName],
              ["Date of birth", pass.dateOfBirth ? `${formatDate(pass.dateOfBirth, "long")}${age !== null ? ` · ${age} years` : ""}` : null],
              ["Address", pass.address ? `${pass.address}${pass.pincode ? ` — ${pass.pincode}` : ""}` : null],
              ["Government ID", pass.idType ? PRESS_ID_TYPE_LABELS[pass.idType] : null],
              ["ID number", pass.idNumber ? <span className="font-mono tracking-wide">{formatIdNumber(pass.idType, pass.idNumber)}</span> : null],
              ["Mobile", pass.mobile ? formatMobile(pass.mobile) : null],
              ["Background", reporterTypeLabel(pass)],
              ["Experience", experienceLabel(pass.experience)],
              ["Region", region || null],
              ["Reports in", pass.languages.length > 0 ? languageLabels(pass.languages).join(", ") : null],
              ["About", pass.about],
              [
                "Links",
                pass.links.length > 0 ? (
                  <span className="flex flex-col gap-0.5">
                    {pass.links.map((link) => (
                      <a key={link} href={link} target="_blank" rel="noreferrer" className="break-all text-brand hover:underline">
                        {link}
                      </a>
                    ))}
                  </span>
                ) : null,
              ],
              ["Pledge", pass.pledgeSignedAt ? <span>Signed <DeskDate iso={pass.pledgeSignedAt} />{pass.pledgeSignature ? ` · “${pass.pledgeSignature}”` : ""}</span> : null],
            ]}
          />
        </Section>
      )}

      <Section title="Logins" icon={<MonitorSmartphone aria-hidden className="size-3.5" />}>
        {data.sessions.length === 0 ? (
          <p className="text-sm text-muted">No logins on record.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {data.sessions.map((s) => (
              <li key={s.createdAt + (s.ip ?? "")} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3.5 py-2.5 text-sm">
                <span className="flex min-w-0 flex-col">
                  <span className="flex flex-wrap items-center gap-2">
                    <ViaChip app={isApp(s.userAgent)} />
                    <span className="font-semibold text-ink" title={s.userAgent ?? undefined}>
                      {deviceOf(s.userAgent)}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-muted">{s.ip ?? "IP not recorded"}</span>
                </span>
                <span className="flex flex-col items-end text-xs text-muted">
                  <span>
                    Signed in <DeskDate iso={s.createdAt} style="date-time" />
                  </span>
                  <span>{s.current ? <Chip tone="live">Signed in now</Chip> : <>Ended</>}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="IP addresses from activity" icon={<Globe aria-hidden className="size-3.5" />}>
        {data.ips.length === 0 ? (
          <p className="text-sm text-muted">No activity recorded yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {data.ips.map((r) => (
              <li key={r.ip} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3.5 py-2.5 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  {[...r.via].sort().reverse().map((v) => (
                    <ViaChip key={v} app={v === "app"} />
                  ))}
                  <span className="font-mono text-ink">{r.ip}</span>
                </span>
                <span className="text-xs text-muted">
                  {r.events} {r.events === 1 ? "tap" : "taps"} · <DeskDate iso={r.firstSeen} /> – <DeskDate iso={r.lastSeen} />
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs leading-relaxed text-muted">
          Device MAC addresses can&rsquo;t be seen: phones and browsers never share them with websites or apps. The device above
          is the browser or app they used.
        </p>
      </Section>
    </div>
  );
}

/** Opens for `userId` (null = closed). */
export function PersonDetailModal({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const query = useQuery({
    queryKey: ["admin", "person", userId],
    queryFn: ({ signal }) => api.admin.personDetail(userId as string, signal),
    enabled: userId !== null,
  });
  return (
    <Modal
      open={userId !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Profile details"
      size="lg"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      {query.isPending ? (
        <ListLoading />
      ) : query.isError ? (
        <ListError message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <Body data={query.data} />
      )}
    </Modal>
  );
}
