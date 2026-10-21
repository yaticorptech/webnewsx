"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { spotlightPackageSchema, type SpotlightPackage, type SpotlightPackageUpdateInput } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { ActionDialog } from "./action-dialog";
import { SubHeading } from "./section-header";

type Draft = { name: string; hours: string; priceInr: string; sort: string };

const toDraft = (pkg?: SpotlightPackage): Draft => ({
  name: pkg?.name ?? "",
  hours: pkg ? String(pkg.hours) : "",
  priceInr: pkg ? String(pkg.priceInr) : "",
  sort: pkg ? String(pkg.sort) : "",
});

/** Validates a draft with the shared zod schema; returns the parsed values or per-field messages. */
function parseDraft(draft: Draft, active: boolean) {
  const result = spotlightPackageSchema.safeParse({
    name: draft.name,
    hours: Number(draft.hours),
    priceInr: Number(draft.priceInr),
    sort: draft.sort === "" ? 0 : Number(draft.sort),
    active,
  });
  if (result.success) return { ok: true as const, value: result.data };
  const errors: Partial<Record<keyof Draft, string>> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof Draft | undefined;
    if (key && !errors[key]) {
      errors[key] =
        key === "name" ? "1–40 characters" : key === "hours" ? "Whole hours, 1–720" : key === "priceInr" ? "Whole rupees, 0–10,00,000" : "0–1000";
    }
  }
  return { ok: false as const, errors };
}

/** Package price editor (SPEC §3.11: defaults 6h ₹99 · 24h ₹249 · 72h ₹599, admin-editable). */
export function SpotlightPackages({ initial }: { initial: SpotlightPackage[] | null }) {
  const client = useQueryClient();
  const { data } = useQuery({
    queryKey: qk.adminSpotlightPackages,
    queryFn: ({ signal }) => api.admin.spotlightPackages(signal),
    initialData: initial ? { items: initial } : undefined,
    staleTime: 30_000,
  });
  const packages = [...(data?.items ?? [])].sort((a, b) => a.sort - b.sort || a.hours - b.hours);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<SpotlightPackage | null>(null);

  const refresh = () => {
    void client.invalidateQueries({ queryKey: qk.adminSpotlightPackages });
    void client.invalidateQueries({ queryKey: qk.spotlightPackages });
    void client.invalidateQueries({ queryKey: qk.adminAll });
  };

  const remove = useMutation({
    mutationFn: (pkg: SpotlightPackage) => api.admin.deletePackage(pkg.id),
    onSuccess: (_r, pkg) => toast.success("Package deleted", { description: `“${pkg.name}” is no longer offered.` }),
    onError: (error) => toast.error("Couldn't delete the package", { description: errorMessage(error) }),
    onSettled: refresh,
  });

  return (
    <section aria-labelledby="desk-packages" className="flex flex-col gap-4">
      <SubHeading
        id="desk-packages"
        title="Packages & prices"
        aside={
          !adding && (
            <Button variant="secondary" size="sm" leftIcon={<Plus aria-hidden />} onClick={() => setAdding(true)}>
              Add package
            </Button>
          )
        }
      />
      <p className="-mt-2 max-w-2xl text-sm text-muted">
        What reporters can pick in their Newsroom. Prices are in rupees; switch a package off to stop offering it without deleting its history.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence initial={false}>
          {packages.map((pkg) => (
            <PackageCard key={pkg.id} pkg={pkg} onSaved={refresh} onDelete={() => setDeleting(pkg)} />
          ))}
          {adding && <NewPackageCard key="new" onDone={() => setAdding(false)} onSaved={refresh} />}
        </AnimatePresence>
      </div>

      <ActionDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this package?"
        description="Reporters can no longer pick it. Past and running Spotlights that used it keep their details."
        confirmLabel="Delete package"
        confirmIcon={<Trash2 aria-hidden />}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting);
        }}
      >
        {deleting && (
          <p className="rounded-xl border border-border bg-surface-2/60 p-3 text-sm font-bold text-ink">
            {deleting.name} · {deleting.hours}h · ₹{deleting.priceInr}
          </p>
        )}
      </ActionDialog>
    </section>
  );
}

const cardMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.16 } },
  transition: { duration: 0.24, ease: [0.2, 0.8, 0.2, 1] as const },
};

