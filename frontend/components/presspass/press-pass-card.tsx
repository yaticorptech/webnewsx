"use client";

import { Globe, MapPin } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import QRCode from "qrcode";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { UserHandle } from "@/components/brand/user-handle";
import { VerifiedBadge } from "@/components/brand/verified-badge";
import type { PressLanguage, ReporterLevel } from "@/lib/shared/contracts";
import { cn, initialsOf } from "@/lib/utils";
import { barcodeBars, languageLabels, passDate } from "./press-format";
import { CARD_ART, CARD_H, CARD_W, cq, fs, LAYOUT, passVerifyUrl, px, py, rect, type Patch as PatchRect } from "./press-pass-layout";

/** Everything the ID card prints — built from a `PressPass` or from the application form (preview). */
export type PressPassCardData = {
  passNumber: string;
  level: ReporterLevel;
  /** `preview` = the application's live mock-up (no pass number yet). */
  status: "active" | "revoked" | "preview";
  holder: { name: string; username: string; image: string | null };
  region: string | null;
  languages: readonly PressLanguage[];
  issuedAt: string | null;
  /** Editor Desk accounts get an extra line on the card. */
  editorDesk?: boolean;
  /** The Reporter Pledge is signed (printed on the downloaded card). */
  pledgeSigned?: boolean;
};

export type PressPassCardProps = {
  data: PressPassCardData;
  /** Play the issue sequence (rise + shine). Default true. */
  animateIn?: boolean;
  /** Form mock-up: empty fields show what to fill in ("Your region") instead of "—". */
  hints?: boolean;
  className?: string;
};

const EASE = [0.16, 1, 0.3, 1] as const;

/** The name shrinks for long names so it stays clear of the globe. */
function nameSize(name: string): number {
  const base = LAYOUT.name.size;
  if (name.length <= 10) return base;
  if (name.length <= 15) return Math.round(base * 0.72);
  return Math.round(base * 0.58);
}

/**
 * The Press Pass ID card, the owner's reference (2026-10-08, "same to same"): the reference artwork fills the card —
 * the red panel with PRESS PASS, the wordmark and DIGITAL NEWS NETWORK, the red globe, the skyline, the NEWS wall,
 * PEOPLE · STORIES · IMPACT, the QR with SCAN TO VERIFY — and the holder's own details sit over it where the
 * reference's sample ones were (press-pass-layout.ts): the portrait, REPORTER · name (with the Verified badge as it
 * is everywhere else — owner: unchanged) · handle (no level chip — owner 2026-10-09), region and languages, pass number,
 * issue date and the barcode. Issue sequence: the card rises in 3D and a sheen sweeps across; it stays still under
 * the pointer (owner 2026-10-08). Reduced motion: a plain fade.
 */
