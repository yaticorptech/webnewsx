"use client";

import { CircleAlert, CircleCheck, EyeOff, Newspaper, Smartphone } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { ArticleView } from "@/components/article/article-view";
import { POSTER_TEMPLATE_LABELS, isPosterTemplate, type ArticleCard } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { buildPreviewCard, buildPreviewDetail, type FieldErrors, type FieldKey, type PreviewInput } from "./composer-model";
import { CHOOSE_TEMPLATE_HINT, ReelPhone } from "./live-preview";

type Mode = "poster" | "article";

/** `short` is what phones show (the full label stays the accessible name). */
const MODES: { value: Mode; label: string; short: string; icon: typeof Newspaper }[] = [
  { value: "poster", label: "Reel poster", short: "Poster", icon: Smartphone },
  { value: "article", label: "Full article", short: "Article", icon: Newspaper },
];

/** Padding around each mode's preview inside the panel. */
const MODE_PADDING: Record<Mode, string> = {
  poster: "px-3 py-6 sm:px-6 sm:py-8",
  article: "px-3 py-5 sm:px-8 sm:py-8",
};

const CHECKS: { key: FieldKey; label: string }[] = [
  { key: "cover", label: "Cover image or video" },
  { key: "articleMedia", label: "Article image or video" },
  { key: "title", label: "Headline" },
  { key: "category", label: "Category" },
  { key: "district", label: "District" },
  { key: "template", label: "Template" },
  { key: "bodyHtml", label: "Story" },
];

export type PreviewPaneProps = {
  input: PreviewInput;
  /** Publish-readiness problems (empty = ready). */
  problems: FieldErrors;
  onFix: (field: FieldKey) => void;
  /** "Change" (or "Choose") under the reel poster: back to the template picker. Without it the poster has no link. */
  onChangeTemplate?: () => void;
  /** Trainee: the story goes to the Review Desk instead of straight to the feeds. */
  review?: boolean;
  /** A press meet story: it goes to this organizer, who verifies it before it goes live (owner 2026-10-07). */
  sendTo?: string | null;
};

/**
 * Step 03: the story rendered with the real reel / article components (preview mode: inert controls, no side
 * effects), plus a readiness checklist that links back to the fields.
 */
