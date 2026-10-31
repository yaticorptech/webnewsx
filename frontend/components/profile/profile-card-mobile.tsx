"use client";

import { Globe, MapPin, PenLine, UsersRound } from "lucide-react";
import Link from "next/link";
import { UserHandle } from "@/components/brand/user-handle";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import { FollowButton } from "@/components/follow/follow-button";
import { BackButton } from "@/components/layout/back-button";
import { MessageButton } from "@/components/messages/message-button";
import { languageLabels, regionLabel } from "@/components/presspass/press-format";
import { compactNumber } from "@/lib/format";
import type { ProfileData } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { ProfileAvatar } from "./profile-avatar";
import { ShareProfileButton } from "./share-profile-button";
import type { FollowListKind } from "./stats-band";

type Props = {
  user: ProfileData["user"];
  isSelf: boolean;
  initialFollowing: boolean;
  verified: boolean;
  counts: ProfileData["counts"];
  press: ProfileData["press"];
  onOpenList: (kind: FollowListKind) => void;
  onShowArticles?: () => void;
};

/**
 * The profile on phones and in the app (owner 2026-10-31, from their mockup): the red curved PROFILE panel on the left,
 * the WebNewsX logo, the globe / NEWS wall / skyline art on the right, the framed square portrait with the name and
 * @handle beside it, then Location · Languages and Articles · Followers · Following in two soft cards, and the actions.
 * Wider screens keep the plain white header (profile-header.tsx).
 */
