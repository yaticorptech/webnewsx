"use client";

import { ArrowLeft, ArrowRight, Check, ClipboardCopy, Languages, ListChecks, Type, WandSparkles, X } from "lucide-react";
import { useState, type ClipboardEvent, type ReactNode } from "react";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import {
  BLURB,
  CATEGORY_LABELS,
  CATEGORY_VALUES,
  KARNATAKA_DISTRICTS,
  LIMITS,
  PRESS_LANGUAGE_LABELS,
  PRESS_LANGUAGE_VALUES,
  SUBCATEGORIES,
  type Category,
  type PressLanguage,
} from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { TITLE_SOFT_MAX } from "./composer-fields";

/*
 * "Generate prompt" (owner 2026-10-16): for reporters without their own AI key. They write the topic and key points; we
 * build a strong prompt to paste into any AI chat (ChatGPT, Gemini…), which answers with every field of this page IN THIS
 * PAGE'S ORDER — Category, Sub category, Language, Headline, Blurb, Description — so they copy the answers in top to
 * bottom. Nothing is sent anywhere by us. Kept deliberately simple: three numbered steps, two boxes, one big button.
 */

/** The composer's own field order (keep in step with composer.tsx) — the AI answers in exactly this order. */
export function buildStoryPrompt({ topic, points, language }: { topic: string; points: string; language: PressLanguage | "" }): string {
  const lang = language ? PRESS_LANGUAGE_LABELS[language] : "the same language as the key points";
  const facts = points
    .split("\n")
    .map((line) => line.replace(/^[\s\-•*\d.)]+/, "").trim())
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join("\n");
  const categories = CATEGORY_VALUES.map((c) => CATEGORY_LABELS[c]).join(", ");
  const subLists = CATEGORY_VALUES.map((c) =>
    c === "karnataka" ? `   - Karnataka: the district — one of ${KARNATAKA_DISTRICTS.join(", ")}` : `   - ${CATEGORY_LABELS[c]}: ${SUBCATEGORIES[c].join(", ")}`,
  ).join("\n");
  return `You are an experienced news reporter and editor writing for WebNEWS, an Indian news platform.

Write a news story in ${lang} from the title and facts below.
Use ONLY these facts. Do not invent names, numbers, quotes, dates or places. If a detail is not given, leave it out.

TITLE: ${topic.trim()}

KEY POINTS:
${facts || "- (none given)"}

Reply with exactly these 6 parts, in this order. Start each part with its label in capital letters (as shown) on its own line, then the answer on the next line. Write nothing before part 1 and nothing after part 6.

1. CATEGORY
Choose exactly one from: ${categories}

2. SUB CATEGORY
Choose exactly one from the list for the category you chose:
${subLists}

3. LANGUAGE
${lang}

4. HEADLINE
One line, at most ${TITLE_SOFT_MAX} characters (never more than ${LIMITS.titleMax}). Clear and factual, no clickbait, no quotation marks, no full stop at the end.

5. BLURB
A short summary of the story in one or two sentences (at least ${BLURB.min} characters).

6. DESCRIPTION
The full story in 4 to 8 short paragraphs (at least 150 words). Start with the most important facts (who, what, where, when, why). Neutral news tone. Plain text only: no headings, no bullet points, no markdown symbols like # or *.

Write parts 4, 5 and 6 in ${lang}. Keep the labels (CATEGORY, SUB CATEGORY, LANGUAGE, HEADLINE, BLURB, DESCRIPTION) in English.`;
}

/** The three steps, in very simple words (owner 2026-10-16: a small box each, two short lines). */
/** What "Fill my story" puts into the page (any part the answer didn't give is left out). */
export type FilledStory = {
  category?: Category;
  subcategory?: string;
  district?: string;
  language?: PressLanguage;
  headline?: string;
  blurb?: string;
  /** Paragraphs, as the editor's HTML. */
  descriptionHtml?: string;
};

