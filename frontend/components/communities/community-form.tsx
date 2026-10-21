"use client";

import { Camera, Globe, Lock } from "lucide-react";
import { useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { CHAT_LIMITS, type CommunityVisibility } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

export type CommunityFormValue = { name: string; description: string; visibility: CommunityVisibility; image: string | null };

/** Name, description, public / private and an optional photo — shared by "Create community" and "Edit". */
export function CommunityFields({ value, onChange }: { value: CommunityFormValue; onChange: (next: CommunityFormValue) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await api.upload(file, "avatar");
      onChange({ ...value, image: uploaded.url });
    } catch (error) {
      toast.error("Couldn't upload the photo", { description: errorMessage(error) });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const field = "w-full rounded-xl border border-border-strong bg-surface px-3.5 text-[0.9375rem] text-ink outline-none focus:border-brand";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label={value.image ? "Change photo" : "Add a photo"}
          className="relative shrink-0 rounded-full"
        >
          <Avatar src={value.image} name={value.name || "Community"} size={72} decorative />
          <span className="absolute -bottom-0.5 -right-0.5 flex size-7 items-center justify-center rounded-full bg-brand text-brand-contrast ring-2 ring-surface">
            <Camera aria-hidden className="size-3.5" />
          </span>
        </button>
        <div className="min-w-0 text-sm text-muted">
          <p className="font-bold text-ink">{uploading ? "Uploading…" : "Community photo"}</p>
          {value.image && (
            <button type="button" className="font-semibold text-brand hover:underline" onClick={() => onChange({ ...value, image: null })}>
              Remove
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(event) => void pick(event.target.files?.[0])} />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="kicker text-muted">Name</span>
        <input
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          maxLength={CHAT_LIMITS.nameMax}
          placeholder="e.g. Mysuru Local News"
          required
          className={cn(field, "h-11")}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="kicker text-muted">About (optional)</span>
        <textarea
          value={value.description}
          onChange={(event) => onChange({ ...value, description: event.target.value })}
          maxLength={CHAT_LIMITS.descriptionMax}
          rows={3}
          placeholder="What is this community for?"
          className={cn(field, "resize-none py-2.5")}
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="kicker mb-1.5 text-muted">Who can join</legend>
        {(
          [
            { v: "public", icon: <Globe aria-hidden />, title: "Public", hint: "Anyone can find it and join." },
            { v: "private", icon: <Lock aria-hidden />, title: "Private", hint: "Hidden — people join only when invited." },
          ] as const
        ).map((option) => (
          <label
            key={option.v}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors [&_svg]:size-4.5",
              value.visibility === option.v ? "border-brand bg-tint" : "border-border hover:border-border-strong",
            )}
          >
            <input
              type="radio"
              name="community-visibility"
              value={option.v}
              checked={value.visibility === option.v}
              onChange={() => onChange({ ...value, visibility: option.v })}
              className="sr-only"
            />
            <span className={cn("mt-0.5", value.visibility === option.v ? "text-brand" : "text-muted")}>{option.icon}</span>
            <span>
              <span className="block text-sm font-bold text-ink">{option.title}</span>
              <span className="block text-[0.8125rem] text-muted">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
