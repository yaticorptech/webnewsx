"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, KeyRound, MousePointerClick, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, isApiError } from "@/lib/api";

/*
 * "Generate with AI" (owner 2026-10-14): the reporter types the facts, Gemini writes the description, and it lands in the
 * editor to check and edit before publishing. Each reporter uses their OWN Gemini API key (Google AI Studio); without
 * one, "Add your Gemini key in 3 steps" opens a guide with a picture of each step and the box to paste it.
 */

export const AI_STATUS_KEY = ["ai", "status"] as const;
const STATUS_KEY = AI_STATUS_KEY;
export const AI_STUDIO_URL = "https://aistudio.google.com/apikey";

export function AiWriter({ title, language, onGenerated }: { title: string; language: string | null; onGenerated: (html: string) => void }) {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: STATUS_KEY, queryFn: ({ signal }) => api.ai.status(signal), staleTime: 5 * 60_000 });
  const [notes, setNotes] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);

  const generate = useMutation({
    mutationFn: () => api.ai.describe({ title: title.trim(), notes: notes.trim(), language }),
    onSuccess: ({ html }) => {
      onGenerated(html);
      toast.success("Description written", { description: "Check the facts and edit it before you publish." });
    },
    onError: (err) => {
      if (isApiError(err) && (err.code === "gemini_key_missing" || err.code === "gemini_key_invalid")) {
        queryClient.setQueryData(STATUS_KEY, { hasKey: false });
        setGuideOpen(true);
      }
      toast.error("Couldn't generate the description", { description: errorMessage(err) });
    },
  });

  const hasKey = status.data?.hasKey ?? false;
  const tooShort = title.trim().length < 5 ? "Add the headline first" : notes.trim().length < 10 ? "Add a few facts for the AI to write from" : null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      {status.isPending ? (
        <p className="text-sm text-muted">Checking your Gemini key…</p>
      ) : !hasKey ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-tint-border bg-tint px-4 py-4 sm:flex-row sm:items-center">
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-brand-contrast">
            <KeyRound className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink">Gemini key not added</p>
            <p className="text-sm text-muted">Generate with AI uses your own free Gemini API key. Add it in 3 steps.</p>
          </div>
          <Button size="sm" onClick={() => setGuideOpen(true)}>
            Add key in 3 steps
          </Button>
        </div>
      ) : (
        <>
          <Field label="Key facts for the AI" hint="Who, what, where, when — the AI writes only from these and your headline.">
            <Textarea
              rows={5}
              maxLength={4000}
              placeholder={"e.g. Mangaluru city corporation started a new waste collection drive on 14 Oct. 60 trucks, all 60 wards. Mayor said…"}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => generate.mutate()}
              loading={generate.isPending}
              disabled={tooShort !== null}
              leftIcon={<Sparkles aria-hidden />}
            >
              Generate description
            </Button>
            {tooShort && <span className="text-sm text-muted">{tooShort}</span>}
            <button type="button" onClick={() => setGuideOpen(true)} className="ml-auto text-sm font-semibold text-muted underline-offset-2 hover:text-brand hover:underline">
              Change Gemini key
            </button>
          </div>
        </>
      )}
      <GeminiKeyGuide open={guideOpen} onOpenChange={setGuideOpen} hasKey={hasKey} />
    </div>
  );
}

