"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Flag } from "lucide-react";
import { motion } from "motion/react";
import { useId, useState } from "react";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { useViewer } from "@/components/providers/viewer-provider";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage, isApiError } from "@/lib/api";
import { FLAG_NOTE_MAX, FLAG_REASON_LABELS, FLAG_REASON_VALUES, type FlagReason } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/** What each reason covers — shown under the label so readers pick the right one. */
const REASON_HINTS: Record<FlagReason, string> = {
  misinformation: "False or misleading claims presented as fact.",
  hate: "Attacks, threatens or harasses a person or a group.",
  spam: "Ads, scams, clickbait or fake giveaways.",
  copyright: "Uses someone else's photos or reporting without permission.",
  other: "Anything else the Editor Desk should look at.",
};

/** "viewer already reported <articleId>" (local memory, per viewer) so the menu can say "Reported". */
export const flagKey = (articleId: string, viewerId: string | null) => ["flag-state", articleId, viewerId ?? "anon"] as const;

/**
 * The reason of the viewer's own open report on a story (null = not reported): from the story (`viewer.reported`,
 * owner 2026-09-30), then kept by this browser once they report it — so the mark shows at once, everywhere.
 */
export function useReportedReason(article: { id: string; viewer?: { reported?: FlagReason | null } }): FlagReason | null {
  const viewer = useViewer();
  const queryClient = useQueryClient();
  const key = flagKey(article.id, viewer?.id ?? null);
  const initial = viewer ? (article.viewer?.reported ?? null) : null;
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => queryClient.getQueryData<FlagReason | null>(key) ?? initial,
    initialData: initial,
    staleTime: Infinity,
  });
  return data ?? null;
}

export type FlagDialogProps = {
  articleId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Outcome = "sent" | "already";

/**
 * "Report this story" sheet (SPEC §3.11): a reason (misinformation · hate/harassment · spam/scam ·
 * copyright · other) and an optional note → `POST /api/articles/:id/flag`. Reports go to the Editor
 * Desk's Flags queue; the reporter never sees who flagged. One open report per reader per story.
 */
export function FlagDialog({ articleId, title, open, onOpenChange }: FlagDialogProps) {
  const viewer = useViewer();
  const queryClient = useQueryClient();
  const groupId = useId();
  const [reason, setReason] = useState<FlagReason | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  // Fresh form every time the sheet opens (adjusting state during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setReason(null);
      setNote("");
      setError(null);
      setOutcome(null);
    }
  }

  const mutation = useMutation({
    mutationFn: (input: { reason: FlagReason; note: string }) =>
      api.flag(articleId, { reason: input.reason, note: input.note.trim() || undefined }),
    onSuccess: (_result, input) => {
      queryClient.setQueryData(flagKey(articleId, viewer?.id ?? null), input.reason);
      setOutcome("sent");
    },
    onError: (err, input) => {
      if (isApiError(err) && err.code === "already_flagged") {
        queryClient.setQueryData(flagKey(articleId, viewer?.id ?? null), (current: FlagReason | null | undefined) => current ?? input.reason);
        setOutcome("already");
        return;
      }
      setError(errorMessage(err, "Couldn't send your report. Please try again."));
    },
  });

  const submit = () => {
    if (!reason) {
      setError("Choose what's wrong with this story");
      return;
    }
    setError(null);
    mutation.mutate({ reason, note });
  };

  const busy = mutation.isPending;

  return (
    <Modal
      open={open}
      onOpenChange={(value) => !busy && onOpenChange(value)}
      title={outcome ? "Report received" : "Report this story"}
      description={
        outcome ? undefined : "Tell the Editor Desk what's wrong. Reports are private — the reporter never sees who flagged."
      }
      size="md"
      dismissible={!busy}
      footer={
        outcome ? (
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy} leftIcon={<Flag aria-hidden />}>
              Send report
            </Button>
          </>
        )
      }
    >
      {outcome ? (
        <FlagSent outcome={outcome} title={title} />
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="flex flex-col gap-5"
        >
          <p className="line-clamp-2 border-l-4 border-brand pl-3 font-wide text-[0.9375rem] font-extrabold leading-snug text-ink">
            {title}
          </p>
          <fieldset aria-describedby={error ? `${groupId}-error` : undefined}>
            <legend className="mb-2 text-[0.8125rem] font-bold text-ink">
              What&apos;s wrong?<span aria-hidden className="ml-0.5 text-brand">*</span>
            </legend>
            <div className="flex flex-col gap-2">
              {FLAG_REASON_VALUES.map((value) => {
                const checked = reason === value;
                return (
                  <label
                    key={value}
                    className={cn(
                      "group relative flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors duration-150",
                      "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand",
                      checked ? "border-brand bg-tint-2" : "border-border bg-surface hover:border-tint-border hover:bg-tint",
                    )}
                  >
                    <input
                      type="radio"
                      name={`${groupId}-reason`}
                      value={value}
                      checked={checked}
                      onChange={() => {
                        setReason(value);
                        setError(null);
                      }}
                      className="sr-only"
                    />
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        checked ? "border-brand" : "border-border-strong group-hover:border-brand",
                      )}
                    >
                      {checked && (
                        <motion.span
                          className="size-2 rounded-full bg-brand"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 600, damping: 22 }}
                        />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-ink">{FLAG_REASON_LABELS[value]}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted">{REASON_HINTS[value]}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <div aria-live="polite">
              {error && (
                <p id={`${groupId}-error`} className="mt-2 text-xs font-semibold text-brand">
                  {error}
                </p>
              )}
            </div>
          </fieldset>
          <Field label="Add details (optional)" hint="Links to the original, what's false, anything that helps the desk decide.">
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={FLAG_NOTE_MAX}
              rows={3}
              autoGrow
              maxRows={6}
              placeholder="What should the Editor Desk know?"
            />
          </Field>
        </form>
      )}
    </Modal>
  );
}

function FlagSent({ outcome, title }: { outcome: Outcome; title: string }) {
  return (
    <div role="status" className="relative isolate flex flex-col items-center overflow-hidden py-4 text-center">
      <SpeedBarsSvg className="pointer-events-none absolute -right-10 -bottom-8 -z-10 w-44 text-brand opacity-[0.06]" />
      <motion.span
        className="flex size-16 items-center justify-center rounded-full bg-brand text-brand-contrast shadow-[0_8px_24px_-8px_rgb(227_6_19/0.55)]"
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 18 }}
      >
        <Check aria-hidden className="size-8" strokeWidth={3} />
      </motion.span>
      <p className="mt-5 font-wide text-lg font-extrabold text-ink">
        {outcome === "sent" ? "Thanks — the Editor Desk has your report" : "You've already reported this story"}
      </p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
        {outcome === "sent"
          ? "Editors review every report. If the story breaks the rules it will be hidden or removed."
          : "Your earlier report is still open with the Editor Desk. There's no need to send another."}
      </p>
      <p className="mt-4 line-clamp-2 max-w-sm text-xs font-semibold text-ink-2">“{title}”</p>
    </div>
  );
}