export function PreviewPane({ input, problems, onFix, onChangeTemplate, review = false, sendTo = null }: PreviewPaneProps) {
  const [mode, setMode] = useState<Mode>("poster");
  const card = buildPreviewCard(input);
  const detail = buildPreviewDetail(input);
  const issues = CHECKS.filter((check) => problems[check.key]);

  return (
    <div className="flex flex-col gap-5">
      <Readiness issues={issues} problems={problems} onFix={onFix} review={review} sendTo={sendTo} />

      <div id="composer-preview-panel" className="card relative overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-2 py-2 sm:px-3">
          <SegmentedToggle mode={mode} onChange={setMode} />
          <span className="hidden shrink-0 items-center gap-1.5 pr-2 text-xs text-faint sm:flex">
            <EyeOff aria-hidden className="size-3.5" />
            Only you can see this
          </span>
        </div>
        {/* Preview mode renders inert controls; anchors are also neutralised here as a safety net. */}
        <div
          data-composer-preview
          onClickCapture={(event) => {
            if ((event.target as HTMLElement).closest("a")) event.preventDefault();
          }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
              className={MODE_PADDING[mode]}
            >
              {mode === "poster" ? (
                <PosterPreview card={card} onChangeTemplate={onChangeTemplate} />
              ) : (
                <>
                  {problems.articleMedia && <MissingArticleMedia onAdd={() => onFix("articleMedia")} />}
                  <ArticleView article={detail} preview />
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function SegmentedToggle({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return (
    <div role="radiogroup" aria-label="Preview as" className="relative flex rounded-full bg-surface-2 p-1">
      {MODES.map((item) => {
        const active = item.value === mode;
        const Icon = item.icon;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-controls="composer-preview-panel"
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const step = event.key === "ArrowRight" ? 1 : -1;
                const next = MODES[(MODES.indexOf(item) + step + MODES.length) % MODES.length]!;
                onChange(next.value);
                (
                  event.currentTarget.parentElement?.querySelector(`[data-mode="${next.value}"]`) as HTMLElement | null
                )?.focus();
              }
            }}
            tabIndex={active ? 0 : -1}
            data-mode={item.value}
            className={cn(
              "relative inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[0.8125rem] font-bold transition-colors duration-150 sm:gap-2 sm:px-3.5 [&_svg]:size-4",
              active ? "text-brand-contrast" : "text-muted hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId="composer-preview-toggle"
                aria-hidden
                className="absolute inset-0 rounded-full bg-brand"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <Icon aria-hidden className="relative" />
            <span aria-hidden className="relative sm:hidden">
              {item.short}
            </span>
            <span className="relative max-sm:sr-only">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The story as the reel shows it once published: the feed's reel in preview mode (poster in the chosen template, the
 * action rail on it) in a phone frame at phone width, with the template's name and a "Choose" link back to the picker.
 * While none is chosen it shows DEFAULT_POSTER_TEMPLATE with a note saying so and asking for a choice.
 */
function PosterPreview({ card, onChangeTemplate }: { card: ArticleCard; onChangeTemplate?: () => void }) {
  const chosen = isPosterTemplate(card.template) ? card.template : null;
  return (
    <figure className="mx-auto flex w-full max-w-90 flex-col items-center gap-4">
      <ReelPhone card={card} priority className="w-full max-w-85" />
      <figcaption className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[0.8125rem] text-muted">
        {chosen ? (
          <span>
            {chosen === "plain" ? (
              <>
                <span className="font-bold text-ink">No template</span> — your cover with the headline and your name.
              </>
            ) : (
              <>
                Using the <span className="font-bold text-ink">{POSTER_TEMPLATE_LABELS[chosen]}</span> template.
              </>
            )}
            {onChangeTemplate && " Want a different one?"}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 font-semibold text-ink-2">
            <CircleAlert aria-hidden className="size-4 shrink-0 text-brand" />
            {/* The poster shows DEFAULT_POSTER_TEMPLATE meanwhile, which can pass for a choice. */}
            No template chosen yet — this is the default design. {CHOOSE_TEMPLATE_HINT}.
          </span>
        )}
        {onChangeTemplate && (
          <button
            type="button"
            onClick={onChangeTemplate}
            className="font-bold text-brand underline decoration-brand/40 underline-offset-4 hover:decoration-current"
          >
            Choose
            <span className="sr-only"> {chosen ? "another" : "a"} template</span>
          </button>
        )}
      </figcaption>
    </figure>
  );
}

/** Above the full article while it has no image or video yet (it shows a neutral placeholder in its place). */
function MissingArticleMedia({ onAdd }: { onAdd: () => void }) {
  return (
    <p className="mb-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[0.8125rem] text-muted">
      <span className="flex items-center gap-1.5 font-semibold text-ink-2">
        <CircleAlert aria-hidden className="size-4 shrink-0 text-brand" />
        No article image or video yet — it shows at the top of your article.
      </span>
      <button
        type="button"
        onClick={onAdd}
        className="font-bold text-brand underline decoration-brand/40 underline-offset-4 hover:decoration-current"
      >
        Add one
      </button>
    </p>
  );
}

function Readiness({
  issues,
  problems,
  onFix,
  review,
  sendTo,
}: {
  issues: { key: FieldKey; label: string }[];
  problems: FieldErrors;
  onFix: (field: FieldKey) => void;
  review: boolean;
  sendTo: string | null;
}) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-success/30 bg-success-soft px-4 py-3 text-sm">
        <CircleCheck aria-hidden className="size-5 shrink-0 text-success" />
        <p>
          {sendTo ? (
            <>
              <span className="font-bold text-ink">Ready to send.</span>{" "}
              <span className="text-muted">{sendTo} verifies it; once they do, it goes live in every open feed.</span>
            </>
          ) : review ? (
            <>
              <span className="font-bold text-ink">Ready to submit.</span>{" "}
              <span className="text-muted">An editor at the Review Desk checks it; once approved it goes live in every open feed.</span>
            </>
          ) : (
            <>
              <span className="font-bold text-ink">Ready to publish.</span>{" "}
              <span className="text-muted">It goes live in every open feed the moment you hit Publish.</span>
            </>
          )}
        </p>
      </div>
    );
  }
  return (
    <div className="panel-tint px-4 py-3 text-sm">
      <p className="flex items-center gap-2 font-bold text-ink">
        <CircleAlert aria-hidden className="size-5 shrink-0 text-brand" />
        {sendTo ? "Not ready to send yet" : review ? "Not ready to submit yet" : "Not ready to publish yet"}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5 pl-7">
        {issues.map((issue) => (
          <li key={issue.key}>
            <button
              type="button"
              onClick={() => onFix(issue.key)}
              className="text-left font-semibold text-brand underline decoration-brand/40 underline-offset-4 hover:decoration-current"
            >
              {problems[issue.key]}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
