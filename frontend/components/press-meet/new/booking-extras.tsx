"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleCheck, FileText, FileUp, IndianRupee, RefreshCw, X } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { PRESS_MEET_REPORT, type PlatformFeePayment, type PressMeetReportFile } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import { inr } from "../format";

/*
 * The Details step's two required parts (owner 2026-10-05): the press meet report (uploaded, private to the meet) and
 * the platform fee (set by the Editor Desk; a test payment until online payments are connected). Schedule stays off
 * until both are done.
 */

const REPORT_MB = PRESS_MEET_REPORT.maxBytes / (1024 * 1024);
const REPORT_EXT = /\.(pdf|docx?|jpe?g|png)$/i;

export function fileSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function Legend({ id, children }: { id: string; children: string }) {
  return (
    <h3 id={id} className="mb-3 text-sm font-bold text-ink">
      {children}
      <span aria-hidden className="ml-0.5 text-brand-strong">
        *
      </span>
    </h3>
  );
}

/** Green "✓ … done" line shared by both parts. */
function Done({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-success-strong">
      <CircleCheck aria-hidden className="size-4.5" />
      {children}
    </span>
  );
}

/* ─────────────── Press meet report ─────────────── */

export function ReportUpload({ report, onChange }: { report: PressMeetReportFile | null; onChange: (report: PressMeetReportFile | null) => void }) {
  const headingId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!REPORT_EXT.test(file.name)) return setError("Choose a PDF, a Word file (.doc, .docx) or a JPG / PNG image");
    if (file.size > PRESS_MEET_REPORT.maxBytes) return setError(`The report must be ${REPORT_MB} MB or smaller`);
    setProgress(0);
    try {
      const { report: saved } = await api.pressMeets.uploadReport(file, setProgress);
      onChange(saved);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void upload(event.dataTransfer.files[0]);
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={PRESS_MEET_REPORT.accept}
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(event) => void upload(event.target.files?.[0])}
    />
  );

  return (
    <section aria-labelledby={headingId}>
      <Legend id={headingId}>Press meet report</Legend>
      {input}
      {report ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-success/30 bg-success-soft/40 p-4 sm:flex-row sm:items-center">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-success-strong">
            <FileText aria-hidden className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <Done>Report uploaded</Done>
            <span className="mt-0.5 block truncate text-xs text-muted">
              {report.fileName} · {fileSize(report.sizeBytes)}
            </span>
          </span>
          <span className="flex gap-1.5">
            <Button variant="ghost" size="sm" leftIcon={<RefreshCw aria-hidden />} onClick={() => inputRef.current?.click()}>
              Replace
            </Button>
            <Button variant="ghost" size="sm" leftIcon={<X aria-hidden />} onClick={() => onChange(null)}>
              Remove
            </Button>
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          disabled={progress !== null}
          aria-describedby={error ? `${headingId}-error` : undefined}
          className={cn(
            "flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-[border-color,background-color]",
            dragging ? "border-brand bg-tint" : error ? "border-brand/60 bg-surface" : "border-border-strong bg-surface hover:border-tint-border hover:bg-tint/40",
          )}
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-tint text-brand">
            <FileUp aria-hidden className="size-5" />
          </span>
          {progress === null ? (
            <>
              <span className="font-wide text-[0.9375rem] font-extrabold text-ink">Upload the press meet report</span>
              <span className="text-xs text-muted">PDF, Word or JPG / PNG · up to {REPORT_MB} MB · tap or drop the file here</span>
            </>
          ) : (
            <>
              <span className="text-sm font-bold text-ink">Uploading… {Math.round(progress * 100)}%</span>
              <span aria-hidden className="h-1.5 w-full max-w-60 overflow-hidden rounded-full bg-surface-3">
                <span className="block h-full rounded-full bg-brand transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
              </span>
            </>
          )}
        </button>
      )}
      <p className="mt-2 text-xs text-muted">The reporters you invite can open it with their invitation.</p>
      {error && (
        <p id={`${headingId}-error`} role="alert" className="mt-1.5 text-xs font-semibold text-brand">
          {error}
        </p>
      )}
    </section>
  );
}

/* ─────────────── Platform fee ─────────────── */

export function usePlatformFee() {
  return useQuery({ queryKey: qk.pressMeetPlatformFee, queryFn: ({ signal }) => api.pressMeets.platformFee(signal), staleTime: 60_000 });
}

export function PlatformFeePay({ payment, onPaid }: { payment: PlatformFeePayment | null; onPaid: (payment: PlatformFeePayment) => void }) {
  const headingId = useId();
  const fee = usePlatformFee();
  const pay = useMutation({
    mutationFn: () => api.pressMeets.payPlatformFee(),
    onSuccess: ({ payment: paid }) => {
      onPaid(paid);
      toast.success("Platform fee paid", { description: `${inr(paid.amountInr)} · test payment` });
    },
    onError: (err) => toast.error("Couldn't take the platform fee", { description: errorMessage(err) }),
  });
  const amount = payment?.amountInr ?? fee.data?.amountInr ?? null;

  return (
    <section aria-labelledby={headingId}>
      <Legend id={headingId}>Platform fee</Legend>
      <div
        className={cn(
          "flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center",
          payment || amount === 0 ? "border-success/30 bg-success-soft/40" : "border-border-strong bg-surface",
        )}
      >
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            payment || amount === 0 ? "bg-surface text-success-strong" : "bg-tint text-brand",
          )}
        >
          <IndianRupee aria-hidden className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          {fee.isPending && !payment ? (
            <span className="block h-5 w-40 animate-pulse rounded bg-skeleton/50" />
          ) : fee.isError && !payment ? (
            <span className="text-sm text-muted">Couldn&rsquo;t load the platform fee. {errorMessage(fee.error)}</span>
          ) : payment ? (
            <>
              <Done>Platform fee paid</Done>
              <span className="mt-0.5 block text-xs text-muted">{inr(payment.amountInr)} · test payment, no money was charged</span>
            </>
          ) : amount === 0 ? (
            <>
              <Done>No platform fee right now</Done>
              <span className="mt-0.5 block text-xs text-muted">Booking is free at the moment.</span>
            </>
          ) : (
            <>
              <span className="block font-wide text-xl font-black tabular-nums text-ink">{inr(amount ?? 0)}</span>
              <span className="mt-0.5 block text-xs text-muted">
                WebNEWS&rsquo;s fee to book this press meet, paid now. Test payment — no money is charged while online payments are being set up.
              </span>
            </>
          )}
        </span>
        {!payment && amount !== null && amount > 0 && (
          <Button onClick={() => pay.mutate()} loading={pay.isPending} leftIcon={<IndianRupee aria-hidden />} className="shrink-0">
            Pay platform fee
          </Button>
        )}
        {fee.isError && !payment && (
          <Button variant="outline" size="sm" onClick={() => void fee.refetch()} className="shrink-0">
            Try again
          </Button>
        )}
      </div>
    </section>
  );
}