function PackageCard({ pkg, onSaved, onDelete }: { pkg: SpotlightPackage; onSaved: () => void; onDelete: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(pkg));
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  // When the saved package really changes (a save, another admin), the draft follows it.
  const serverKey = `${pkg.name}|${pkg.hours}|${pkg.priceInr}|${pkg.sort}`;
  const [syncedFrom, setSyncedFrom] = useState(serverKey);
  if (syncedFrom !== serverKey) {
    setSyncedFrom(serverKey);
    setDraft(toDraft(pkg));
  }
  const original = toDraft(pkg);
  const dirty = (Object.keys(draft) as (keyof Draft)[]).some((key) => draft[key].trim() !== original[key]);

  const update = useMutation({
    mutationFn: (input: SpotlightPackageUpdateInput) => api.admin.updatePackage(pkg.id, input),
    onError: (error) => toast.error("Couldn't save the package", { description: errorMessage(error) }),
    onSettled: onSaved,
  });

  const save = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseDraft(draft, pkg.active);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    const changes: SpotlightPackageUpdateInput = {};
    if (parsed.value.name !== pkg.name) changes.name = parsed.value.name;
    if (parsed.value.hours !== pkg.hours) changes.hours = parsed.value.hours;
    if (parsed.value.priceInr !== pkg.priceInr) changes.priceInr = parsed.value.priceInr;
    if (parsed.value.sort !== pkg.sort) changes.sort = parsed.value.sort;
    update.mutate(changes, { onSuccess: () => toast.success("Package saved", { description: `${parsed.value.name} · ₹${parsed.value.priceInr}` }) });
  };

  const toggle = () => {
    const active = !pkg.active;
    update.mutate(
      { active },
      {
        onSuccess: () =>
          toast.success(active ? "Package offered again" : "Package switched off", {
            description: pkg.name,
            action: { label: "Undo", onClick: () => update.mutate({ active: !active }) },
          }),
      },
    );
  };

  return (
    <motion.form {...cardMotion} layout="position" onSubmit={save} noValidate className={cn("card flex flex-col gap-4 p-4", !pkg.active && "bg-surface-2/60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="kicker text-brand">{pkg.active ? "Offered" : "Switched off"}</p>
          <p className="mt-1 truncate font-wide text-xl font-extrabold text-ink">{pkg.name}</p>
        </div>
        <Switch checked={pkg.active} onChange={toggle} label={`Offer “${pkg.name}”`} disabled={update.isPending} />
      </div>
      <PackageFields draft={draft} errors={errors} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <Button variant="ghost" size="sm" leftIcon={<Trash2 aria-hidden />} onClick={onDelete} className="text-muted hover:text-brand">
          Delete
        </Button>
        <Button type="submit" size="sm" leftIcon={<Save aria-hidden />} disabled={!dirty} loading={update.isPending}>
          Save
        </Button>
      </div>
    </motion.form>
  );
}

function NewPackageCard({ onDone, onSaved }: { onDone: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => ({ ...toDraft(), sort: "" }));
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const create = useMutation({
    mutationFn: (input: Parameters<typeof api.admin.createPackage>[0]) => api.admin.createPackage(input),
    onSuccess: (result) => {
      toast.success("Package added", { description: `${result.package.name} · ${result.package.hours}h · ₹${result.package.priceInr}` });
      onDone();
    },
    onError: (error) => toast.error("Couldn't add the package", { description: errorMessage(error) }),
    onSettled: onSaved,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseDraft(draft, true);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    create.mutate(parsed.value);
  };

  return (
    <motion.form {...cardMotion} onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-2xl border border-dashed border-tint-border bg-tint p-4">
      <p className="kicker text-brand">New package</p>
      <PackageFields draft={draft} errors={errors} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} autoFocus />
      <div className="flex items-center justify-end gap-2 border-t border-tint-border pt-3">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" leftIcon={<Plus aria-hidden />} loading={create.isPending}>
          Add package
        </Button>
      </div>
    </motion.form>
  );
}

function PackageFields({
  draft,
  errors,
  onChange,
  autoFocus,
}: {
  draft: Draft;
  errors: Partial<Record<keyof Draft, string>>;
  onChange: (patch: Partial<Draft>) => void;
  autoFocus?: boolean;
}) {
  const id = useId();
  const field = (
    key: keyof Draft,
    label: string,
    props: { prefix?: string; suffix?: string; inputMode?: "numeric"; className?: string; autoFocus?: boolean; placeholder?: string } = {},
  ) => (
    <div className={cn("flex flex-col gap-1", props.className)}>
      <label htmlFor={`${id}-${key}`} className="kicker text-muted">
        {label}
      </label>
      <div
        className={cn(
          "flex h-10 items-center gap-1 rounded-xl border bg-surface px-3 text-sm transition-[border-color,box-shadow] focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--tint-3)]",
          errors[key] ? "border-brand" : "border-border-strong",
        )}
      >
        {props.prefix && <span className="font-bold text-muted">{props.prefix}</span>}
        <input
          id={`${id}-${key}`}
          value={draft[key]}
          inputMode={props.inputMode}
          placeholder={props.placeholder}
          autoFocus={props.autoFocus}
          aria-invalid={errors[key] ? true : undefined}
          aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
          onChange={(event) => onChange({ [key]: props.inputMode ? event.target.value.replace(/[^\d]/g, "") : event.target.value } as Partial<Draft>)}
          className="h-full min-w-0 flex-1 bg-transparent font-semibold text-ink tabular-nums outline-none"
        />
        {props.suffix && <span className="text-xs font-bold text-muted">{props.suffix}</span>}
      </div>
      {errors[key] && (
        <p id={`${id}-${key}-error`} className="text-xs font-medium text-brand-strong">
          {errors[key]}
        </p>
      )}
    </div>
  );
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4.5rem] gap-3">
      {field("name", "Name", { className: "col-span-3", autoFocus, placeholder: "e.g. Weekend Lead" })}
      {field("hours", "Hours", { suffix: "h", inputMode: "numeric", placeholder: "48" })}
      {field("priceInr", "Price", { prefix: "₹", inputMode: "numeric", placeholder: "399" })}
      {field("sort", "Order", { inputMode: "numeric", placeholder: "0" })}
    </div>
  );
}

/** Accessible on/off switch (role="switch"). */
function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 disabled:opacity-60",
        checked ? "bg-brand" : "bg-border-strong",
      )}
    >
      <motion.span
        aria-hidden
        layout
        transition={{ type: "spring", stiffness: 600, damping: 36 }}
        className={cn("block size-6 rounded-full bg-white shadow-card", checked ? "ml-auto" : "ml-0")}
      />
    </button>
  );
}