export function ProfileCardMobile({ user, isSelf, initialFollowing, verified, counts, press, onOpenList, onShowArticles }: Props) {
  const region = press ? regionLabel(press) : null;
  const languages = press ? languageLabels(press.languages) : [];
  const stats = [
    { label: "Articles", value: counts.articles, onClick: onShowArticles },
    { label: "Followers", value: counts.followers, onClick: () => onOpenList("followers") },
    { label: "Following", value: counts.following, onClick: () => onOpenList("following") },
  ];

  return (
    <section
      aria-labelledby="profile-name-m"
      className="relative isolate overflow-hidden rounded-[1.75rem] bg-[#fbfafa] shadow-[0_10px_30px_-18px_rgb(80_0_10/0.45)] ring-1 ring-black/5"
    >
      {/* The art: globe, NEWS wall and skyline, fading into the card. */}
      <img
        src="/brand/profile-art.webp"
        alt=""
        aria-hidden
        className="pointer-events-none absolute right-0 top-[7%] -z-10 w-[64%] [mask-image:linear-gradient(to_left,black_55%,transparent),linear-gradient(to_top,transparent_0%,black_30%)] [mask-composite:intersect]"
      />
      {/* A faint dotted world behind the logo. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-20 h-[34%] bg-[radial-gradient(#d4d4d8_1px,transparent_1.2px)] bg-size-[7px_7px] opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />

      {/* The red PROFILE panel, its right edge curving out towards the bottom. */}
      <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-y-0 left-0 -z-10 h-full w-[21%]">
        <defs>
          <linearGradient id="pc-red" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0" stopColor="#e3262f" />
            <stop offset="0.55" stopColor="#b3121b" />
            <stop offset="1" stopColor="#5a080d" />
          </linearGradient>
        </defs>
        <path d="M0 0 H44 C58 30 58 62 72 82 C80 92 88 97 100 100 H0 Z" fill="url(#pc-red)" />
      </svg>
      <div aria-hidden className="absolute bottom-[34%] left-[3.2%] flex flex-col items-center gap-3">
        <span className="whitespace-nowrap text-[0.7rem] font-semibold uppercase tracking-[0.5em] text-white/95 [writing-mode:vertical-rl] rotate-180">
          {press ? "Press profile" : "Profile"}
        </span>
        <span className="h-6 w-0.5 rounded bg-[#ff5a5f]" />
      </div>
      <span aria-hidden className="absolute bottom-6 left-[3.5%] h-0.5 w-6 rounded bg-[#ff5a5f]" />

      <div className="relative pb-5 pl-[23%] pr-4 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div data-own-back="" data-app-no-back="" className="-ml-1">
            <BackButton fallback="/" plain />
          </div>
          <ShareProfileButton
            username={user.username}
            name={user.name}
            image={user.image}
            compact
            iconOnly
            className="size-9 bg-white/80 backdrop-blur"
          />
        </div>

        <img src="/brand/logo-light.png" alt="WebNewsX — Pulse of People" className="mt-1 block w-[78%] max-w-[17rem]" />

        <div className="mt-5 flex items-end gap-3">
          <ProfileAvatar src={user.image} name={user.name} shape="card" large className="shrink-0" />
          <div className="min-w-0 pb-1">
            <h1
              id="profile-name-m"
              className="flex min-w-0 items-center gap-1.5 font-wide text-[clamp(1.35rem,6.4vw,1.9rem)] font-black leading-tight text-ink"
            >
              <span className="truncate">{user.name}</span>
              {verified && <VerifiedBadge size={20} className="shrink-0" />}
            </h1>
            <p className="mt-0.5 truncate text-[0.95rem] font-bold text-brand">
              <UserHandle username={user.username} truncate />
            </p>
          </div>
        </div>

        {(region || languages.length > 0) && (
          <div className="mt-4 grid grid-cols-2 divide-x divide-border rounded-2xl bg-white/90 py-3 shadow-[0_6px_18px_-12px_rgb(0_0_0/0.35)] ring-1 ring-black/5 backdrop-blur">
            <Detail icon={<MapPin aria-hidden className="size-5" />} label="Location" value={region ?? "—"} />
            <Detail icon={<Globe aria-hidden className="size-5" />} label="Languages" value={languages.join(", ") || "—"} />
          </div>
        )}

        <ul
          aria-label="Profile stats"
          className="mt-3 grid grid-cols-3 divide-x divide-border rounded-2xl bg-white/90 py-3 shadow-[0_6px_18px_-12px_rgb(0_0_0/0.35)] ring-1 ring-black/5 backdrop-blur"
        >
          {stats.map((s) => {
            const inner = (
              <>
                <span className="block font-wide text-xl font-black leading-none text-ink">{compactNumber(s.value)}</span>
                <span className="mt-1 block text-[0.8rem] text-ink-2">{s.label}</span>
              </>
            );
            return (
              <li key={s.label} className="text-center">
                {s.onClick ? (
                  <button type="button" onClick={s.onClick} className="w-full rounded-lg py-0.5 hover:text-brand">
                    {inner}
                  </button>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>

        {user.bio && <p className="mt-3 line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-ink-2 wrap-anywhere">{user.bio}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {isSelf ? (
            <>
              <Link
                href="/settings/profile"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand px-3 text-[0.95rem] font-bold text-brand-contrast shadow-[0_8px_18px_-10px_rgb(200_16_30/0.7)] hover:bg-brand-strong"
              >
                <PenLine aria-hidden className="size-4.5" />
                Edit Profile
              </Link>
              <Link
                href="/press-meet"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-brand/70 bg-white px-3 text-[0.95rem] font-bold text-brand hover:bg-tint"
              >
                <UsersRound aria-hidden className="size-4.5" />
                Press Meet
              </Link>
            </>
          ) : (
            <>
              <FollowButton username={user.username} initialFollowing={initialFollowing} className="h-12 min-w-0 rounded-2xl" />
              <MessageButton
                username={user.username}
                className={cn("h-12 min-w-0 rounded-2xl border-2 border-brand/70 bg-white text-brand hover:bg-tint")}
              />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 px-3">
      <span className="shrink-0 text-brand">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[0.62rem] font-bold uppercase tracking-[0.18em] text-muted">{label}</span>
        <span className="block truncate text-[0.85rem] font-bold text-ink">{value}</span>
      </span>
    </div>
  );
}
