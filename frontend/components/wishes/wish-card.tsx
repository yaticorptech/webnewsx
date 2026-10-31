"use client";

import { CalendarDays, MapPin, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import type { WishKind, WishTemplate } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/** What a card needs — a posted wish, or the composer's live preview. */
export type WishCardData = {
  kind: WishKind;
  template: WishTemplate;
  title: string;
  message: string | null;
  photoUrl: string | null;
  eventAt: string | null;
  venue: string | null;
  author: { username: string; name: string; image: string | null };
};

/**
 * The look of each design (owner 2026-10-31: "simple templates"): a background, the heading's colour and a few
 * decorations. Birthday: Confetti · Balloons · Classic. Invitation: Elegant · Festive · Minimal.
 */
const DESIGNS: Record<
  Exclude<WishTemplate, "photo" | "party" | "custom" | "flyer">,
  { bg: string; ink: string; muted: string; accent: string; heading: string; frame?: string }
> = {
  confetti: {
    bg: "bg-[linear-gradient(160deg,#fff1e6_0%,#ffd6e0_55%,#ffc4a8_100%)]",
    ink: "text-[#3b1f2b]",
    muted: "text-[#6d4252]",
    accent: "text-[#e0475f]",
    heading: "Happy Birthday",
  },
  balloons: {
    bg: "bg-[linear-gradient(165deg,#eef4ff_0%,#e3dcff_60%,#ffe3f1_100%)]",
    ink: "text-[#22224a]",
    muted: "text-[#4d4c7a]",
    accent: "text-[#6a4cff]",
    heading: "Happy Birthday",
  },
  classic: {
    bg: "bg-[#fbf6ec]",
    ink: "text-[#2b2116]",
    muted: "text-[#6b5a43]",
    accent: "text-[#b0802b]",
    heading: "Happy Birthday",
    frame: "ring-2 ring-inset ring-[#d8b46a]/70",
  },
  elegant: {
    bg: "bg-[#fbf8f1]",
    ink: "text-[#1f1b16]",
    muted: "text-[#625746]",
    accent: "text-[#a77a2a]",
    heading: "You're Invited",
    frame: "ring-1 ring-inset ring-[#c9a45c]/80",
  },
  festive: {
    bg: "bg-[linear-gradient(160deg,#6b0f1f_0%,#8f1d2c_55%,#b5452a_100%)]",
    ink: "text-[#fff6e6]",
    muted: "text-[#f6d9b8]",
    accent: "text-[#ffc247]",
    heading: "You're Invited",
  },
  minimal: {
    bg: "bg-white",
    ink: "text-ink",
    muted: "text-muted",
    accent: "text-brand",
    heading: "Invitation",
    frame: "ring-1 ring-inset ring-border",
  },
};

function Decorations({ template }: { template: WishTemplate }) {
  if (template === "confetti") {
    const dots = [
      ["8%", "12%", "#ff8fa3", 10],
      ["88%", "10%", "#ffd166", 8],
      ["15%", "78%", "#06d6a0", 9],
      ["82%", "70%", "#118ab2", 7],
      ["50%", "6%", "#ef476f", 6],
      ["94%", "42%", "#ff9f1c", 9],
      ["4%", "45%", "#8338ec", 7],
      ["70%", "90%", "#ff8fa3", 8],
    ] as const;
    return (
      <>
        {dots.map(([left, top, color, size], i) => (
          <span
            key={i}
            aria-hidden
            className="absolute rotate-12 rounded-[2px]"
            style={{ left, top, width: size, height: size * 1.8, background: color, opacity: 0.85 }}
          />
        ))}
      </>
    );
  }
  if (template === "balloons") {
    return (
      <svg aria-hidden viewBox="0 0 120 160" className="absolute -right-2 top-2 h-[58%] opacity-90">
        {[
          [30, 40, "#ff7aa8"],
          [62, 28, "#7c6cff"],
          [92, 46, "#ffb84d"],
        ].map(([cx, cy, fill], i) => (
          <g key={i}>
            <ellipse cx={cx} cy={cy} rx="16" ry="20" fill={fill as string} />
            <path d={`M${cx} ${Number(cy) + 20} q -4 30 6 70`} stroke="#9aa0b8" strokeWidth="1" fill="none" />
          </g>
        ))}
      </svg>
    );
  }
  if (template === "festive") {
    return (
      <>
        <span aria-hidden className="absolute inset-x-0 top-0 h-2 bg-[repeating-linear-gradient(90deg,#ffc247_0_14px,#ff8a3d_14px_28px)]" />
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-2 bg-[repeating-linear-gradient(90deg,#ffc247_0_14px,#ff8a3d_14px_28px)]"
        />
      </>
    );
  }
  return null;
}

const eventWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * "Full photo" (owner 2026-10-31): the photo fills the card and the wishes sit over its bottom on a dark fade. Without a
 * photo yet, a warm gradient with a hint holds its place.
 */
function PhotoArt({ data, className }: { data: WishCardData; className?: string }) {
  const birthday = data.kind === "birthday";
  return (
    <div className={cn("relative isolate flex aspect-[4/5] w-full flex-col justify-end overflow-hidden rounded-2xl text-white", className)}>
      {data.photoUrl ? (
        <img src={data.photoUrl} alt="" className="absolute inset-0 -z-20 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 -z-20 flex items-start justify-center bg-[linear-gradient(160deg,#f6b8c4_0%,#c9a2f2_50%,#7a5cc7_100%)] pt-[18%] text-sm font-semibold text-white/85">
          Add a photo — it fills the card
        </div>
      )}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-10 h-[68%] bg-[linear-gradient(to_top,rgb(10_6_14/0.92)_0%,rgb(10_6_14/0.72)_45%,transparent_100%)]"
      />
      {birthday && (
        <span aria-hidden className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-[#e0475f] shadow">
          🎂 Birthday
        </span>
      )}
      <div className="px-6 pb-6 pt-10 text-left">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.3em] text-[#ffc6d0]">
          {birthday ? "Wishing you a" : "You're invited"}
        </p>
        {birthday && (
          <p className="mt-1 font-serif text-[clamp(1.6rem,5vw,2.3rem)] font-bold italic leading-none text-[#ffd166]">Happy Birthday</p>
        )}
        {data.title && (
          <h3 className="mt-2 line-clamp-2 font-wide text-[clamp(1.4rem,4.6vw,2rem)] font-black leading-tight">{data.title}</h3>
        )}
        {!birthday && data.eventAt && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-white/95">
            <CalendarDays aria-hidden className="size-4" />
            {eventWhen(data.eventAt)}
          </p>
        )}
        {!birthday && data.venue && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-white/85">
            <MapPin aria-hidden className="size-4 shrink-0" />
            {data.venue}
          </p>
        )}
        {data.message && (
          <p className="mt-2.5 line-clamp-3 whitespace-pre-line text-[0.92rem] leading-relaxed text-white/90">{data.message}</p>
        )}
      </div>
    </div>
  );
}

function Balloon({ x, y, color, scale = 1 }: { x: number; y: number; color: string; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M0 24 q -6 22 4 44" stroke="#8a8a8a" strokeWidth="1" fill="none" />
      <ellipse cx="0" cy="0" rx="17" ry="21" fill={color} />
      <ellipse cx="-6" cy="-8" rx="4" ry="6" fill="#fff" opacity="0.45" />
      <path d="M-3 20 h6 l-3 5 z" fill={color} />
    </g>
  );
}

const PARTY_LETTERS = ["#f59e0b", "#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#f97316", "#10b981"];

/**
 * "Party" (owner 2026-10-31, from their reference): a cream card with confetti, balloon bunches in the top corners,
 * a colourful script "Happy Birthday", the photo in a golden arch, the name on a ribbon and a row of balloons and stars
 * along the bottom.
 */
function PartyArt({ data, className }: { data: WishCardData; className?: string }) {
  const word = (text: string, offset: number) =>
    [...text].map((ch, i) => (
      <span key={i} style={{ color: PARTY_LETTERS[(i + offset) % PARTY_LETTERS.length] }}>
        {ch}
      </span>
    ));
  return (
    <div
      className={cn("relative isolate flex aspect-[4/5] w-full flex-col items-center overflow-hidden rounded-2xl bg-[#fff3c4] [container-type:inline-size]", className)}
    >
      {/* Confetti and the balloon bunches. */}
      <svg aria-hidden viewBox="0 0 400 500" preserveAspectRatio="none" className="absolute inset-0 -z-10 size-full">
        {[
          [30, 40, "#f472b6"],
          [120, 20, "#60a5fa"],
          [210, 50, "#fbbf24"],
          [300, 25, "#a78bfa"],
          [370, 70, "#34d399"],
          [20, 160, "#fb7185"],
          [380, 180, "#60a5fa"],
          [15, 300, "#a78bfa"],
          [385, 320, "#f472b6"],
          [60, 230, "#fbbf24"],
          [345, 250, "#34d399"],
        ].map(([cx, cy, fill], i) => (
          <rect
            key={i}
            x={Number(cx)}
            y={Number(cy)}
            width="7"
            height="12"
            rx="2"
            fill={fill as string}
            transform={`rotate(${i * 37} ${cx} ${cy})`}
            opacity="0.85"
          />
        ))}
        {[
          [55, 120],
          [340, 135],
          [90, 330],
          [320, 360],
        ].map(([x, y], i) => (
          <path key={`s${i}`} d={`M${x} ${y - 7} l2 5 5 1 -4 3 1 5 -4 -3 -4 3 1 -5 -4 -3 5 -1z`} fill={i % 2 ? "#60a5fa" : "#f472b6"} />
        ))}
        <Balloon x={52} y={52} color="#c084fc" />
        <Balloon x={80} y={40} color="#f472b6" />
        <Balloon x={104} y={58} color="#2dd4bf" scale={0.9} />
        <Balloon x={300} y={58} color="#fbbf24" scale={0.9} />
        <Balloon x={326} y={40} color="#ef4444" />
        <Balloon x={354} y={56} color="#22c55e" />
      </svg>

      <p className="relative mt-[6%] w-full text-center font-serif text-[9cqw] font-black italic leading-[0.95] [text-shadow:0_2px_0_#fff,0_3px_6px_rgb(0_0_0/0.15)]">
        <span className="block">{word("Happy", 0)}</span>
        <span className="block text-[1.25em]">{word("Birthday", 3)}</span>
      </p>

      {/* The photo in a golden arch. */}
      <div className="relative mt-[4%] aspect-[4/5] w-[68%] overflow-hidden rounded-t-[999px] rounded-b-[18px] border-[5px] border-[#f6c453] bg-[#fde68a] shadow-[0_8px_20px_-8px_rgb(0_0_0/0.3)]">
        {data.photoUrl ? (
          <img src={data.photoUrl} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center px-4 text-center text-xs font-semibold text-[#9a6b00]">
            Add a photo
          </span>
        )}
      </div>

      {/* The name on a ribbon, the balloon row under it. */}
      <div className="absolute inset-x-0 bottom-0 h-[24%]">
        <svg aria-hidden viewBox="0 0 400 120" preserveAspectRatio="none" className="absolute inset-0 size-full">
          <path d="M0 40 Q200 0 400 40 L400 120 L0 120 Z" fill="#fff8dc" />
          {[
            [30, "#fbbf24"],
            [85, "#f472b6"],
            [140, "#fb923c"],
            [200, "#4ade80"],
            [260, "#f87171"],
            [315, "#fbbf24"],
            [370, "#a3e635"],
          ].map(([cx, fill], i) => (
            <g key={i}>
              <ellipse cx={Number(cx)} cy={112} rx="34" ry="30" fill={fill as string} />
              <ellipse cx={Number(cx) - 10} cy={98} rx="8" ry="6" fill="#fff" opacity="0.5" />
            </g>
          ))}
          <path d="M12 48 l10 22 24 3 -18 16 5 24 -21 -12 -21 12 5 -24 -18 -16 24 -3z" fill="#facc15" transform="translate(0 -10)" />
          <path d="M378 48 l10 22 24 3 -18 16 5 24 -21 -12 -21 12 5 -24 -18 -16 24 -3z" fill="#f97316" transform="translate(-22 -10)" />
        </svg>
        <p className="absolute inset-x-[14%] top-[16%] truncate text-center font-serif text-[8cqw] font-black italic text-[#e0475f]">
          {data.title}
        </p>
      </div>
    </div>
  );
}

/**
 * "Flyer" (owner 2026-10-31, from their reference): the photo full-bleed with soft balloon bokeh over its top, a dark
 * fade below, a big silver HAPPY with a script Birthday (or "You're invited" + the event) and the details in small caps.
 */
function FlyerArt({ data, className }: { data: WishCardData; className?: string }) {
  const birthday = data.kind === "birthday";
  const bokeh = [
    ["6%", "6%", "#fb923c", "22%"],
    ["78%", "2%", "#60a5fa", "20%"],
    ["62%", "14%", "#f9a8d4", "16%"],
    ["-4%", "30%", "#f9a8d4", "18%"],
    ["84%", "28%", "#fdba74", "14%"],
    ["30%", "-4%", "#c4b5fd", "14%"],
  ] as const;
  return (
    <div
      className={cn(
        "relative isolate flex aspect-[4/5] w-full flex-col justify-end overflow-hidden rounded-2xl bg-[linear-gradient(180deg,#f8c9a8_0%,#f3a37f_45%,#2a1c26_100%)] text-white [container-type:inline-size]",
        className,
      )}
    >
      {data.photoUrl ? (
        <img src={data.photoUrl} alt="" className="absolute inset-0 -z-20 size-full object-cover" />
      ) : (
        <span className="absolute inset-x-0 top-[30%] -z-20 text-center text-sm font-semibold text-white/85">
          Add a photo — it fills the card
        </span>
      )}
      {bokeh.map(([left, top, color, size], i) => (
        <span
          key={i}
          aria-hidden
          className="absolute -z-10 rounded-full opacity-70 mix-blend-screen blur-[1px]"
          style={{
            left,
            top,
            width: size,
            aspectRatio: "4 / 5",
            background: `radial-gradient(circle at 35% 30%, #fff 0%, ${color} 35%, ${color}00 72%)`,
          }}
        />
      ))}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-10 h-[62%] bg-[linear-gradient(to_top,rgb(18_10_20/0.95)_0%,rgb(18_10_20/0.7)_45%,transparent_100%)]"
      />
      <div className="px-[7%] pb-[7%] text-center">
        {birthday ? (
          <>
            <p className="bg-[linear-gradient(180deg,#ffffff_0%,#e9e4ee_45%,#9f97a8_100%)] bg-clip-text font-wide text-[19cqw] font-black uppercase leading-[0.85] tracking-[0.04em] text-transparent [filter:drop-shadow(0_3px_4px_rgb(0_0_0/0.45))]">
              Happy
            </p>
            <p className="-mt-[2cqw] font-serif text-[10cqw] font-semibold italic leading-none text-white [text-shadow:0_2px_6px_rgb(0_0_0/0.5)]">
              Birthday
            </p>
            <p className="mt-[3cqw] truncate font-wide text-[6.5cqw] font-black uppercase tracking-[0.06em] text-[#ffd8a8]">{data.title}</p>
          </>
        ) : (
          <>
            <p className="text-[3.2cqw] font-bold uppercase tracking-[0.3em] text-[#ffd8a8]">You&rsquo;re invited</p>
            <p className="mt-[1.5cqw] line-clamp-2 bg-[linear-gradient(180deg,#ffffff_0%,#e9e4ee_50%,#a49cad_100%)] bg-clip-text font-wide text-[10cqw] font-black uppercase leading-[0.95] text-transparent [filter:drop-shadow(0_3px_4px_rgb(0_0_0/0.45))]">
              {data.title}
            </p>
          </>
        )}
        {data.message && (
          <p className="mx-auto mt-[2.5cqw] line-clamp-2 max-w-[90%] text-[3.4cqw] font-semibold uppercase tracking-[0.04em] text-white/90">
            {data.message}
          </p>
        )}
        {!birthday && (data.eventAt || data.venue) && (
          <p className="mt-[2cqw] text-[3.4cqw] font-semibold uppercase tracking-[0.04em] text-white/90">
            {[data.eventAt ? eventWhen(data.eventAt) : null, data.venue].filter(Boolean).join("  |  ")}
          </p>
        )}
      </div>
    </div>
  );
}

/** "Your own design" (owner 2026-10-31): the member's finished card, uploaded as the photo, shown as it is. */
function CustomArt({ data, className }: { data: WishCardData; className?: string }) {
  return data.photoUrl ? (
    <img
      src={data.photoUrl}
      alt={data.title || (data.kind === "birthday" ? "Birthday wish" : "Invitation")}
      className={cn("block h-auto w-full rounded-2xl", className)}
    />
  ) : (
    <div
      className={cn(
        "flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border-strong bg-surface-2 px-6 text-center",
        className,
      )}
    >
      <span className="text-3xl">🖼️</span>
      <p className="font-semibold text-ink">Your own design</p>
      <p className="text-sm text-muted">Upload a finished card — it&rsquo;s shown exactly as it is.</p>
    </div>
  );
}

/** The designed card itself (the composer previews this). */
export function WishArt({ data, className }: { data: WishCardData; className?: string }) {
  if (data.template === "photo") return <PhotoArt data={data} className={className} />;
  if (data.template === "party") return <PartyArt data={data} className={className} />;
  if (data.template === "custom") return <CustomArt data={data} className={className} />;
  if (data.template === "flyer") return <FlyerArt data={data} className={className} />;
  const d = DESIGNS[data.template] ?? DESIGNS.confetti;
  const birthday = data.kind === "birthday";
  return (
    <div
      className={cn(
        "relative isolate flex aspect-[4/5] w-full flex-col items-center justify-center overflow-hidden rounded-2xl px-6 py-8 text-center",
        d.bg,
        d.frame,
        className,
      )}
    >
      <Decorations template={data.template} />
      <p className={cn("text-[0.7rem] font-bold uppercase tracking-[0.3em]", d.accent)}>{birthday ? "🎂 Wishing you" : "✉️ Join us"}</p>
      <p className={cn("mt-2 font-serif text-[clamp(1.6rem,5vw,2.2rem)] font-bold italic leading-tight", d.accent)}>{d.heading}</p>
      {data.photoUrl && (
        <img
          src={data.photoUrl}
          alt=""
          className={cn(
            "mt-4 size-28 rounded-full object-cover shadow-[0_8px_24px_-8px_rgb(0_0_0/0.35)] ring-4",
            data.template === "festive" ? "ring-[#ffc247]" : "ring-white",
          )}
        />
      )}
      {data.title && (
        <h3 className={cn("mt-4 line-clamp-2 font-wide text-[clamp(1.35rem,4.4vw,1.85rem)] font-black leading-tight", d.ink)}>
          {data.title}
        </h3>
      )}
      {!birthday && data.eventAt && (
        <p className={cn("mt-3 inline-flex items-center gap-1.5 text-sm font-semibold", d.ink)}>
          <CalendarDays aria-hidden className="size-4" />
          {eventWhen(data.eventAt)}
        </p>
      )}
      {!birthday && data.venue && (
        <p className={cn("mt-1 inline-flex items-center gap-1.5 text-sm", d.muted)}>
          <MapPin aria-hidden className="size-4" />
          {data.venue}
        </p>
      )}
      {data.message && (
        <p className={cn("mt-4 line-clamp-4 max-w-sm whitespace-pre-line text-[0.95rem] leading-relaxed", d.muted)}>{data.message}</p>
      )}
    </div>
  );
}

/** A wish in the feed: the card, who posted it, and Delete for its author / the Editor Desk. */
export function WishCard({
  data,
  canDelete = false,
  onDelete,
  extra,
  compact = false,
  className,
}: {
  data: WishCardData;
  /** In a grid of story cards (desktop Home): a narrower card, so the row isn't stretched taller than the stories. */
  compact?: boolean;
  canDelete?: boolean;
  onDelete?: () => Promise<void>;
  /** Under the card (the feed's quick wishes). */
  extra?: ReactNode;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <article
      aria-label={
        data.kind === "birthday"
          ? data.title
            ? `Birthday wish for ${data.title}`
            : "Birthday wish"
          : `Invitation${data.title ? `: ${data.title}` : ""}`
      }
      className={cn("card overflow-hidden p-2.5", className)}
    >
      <WishArt data={data} className={compact ? "mx-auto max-w-[15.5rem]" : undefined} />
      {extra}
      <div className="flex items-center gap-2.5 px-1.5 pb-0.5 pt-3">
        <Link href={`/${data.author.username}`} className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink hover:text-brand">
          <Avatar src={data.author.image} name={data.author.name} size="sm" decorative />
          <span className="truncate">{data.author.name}</span>
        </Link>
        <span className="text-xs text-muted">· {data.kind === "birthday" ? "Birthday wish" : "Invitation"}</span>
        <div className="ml-auto flex items-center gap-1">
          <Link href="/wishes/new" className="rounded-full px-3 py-1.5 text-xs font-bold text-brand hover:bg-tint">
            Post yours
          </Link>
          {canDelete && onDelete && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (!window.confirm("Remove this from the feed?")) return;
                setBusy(true);
                try {
                  await onDelete();
                } finally {
                  setBusy(false);
                }
              }}
              aria-label="Remove"
              className="inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-tint hover:text-brand disabled:opacity-50"
            >
              <Trash2 aria-hidden className="size-4" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