type Label = "CATEGORY" | "SUB CATEGORY" | "LANGUAGE" | "HEADLINE" | "BLURB" | "DESCRIPTION";
const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9\u0900-\u0dff]+/g, " ").trim();
const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A blurb trimmed to BLURB.max characters at a word boundary (a full stop kept when there's room), no dangling punctuation. */
export function fitBlurb(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= BLURB.max) return clean;
  const cut = clean.slice(0, BLURB.max + 1);
  const space = cut.lastIndexOf(" ");
  let words = (space > BLURB.min ? cut.slice(0, space) : clean.slice(0, BLURB.max)).replace(/[\s,;:–—-]+$/, "");
  // Not ending on a little word ("…win over Australia at the").
  for (let i = 0; i < 3; i++) {
    const shorter = words.replace(/\s+(?:the|a|an|at|of|in|on|to|for|and|or|with|by|from|as|its|their)$/i, "").replace(/[\s,;:–—-]+$/, "");
    if (shorter === words || shorter.length < BLURB.min) break;
    words = shorter;
  }
  return words.length < BLURB.max && !/[.!?।]$/.test(words) ? `${words}.`.slice(0, BLURB.max) : words;
}

/**
 * Reads the AI's answer to buildStoryPrompt (owner 2026-10-16: paste the whole answer, the page fills itself): finds each
 * labelled part — "1. CATEGORY", "**HEADLINE:**", "Headline -" … — and matches category, sub category / district and
 * language to WebNEWS's own lists. Tolerant of markdown, numbering and answers on the label's line.
 */
