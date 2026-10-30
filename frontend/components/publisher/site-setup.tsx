"use client";

import { ArrowLeft, Check, CircleAlert, Copy, Globe, ImagePlus, Loader2, Plug, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, isApiError, uploadImage } from "@/lib/api";
import {
  SITE_LIMITS,
  SITE_SECTION_SIZE,
  sitePasswordOk,
  sitePhoneProblem,
  type ArticleCard,
  type Category,
  type MySiteResponse,
  type SiteConnection,
  type SiteLanguage,
  type SiteSection,
} from "@/lib/shared/contracts";
import { PasswordInput } from "@/components/auth/password-input";
import { SiteChrome } from "./site-chrome";
import { CountrySelect, PasswordChecklist, cleanDigits, joinPhone, splitPhone } from "./site-fields";
import { SiteHomeBody } from "./site-home";
import { MenuCard } from "./site-menu-card";

type Form = {
  title: string;
  tagline: string;
  logoUrl: string | null;
  logoKey: string | null;
  city: string;
  contactEmail: string;
  phoneCode: string;
  phoneDigits: string;
  address: string;
  footerText: string;
  sourceId: string;
  adminEmail: string;
  adminPassword: string;
  /** The menu's categories in order; null = automatic (every category with stories). */
  navCategories: Category[] | null;
  language: SiteLanguage;
};

/** The preview's menu and home rows, as the live site will deal them (backend siteHome). */
function previewMenu(form: Form, posted: Category[], latest: ArticleCard[]): { categories: Category[]; sections: SiteSection[] } {
  const categories = form.navCategories ? form.navCategories.filter((c) => posted.includes(c)) : posted;
  const sections = categories.map((category) => ({ category, stories: latest.filter((card) => card.category === category).slice(0, SITE_SECTION_SIZE) }));
  return { categories, sections };
}

function formOf(data: MySiteResponse): Form {
  const s = data.site;
  return {
    // Empty for a new site: the placeholder asks for it (owner 2026-10-30: not the account's name).
    title: s?.title ?? "",
    tagline: s?.tagline ?? "",
    logoUrl: s?.logoUrl ?? null,
    logoKey: null,
    city: s?.city ?? "",
    contactEmail: s?.contactEmail ?? "",
    phoneCode: splitPhone(s?.contactPhone ?? "").code,
    phoneDigits: splitPhone(s?.contactPhone ?? "").digits,
    address: s?.address ?? "",
    footerText: s?.footerText ?? "",
    sourceId: s?.sourceId ?? data.sources[0]?.id ?? "",
    adminEmail: s?.adminEmail ?? "",
    adminPassword: "",
    navCategories: s?.navCategories ?? null,
    language: s?.language ?? "en",
  };
}

