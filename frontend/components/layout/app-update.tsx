"use client";

import { ArrowDownToLine, ArrowRight, Check, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { request } from "@/lib/api";
import { nativeAndroidVersion, openInPhoneBrowser } from "@/lib/native-app";
import type { AppVersionInfo } from "@/lib/shared/contracts";

const APP_URL = process.env.NEXT_PUBLIC_ANDROID_APP_URL || "/webnews.apk";
/** "Later" lasts until the app is opened again (the web view's session ends with the app). */
const LATER_KEY = "wn_update_later";

type Update = { build: number; version: string | null; installed: string; notes: string[]; required: boolean };

/**
 * "Update available" (owner 2026-11-02): when the Android app opens and a newer build is out (GET /api/app/android),
 * a popup offers it. Update downloads the new APK in the phone's browser; Android then asks to install it over the
 * old one (an app from outside the Play Store can't update itself silently). Below the minimum build there's no
 * "Later". Nothing on the website or iOS.
 */
export function AppUpdate() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const app = await nativeAndroidVersion();
      if (!app) return;
      // Test switch (owner 2026-11-02): open any page with ?update-test=1 in the app to see the popup now, as if a newer
      // build were out — only on that phone, nobody else sees it.
      const testing = new URLSearchParams(window.location.search).has("update-test");
      const info: AppVersionInfo | null = testing
        ? {
            latestBuild: app.build + 1,
            latestVersion: "1.1 (test)",
            minBuild: null,
            notes: "New app icon|New loading screen|Long-press your profile for Settings & Log out",
          }
        : await request<AppVersionInfo>("/api/app/android").catch(() => null);
      if (cancelled || !info?.latestBuild || info.latestBuild <= app.build) return;
      const required = info.minBuild !== null && app.build < info.minBuild;
      if (!required && !testing && sessionStorage.getItem(LATER_KEY) === String(info.latestBuild)) return;
      setUpdate({
        build: info.latestBuild,
        version: info.latestVersion,
        installed: app.version ?? `build ${app.build}`,
        notes: (info.notes ?? "")
          .split(/\n|\|/)
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 6),
        required,
      });
      setOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!update) return null;

  const download = async () => {
    setStarted(true);
    await openInPhoneBrowser(new URL(APP_URL, window.location.origin).toString());
  };
  const later = () => {
    sessionStorage.setItem(LATER_KEY, String(update.build));
    setOpen(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={(value) => (value ? setOpen(true) : later())}
      title={started ? "Install the update" : "Update available"}
      description={update.version ? `WebNewsX ${update.version}` : "A new version of WebNewsX is ready"}
      size="sm"
      dismissible={!update.required}
      footer={
        started ? (
          <>
            <Button variant="outline" leftIcon={<RotateCcw aria-hidden />} onClick={() => void download()}>
              Download again
            </Button>
            {!update.required && <Button onClick={() => setOpen(false)}>Done</Button>}
          </>
        ) : (
          <>
            {!update.required && (
              <Button variant="outline" onClick={later}>
                Later
              </Button>
            )}
            <Button leftIcon={<ArrowDownToLine aria-hidden />} onClick={() => void download()}>
              Update now
            </Button>
          </>
        )
      }
    >
      <div data-app-update="" className="flex flex-col gap-4">
        {/* Your version (outdated) → the new one. */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border border-border p-3 text-center">
          <div>
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted">Your version</p>
            <p className="mt-0.5 font-wide text-lg font-black text-ink-2 line-through decoration-brand/60">{update.installed}</p>
            <p className="text-xs font-semibold text-brand">Outdated</p>
          </div>
          <ArrowRight aria-hidden className="size-5 text-muted" />
          <div>
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted">New version</p>
            <p className="mt-0.5 font-wide text-lg font-black text-ink">{update.version ?? `build ${update.build}`}</p>
            <p className="text-xs font-semibold text-success-strong">Ready to install</p>
          </div>
        </div>

        <div className="panel-tint relative flex items-center gap-3 overflow-hidden px-4 py-3.5">
          <SpeedBarsSvg className="pointer-events-none absolute -right-4 top-1/2 h-16 w-28 -translate-y-1/2 text-brand/10" />
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-white [&_svg]:size-5">
            {started ? <ArrowDownToLine /> : <Sparkles />}
          </span>
          <p className="text-sm leading-relaxed text-ink-2">
            {started
              ? "When the download finishes, tap it and choose Install. Your account and saved stories stay as they are."
              : update.required
                ? "Your version of the app is outdated and no longer supported. Update to keep reading."
                : "Your version of the app is outdated. Update to get everything that's new."}
          </p>
        </div>

        {!started && update.notes.length > 0 && (
          <section aria-labelledby="app-update-new">
            <h3 id="app-update-new" className="kicker mb-2.5 text-ink">
              What&apos;s new
            </h3>
            <ul className="flex flex-col gap-2.5 text-sm leading-snug text-ink-2">
              {update.notes.map((note) => (
                <li key={note} className="flex items-start gap-2.5">
                  <span aria-hidden className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-tint text-brand">
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                  {note}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}