export function parseStoryAnswer(answer: string): FilledStory {
  const parts: Partial<Record<Label, string>> = {};
  const labelRe = /^\s*(?:#+\s*)?\**\s*(?:\d+[.)]\s*)?\**\s*(CATEGORY|SUB[\s-]?CATEGORY|LANGUAGE|HEADLINE|BLURB|DESCRIPTION)\s*\**\s*[:\-–—]?\s*\**\s*(.*)$/i;
  let current: Label | null = null;
  for (const raw of answer.replace(/\r\n?/g, "\n").split("\n")) {
    const match = labelRe.exec(raw);
    if (match) {
      const label = match[1]!.toUpperCase().replace(/SUB[\s-]?CATEGORY/, "SUB CATEGORY") as Label;
      current = label;
      parts[label] = (match[2] ?? "").replace(/\*+$/, "").trim();
      continue;
    }
    if (current) parts[current] = `${parts[current] ?? ""}\n${raw}`;
  }
  const clean = (text?: string) => text?.replace(/\*\*|__/g, "").replace(/^["“”']+|["“”']+$/g, "").trim() || undefined;
  const result: FilledStory = {};

  const categoryText = norm(clean(parts.CATEGORY)?.split("\n")[0] ?? "");
  const category = CATEGORY_VALUES.find((c) => norm(CATEGORY_LABELS[c]) === categoryText || norm(c) === categoryText)
    ?? CATEGORY_VALUES.find((c) => categoryText && (norm(CATEGORY_LABELS[c]).includes(categoryText) || categoryText.includes(norm(CATEGORY_LABELS[c]))));
  if (category) result.category = category;

  const subText = norm(clean(parts["SUB CATEGORY"])?.split("\n")[0] ?? "");
  if (subText) {
    if (category === "karnataka") {
      const district = KARNATAKA_DISTRICTS.find((d) => norm(d) === subText) ?? KARNATAKA_DISTRICTS.find((d) => subText.includes(norm(d)));
      if (district) result.district = district;
    } else if (category) {
      const list = SUBCATEGORIES[category];
      const sub = list.find((x) => norm(x) === subText) ?? list.find((x) => subText.includes(norm(x)) || norm(x).includes(subText));
      if (sub) result.subcategory = sub;
    }
  }

  const languageText = norm(clean(parts.LANGUAGE)?.split("\n")[0] ?? "");
  const language = PRESS_LANGUAGE_VALUES.find((code) => norm(PRESS_LANGUAGE_LABELS[code]) === languageText || code === languageText)
    ?? PRESS_LANGUAGE_VALUES.find((code) => languageText.includes(norm(PRESS_LANGUAGE_LABELS[code])));
  if (language) result.language = language;

  const headline = clean(parts.HEADLINE)?.split("\n").map((l) => l.trim()).filter(Boolean).join(" ");
  if (headline) result.headline = headline.slice(0, LIMITS.titleMax);
  const blurb = clean(parts.BLURB)?.split("\n").map((l) => l.trim()).filter(Boolean).join(" ");
  // Kept whole (owner 2026-10-31: the cut blurbs lost their ending); only the hard limit applies.
  if (blurb) result.blurb = fitBlurb(blurb);

  const description = clean(parts.DESCRIPTION);
  if (description) {
    const paragraphs = description
      .split(/\n\s*\n|\n/)
      .map((p) => p.replace(/^[#>*\-\s]+/, "").replace(/\*\*|__/g, "").trim())
      .filter(Boolean);
    if (paragraphs.length > 0) result.descriptionHtml = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  }
  return result;
}

/** The language box's ▾ (drawn, since the box's own arrow is hidden). */
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%236b7079' stroke-width='2'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")";

/** The fields' shared look: white, clearly outlined, a soft red glow while typing. */
const FIELD =
  "w-full rounded-xl border border-border-strong bg-surface px-4 text-[0.9375rem] text-ink shadow-[0_1px_2px_rgb(16_24_40/0.05)] placeholder:text-faint transition-[border-color,box-shadow] duration-150 hover:border-ink/30 focus:border-brand focus:shadow-[0_0_0_4px_rgb(227_6_19/0.12)] focus:outline-none";

/**
 * Two simple screens (owner 2026-10-16: "simple, not confusing"): 1 · Write the title and points, then open ChatGPT
 * (prompt already in its box) or Gemini (prompt copied) — which moves on by itself to 2 · Paste the answer and
 * "Fill my story". Starts empty every time it opens.
 */
export function PromptHelper({
  open,
  onOpenChange,
  language,
  onFill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The Language chosen on the page. */
  language: PressLanguage | "";
  /** "Fill my story": the AI's answer, read into the page's fields. */
  onFill: (story: FilledStory) => void;
}) {
  const [screen, setScreen] = useState<"write" | "paste">("write");
  const [topic, setTopic] = useState("");
  const [points, setPoints] = useState("");
  const [lang, setLang] = useState<PressLanguage | "">(language);
  const [answer, setAnswer] = useState("");
  const [copies, setCopies] = useState(0);
  /** The Copy prompt button's green "Copied" (back to "Copy prompt" when the text changes). */
  const [justCopied, setJustCopied] = useState(false);
  // Every time it opens it starts empty (no draft kept); the language follows the page.
  const [shown, setShown] = useState(false);
  if (open !== shown) {
    setShown(open);
    if (open) {
      setScreen("write");
      setTopic("");
      setPoints("");
      setLang(language);
      setAnswer("");
      setJustCopied(false);
    }
  }
  // All three are required (owner 2026-10-16): a title, some points, and the story's language.
  const missing = [topic.trim().length < 3 && "title", points.trim().length < 10 && "key points", !lang && "language"].filter(Boolean) as string[];
  const ready = missing.length === 0;
  const prompt = buildStoryPrompt({ topic, points, language: lang });

  const copy = async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopies((n) => n + 1);
      return true;
    } catch {
      return false;
    }
  };

  /** Off to the AI: the prompt goes with it (and on the clipboard), and the popup waits on the Paste screen. */
  const openAi = (which: "chatgpt" | "gemini") => {
    void copy();
    setScreen("paste");
    toast.success(which === "chatgpt" ? "Opening ChatGPT with your prompt" : "Prompt copied — paste it in Gemini", {
      id: "ai-open",
      description: "Send it, then copy the whole answer and paste it here.",
    });
  };

  const fill = () => {
    const story = parseStoryAnswer(answer);
    const found = [story.category, story.headline, story.blurb, story.descriptionHtml].filter(Boolean).length;
    if (found === 0) {
      toast.error("Couldn't read that answer", { description: "Paste the AI's whole answer — it starts with CATEGORY." });
      return;
    }
    onFill(story);
    setAnswer("");
    onOpenChange(false);
  };

  const keepLines = (event: ClipboardEvent<HTMLTextAreaElement>, set: (value: string) => void, max: number) => {
    // Pasted text arrives as written: the blank lines copying adds between lines are dropped.
    const pasted = event.clipboardData.getData("text/plain");
    if (!pasted) return;
    event.preventDefault();
    const clean = pasted
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/g, ""))
      .filter((line) => line.trim() !== "")
      .join("\n");
    const box = event.currentTarget;
    const next = box.value.slice(0, box.selectionStart) + clean + box.value.slice(box.selectionEnd);
    const caret = box.selectionStart + clean.length;
    set(next.slice(0, max));
    requestAnimationFrame(() => box.setSelectionRange(caret, caret));
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="AI prompt" hideHeader size="md" bodyClassName="px-0 py-0 sm:px-0">
      {/* Header: title, close, and the two steps. */}
      <div className="relative border-b border-border bg-gradient-to-b from-tint/70 to-surface px-6 pb-4 pt-5">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          className="absolute right-4 top-4 z-20 inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink"
        >
          <X aria-hidden className="size-5" />
        </button>
        <div className="flex items-center gap-3 pr-10">
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-[#a8040e] text-white shadow-[0_6px_16px_-6px_rgb(227_6_19/0.6)]">
            <WandSparkles className="size-5" />
          </span>
          <h2 className="font-wide text-lg font-extrabold text-ink">Write with AI</h2>
        </div>
        <ol aria-label="Steps" className="mt-4 flex items-center gap-3">
          {(["Write", "Paste"] as const).map((label, index) => {
            const now = (index === 0 && screen === "write") || (index === 1 && screen === "paste");
            const done = index === 0 && screen === "paste";
            return (
              <li key={label} className={cn("flex items-center gap-2", index === 0 && "flex-1")}>
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs font-bold",
                    done ? "bg-[#22a35a] text-white" : now ? "bg-brand text-white" : "bg-surface-2 text-muted ring-1 ring-border ring-inset",
                  )}
                >
                  {done ? <Check aria-hidden className="size-3.5" strokeWidth={3.5} /> : index + 1}
                </span>
                <span className={cn("text-sm font-semibold", now || done ? "text-ink" : "text-muted")}>{label}</span>
                {index === 0 && <span aria-hidden className={cn("ml-1 h-0.5 flex-1 rounded-full", done ? "bg-[#22a35a]" : "bg-border")} />}
              </li>
            );
          })}
        </ol>
      </div>

      {screen === "write" ? (
        <div className="flex flex-col gap-3.5 px-6 pb-6 pt-5">
          <FieldLabel icon={<Type aria-hidden />} label="Title" />
          <input
            aria-label="Title"
            aria-required
            value={topic}
            onChange={(event) => {
              setTopic(event.target.value);
              setJustCopied(false);
            }}
            placeholder="Your story's title"
            maxLength={200}
            className={cn(FIELD, "-mt-2 h-12")}
          />
          <FieldLabel icon={<ListChecks aria-hidden />} label="Key points" />
          <textarea
            aria-label="Key points"
            aria-required
            value={points}
            onChange={(event) => {
              setPoints(event.target.value);
              setJustCopied(false);
            }}
            onPaste={(event) => keepLines(event, setPoints, 4000)}
            rows={5}
            maxLength={4000}
            placeholder="Main points, one per line"
            className={cn(FIELD, "-mt-2 resize-none py-3 leading-relaxed")}
          />
          <FieldLabel icon={<Languages aria-hidden />} label="Language" />
          <select
            aria-label="Story language"
            aria-required
            value={lang}
            onChange={(event) => {
              setLang(event.target.value as PressLanguage | "");
              setJustCopied(false);
            }}
            className={cn(FIELD, "-mt-2 h-12 cursor-pointer appearance-none pr-10", !lang && "text-faint")}
            style={{ backgroundImage: CHEVRON, backgroundPosition: "right 1rem center", backgroundRepeat: "no-repeat" }}
          >
            <option value="" disabled>
              Choose the story&rsquo;s language
            </option>
            {PRESS_LANGUAGE_VALUES.map((code) => (
              <option key={code} value={code}>
                {PRESS_LANGUAGE_LABELS[code]}
              </option>
            ))}
          </select>

          {/* The prompt itself as a code block (owner 2026-10-19: "give the result in code block style"): dark monospace
              panel, a Copy button in its header, and the text still selectable by hand for phones and the app. */}
          {ready && (
            <div className="overflow-hidden rounded-xl border border-[#2a3040] bg-[#0f1219] shadow-[0_1px_2px_rgb(16_24_40/0.2)]">
              <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] py-1.5 pl-3.5 pr-1.5">
                <span className="font-mono text-[0.6875rem] font-semibold uppercase tracking-wider text-[#9aa3b4]">prompt</span>
                <button
                  type="button"
                  onClick={() =>
                    void copy().then((ok) =>
                      ok ? setJustCopied(true) : toast.error("Couldn't copy", { description: "Select the text and copy it by hand." }),
                    )
                  }
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors",
                    justCopied ? "text-[#4ade80]" : "text-[#c7cdd8] hover:bg-white/10 hover:text-white",
                  )}
                >
                  {justCopied ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : <ClipboardCopy aria-hidden className="size-3.5" />}
                  {justCopied ? "Copied" : "Copy"}
                </button>
              </div>
              <pre
                aria-label="Your prompt"
                tabIndex={0}
                className="max-h-56 select-text overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-xs leading-relaxed text-[#e6e9f0] [scrollbar-width:thin]"
              >
                {prompt}
              </pre>
            </div>
          )}

          <p className={cn("mt-1 text-center text-xs font-medium", ready ? "text-[#1f7a3d]" : "text-muted")}>
            {ready ? "All set — open your AI, your prompt goes with it" : `Fill in the ${missing.join(", ").replace(/, ([^,]*)$/, " and $1")} first`}
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <AiButton
              href={ready ? `https://chatgpt.com/?q=${encodeURIComponent(prompt)}` : undefined}
              label="ChatGPT"
              logo={<ChatGptLogo />}
              onOpen={() => openAi("chatgpt")}
            />
            <AiButton href={ready ? "https://gemini.google.com/app" : undefined} label="Gemini" logo={<GeminiLogo />} onOpen={() => openAi("gemini")} />
          </div>
          {/* Copy it yourself (Gemini, or any AI) and move on when ready (owner 2026-10-16). */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={!ready}
              onClick={() =>
                void copy().then((ok) =>
                  ok ? setJustCopied(true) : toast.error("Couldn't copy", { description: "Please try again." }),
                )
              }
              className={cn(
                "inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors",
                !ready
                  ? "cursor-not-allowed bg-surface-2 text-faint"
                  : justCopied
                    ? "bg-[#effaf3] text-[#1f7a3d] ring-1 ring-[#bfe3c8] ring-inset"
                    : "bg-surface-2 text-ink hover:bg-border",
              )}
            >
              {justCopied ? <Check aria-hidden className="size-4" strokeWidth={3} /> : <ClipboardCopy aria-hidden className="size-4" />}
              {justCopied ? "Copied" : "Copy prompt"}
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={() => setScreen("paste")}
              className={cn(
                "inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors",
                !ready ? "cursor-not-allowed bg-surface-2 text-faint" : "bg-brand text-white hover:bg-brand-hover",
              )}
            >
              Next
              <ArrowRight aria-hidden className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5 px-6 pb-6 pt-5">
          <textarea
            aria-label="The AI's answer"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            onPaste={(event) => keepLines(event, setAnswer, 20000)}
            rows={8}
            autoFocus
            placeholder="Paste the AI's whole answer here"
            className={cn(FIELD, "resize-none py-3 text-sm leading-relaxed")}
          />
          <button
            type="button"
            disabled={answer.trim().length < 20}
            onClick={fill}
            className={cn(
              "flex h-13 w-full items-center justify-center gap-2.5 rounded-2xl text-base font-bold transition-all duration-200",
              answer.trim().length < 20
                ? "cursor-not-allowed bg-surface-2 text-faint"
                : "bg-gradient-to-b from-[#ef1b28] to-brand text-white shadow-[0_10px_24px_-10px_rgb(227_6_19/0.75),inset_0_1px_0_rgb(255_255_255/0.25)] hover:brightness-105 active:scale-[0.99]",
            )}
          >
            <WandSparkles aria-hidden className="size-5" />
            Fill my story
          </button>
          <div className="flex items-center justify-between text-sm">
            <button type="button" onClick={() => setScreen("write")} className="inline-flex items-center gap-1 font-medium text-muted hover:text-ink">
              <ArrowLeft aria-hidden className="size-4" />
              Back
            </button>
            <button
              type="button"
              onClick={() => void copy().then((ok) => (ok ? toast.success("Prompt copied", { id: "ai-open" }) : toast.error("Couldn't copy")))}
              className="inline-flex items-center gap-1.5 font-medium text-muted hover:text-ink"
            >
              {copies > 0 ? <Check aria-hidden className="size-4 text-[#22a35a]" /> : <ClipboardCopy aria-hidden className="size-4" />}
              Copy prompt again
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** A field's label with its icon and the required ★ (owner 2026-10-16: all three are compulsory). */
function FieldLabel({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[0.8125rem] font-bold text-ink-2 [&_svg]:size-4 [&_svg]:text-brand">
      {icon}
      {label}
      <span aria-hidden className="text-brand">
        *
      </span>
    </span>
  );
}

/** A big ChatGPT / Gemini button; disabled (no link) until the title and points are written. */
function AiButton({ href, label, logo, onOpen }: { href?: string; label: string; logo: ReactNode; onOpen: () => void }) {
  const look =
    "inline-flex h-13 items-center justify-center gap-2.5 rounded-2xl border text-[0.9375rem] font-bold transition-all duration-150";
  if (!href) {
    return (
      <span aria-disabled className={cn(look, "cursor-not-allowed border-border bg-surface-2 text-faint [&_svg]:opacity-50")}>
        {logo}
        {label}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onOpen}
      className={cn(look, "border-border-strong bg-surface text-ink shadow-[0_2px_6px_-2px_rgb(16_24_40/0.12)] hover:-translate-y-px hover:border-ink/40 hover:shadow-md active:translate-y-0")}
    >
      {logo}
      Open {label}
    </a>
  );
}

/** ChatGPT's mark. */
function ChatGptLogo() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="currentColor">
      <path d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.52 2.9A5.98 5.98 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.07Zm-9.02 12.61a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.8.8 0 0 0 .39-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.49 4.5ZM3.6 18.3a4.47 4.47 0 0 1-.53-3.01l.14.08 4.78 2.76a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06l-4.84 2.79a4.5 4.5 0 0 1-6.14-1.64ZM2.34 7.9a4.49 4.49 0 0 1 2.37-1.97V11.6a.77.77 0 0 0 .39.67l5.81 3.36-2.02 1.17a.08.08 0 0 1-.07 0l-4.83-2.79A4.5 4.5 0 0 1 2.34 7.87Zm16.6 3.86-5.83-3.39 2.02-1.16a.08.08 0 0 1 .07 0l4.83 2.79a4.49 4.49 0 0 1-.68 8.1v-5.68a.79.79 0 0 0-.41-.66Zm2.01-3.02-.14-.09-4.77-2.78a.78.78 0 0 0-.79 0L9.41 9.23V6.9a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66ZM8.31 12.86l-2.02-1.16a.08.08 0 0 1-.04-.06V6.07a4.5 4.5 0 0 1 7.38-3.45l-.14.08-4.78 2.76a.8.8 0 0 0-.39.68Zm1.1-2.37 2.6-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5Z" />
    </svg>
  );
}

/** Gemini's sparkle, in its blue-violet gradient. */
function GeminiLogo() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5">
      <defs>
        <linearGradient id="gemini-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4285f4" />
          <stop offset="0.55" stopColor="#9b72cb" />
          <stop offset="1" stopColor="#d96570" />
        </linearGradient>
      </defs>
      <path fill="url(#gemini-mark)" d="M12 0c.4 6.3 5.7 11.6 12 12-6.3.4-11.6 5.7-12 12-.4-6.3-5.7-11.6-12-12 6.3-.4 11.6-5.7 12-12Z" />
    </svg>
  );
}