export function PressPassCard({ data, animateIn = true, hints = false, className }: PressPassCardProps) {
  const reduce = useReducedMotion() ?? false;
  const [portraitFailed, setPortraitFailed] = useState<string | null>(null);
  const revoked = data.status === "revoked";
  const preview = data.status === "preview";
  const verified = !revoked && !preview && data.level === "verified";
  const showImage = Boolean(data.holder.image) && portraitFailed !== data.holder.image;
  const languages = languageLabels(data.languages);
  const play = animateIn && !reduce;
  const name = data.holder.name || "Your name";
  const label = `WebNEWS Global Press Pass${preview ? " preview" : ""} — ${data.holder.name}, ${data.level === "verified" ? "Verified" : "Trainee"} reporter`;
  const portrait = (
    <>
      <span aria-hidden className="font-wider font-black uppercase text-brand" style={{ fontSize: fs(96, 1.5) }}>
        {initialsOf(data.holder.name)}
      </span>
      {showImage && data.holder.image && (
        <img
          src={data.holder.image}
          alt=""
          width={331}
          height={353}
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          ref={(img) => {
            if (img?.complete && img.naturalWidth === 0) setPortraitFailed(data.holder.image);
          }}
          onError={() => setPortraitFailed(data.holder.image)}
          className="absolute inset-0 size-full bg-tint object-cover text-transparent"
        />
      )}
    </>
  );
  const frame = { label, animateIn, reduce, revoked, play };

  const small: CSSProperties = { fontSize: fs(LAYOUT.smallLabel, 0.5), letterSpacing: "0.2em" };
  const value: CSSProperties = { fontSize: fs(LAYOUT.value, 0.625) };

  return (
    <div className={cn("perspective-distant", className)}>
      <CardFrame
        {...frame}
        style={{ aspectRatio: `${CARD_W} / ${CARD_H}`, borderRadius: `max(0.75rem, ${((32 / CARD_W) * 100).toFixed(3)}cqw)` }}
        // --pp-floor: text size floors (press-pass-layout.ts `fs`) apply from 640px; on phones the card is the desktop one
        // scaled down whole, like a photo of it (owner 2026-10-09: "same like the desktop ID card").
        className="@container bg-[#fdf6f6] text-ink leading-none [--pp-floor:0] sm:[--pp-floor:1]"
      >
        {/* The reference artwork. */}
        <img src={CARD_ART} alt="" width={CARD_W} height={CARD_H} decoding="async" draggable={false} className="absolute inset-0 size-full object-cover" />

        {/* Flat patches over the reference's sample details, their edges feathered into the artwork. */}
        <Patch r={LAYOUT.namePatch} />
        <Patch r={LAYOUT.rowPatch} />
        <Patch r={LAYOUT.passPatch} />
        <Patch r={LAYOUT.barcodePatch} />

        {/* Portrait */}
        <div
          className="absolute flex items-center justify-center overflow-hidden bg-tint shadow-[0_1.2cqw_2.4cqw_-1.2cqw_rgb(0_0_0/0.35)]"
          style={{ ...rect(LAYOUT.photo), borderRadius: `${((LAYOUT.photo.radius / CARD_W) * 100).toFixed(3)}cqw` }}
        >
          {portrait}
        </div>

        {/* REPORTER · name + badge · handle */}
        <p
          className="absolute font-bold uppercase text-[#e30613]"
          style={{ left: px(LAYOUT.reporterLabel.x), top: py(LAYOUT.reporterLabel.top), fontSize: fs(LAYOUT.reporterLabel.size), letterSpacing: "0.22em" }}
        >
          {data.editorDesk ? "Editor Desk · Reporter" : "Reporter"}
        </p>
        <p
          className="absolute flex items-center font-wider font-black tracking-[-0.02em] text-ink"
          style={{ left: px(LAYOUT.name.x), top: py(LAYOUT.name.top), maxWidth: px(LAYOUT.name.maxW), fontSize: fs(nameSize(name), 1), gap: "0.5em" }}
        >
          <span className="min-w-0 truncate" title={name}>
            {name}
          </span>
          {verified && <VerifiedBadge size={20} className="shrink-0" />}
        </p>
        <p
          className="absolute flex min-w-0 font-bold text-[#e30613]"
          style={{ left: px(LAYOUT.handle.x), top: py(LAYOUT.handle.top), maxWidth: px(LAYOUT.name.maxW), fontSize: fs(LAYOUT.handle.size, 0.6875) }}
        >
          <UserHandle username={data.holder.username} truncate />
        </p>

        {/* Region · languages */}
        <MapPin aria-hidden className="absolute text-[#e30613]" style={rect(LAYOUT.pin)} strokeWidth={2.25} />
        <dl className="contents">
          <dt className="absolute font-bold uppercase text-muted" style={{ left: px(LAYOUT.region.x), top: py(LAYOUT.region.labelTop), ...small }}>
            Region
          </dt>
          <dd
            className="absolute truncate font-bold text-ink"
            style={{ left: px(LAYOUT.region.x), top: py(LAYOUT.region.valueTop), maxWidth: px(LAYOUT.region.maxW), ...value }}
          >
            {data.region ?? <span className="text-muted">{hints || preview ? "Your region" : "—"}</span>}
          </dd>
          <span aria-hidden className="absolute w-px bg-border-strong" style={{ left: px(LAYOUT.divider1.x), top: py(LAYOUT.divider1.y), height: py(LAYOUT.divider1.h) }} />
          <Globe aria-hidden className="absolute text-[#e30613]" style={rect(LAYOUT.globe)} strokeWidth={2} />
          <dt className="absolute font-bold uppercase text-muted" style={{ left: px(LAYOUT.languages.x), top: py(LAYOUT.languages.labelTop), ...small }}>
            Languages
          </dt>
          <dd
            className="absolute truncate font-bold text-ink"
            style={{ left: px(LAYOUT.languages.x), top: py(LAYOUT.languages.valueTop), maxWidth: px(LAYOUT.languages.maxW), ...value }}
          >
            {languages.length > 0 ? languages.join(", ") : <span className="text-muted">—</span>}
          </dd>

          {/* Pass number · issue date */}
          <dt className="absolute font-bold uppercase text-muted" style={{ left: px(LAYOUT.passNo.x), top: py(LAYOUT.passNo.labelTop), ...small }}>
            Pass no.
          </dt>
          <dd
            className="absolute font-wide font-extrabold tabular-nums tracking-[0.04em] text-ink"
            style={{ left: px(LAYOUT.passNo.x), top: py(LAYOUT.passNo.valueTop), fontSize: fs(LAYOUT.passNo.size, 0.8125) }}
            data-testid="press-pass-number"
          >
            {data.passNumber}
          </dd>
          <span aria-hidden className="absolute w-px bg-border-strong" style={{ left: px(LAYOUT.divider2.x), top: py(LAYOUT.divider2.y), height: py(LAYOUT.divider2.h) }} />
          <dt className="absolute font-bold uppercase text-muted" style={{ left: px(LAYOUT.issued.x), top: py(LAYOUT.passNo.labelTop), ...small }}>
            Issued on
          </dt>
          <dd
            className="absolute font-wide font-extrabold tabular-nums tracking-[0.04em] text-ink"
            style={{ left: px(LAYOUT.issued.x), top: py(LAYOUT.passNo.valueTop), fontSize: fs(LAYOUT.passNo.size, 0.8125) }}
          >
            {preview ? "On signing" : passDate(data.issuedAt)}
          </dd>
        </dl>

        <Barcode seed={data.passNumber} className="absolute text-ink" style={rect(LAYOUT.barcode)} />

        {/* The pass's own QR: scanning it opens the pass's verify page (owner 2026-10-31). */}
        {!preview && data.passNumber && (
          <>
            <Patch r={LAYOUT.qrPatch} />
            <PassQr passNumber={data.passNumber} />
          </>
        )}
      </CardFrame>
    </div>
  );
}

