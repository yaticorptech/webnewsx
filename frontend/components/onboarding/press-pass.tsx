"use client";

import { AnimatePresence, motion } from "motion/react";
import { Logo } from "@/components/brand/logo";
import { SpeedBarsSvg, SpeedLines } from "@/components/brand/speed-lines";
import { UserHandle } from "@/components/brand/user-handle";
import { cn, initialsOf } from "@/lib/utils";

export type PressPassProps = {
  username: string;
  name: string;
  bio: string;
  image: string | null;
  className?: string;
};

const EASE = [0.2, 0.8, 0.2, 1] as const;

/**
 * Live preview of the profile being set up, styled as a press credential: white card, pink issuer
 * strip with the wordmark, round portrait in a red ring, pink stats band. Purely presentational — it
 * mirrors the form as you type.
 */
export function PressPass({ username, name, bio, image, className }: PressPassProps) {
  const displayName = name.trim();
  const displayBio = bio.trim();

  return (
    <figure
      aria-label="Preview of your profile"
      className={cn("relative overflow-hidden rounded-2xl border border-border bg-surface text-ink shadow-pop", className)}
    >
      <div className="relative flex items-center justify-between gap-3 overflow-hidden border-b border-tint-border bg-tint px-5 py-3.5">
        <div aria-hidden className="bg-speed-lines absolute inset-0" />
        <span className="kicker relative flex items-center gap-2 text-brand">
          <SpeedLines className="text-[0.8rem]" />
          Press pass
        </span>
        <Logo height={13} alt="WebNEWS" className="relative" />
      </div>

      <div className="relative px-5 pb-5 pt-6">
        <div className="flex items-center gap-4">
          <div className="relative size-22 shrink-0">
            {/* A round red ring (owner 2026-09-29), like the press pass and the profile portrait. */}
            <span aria-hidden className="absolute -inset-1 rounded-full bg-brand" />
            <span className="absolute inset-0 overflow-hidden rounded-full border-2 border-white bg-tint">
              <AnimatePresence mode="popLayout" initial={false}>
                {image ? (
                  <motion.img
                    key={image}
                    src={image}
                    alt=""
                    width={88}
                    height={88}
                    referrerPolicy="no-referrer"
                    initial={{ opacity: 0, scale: 1.1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35, ease: EASE }}
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : (
                  <motion.span
                    key="initials"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex items-center justify-center font-wide text-2xl font-extrabold text-brand"
                  >
                    {displayName || username ? initialsOf(displayName || username) : <SpeedBarsSvg className="h-7 w-auto text-tint-border" />}
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
          </div>
          <div className="min-w-0">
            <p
              className={cn(
                "font-wider text-[1.375rem] leading-[1.05] font-black tracking-[-0.02em] wrap-break-word",
                displayName ? "text-ink" : "text-muted-2",
              )}
            >
              {displayName || "Your name"}
            </p>
            <p className={cn("mt-1.5 flex min-w-0 text-sm font-semibold", username ? "text-brand" : "text-muted-2")}>
              <UserHandle username={username || "your.name"} truncate />
            </p>
          </div>
        </div>

        <p
          className={cn(
            "mt-5 min-h-18 text-[0.9375rem] leading-relaxed whitespace-pre-line wrap-break-word",
            displayBio ? "text-ink-2" : "text-muted-2",
          )}
        >
          {displayBio || "Your bio appears here: who you are, what you cover, where you file from."}
        </p>

        <dl className="mt-5 grid grid-cols-3 rounded-xl border border-tint-border bg-tint py-3.5 text-center">
          {["Articles", "Followers", "Following"].map((label, index) => (
            <div key={label} className="relative flex flex-col">
              {index > 0 && <span aria-hidden className="absolute inset-y-1 left-0 w-px bg-tint-border" />}
              <dt className="order-2 mt-1 text-[0.625rem] font-bold tracking-[0.16em] text-muted uppercase">{label}</dt>
              <dd className="-order-1 font-wider text-xl leading-none font-black text-brand">0</dd>
            </div>
          ))}
        </dl>
      </div>
    </figure>
  );
}
