"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { handleText } from "@/components/brand/user-handle";
import { AvatarPicker } from "@/components/onboarding/avatar-picker";
import { useUsernameCheck } from "@/components/onboarding/use-username-check";
import { ReadLanguagesPicker } from "@/components/onboarding/read-languages-picker";
import { UsernameField } from "@/components/onboarding/username-field";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PulseDot } from "@/components/ui/pulse-dot";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, isApiError } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { LIMITS, USERNAME_MESSAGES, validateNewUsername, type PressLanguage, type UpdateMeInput, type ViewerUser } from "@/lib/shared/contracts";

type Profile = { username: string; name: string; bio: string; image: string | null; languages: PressLanguage[] };
type FieldKey = keyof Profile;
type Errors = Partial<Record<FieldKey, string>>;

function profileOf(user: ViewerUser): Profile {
  return { username: user.username ?? "", name: user.name, bio: user.bio ?? "", image: user.image, languages: user.languages ?? [] };
}

const EASE = [0.2, 0.8, 0.2, 1] as const;

/**
 * /settings/profile editor: photo, username (your own counts as available), display name, bio.
 * Sends only changed fields to PATCH /api/me, then refreshes the server tree (nav avatar, bylines).
 */
export function ProfileSettingsForm({ viewer }: { viewer: ViewerUser }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [baseline, setBaseline] = useState<Profile>(() => profileOf(viewer));
  const [form, setForm] = useState<Profile>(() => profileOf(viewer));
  const [errors, setErrors] = useState<Errors>({});
  const [serverUsernameError, setServerUsernameError] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const check = useUsernameCheck(form.username, baseline.username);
  const usernameRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const bioRef = useRef<HTMLTextAreaElement>(null);

  const changes: UpdateMeInput = {};
  if (form.username !== baseline.username) changes.username = form.username;
  if (form.name.trim() !== baseline.name) changes.name = form.name.trim();
  if (form.bio.trim() !== baseline.bio.trim()) changes.bio = form.bio.trim();
  if (form.image && form.image !== baseline.image) changes.image = form.image;
  if (form.languages.join() !== baseline.languages.join()) changes.languages = form.languages;
  const dirty = Object.keys(changes).length > 0 || form.name !== baseline.name || form.bio !== baseline.bio;

  // Unsaved-changes guard for reloads / closing the tab.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const update = <K extends FieldKey>(key: K, value: Profile[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const verifyUsername = async (): Promise<string | null> => {
    const username = form.username;
    if (!username) return "Choose a username";
    if (username === baseline.username) return null;
    const format = validateNewUsername(username);
    if (!format.ok && format.code !== "reserved") return format.message;
    try {
      const result = await queryClient.fetchQuery({
        queryKey: qk.usernameCheck(username),
        queryFn: ({ signal }) => api.checkUsername(username, signal),
        staleTime: 30_000,
      });
      return result.available ? null : result.message || USERNAME_MESSAGES.taken;
    } catch {
      return null;
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || avatarBusy || !dirty) return;

    const found: Errors = {};
    const usernameError = await verifyUsername();
    if (usernameError) found.username = usernameError;
    if (!form.name.trim()) found.name = "Name is required";
    if (!form.bio.trim()) found.bio = "Bio is required";
    if (!form.image) found.image = "Please add a profile photo";
    if (form.languages.length === 0) found.languages = "Pick at least one language you read";
    setErrors(found);
    if (Object.keys(found).length > 0) {
      if (found.username) usernameRef.current?.focus();
      else if (found.name) nameRef.current?.focus();
      else if (found.bio) bioRef.current?.focus();
      return;
    }
    if (Object.keys(changes).length === 0) {
      setForm(baseline);
      return;
    }

    setSaving(true);
    try {
      const { user } = await api.updateMe(changes);
      const saved = profileOf(user);
      setBaseline(saved);
      setForm(saved);
      setSavedAt(Date.now());
      void queryClient.invalidateQueries({ queryKey: qk.profile(baseline.username) });
      if (saved.username !== baseline.username) void queryClient.invalidateQueries({ queryKey: qk.profile(saved.username) });
      toast.success("Profile updated", {
        description: saved.username !== baseline.username ? `Your username is now ${handleText(saved.username)}.` : "Your changes are live.",
        action: { label: "View profile", href: `/${saved.username}` },
      });
      router.refresh();
    } catch (error) {
      if (!isApiError(error)) {
        toast.error("Couldn't save your profile", { description: errorMessage(error) });
      } else if (error.code === "username_taken") {
        void check.invalidate(form.username);
        setServerUsernameError(USERNAME_MESSAGES.taken);
        usernameRef.current?.focus();
      } else if (error.fields && Object.keys(error.fields).length > 0) {
        const mapped: Errors = {};
        for (const key of ["username", "name", "bio", "image", "languages"] as const) if (error.fields[key]) mapped[key] = error.fields[key];
        if (mapped.username) setServerUsernameError(mapped.username);
        setErrors(mapped);
        if (Object.keys(mapped).length === 0) toast.error("Couldn't save your profile", { description: error.message });
      } else {
        toast.error("Couldn't save your profile", { description: error.message });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-label="Edit profile"
      // Full screen (owner 2026-10-23): ≥1024px the photo in a left column, the details beside it.
      className="card relative overflow-hidden lg:grid lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]"
    >
      <span aria-hidden className="absolute top-0 left-0 h-0.75 w-24 bg-brand" />

      <section aria-labelledby="settings-photo" className="px-5 pb-6 pt-7 sm:px-8 lg:row-span-2 lg:border-r lg:border-border">
        <SectionTitle id="settings-photo" title="Photo" description="Shown on your profile and next to every story you publish." />
        <AvatarPicker
          className="mt-5"
          layout="inline"
          label="Profile photo"
          value={form.image}
          onChange={(url) => update("image", url)}
          name={form.name || form.username}
          error={errors.image}
          onBusyChange={setAvatarBusy}
        />
      </section>

      <section aria-labelledby="settings-public" className="flex flex-col gap-6 border-t border-border px-5 py-7 sm:px-8 lg:border-t-0">
        <SectionTitle id="settings-public" title="Public profile" description="Everything here is visible to readers." />
        <UsernameField
          value={form.username}
          onChange={(value) => {
            update("username", value);
            setServerUsernameError(null);
          }}
          status={check.status}
          onPickSuggestion={(suggestion) => {
            check.primeAvailable(suggestion);
            update("username", suggestion);
            setServerUsernameError(null);
          }}
          error={serverUsernameError ?? errors.username}
          inputRef={usernameRef}
        />
        <Field label="Display name" required error={errors.name} labelAside={`${form.name.length}/${LIMITS.nameMax}`}>
          <Input
            ref={nameRef}
            name="name"
            autoComplete="name"
            maxLength={LIMITS.nameMax}
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            size="lg"
          />
        </Field>
        <Field label="Bio" required error={errors.bio} hint="Line breaks are kept.">
          <Textarea
            ref={bioRef}
            name="bio"
            maxLength={LIMITS.bioMax}
            rows={3}
            autoGrow
            maxRows={6}
            value={form.bio}
            onChange={(event) => update("bio", event.target.value)}
          />
        </Field>
      </section>

      <section aria-labelledby="settings-languages" className="flex flex-col gap-5 border-t border-border px-5 py-7 sm:px-8 lg:col-start-2">
        <SectionTitle id="settings-languages" title="Your feeds" description="Only you see this." />
        <ReadLanguagesPicker
          value={form.languages}
          onChange={(next) => update("languages", next)}
          error={errors.languages}
          reporter={viewer.role === "reporter"}
        />
      </section>

      <div className="flex flex-col-reverse gap-3 border-t border-border bg-surface-2/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:col-span-2">
        <div aria-live="polite" className="min-h-5 text-[0.8125rem]">
          {dirty ? (
            <motion.span
              key="dirty"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: EASE }}
              className="flex items-center gap-2 font-semibold text-ink-2"
            >
              <PulseDot size="xs" />
              Unsaved changes
            </motion.span>
          ) : savedAt > 0 ? (
            <motion.span
              key={`saved-${savedAt}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: EASE }}
              className="flex items-center gap-1.5 font-semibold text-success"
            >
              <Check aria-hidden className="size-4" strokeWidth={3} />
              All changes saved
            </motion.span>
          ) : null}
        </div>
        <div className="flex items-center gap-2 sm:justify-end">
          {dirty && (
            <Button
              variant="ghost"
              onClick={() => {
                setForm(baseline);
                setErrors({});
                setServerUsernameError(null);
              }}
              disabled={saving}
              className="flex-1 sm:flex-none"
            >
              Discard
            </Button>
          )}
          <Button
            type="submit"
            size="lg"
            loading={saving}
            disabled={!dirty || avatarBusy}
            className="flex-1 sm:min-w-44 sm:flex-none"
          >
            Save changes
          </Button>
        </div>
      </div>
    </form>
  );
}

function SectionTitle({ id, title, description }: { id: string; title: string; description: string }) {
  return (
    <div>
      <h2 id={id} className="font-wide text-lg font-extrabold tracking-[-0.01em] text-ink">
        {title}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
    </div>
  );
}
