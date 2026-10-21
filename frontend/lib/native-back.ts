"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "@/components/ui/toast";
import { nativeAppPlugin } from "./native-app";

/** A second Back on Home within this long leaves the app. */
const EXIT_WINDOW_MS = 2000;

/**
 * The phone's Back button in the app (owner 2026-10-05: on Home it kept stepping back through earlier pages instead of
 * leaving the app), like any Android app:
 *  - an open sheet, dialog or menu closes first;
 *  - Home: the first Back says "Press back again to exit" (owner 2026-10-05: not out at once); a second one within 2 s
 *    leaves the app (it stays in the background, as the system's own Back does; elsewhere `exitApp`);
 *  - Home with a tab (?tab=following) goes to Home;
 *  - any other page goes back, or to Home when there's nothing to go back to.
 */
export function useNativeBackButton(): void {
  const router = useRouter();
  useEffect(() => {
    const app = nativeAppPlugin();
    if (!app) return;
    let handle: { remove(): unknown } | null = null;
    let cancelled = false;
    let armedAt = 0;
    // The app's bridge returns the listener itself, not a promise of it (it crashed on `.then`, owner 2026-10-05).
    void Promise.resolve(
      app.addListener("backButton", ({ canGoBack }) => {
        if (document.querySelector('[role="dialog"], [aria-modal="true"], [role="menu"]')) {
          // The sheets, dialogs and menus close on Escape (sent where focus is, so their own listeners hear it).
          (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          return;
        }
        const { pathname, search } = window.location;
        if (pathname === "/") {
          if (search) {
            router.replace("/");
            return;
          }
          if (Date.now() - armedAt > EXIT_WINDOW_MS) {
            armedAt = Date.now();
            toast("Press back again to exit", { id: "back-to-exit", duration: EXIT_WINDOW_MS, classic: true });
            return;
          }
          armedAt = 0;
          toast.dismiss("back-to-exit");
          void Promise.resolve(app.minimizeApp ? app.minimizeApp() : app.exitApp()).catch(() => app.exitApp());
          return;
        }
        if (canGoBack) window.history.back();
        else router.replace("/");
      }),
    )
      .then((listener) => {
        if (cancelled) void Promise.resolve(listener.remove()).catch(() => {});
        else handle = listener;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (handle) void Promise.resolve(handle.remove()).catch(() => {});
    };
  }, [router]);
}

/**
 * Links that open the app (owner 2026-10-15: a scanned profile QR opens the profile in the app when it's installed):
 * Android hands the app the link (AndroidManifest intent filters); the app shows that page.
 */
export function useNativeLinkOpen(): void {
  const router = useRouter();
  useEffect(() => {
    const app = nativeAppPlugin();
    if (!app) return;
    let handle: { remove(): unknown } | null = null;
    let cancelled = false;
    void Promise.resolve(
      app.addListener("appUrlOpen", ({ url }) => {
        try {
          const target = new URL(url);
          const path = `${target.pathname}${target.search}${target.hash}`;
          if (path && path !== `${window.location.pathname}${window.location.search}${window.location.hash}`) router.push(path);
        } catch {
          // Not a link we can open.
        }
      }),
    ).then((listener) => {
      if (cancelled) void listener.remove();
      else handle = listener;
    });
    return () => {
      cancelled = true;
      void handle?.remove();
    };
  }, [router]);
}