/** Where each field is, for the error list (owner 2026-10-30: "if error, show where"). */
const FIELD_LABELS: Record<string, string> = {
  title: "Title (in the preview, middle of the header)",
  tagline: "Tagline (in the preview, under the title)",
  logoUrl: "Logo (click the logo in the preview)",
  logoKey: "Logo (click the logo in the preview)",
  sourceId: "Stories on the site → Show stories from",
  city: "Stories on the site → City",
  adminEmail: "Admin login → Admin email",
  adminPassword: "Admin login → Admin password",
  contactEmail: "Footer → Email",
  contactPhone: "Footer → Phone",
  address: "Footer → Address",
  footerText: "Footer → Footer line",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Checked before saving (owner 2026-10-30), so mistakes show on the fields; the API checks the same rules. */
function validate(form: Form, isNew: boolean): Record<string, string> {
  const problems: Record<string, string> = {};
  // Logo, title and tagline are required (owner 2026-10-30).
  if (!form.logoUrl) problems.logoUrl = "Add your logo";
  if (form.title.trim().length < 2) problems.title = "Add your site's title";
  if (form.tagline.trim().length < 2) problems.tagline = "Add your tagline";
  if (!EMAIL.test(form.adminEmail)) problems.adminEmail = "Enter a valid email address";
  if (isNew && !form.adminPassword) problems.adminPassword = "Set a password for your site's admin";
  else if (form.adminPassword && !sitePasswordOk(form.adminPassword)) problems.adminPassword = "The password doesn't meet every rule below";
  if (form.contactEmail && !EMAIL.test(form.contactEmail)) problems.contactEmail = "Enter a valid email address";
  if (form.phoneDigits) {
    const problem = sitePhoneProblem(joinPhone(form.phoneCode, form.phoneDigits));
    if (problem) problems.contactPhone = problem;
  }
  return problems;
}

const CONNECTION: Record<SiteConnection, { label: string; tone: string }> = {
  not_connected: { label: "Connecting", tone: "bg-surface-3 text-ink-2" },
  pending_dns: { label: "Waiting for DNS", tone: "bg-amber-100 text-amber-800" },
  live: { label: "Live", tone: "bg-success-soft text-success-strong" },
};

/**
 * /site-setup (owner 2026-10-29): the publisher's website as it will look — the real webnews.in layout with their
 * stories, not editable — except the logo (click → upload popup), the title and the tagline in the middle. Above it:
 * whose stories it shows, the admin email + password for `<domain>/admin`, footer details, and connecting the domain.
 */
export function SiteSetup() {
  const [data, setData] = useState<MySiteResponse | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [logoOpen, setLogoOpen] = useState(false);

  useEffect(() => {
    api.sites
      .mine()
      .then((d) => {
        setData(d);
        setForm(formOf(d));
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  // Picking another source refreshes the preview with its stories.
  const pickSource = async (sourceId: string) => {
    setForm((f) => (f ? { ...f, sourceId } : f));
    try {
      const next = await api.sites.mine(sourceId);
      setData((d) => (d ? { ...d, preview: next.preview, postedCategories: next.postedCategories } : next));
    } catch {
      /* the preview keeps the previous stories */
    }
  };

  const save = async () => {
    if (!form) return;
    const problems = validate(form, !data?.site);
    setFieldErrors(problems);
    if (Object.keys(problems).length > 0) {
      showProblems(problems);
      return;
    }
    setSaving(true);
    try {
      const next = await api.sites.save({
        title: form.title,
        tagline: form.tagline,
        logoUrl: form.logoUrl ?? "",
        logoKey: form.logoKey,
        city: form.city,
        contactEmail: form.contactEmail,
        contactPhone: joinPhone(form.phoneCode, form.phoneDigits),
        address: form.address,
        footerText: form.footerText,
        sourceId: form.sourceId,
        adminEmail: form.adminEmail,
        adminPassword: form.adminPassword || undefined,
        navCategories: form.navCategories,
        language: form.language,
      });
      setData(next);
      setForm((f) => (f ? { ...f, adminPassword: "", logoKey: null } : f));
      toast.success("Website saved");
    } catch (err) {
      if (isApiError(err) && err.fields) {
        setFieldErrors(err.fields);
        showProblems(err.fields);
      } else {
        toast.error("Couldn't save", { description: errorMessage(err) });
      }
    } finally {
      setSaving(false);
    }
  };

  // The list sits under the toolbar; jump there so it's seen.
  const showProblems = (problems: Record<string, string>) => {
    const [field, message] = Object.entries(problems)[0]!;
    toast.error("Couldn't save", { description: `${FIELD_LABELS[field] ?? field}: ${message}` });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (error) return <p className="card mx-auto mt-10 max-w-xl px-5 py-8 text-center text-sm text-muted">{error}</p>;
  if (!data || !form) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 aria-hidden className="size-6 animate-spin text-brand" />
      </div>
    );
  }

  if (!data.domain) {
    return (
      <div className="card mx-auto mt-10 flex max-w-xl flex-col items-center gap-4 px-6 py-10 text-center">
        <Globe aria-hidden className="size-10 text-brand" strokeWidth={1.5} />
        <h1 className="font-wide text-2xl font-black text-ink">Verify your domain first</h1>
        <p className="text-sm text-muted">Your website runs on your own domain. Verify it with a DNS record, then come back here.</p>
        <Button href="/settings?section=domain">Go to Your domain</Button>
      </div>
    );
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const isNew = !data.site;
  const connection = data.site?.connection ?? "not_connected";
  const menu = previewMenu(form, data.postedCategories, data.preview.latest);

  return (
    <div className="flex flex-col">
      {/* Toolbar (WebNEWS) */}
      <div className="sticky top-0 z-50 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <Link href="/settings?section=domain" aria-label="Back" className="flex size-10 items-center justify-center rounded-full text-ink hover:bg-tint-2">
            <ArrowLeft aria-hidden className="size-5" />
          </Link>
          <div className="min-w-0">
            <p className="truncate font-wide text-base font-black text-ink">Your website</p>
            <p className="truncate text-xs text-muted">{data.domain}</p>
          </div>
          {data.site && (
            <span className={`ml-1 hidden rounded-full px-2.5 py-1 text-xs font-bold sm:inline ${CONNECTION[connection].tone}`}>{CONNECTION[connection].label}</span>
          )}
          <Button className="ml-auto rounded-2xl px-6" loading={saving} onClick={() => void save()} leftIcon={<Check aria-hidden />}>
            {isNew ? "Save website" : "Save"}
          </Button>
        </div>
      </div>

      {/* Setup panel (WebNEWS) */}
      <div className="border-b border-border bg-bg">
        {Object.keys(fieldErrors).length > 0 && (
          <div role="alert" className="mx-auto max-w-7xl px-4 pt-6">
            <div className="rounded-2xl border border-brand/30 bg-tint px-5 py-4">
              <p className="flex items-center gap-2 text-sm font-bold text-brand">
                <CircleAlert aria-hidden className="size-4" /> Fix {Object.keys(fieldErrors).length === 1 ? "this" : "these"} to save
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-2">
                {Object.entries(fieldErrors).map(([field, message]) => (
                  <li key={field}>
                    <strong className="font-semibold text-ink">{FIELD_LABELS[field] ?? field}</strong> — {message}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 lg:grid-cols-3">
          <section className="card flex flex-col gap-4 p-5">
            <h2 className="font-wide text-lg font-extrabold text-ink">Stories on the site</h2>
            <Field label="Show stories from" hint="A group shows every story the group publishes." error={fieldErrors.sourceId}>
              <select
                value={form.sourceId}
                onChange={(e) => void pickSource(e.target.value)}
                className="h-11 w-full rounded-xl border border-border-strong bg-surface px-3 text-sm text-ink"
              >
                {data.sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.kind === "group" ? "(group)" : "(your account)"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="City" hint="For the weather card." error={fieldErrors.city}>
              <Input value={form.city} maxLength={SITE_LIMITS.cityMax} onChange={(e) => set("city", e.target.value)} placeholder="e.g. Mangaluru" />
            </Field>
          </section>

          <MenuCard
            posted={data.postedCategories}
            chosen={form.navCategories}
            onChosen={(navCategories) => setForm((f) => (f ? { ...f, navCategories } : f))}
            language={form.language}
            onLanguage={(language) => set("language", language)}
          />

          <section className="card flex flex-col gap-4 p-5">
            <h2 className="font-wide text-lg font-extrabold text-ink">Admin login</h2>
            <p className="-mt-2 text-xs text-muted">
              For <strong className="text-ink">{data.domain}/admin</strong> — separate from your WebNEWS login.
            </p>
            <Field label="Admin email" required error={fieldErrors.adminEmail}>
              <Input
                type="email"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={form.adminEmail}
                onChange={(e) => set("adminEmail", e.target.value.trim())}
                placeholder="admin@yoursite.com"
              />
            </Field>
            <Field
              label={isNew ? "Admin password" : "New admin password"}
              required={isNew}
              hint={isNew ? undefined : "Leave empty to keep the current one."}
              error={fieldErrors.adminPassword}
            >
              <PasswordInput autoComplete="new-password" maxLength={SITE_LIMITS.passwordMax} value={form.adminPassword} onChange={(e) => set("adminPassword", e.target.value)} />
            </Field>
            {(isNew || form.adminPassword) && <PasswordChecklist value={form.adminPassword} className="-mt-2" />}
          </section>

          <section className="card flex flex-col gap-4 p-5">
            <h2 className="font-wide text-lg font-extrabold text-ink">Footer</h2>
            <Field label="Footer line" hint={`Under your logo at the bottom of every page. Empty: "News${form.city ? ` from ${form.city}` : ""} — reported and published every day."`} error={fieldErrors.footerText}>
              <Input value={form.footerText} maxLength={SITE_LIMITS.footerTextMax} onChange={(e) => set("footerText", e.target.value)} />
            </Field>
            <Field label="Email" error={fieldErrors.contactEmail}>
              <Input type="email" autoCapitalize="none" spellCheck={false} value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value.trim())} />
            </Field>
            <Field
              label="Phone"
              hint={form.phoneCode === "+91" ? `${form.phoneDigits.length}/10 digits` : undefined}
              error={fieldErrors.contactPhone}
            >
              <Input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder={form.phoneCode === "+91" ? "98765 43210" : "Mobile number"}
                value={form.phoneDigits}
                onChange={(e) => set("phoneDigits", cleanDigits(form.phoneCode, e.target.value))}
                prefix={
                  <CountrySelect
                    value={form.phoneCode}
                    onChange={(code) => setForm((f) => (f ? { ...f, phoneCode: code, phoneDigits: cleanDigits(code, f.phoneDigits) } : f))}
                    className="-ml-1 text-ink"
                  />
                }
              />
            </Field>
            <Field label="Address" error={fieldErrors.address}>
              <Input value={form.address} maxLength={SITE_LIMITS.addressMax} onChange={(e) => set("address", e.target.value)} />
            </Field>
          </section>

          {data.site && <ConnectCard data={data} connection={connection} />}
        </div>
        <p className="mx-auto max-w-7xl px-4 pb-4 text-xs text-muted">
          Preview below — click the logo to add yours, type your title and tagline in the middle. The rest of the layout is fixed.
        </p>
      </div>

      {/* The site itself */}
      <div className="border-4 border-dashed border-tint-border">
        <SiteChrome
          site={{
            domain: data.domain,
            title: form.title,
            tagline: form.tagline || null,
            logoUrl: form.logoUrl,
            city: form.city || null,
            contactEmail: form.contactEmail || null,
            contactPhone: joinPhone(form.phoneCode, form.phoneDigits) || null,
            address: form.address || null,
            footerText: form.footerText || null,
          }}
          homeHref="#"
          ticker={data.preview.latest.slice(0, 8)}
          articleBase={null}
          ads={{}}
          categories={menu.categories}
          lang={form.language}
          preview
          editor={{
            onLogo: () => setLogoOpen(true),
            onTitle: (v) => set("title", v),
            onTagline: (v) => set("tagline", v),
            titleMax: SITE_LIMITS.titleMax,
            taglineMax: SITE_LIMITS.taglineMax,
            missing: {
              logo: Boolean(fieldErrors.logoUrl) && !form.logoUrl,
              title: Boolean(fieldErrors.title) && form.title.trim().length < 2,
              tagline: Boolean(fieldErrors.tagline) && form.tagline.trim().length < 2,
            },
          }}
        >
          <div className="pointer-events-none select-none">
            <SiteHomeBody
              latest={data.preview.latest}
              trending={data.preview.trending}
              breaking={[]}
              sections={menu.sections}
              ads={{}}
              city={form.city || null}
              href={() => "#"}
              categoryHref={null}
              bookHref={null}
              lang={form.language}
              preview
            />
          </div>
        </SiteChrome>
      </div>

      <LogoDialog
        open={logoOpen}
        onOpenChange={setLogoOpen}
        current={form.logoUrl}
        required
        onDone={(logo) => setForm((f) => (f ? { ...f, logoUrl: logo?.url ?? null, logoKey: logo?.key ?? null } : f))}
      />
    </div>
  );
}

/**
 * Where the domain stands (owner 2026-10-30: one step — saving connects it, no button): the records again until it's
 * live, then "Open site".
 */
function ConnectCard({ data, connection }: { data: MySiteResponse; connection: SiteConnection }) {
  const copy = (text: string) => void navigator.clipboard?.writeText(text).then(() => toast.success("Copied"));
  return (
    <section className="card flex flex-col gap-4 p-5 lg:col-span-3">
      <div className="flex flex-wrap items-center gap-3">
        <Plug aria-hidden className="size-5 text-brand" />
        <h2 className="font-wide text-lg font-extrabold text-ink">{data.domain}</h2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${CONNECTION[connection].tone}`}>{CONNECTION[connection].label}</span>
        {connection === "live" && (
          <Button href={`https://${data.domain}`} variant="outline" className="ml-auto rounded-2xl">
            Open site
          </Button>
        )}
      </div>
      {connection !== "live" && (
        <>
          <p className="text-sm text-muted">
            Your website opens on {data.domain} once {data.dns.length === 1 ? "this record is" : "these records are"} at your DNS provider (you
            may have added {data.dns.length === 1 ? "it" : "them"} with the verification record already). It can take a few minutes to a few hours;
            this page shows <strong className="text-ink">Live</strong> once it works.
          </p>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-[0.6875rem] font-bold uppercase tracking-widest text-muted">
                <tr>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Host / Name</th>
                  <th className="px-3 py-2">Value</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.dns.map((r) => (
                  <tr key={`${r.type}-${r.host}-${r.value}`}>
                    <td className="px-3 py-2 font-mono">{r.type}</td>
                    <td className="px-3 py-2 font-mono">{r.host}</td>
                    <td className="break-all px-3 py-2 font-mono">{r.value}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => copy(r.value)} aria-label={`Copy ${r.type} value`} className="rounded-md p-1.5 text-muted hover:bg-tint-2 hover:text-brand">
                        <Copy aria-hidden className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="flex items-start gap-2 text-xs text-muted">
            <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            Keep the webnews-verification TXT record too — it proves the domain is still yours.
          </p>
        </>
      )}
    </section>
  );
}

/** "Add your logo" (owner 2026-10-29): upload, see it, done — or remove it. */
function LogoDialog({
  open,
  onOpenChange,
  current,
  onDone,
  required = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: string | null;
  /** The logo is required: no "Remove logo", only replace. */
  required?: boolean;
  onDone: (logo: { url: string; key: string } | null) => void;
}) {
  const [picked, setPicked] = useState<{ url: string; key: string } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const shown = picked?.url ?? current;

  const upload = async (file: File) => {
    setProgress(0);
    try {
      const up = await uploadImage(file, "logo", setProgress);
      setPicked({ url: up.url, key: up.key });
    } catch (err) {
      toast.error("Couldn't upload the logo", { description: errorMessage(err) });
    } finally {
      setProgress(null);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) setPicked(null);
        onOpenChange(next);
      }}
      title="Add your logo"
      description="A PNG with a transparent background looks best. It sits above your title."
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          {current && !required && (
            <Button
              variant="ghost"
              leftIcon={<Trash2 aria-hidden />}
              onClick={() => {
                onDone(null);
                onOpenChange(false);
              }}
            >
              Remove logo
            </Button>
          )}
          <Button
            className="ml-auto"
            disabled={!picked || progress !== null}
            onClick={() => {
              if (picked) onDone(picked);
              setPicked(null);
              onOpenChange(false);
            }}
          >
            Use this logo
          </Button>
        </div>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={progress !== null}
        className="flex h-44 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-tint-border bg-tint/40 text-sm font-bold text-brand transition hover:bg-tint"
      >
        {progress !== null ? (
          <>
            <Loader2 aria-hidden className="size-6 animate-spin" />
            Uploading {Math.round(progress * 100)}%
          </>
        ) : shown ? (
          <img src={shown} alt="Your logo" className="max-h-28 max-w-[80%] object-contain" />
        ) : (
          <>
            <ImagePlus aria-hidden className="size-8" />
            Choose an image
          </>
        )}
      </button>
      {shown && progress === null && <p className="mt-2 text-center text-xs text-muted">Tap the image to choose another.</p>}
    </Modal>
  );
}
