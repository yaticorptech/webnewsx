"use client";

import { Bell, Download, X, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isTourActive } from "@/components/tour/guided-tour";
import { isNativeApp } from "@/lib/native-app";
import { track } from "@/lib/track";

/*
 * "Get the WebNEWS app" (owner 2026-10-16): people reading in a phone's browser are invited to the app — a small card
 * above the bottom bar, a few seconds after they arrive. It comes back now and then (AFTER_GOT_MS / AFTER_NOT_NOW_MS). Never in the app itself, never on computers, never on the Desk.
 * Android only for now (there's no iPhone app). A browser can't see which apps are installed, so the tap counts.
 */

/** Where the app comes from: the Play Store link once it's listed, else the app file the server hands out. */
const APP_URL = process.env.NEXT_PUBLIC_ANDROID_APP_URL || "/webnews.apk";
/**
 * The hosted site has no /webnews.apk (only the local phone relay serves it, mobile/README.md): without a configured
 * download link a production build shows no card at all, rather than a link to nowhere (owner 2026-10-22).
 */
const HAS_APP_LINK = Boolean(process.env.NEXT_PUBLIC_ANDROID_APP_URL) || process.env.NODE_ENV !== "production";
const KEY = "webnews:get-app";
const DAY_MS = 24 * 60 * 60 * 1000;
/** Back again after (owner 2026-10-16: "show again with an interval"): "Not now" 1 day; "Get the app" 1 hour (a browser
 * can't tell whether the app was really installed, so it asks again now and then). Never inside the app. */
const AFTER_NOT_NOW_MS = 1 * DAY_MS;
const AFTER_GOT_MS = 60 * 60 * 1000; // 1 hour (owner 2026-10-16)
const DELAY_MS = 8_000;

type Saved = { until?: number };
const read = (): Saved => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Saved;
  } catch {
    return {};
  }
};
const save = (value: Saved) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Not remembered: it may show again next visit.
  }
};

export function GetAppBanner() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Phones only (owner 2026-10-22: it showed on a computer): an Android phone's browser, at a phone's width.
    const phone = /Android/i.test(navigator.userAgent) && window.matchMedia("(max-width: 767.98px)").matches;
    if (!HAS_APP_LINK || isNativeApp() || !phone || pathname.startsWith("/admin")) return;
    // Testing: any page with ?app-card=reset forgets the earlier answer, so the card shows again.
    if (new URLSearchParams(window.location.search).get("app-card") === "reset") save({});
    const saved = read();
    if (saved.until && saved.until > Date.now()) return;
    // Not over the guided tour (it comes back next visit).
    const timer = setTimeout(() => {
      if (!isTourActive()) setOpen(true);
    }, DELAY_MS);
    return () => clearTimeout(timer);
    // Once per visit: not re-armed on every page change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notNow = () => {
    save({ until: Date.now() + AFTER_NOT_NOW_MS });
    track("get_app_dismissed");
    setOpen(false);
  };
  const got = () => {
    save({ until: Date.now() + AFTER_GOT_MS });
    track("get_app");
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          aria-label="Get the WebNEWS app"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0, transition: { duration: 0.15 } }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          // md:hidden as well: a phone turned sideways or a window widened later never shows it on a wide screen.
          className="fixed inset-x-3 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+0.75rem)] z-40 mx-auto max-w-md rounded-2xl border border-border bg-surface p-4 shadow-[0_18px_40px_-16px_rgb(16_24_40/0.45)] md:hidden"
        >
          <button
            type="button"
            onClick={notNow}
            aria-label="Close"
            className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
          >
            <X aria-hidden className="size-4.5" />
          </button>
          <div className="flex items-center gap-3 pr-7">
            <img src="/icons/icon-192.png" alt="" width={48} height={48} className="size-12 shrink-0 rounded-xl shadow-sm" />
            <div className="min-w-0">
              <p className="font-wide text-[0.9375rem] font-extrabold leading-tight text-ink">WebNEWS is better in the app</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-xs text-muted">
                <span className="inline-flex items-center gap-1">
                  <Zap aria-hidden className="size-3 text-brand" /> Faster
                </span>
                <span className="inline-flex items-center gap-1">
                  <Bell aria-hidden className="size-3 text-brand" /> Breaking-news alerts
                </span>
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <a
              href={APP_URL}
              onClick={got}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-white shadow-[0_8px_18px_-10px_rgb(227_6_19/0.8)] hover:bg-brand-hover"
            >
              <Download aria-hidden className="size-4" />
              Get the app
            </a>
            <button type="button" onClick={notNow} className="h-11 rounded-xl px-4 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-ink">
              Not now
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
