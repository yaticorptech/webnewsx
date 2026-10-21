"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, FileText, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { api, errorMessage, isApiError } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { fileSize } from "./new/booking-extras";

/*
 * /press-meet/[id]/report (owner 2026-10-05): the organizer's press meet report inside WebNEWS, fitted to the screen —
 * a phone opening the raw file got it at full size (or, for a PDF, not at all in the app). PDF pages are drawn to the
 * screen's width (pdf.js), an image is scaled to fit, a Word file is offered as a download. Zoom in for small print.
 */

const ZOOMS = [1, 1.5, 2, 3] as const;

export function PressMeetReportViewer({ meetId }: { meetId: string }) {
  const router = useRouter();
  const meet = useQuery({ queryKey: qk.pressMeet(meetId), queryFn: ({ signal }) => api.pressMeets.detail(meetId, signal) });
  const [zoom, setZoom] = useState(0);
  const report = meet.data?.report ?? null;
  const url = api.pressMeets.reportUrl(meetId);
  const kind = !report ? null : report.mime === "application/pdf" ? "pdf" : report.mime.startsWith("image/") ? "image" : "file";

  const back = () => {
    if (window.history.length > 1) router.back();
    else router.replace(`/press-meet/${meetId}`);
  };

  let body: ReactNode;
  if (meet.isPending) {
    body = <Loader2 aria-label="Loading" className="m-auto size-8 animate-spin text-muted" />;
  } else if (meet.isError || !report) {
    const missing = meet.isError ? isApiError(meet.error) && meet.error.status === 404 : true;
    body = (
      <Notice title={missing ? "No report to show" : "Couldn't open the report"}>
        {missing ? "This press meet has no report, or it isn't one you organize or were invited to." : errorMessage(meet.error)}
      </Notice>
    );
  } else if (kind === "pdf") {
    body = <PdfPages url={url} zoom={ZOOMS[zoom]} />;
  } else if (kind === "image") {
    body = (
      <div className="mx-auto w-full max-w-4xl p-3 sm:p-6">
        <img
          src={url}
          alt={report.fileName}
          style={{ width: `${ZOOMS[zoom] * 100}%` }}
          className="mx-auto block h-auto max-w-none rounded-lg bg-white shadow-sm ring-1 ring-border"
        />
      </div>
    );
  } else {
    body = (
      <Notice title="Download to read this report" icon={<FileText aria-hidden />}>
        Word files can&rsquo;t be shown here. Download it to open it in Word or another document app.
        <Button href={url} external download={report.fileName} leftIcon={<Download aria-hidden />} className="mt-4">
          Download report
        </Button>
      </Notice>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface-2" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-border bg-surface px-2 sm:gap-2 sm:px-4">
        <button
          type="button"
          onClick={back}
          aria-label="Back to the press meet"
          data-back-button=""
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-2"
        >
          <ArrowLeft aria-hidden className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{report?.fileName ?? "Press meet report"}</p>
          <p className="truncate text-xs text-muted">
            {meet.data?.title}
            {report && ` · ${fileSize(report.sizeBytes)}`}
          </p>
        </div>
        {(kind === "pdf" || kind === "image") && (
          <>
            <ZoomButton label="Zoom out" disabled={zoom === 0} onClick={() => setZoom((z) => Math.max(0, z - 1))}>
              <ZoomOut aria-hidden className="size-5" />
            </ZoomButton>
            <ZoomButton label="Zoom in" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}>
              <ZoomIn aria-hidden className="size-5" />
            </ZoomButton>
          </>
        )}
        {report && (
          <a
            href={url}
            download={report.fileName}
            target="_blank"
            rel="noopener"
            aria-label="Download the report"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-2"
          >
            <Download aria-hidden className="size-5" />
          </a>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto overscroll-contain" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {body}
      </div>
    </div>
  );
}

function ZoomButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-2 disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function Notice({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="m-auto flex max-w-sm flex-col items-center px-6 py-10 text-center">
      {icon && <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-tint text-brand [&_svg]:size-6">{icon}</span>}
      <h1 className="font-wide text-xl font-black tracking-tight text-ink">{title}</h1>
      <div className="mt-2 flex flex-col items-center text-sm leading-relaxed text-muted">{children}</div>
    </div>
  );
}

/* ─────────────── PDF ─────────────── */

/** pdf.js and its worker load only when a PDF is opened. */
async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
  }
  return pdfjs;
}

function PdfPages({ url, zoom }: { url: string; zoom: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The pages' width = the column's (re-measured when the phone turns).
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry?.contentRect.width ?? 0)));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    (async () => {
      const pdfjs = await loadPdfjs();
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error(response.status === 404 ? "The report wasn't found" : "Couldn't download the report");
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await response.arrayBuffer()) }).promise;
      if (cancelled) return void pdf.destroy();
      loaded = pdf;
      setDoc(pdf);
    })().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error && err.message.startsWith("Couldn") ? err.message : "This PDF couldn't be shown. Download it instead.");
    });
    return () => {
      cancelled = true;
      void loaded?.destroy();
    };
  }, [url]);

  return (
    <div className="mx-auto w-full max-w-4xl p-3 sm:p-6">
      <div ref={boxRef} className="w-full" />
      {error ? (
        <Notice title="Couldn't show the report">{error}</Notice>
      ) : !doc || width === 0 ? (
        <Loader2 aria-label="Loading the report" className="mx-auto my-16 size-8 animate-spin text-muted" />
      ) : (
        <div className="flex flex-col gap-3" style={{ width: Math.round(width * zoom) }}>
          {Array.from({ length: doc.numPages }, (_, i) => (
            <PdfPage key={i} doc={doc} page={i + 1} width={Math.round(width * zoom)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One page, drawn at the column's width (sharp on high-density screens, capped to spare a phone's memory). */
function PdfPage({ doc, page, width }: { doc: PDFDocumentProxy; page: number; width: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [aspect, setAspect] = useState(1.414);

  useEffect(() => {
    let cancelled = false;
    let task: RenderTask | null = null;
    void doc
      .getPage(page)
      .then((p) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        const base = p.getViewport({ scale: 1 });
        setAspect(base.height / base.width);
        const density = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = p.getViewport({ scale: (width / base.width) * density });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        task = p.render({ canvas, viewport });
        return task.promise;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, width]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`Page ${page} of ${doc.numPages}`}
      style={{ width, height: Math.round(width * aspect) }}
      className="block rounded-md bg-white shadow-sm ring-1 ring-border"
    />
  );
}