export function GeminiKeyGuide({ open, onOpenChange, hasKey }: { open: boolean; onOpenChange: (open: boolean) => void; hasKey: boolean }) {
  const queryClient = useQueryClient();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.ai.saveKey(key.trim()),
    onSuccess: (data) => {
      queryClient.setQueryData(STATUS_KEY, data);
      setKey("");
      onOpenChange(false);
      toast.success("Gemini key saved", { description: "You can now generate descriptions with AI." });
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: () => api.ai.removeKey(),
    onSuccess: (data) => {
      queryClient.setQueryData(STATUS_KEY, data);
      onOpenChange(false);
      toast("Gemini key removed");
    },
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Add your Gemini API key"
      description="Free from Google. It's saved encrypted to your account and used only to write your stories."
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {hasKey && (
            <Button variant="ghost" onClick={() => remove.mutate()} loading={remove.isPending} className="mr-auto">
              Remove saved key
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={key.trim().length < 20}>
            Save key
          </Button>
        </div>
      }
    >
      <ol className="flex flex-col gap-5">
        <Step n={1} title="Open Google AI Studio and sign in" picture={<StepBrowser />}>
          Go to{" "}
          <a href={AI_STUDIO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-brand underline-offset-2 hover:underline">
            aistudio.google.com/apikey <ExternalLink aria-hidden className="size-3.5" />
          </a>{" "}
          and sign in with your Google account. Accept the terms if it asks.
        </Step>
        <Step n={2} title="Click “Create API key”" picture={<StepCreate />}>
          Press <strong className="font-bold text-ink">Create API key</strong>. If it asks for a project, pick one or let it create a new one.
        </Step>
        <Step n={3} title="Copy the key and paste it here" picture={<StepCopy />}>
          Copy the whole key (a long code, e.g. starting with <code className="rounded bg-surface-2 px-1 font-mono text-[0.8125rem]">AQ…</code>) and paste it below, then press <strong className="font-bold text-ink">Save key</strong>.
        </Step>
      </ol>
      <Field label="Your Gemini API key" error={error} className="mt-5">
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste your key (AQ…)"
          value={key}
          onChange={(event) => {
            setKey(event.target.value);
            if (error) setError(null);
          }}
        />
      </Field>
    </Modal>
  );
}

function Step({ n, title, picture, children }: { n: number; title: string; picture: ReactNode; children: ReactNode }) {
  return (
    <li className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-center">
      <div className="flex gap-3">
        <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-black text-brand-contrast">
          {n}
        </span>
        <div className="min-w-0">
          <p className="font-bold text-ink">
            <span className="sr-only">Step {n}: </span>
            {title}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{children}</p>
        </div>
      </div>
      <div aria-hidden>{picture}</div>
    </li>
  );
}

/* Drawn pictures of each step (not screenshots): a small browser window. */

function Window({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <div className="flex items-center gap-1.5 border-b border-border bg-surface-2 px-2.5 py-1.5">
        <span className="size-2 rounded-full bg-[#ff5f57]" />
        <span className="size-2 rounded-full bg-[#febc2e]" />
        <span className="size-2 rounded-full bg-[#28c840]" />
        <span className="ml-1.5 truncate rounded-md bg-surface px-2 py-0.5 font-mono text-[0.625rem] text-ink-2">{url}</span>
      </div>
      <div className="relative h-24 p-3">{children}</div>
    </div>
  );
}

function StepBrowser() {
  return (
    <Window url="aistudio.google.com/apikey">
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <span className="text-xs font-extrabold text-ink">Google AI Studio</span>
        <span className="rounded-full border border-border px-3 py-1 text-[0.625rem] font-bold text-ink-2">Sign in with Google</span>
      </div>
    </Window>
  );
}

function StepCreate() {
  return (
    <Window url="aistudio.google.com/apikey">
      <p className="text-[0.6875rem] font-extrabold text-ink">API keys</p>
      <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-lg bg-[#1a73e8] px-2.5 py-1 text-[0.625rem] font-bold text-white ring-2 ring-brand ring-offset-2">
        <KeyRound className="size-3" /> Create API key
      </span>
      <MousePointerClick className="absolute right-6 top-10 size-5 text-ink" />
      <div className="mt-6 h-2 w-3/4 rounded bg-surface-2" />
      <div className="mt-1.5 h-2 w-1/2 rounded bg-surface-2" />
    </Window>
  );
}

function StepCopy() {
  return (
    <Window url="aistudio.google.com/apikey">
      <p className="text-[0.6875rem] font-extrabold text-ink">API key generated</p>
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2 py-1.5">
        <span className="truncate font-mono text-[0.625rem] text-ink-2">AQ••••••••••••••••••••••</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 text-[0.625rem] font-bold text-ink ring-2 ring-brand">
          <Copy className="size-3" /> Copy
        </span>
      </div>
    </Window>
  );
}
