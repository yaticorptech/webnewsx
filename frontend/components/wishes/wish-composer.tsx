"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Cake, Camera, ImagePlus, Mail, Save, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, isApiError, uploadImage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { WISH_LIMITS, WISH_TEMPLATES, type WishKind, type WishTemplate } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { WishArt } from "./wish-card";

const TEMPLATE_LABELS: Record<WishTemplate, string> = {
  party: "Party",
  flyer: "Flyer",
  photo: "Full photo",
  custom: "Your own design",
  confetti: "Confetti",
  balloons: "Balloons",
  classic: "Classic",
  elegant: "Elegant",
  festive: "Festive",
  minimal: "Minimal",
};

const input =
  "w-full rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-[0.9375rem] text-ink outline-none transition-colors focus:border-brand focus:shadow-[0_0_0_3px_var(--tint-3)]";

/**
 * Post a birthday wish or an invitation (owner 2026-10-31): any member, no Press Pass. Pick the kind and a design, fill
 * in the few fields and see the card as people will; it then appears in the Home feed between stories (never on top) and
 * stays there — no expiry (owner 2026-10-31).
 */
export function WishComposer({
  author,
  invitations,
  kindSwitch = null,
}: {
  author: { username: string; name: string; image: string | null };
  invitations: boolean;
  /** The + page's Article | Birthday wish choice, above the form (owner 2026-10-31). */
  kindSwitch?: ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<WishKind>("birthday");
  const [template, setTemplate] = useState<WishTemplate>("party");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [eventAt, setEventAt] = useState("");
  const [venue, setVenue] = useState("");
  const [photo, setPhoto] = useState<{ url: string; key: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const pickKind = (next: WishKind) => {
    setKind(next);
    setTemplate(WISH_TEMPLATES[next][0]);
    setErrors({});
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const image = await uploadImage(file, "wish");
      setPhoto({ url: image.url, key: image.key });
    } catch (error) {
      toast.error("Couldn't upload the photo", { id: "wish-photo", description: errorMessage(error) });
    } finally {
      setUploading(false);
    }
  };

  // Drafts (owner 2026-10-31): kept on this device until posted; reopening the page brings the draft back.
  const draftKey = `wn_wish_draft:${author.username}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) ?? "null") as null | {
        kind: WishKind;
        template: WishTemplate;
        title: string;
        message: string;
        eventAt: string;
        venue: string;
        photo: { url: string; key: string } | null;
      };
      if (!saved) return;
      if (saved.kind === "invitation" && !invitations) return;
      // After the first paint (the page is server-rendered without it).
      const timer = setTimeout(() => {
        setKind(saved.kind);
        setTemplate(saved.template);
        setTitle(saved.title);
        setMessage(saved.message);
        setEventAt(saved.eventAt);
        setVenue(saved.venue);
        setPhoto(saved.photo);
        toast.success("Draft restored", { id: "wish-draft" });
      }, 0);
      return () => clearTimeout(timer);
    } catch {
      // A broken draft is ignored.
    }
  }, [draftKey, invitations]);
  const saveDraft = () => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ kind, template, title, message, eventAt, venue, photo }));
      toast.success("Draft saved", { id: "wish-draft", description: "It's here when you come back." });
    } catch {
      toast.error("Couldn't save the draft", { id: "wish-draft" });
    }
  };

  const pickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void upload(file);
    event.target.value = "";
  };

  const post = async () => {
    const next: Record<string, string> = {};
    // A name or a photo (owner 2026-10-31: "only an image is fine too").
    if (!title.trim() && !photo)
      next.title = kind === "birthday" ? "Write their name or add a photo" : "Write the event's name or add a photo";
    if (kind === "invitation" && !eventAt) next.eventAt = "Choose the date and time";
    if (template === "custom" && !photo) next.photo = "Upload your design";
    setErrors(next);
    if (Object.keys(next).length) return;
    setPosting(true);
    try {
      await api.wishes.create({
        kind,
        template,
        title: title.trim(),
        message: message.trim(),
        photo,
        eventAt: kind === "invitation" ? new Date(eventAt).toISOString() : null,
        venue: kind === "invitation" ? venue.trim() || null : null,
      });
      void queryClient.invalidateQueries({ queryKey: qk.wishes });
      try {
        localStorage.removeItem(draftKey);
      } catch {
        // Nothing to clear.
      }
      toast.success(kind === "birthday" ? "Birthday wish posted" : "Invitation posted", {
        id: "wish-posted",
        description: "It shows in the Home feed between stories.",
      });
      router.push("/");
    } catch (error) {
      if (isApiError(error) && error.fields) setErrors(Object.fromEntries(Object.entries(error.fields).map(([k, v]) => [k, String(v)])));
      else toast.error("Couldn't post it", { id: "wish-posted", description: errorMessage(error) });
    } finally {
      setPosting(false);
    }
  };

  const preview = {
    kind,
    template,
    title: title.trim(),
    message: message.trim() || null,
    photoUrl: photo?.url ?? null,
    eventAt: kind === "invitation" && eventAt ? new Date(eventAt).toISOString() : null,
    venue: kind === "invitation" ? venue.trim() || null : null,
    author,
  };

  return (
    // Full width (owner 2026-10-31): the form on the left, the live preview beside it — under it on phones.
    <div data-grid-page="" className="mx-auto flex w-full max-w-6xl flex-col gap-6 sm:gap-8">
      {kindSwitch}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] lg:gap-12">
        <section className="flex min-w-0 flex-col gap-6">
          {/* Invitations are for Press Pass holders; everyone else gets the birthday designs only (owner 2026-10-31). */}
          {invitations && (
            <div role="radiogroup" aria-label="What are you posting?" className="inline-flex w-full rounded-full bg-surface-2 p-1 sm:w-auto sm:self-start">
              {(
                [
                  ["birthday", "Birthday wish", Cake],
                  ["invitation", "Invitation", Mail],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={kind === value}
                  onClick={() => pickKind(value)}
                  className={cn(
                    "flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition-all sm:flex-none",
                    kind === value ? "bg-surface text-brand shadow-[0_1px_3px_rgb(16_24_40/0.12)]" : "text-muted hover:text-ink",
                  )}
                >
                  <Icon aria-hidden className="size-4 shrink-0" />
                  {label}
                </button>
              ))}
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">
              {kind === "birthday" ? "Whose birthday?" : "Event name"}{" "}
              <span className="font-normal text-muted">(optional with a photo)</span>
            </span>
            <input
              className={cn(input, errors.title && "border-brand")}
              value={title}
              maxLength={WISH_LIMITS.titleMax}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === "birthday" ? "e.g. Asha Shetty" : "e.g. House warming ceremony"}
            />
            {errors.title && <span className="text-xs font-semibold text-brand">{errors.title}</span>}
          </label>

          {kind === "invitation" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-ink">Date & time</span>
                <input
                  type="datetime-local"
                  className={cn(input, errors.eventAt && "border-brand")}
                  value={eventAt}
                  onChange={(e) => setEventAt(e.target.value)}
                />
                {errors.eventAt && <span className="text-xs font-semibold text-brand">{errors.eventAt}</span>}
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-ink">Venue</span>
                <input
                  className={input}
                  value={venue}
                  maxLength={WISH_LIMITS.venueMax}
                  onChange={(e) => setVenue(e.target.value)}
                  placeholder="e.g. Town Hall, Mangaluru"
                />
              </label>
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">Message</span>
            <textarea
              className={cn(input, "min-h-24 resize-y")}
              value={message}
              maxLength={WISH_LIMITS.messageMax}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={kind === "birthday" ? "Wishing you a wonderful year ahead!" : "We'd love to have you with us."}
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">{template === "custom" ? "Your design (required)" : "Photo (optional)"}</span>
            {template === "custom" && (
              <span className="text-xs text-muted">Upload a finished card image (JPG or PNG). It&rsquo;s shown exactly as it is.</span>
            )}
            {errors.photo && <span className="text-xs font-semibold text-brand">{errors.photo}</span>}
            {/* Two ways in (owner 2026-10-31): the camera, or a photo from the gallery / computer. */}
            <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={pickFile} />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              onChange={pickFile}
            />
            {photo ? (
              <div className="flex flex-wrap items-center gap-3">
                <img src={photo.url} alt="" className="size-16 rounded-xl object-cover" />
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Upload aria-hidden />}
                  loading={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  Change
                </Button>
                <Button variant="ghost" size="sm" leftIcon={<X aria-hidden />} onClick={() => setPhoto(null)}>
                  Remove
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
                <Button
                  variant="outline"
                  size="md"
                  leftIcon={<Camera aria-hidden />}
                  disabled={uploading}
                  onClick={() => cameraRef.current?.click()}
                >
                  Take a photo
                </Button>
                <Button
                  variant="outline"
                  size="md"
                  leftIcon={<ImagePlus aria-hidden />}
                  loading={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {template === "custom" ? "Upload design" : "Upload photo"}
                </Button>
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-ink">Design</p>
            {/* Phones: one row that scrolls sideways; wider screens: a grid. */}
            <div
              role="radiogroup"
              aria-label="Design"
              className="no-scrollbar -mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 sm:pb-0"
            >
              {WISH_TEMPLATES[kind].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={template === value}
                  onClick={() => setTemplate(value)}
                  className={cn(
                    "flex shrink-0 snap-start flex-col items-center gap-1.5 rounded-xl border-2 p-1.5 transition-colors",
                    template === value ? "border-brand bg-tint" : "border-border hover:border-border-strong",
                  )}
                >
                  {/* The real design at card size, shrunk to a thumbnail (zoom keeps the layout, unlike transform). */}
                  <span aria-hidden className="pointer-events-none block h-[135px] w-[108px] overflow-hidden rounded-lg">
                    <span className="block w-[360px]" style={{ zoom: 0.3 }}>
                      <WishArt data={{ ...preview, template: value, message: null, title: preview.title }} />
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-ink">{TEMPLATE_LABELS[value]}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 text-sm font-semibold text-muted">Preview</p>
          <WishArt data={preview} className="mx-auto max-w-sm lg:max-w-none" />
          {/* After the preview (owner 2026-10-31): post it, keep it as a draft on this device, or leave. */}
          <div className="mx-auto mt-5 flex max-w-sm flex-col gap-2.5 lg:max-w-none">
            <Button size="lg" fullWidth loading={posting} disabled={uploading} onClick={() => void post()}>
              {kind === "birthday" ? "Post birthday wish" : "Post invitation"}
            </Button>
            <div className="grid grid-cols-2 gap-2.5">
              <Button size="lg" variant="outline" leftIcon={<Save aria-hidden />} onClick={saveDraft}>
                Save draft
              </Button>
              <Button size="lg" variant="ghost" href="/">
                Cancel
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