/** The card's figure: the issue sequence (rise + sheen), the greyed look when revoked, the test id. */
function CardFrame({
  label,
  animateIn,
  reduce,
  revoked,
  play,
  className,
  style,
  children,
}: {
  label: string;
  animateIn: boolean;
  reduce: boolean;
  revoked: boolean;
  play: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <motion.figure
      aria-label={label}
      data-testid="press-pass-card"
      initial={animateIn ? (reduce ? { opacity: 0 } : { opacity: 0, y: 28, rotateX: 18, scale: 0.96 }) : false}
      animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
      transition={reduce ? { duration: 0.2 } : { duration: 0.7, ease: EASE }}
      style={style}
      className={cn("relative isolate w-full overflow-hidden shadow-pop", revoked && "grayscale", className)}
    >
      {children}
      {/* Sheen: one sweep on issue. */}
      {play && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/2 z-20 w-1/2 -skew-x-12 bg-linear-to-r from-transparent via-white/70 to-transparent"
          initial={{ x: "0%" }}
          animate={{ x: "400%" }}
          transition={{ delay: 0.45, duration: 1.1, ease: "easeInOut" }}
        />
      )}
    </motion.figure>
  );
}

/** A patch with its edges feathered (a mask fading over `feather` card pixels on every side). */
function PassQr({ passNumber }: { passNumber: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void QRCode.toDataURL(passVerifyUrl(passNumber), { margin: 0, width: 360, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" } })
      .then((url) => live && setSrc(url))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [passNumber]);
  const q = LAYOUT.qr;
  const size = Math.min(q.w, q.h);
  if (!src) return null;
  return (
    <img
      src={src}
      alt={`QR code — scan to verify Press Pass ${passNumber}`}
      draggable={false}
      className="absolute"
      style={rect({ x: q.x + (q.w - size) / 2, y: q.y + (q.h - size) / 2, w: size, h: size })}
    />
  );
}

function Patch({ r }: { r: PatchRect }) {
  const f = cq(r.feather);
  const mask = `linear-gradient(to right, transparent, #000 ${f}, #000 calc(100% - ${f}), transparent), linear-gradient(to bottom, transparent, #000 ${f}, #000 calc(100% - ${f}), transparent)`;
  return (
    <div
      aria-hidden
      className="absolute [-webkit-mask-composite:source-in] [mask-composite:intersect]"
      style={{ ...rect(r), background: `linear-gradient(90deg, ${r.from}, ${r.to})`, maskImage: mask, WebkitMaskImage: mask }}
    />
  );
}

function Barcode({ seed, className, style }: { seed: string; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden className={className} style={style}>
      {barcodeBars(seed).map((bar, i) => (
        <rect key={i} x={bar.x} y={0} width={bar.w} height={32} fill="currentColor" />
      ))}
    </svg>
  );
}
