import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CapacitorConfig } from "@capacitor/cli";

/*
 * WebNEWS for Android and iOS (owner 2026-09-28: "same exact UI and features"): a native shell that loads the
 * website, so every screen and feature is the site's own and stays in sync with it.
 *
 * WEBNEWS_URL = the site the app opens. Store builds: the deployed https domain. Default: the local dev server —
 * on the iOS Simulator directly; on an Android emulator or USB phone after `adb reverse tcp:3000 tcp:3000`.
 * Set it before `npx cap sync` (it's copied into the native projects).
 */
const url = (process.env.WEBNEWS_URL || "http://localhost:3000").replace(/\/+$/, "");

// The offline page's "Try again" needs the site address (on iOS it is served from the app, not from the site).
writeFileSync(join(process.cwd(), "www", "app-url.js"), `window.WEBNEWS_URL = ${JSON.stringify(`${url}/`)};\n`);

const config: CapacitorConfig = {
  appId: "in.webnews.app",
  appName: "WebNEWS",
  webDir: "www",
  backgroundColor: "#FFFFFF",
  // Lets the site recognise the app (lib/native-app.ts also checks window.Capacitor).
  appendUserAgent: "WebNEWSApp",
  server: {
    url,
    // Plain http only for the local dev server.
    cleartext: url.startsWith("http://"),
    errorPath: "offline.html",
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    // The site lays itself out edge to edge (viewport-fit=cover + safe-area insets).
    contentInset: "never",
    // Long-pressing a link shows the app's own menus, not a Safari preview.
    allowsLinkPreview: false,
  },
  plugins: {
    SystemBars: {
      // Android: MainActivity keeps the page between the status and navigation bars itself (the same on every
      // WebView version), so the site's safe-area padding is 0 there. iOS: the site pads itself (viewport-fit=cover).
      insetsHandling: "disable",
      // Dark clock and icons on the site's white bars.
      style: "LIGHT",
    },
    // "Continue with Google" through the phone's own account picker (owner 2026-09-29; Google blocks its web sign-in
    // page inside app web views). The site calls it (frontend lib/native-app.ts); only Google is bundled.
    SocialLogin: {
      providers: { google: true, facebook: false, apple: false, twitter: false },
      logLevel: 1,
    },
    // Push notifications (owner 2026-10-02; frontend lib/native-push.ts). iOS: shown even while the app is open.
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    SplashScreen: {
      // Short: the app's own loading screen (the three bars filling, MainActivity) takes over until the site is on screen.
      launchShowDuration: 400,
      launchAutoHide: true,
      launchFadeOutDuration: 300,
      backgroundColor: "#FFFFFF",
      showSpinner: false,
    },
  },
};

export default config;
