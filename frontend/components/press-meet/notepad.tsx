"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleDot, Clock3, Copy, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { PRESS_MEET, type PressMeetNotes } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { meetTime } from "./format";

type Tone = "dark" | "light";

const SAVE_AFTER_MS = 900;
const draftKey = (meetId: string) => `webnews:press-meet-notes:${meetId}`;

type Draft = { body: string; at: number };

function readDraft(meetId: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(meetId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function writeDraft(meetId: string, draft: Draft | null): void {
  try {
    if (draft) localStorage.setItem(draftKey(meetId), JSON.stringify(draft));
    else localStorage.removeItem(draftKey(meetId));
  } catch {
    // private mode / storage full: the server copy still saves
  }
}

/**
 * The press meet notepad (owner 2026-10-01): private to each person, saved to their account as they type (and kept on
 * this device until the server has it, so a dropped connection loses nothing). "Time" stamps the current time (IST) —
 * handy for quotes. In the room (dark) and on the press meet page afterwards (light), for writing the story. A status
 * line under the box says plainly what's happening (owner 2026-10-02): not saved yet → saving → saved at <time>.
 */
export function Notepad({ meetId, tone = "light", className }: { meetId: string; tone?: Tone; className?: string }) {
  const notes = useQuery({
    queryKey: qk.pressMeetNotes(meetId),
    queryFn: ({ signal }) => api.pressMeets.notes(meetId, signal),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  if (notes.isPending) {
    return (
      <div className={cn("flex min-h-40 items-center justify-center", className)}>
        <Loader2 aria-label="Loading your notes" className={cn("size-5 animate-spin", tone === "dark" ? "text-white/50" : "text-muted")} />
      </div>
    );
  }
  if (notes.isError) {
    return <p className={cn("p-3 text-sm", tone === "dark" ? "text-white/60" : "text-muted", className)}>Couldn&rsquo;t load your notes.</p>;
  }
  return <Editor key={meetId} meetId={meetId} initial={notes.data} tone={tone} className={className} />;
}

function Editor({ meetId, initial, tone, className }: { meetId: string; initial: PressMeetNotes; tone: Tone; className?: string }) {
  const queryClient = useQueryClient();
  // A draft this device kept (not yet on the server) wins over an older server copy.
  const [text, setText] = useState(() => {
    const draft = readDraft(meetId);
    const saved = initial.updatedAt ? Date.parse(initial.updatedAt) : 0;
    return draft && draft.at > saved ? draft.body : initial.body;
  });
  /** typing = changed since the last save (it saves a moment after typing stops). */
  const [status, setStatus] = useState<"saved" | "typing" | "saving" | "error">("saved");
  const [savedAt, setSavedAt] = useState(initial.updatedAt);
  const lastSaved = useRef(initial.body);
  const latest = useRef(text);
  const area = useRef<HTMLTextAreaElement>(null);

  // Save a moment after typing stops.
  useEffect(() => {
    latest.current = text;
    if (text === lastSaved.current) return;
    writeDraft(meetId, { body: text, at: Date.now() });
    const timer = setTimeout(() => {
      setStatus("saving");
      api.pressMeets
        .saveNotes(meetId, text)
        .then((saved) => {
          lastSaved.current = text;
          setSavedAt(saved.updatedAt);
          setStatus(latest.current === text ? "saved" : "saving");
          if (latest.current === text) writeDraft(meetId, null);
          queryClient.setQueryData(qk.pressMeetNotes(meetId), saved);
        })
        .catch(() => setStatus("error"));
    }, SAVE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [text, meetId, queryClient]);

  // Leaving the page with unsaved notes: one last save that outlives the page.
  useEffect(() => {
    const flush = () => {
      if (latest.current === lastSaved.current) return;
      void fetch(`/api/press-meets/${encodeURIComponent(meetId)}/notes`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: latest.current }),
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [meetId]);

  const edit = (next: string) => {
    setText(next);
    setStatus(next === lastSaved.current ? "saved" : "typing");
  };

  const stamp = () => {
    const el = area.current;
    const time = `[${meetTime(new Date().toISOString())}] `;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const before = text.slice(0, start);
    const prefix = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
    const next = `${before}${prefix}${time}${text.slice(end)}`.slice(0, PRESS_MEET.notesMax);
    edit(next);
    const caret = start + prefix.length + time.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Notes copied");
    } catch {
      toast.error("Couldn't copy — select the text and copy it instead");
    }
  };

  const dark = tone === "dark";
  const tool = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-colors [&_svg]:size-3.5",
    dark ? "bg-white/10 text-white hover:bg-white/18" : "bg-surface text-ink ring-1 ring-inset ring-border hover:text-brand hover:ring-brand",
  );

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      {/* The tools in a strip above the text, like an editor's toolbar (owner 2026-10-08 mockup); "Only you can see
          these" is on the card around the notepad now. */}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl transition-[box-shadow,border-color]",
          dark
            ? "bg-white/5 ring-1 ring-white/10 focus-within:ring-brand/70"
            : "border border-border-strong bg-surface focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--tint-3)]",
        )}
      >
        <div className={cn("flex items-center gap-1.5 px-2.5 py-2", dark ? "border-b border-white/10" : "border-b border-border bg-surface-2")}>
          <button type="button" onClick={stamp} className={tool} aria-label="Add the current time">
            <Clock3 aria-hidden />
            Time
          </button>
          <button type="button" onClick={() => void copy()} disabled={!text} className={cn(tool, "disabled:opacity-40")} aria-label="Copy notes">
            <Copy aria-hidden />
            Copy
          </button>
        </div>
        <textarea
          ref={area}
          value={text}
          maxLength={PRESS_MEET.notesMax}
          onChange={(event) => edit(event.target.value)}
          placeholder={"Quotes, figures, names, questions to ask…\nTap Time to stamp when something was said."}
          aria-label="Your press meet notes"
          spellCheck
          className={cn(
            "min-h-0 w-full flex-1 resize-none bg-transparent px-3.5 py-3 text-[0.9375rem] leading-relaxed outline-none",
            dark ? "text-white placeholder:text-white/35" : "min-h-56 text-ink placeholder:text-muted",
          )}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <SaveState status={status} savedAt={savedAt} hasText={text.length > 0} dark={dark} />
        <p className={cn("shrink-0 text-[0.6875rem] tabular-nums", dark ? "text-white/35" : "text-muted")}>
          {text.length.toLocaleString("en-IN")} / {PRESS_MEET.notesMax.toLocaleString("en-IN")}
        </p>
      </div>
    </div>
  );
}

/** Under the notes: not saved yet → saving → saved at <time> (or kept on this device when offline). */
function SaveState({
  status,
  savedAt,
  hasText,
  dark,
}: {
  status: "saved" | "typing" | "saving" | "error";
  savedAt: string | null;
  hasText: boolean;
  dark: boolean;
}) {
  const base = "inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold [&_svg]:size-3.5 [&_svg]:shrink-0";
  let content;
  if (status === "typing") {
    content = (
      <span className={cn(base, dark ? "bg-white/8 text-white/70" : "bg-surface-2 text-ink-2")}>
        <CircleDot aria-hidden className="text-[#f5a524]" /> Not saved yet — saves when you pause
      </span>
    );
  } else if (status === "saving") {
    content = (
      <span className={cn(base, dark ? "bg-white/8 text-white/80" : "bg-surface-2 text-ink-2")}>
        <Loader2 aria-hidden className="animate-spin" /> Saving…
      </span>
    );
  } else if (status === "error") {
    content = (
      <span className={cn(base, dark ? "bg-brand/20 text-white" : "bg-tint text-brand-strong")}>
        <TriangleAlert aria-hidden className="text-brand" />
        <span className="truncate">Couldn&rsquo;t save — kept on this device, saves when you&rsquo;re back online</span>
      </span>
    );
  } else if (savedAt && hasText) {
    content = (
      <span className={cn(base, dark ? "bg-[rgb(53_196_110/0.2)] text-[#62d892] ring-1 ring-inset ring-[rgb(53_196_110/0.4)]" : "bg-success-soft text-success-strong ring-1 ring-inset ring-success/30")}>
        <CircleCheck aria-hidden /> Saved · {meetTime(savedAt)}
      </span>
    );
  } else {
    content = (
      <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", dark ? "text-white/45" : "text-muted")}>
        <CircleCheck aria-hidden className="size-3.5" /> Auto-saves as you type
      </span>
    );
  }
  return (
    <p role="status" aria-live="polite" className="min-w-0">
      {content}
    </p>
  );
}
