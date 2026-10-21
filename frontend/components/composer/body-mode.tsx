import { FileText, Link2, Sparkles, WandSparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The Description section's ways to tell the story (owner 2026-10-14). "prompt" (owner 2026-10-16) isn't a mode the
 * story stays in: picking it opens the "Generate prompt" popup (prompt-helper.tsx).
 */
export type BodyMode = "text" | "link" | "ai" | "prompt";

const MODES: { value: BodyMode; label: string; icon: typeof FileText }[] = [
  { value: "text", label: "Description", icon: FileText },
  { value: "link", label: "Read more link", icon: Link2 },
  { value: "ai", label: "Generate with AI", icon: Sparkles },
  { value: "prompt", label: "Generate prompt", icon: WandSparkles },
];

/** Radio buttons as pills: Description · Read more link · Generate with AI · Generate prompt (two rows of two on phones). */
export function BodyModePicker({ value, onChange }: { value: BodyMode; onChange: (mode: BodyMode) => void }) {
  return (
    <div role="radiogroup" aria-label="How to add the story" className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
      {MODES.map(({ value: mode, label, icon: Icon }) => {
        const checked = mode === value;
        return (
          <label
            key={mode}
            className={cn(
              "flex min-h-10 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-2 py-1.5 text-center text-xs font-bold leading-tight sm:inline-flex sm:h-10 sm:gap-2 sm:px-3.5 sm:py-0 sm:text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand",
              checked ? "border-brand bg-tint text-brand" : "border-border bg-surface text-ink-2 hover:border-tint-border hover:text-ink",
            )}
          >
            <input type="radio" name="composer-body-mode" value={mode} checked={checked} onChange={() => onChange(mode)} className="sr-only" />
            <span
              aria-hidden
              className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border-2", checked ? "border-brand" : "border-border-strong")}
            >
              {checked && <span className="size-1.5 rounded-full bg-brand" />}
            </span>
            <Icon aria-hidden className="size-4 shrink-0" />
            {label}
          </label>
        );
      })}
    </div>
  );
}
