/*
 * The WebNEWS Android / iOS app (mobile/, Capacitor) is a native shell that loads this website and injects
 * `window.Capacitor` with the native plugins installed there. On the plain website everything here is a no-op.
 */

type SharePlugin = {
  /** `files`: local file URIs (the cover image, written to the app's cache first — see shareFileUri). */
  share(options: { title?: string; text?: string; url?: string; dialogTitle?: string; files?: string[] }): Promise<unknown>;
};

/** @capgo/capacitor-social-login (mobile/): Google's own account picker (Android Credential Manager). */
type SocialLoginPlugin = {
  initialize(options: { google: { webClientId: string; mode: "online" } }): Promise<unknown>;
  login(options: { provider: "google"; options: Record<string, never> }): Promise<{ result: { idToken?: string | null } }>;
};

/**
 * @capacitor-community/text-to-speech (mobile/, owner 2026-09-30): the phone's own voice for Listen and News radio —
 * Android's WebView has no Web Speech API. `speak` resolves when the text has been read (or `stop` cut it short).
 */
export type TextToSpeechPlugin = {
  speak(options: { text: string; lang?: string; rate?: number; category?: "ambient" | "playback" }): Promise<void>;
  stop(): Promise<void>;
  getSupportedLanguages(): Promise<{ languages: string[] }>;
};

/**
 * ScreenGuard (mobile/android MainActivity, owner 2026-10-01): blocks screenshots and screen recording of the app
 * while on (Android FLAG_SECURE) — press meet rooms and recordings. Builds from before 2026-10-01 don't have it.
 */
type ScreenGuardPlugin = { enable(): Promise<void>; disable(): Promise<void> };

/** Notification permission as the phone reports it ("prompt" = not asked yet). */
export type PushPermission = "prompt" | "prompt-with-rationale" | "granted" | "denied";
type PluginListener = { remove(): Promise<void> };

/**
 * @capacitor/push-notifications (mobile/, owner 2026-10-02): the phone's permission popup, its FCM token and taps on
 * notifications (`data.url` = the page to open). Builds from before 2026-10-02 don't have it.
 */
export type PushNotificationsPlugin = {
  checkPermissions(): Promise<{ receive: PushPermission }>;
  requestPermissions(): Promise<{ receive: PushPermission }>;
  register(): Promise<void>;
  createChannel(channel: { id: string; name: string; description?: string; importance?: 1 | 2 | 3 | 4 | 5; visibility?: -1 | 0 | 1 }): Promise<void>;
  addListener(event: "registration", fn: (token: { value: string }) => void): Promise<PluginListener>;
  addListener(event: "registrationError", fn: (error: { error: string }) => void): Promise<PluginListener>;
  /** A push that arrived while the app is open (Android shows nothing itself then). */
  addListener(
    event: "pushNotificationReceived",
    fn: (notification: { title?: string; body?: string; data?: Record<string, string> }) => void,
  ): Promise<PluginListener>;
  addListener(
    event: "pushNotificationActionPerformed",
    fn: (action: { actionId: string; notification: { data?: Record<string, string> } }) => void,
  ): Promise<PluginListener>;
};

/**
 * MediaNotification (mobile/android MainActivity, owner 2026-10-07): the "now playing" notification for Listen, with
 * play / pause, a seek bar, 10 s back / forward and stop (also on the lock screen and headphones). Taps come back as
 * "action" events (`position`: where the bar was dropped, in seconds). Builds from before 2026-10-07 don't have it;
 * the first 2026-10-07 build has no seek bar or back / forward.
 */
export type MediaNotificationPlugin = {
  /** `position` / `duration` in seconds. */
  show(options: { title: string; artist: string; playing: boolean; position: number; duration: number }): Promise<void>;
  hide(): Promise<void>;
  addListener(
    event: "action",
    fn: (data: { action: "play" | "pause" | "stop" | "seek" | "rewind" | "forward"; position?: number }) => void,
  ): Promise<PluginListener> | PluginListener;
};

/** PushSupport (mobile/android MainActivity): whether this build has Firebase set up (google-services.json). */
type PushSupportPlugin = { status(): Promise<{ configured: boolean }> };

/** @capacitor/filesystem (mobile/, owner 2026-10-02): writes the shared cover image (and recordings) to the app's cache. */
type FilesystemPlugin = {
  writeFile(options: { path: string; data: string; directory: "CACHE" | "DOCUMENTS"; recursive?: boolean }): Promise<{ uri: string }>;
  appendFile(options: { path: string; data: string; directory: "CACHE" }): Promise<void>;
};

/** ShareTarget (mobile/android MainActivity, owner 2026-10-02): share straight to one app, image + caption. */
type ShareTargetPlugin = { share(options: { package: string; text?: string; file?: string }): Promise<void> };

/**
 * @capacitor/app (mobile/): the phone's Back button and leaving the app. `minimizeApp` is Android only. In the app (a
 * remote page), `addListener` hands back the listener itself rather than a promise of it: wrap it in Promise.resolve.
 */
type AppPlugin = {
  addListener(event: "backButton", fn: (data: { canGoBack: boolean }) => void): Promise<PluginListener> | PluginListener;
  /** A WebNEWS link opened the app (a scanned profile QR, a shared story): its full URL. */
  addListener(event: "appUrlOpen", fn: (data: { url: string }) => void): Promise<PluginListener> | PluginListener;
  exitApp(): Promise<void>;
  minimizeApp?(): Promise<void>;
};

/** @capacitor/browser (mobile/): a page in the phone's own browser (Chrome Custom Tab), over the app. */
type BrowserPlugin = { open(options: { url: string; presentationStyle?: "fullscreen" | "popover" }): Promise<void> };

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  isPluginAvailable?: (name: string) => boolean;
  Plugins?: {
    App?: AppPlugin;
    Share?: SharePlugin;
    SocialLogin?: SocialLoginPlugin;
    TextToSpeech?: TextToSpeechPlugin;
    Browser?: BrowserPlugin;
    ScreenGuard?: ScreenGuardPlugin;
    PushNotifications?: PushNotificationsPlugin;
    PushSupport?: PushSupportPlugin;
    Filesystem?: FilesystemPlugin;
    ShareTarget?: ShareTargetPlugin;
    MediaNotification?: MediaNotificationPlugin;
  };
};

function capacitor(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  const cap = (window as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap?.isNativePlatform?.() ? cap : null;
}

/**
 * The app's push notifications, or null — on the website, in builds without the plugin, and in builds without
 * Firebase (registering there would crash the app, so it's never attempted).
 */
export async function nativePush(): Promise<{ plugin: PushNotificationsPlugin; platform: "android" | "ios" } | null> {
  const cap = capacitor();
  const plugin = cap?.Plugins?.PushNotifications;
  if (!cap || !plugin || !(cap.isPluginAvailable?.("PushNotifications") ?? false)) return null;
  const platform = cap.getPlatform?.() === "ios" ? "ios" : "android";
  if (platform === "android") {
    const support = cap.Plugins?.PushSupport;
    if (!support || !(cap.isPluginAvailable?.("PushSupport") ?? false)) return null;
    const { configured } = await support.status().catch(() => ({ configured: false }));
    if (!configured) return null;
  }
  return { plugin, platform };
}

/** The app's App plugin (the phone's Back button), or null on the website. */
export function nativeAppPlugin(): AppPlugin | null {
  const cap = capacitor();
  return cap?.Plugins?.App && (cap.isPluginAvailable?.("App") ?? true) ? cap.Plugins.App : null;
}

/** Running inside the WebNEWS app (client only; always false during server rendering). */
export function isNativeApp(): boolean {
  return capacitor() !== null;
}

/**
 * The app's own text-to-speech (builds from before 2026-09-30 don't have it), or null — also on the website, which
 * uses the browser's voice.
 */
export function nativeTextToSpeech(): TextToSpeechPlugin | null {
  const cap = capacitor();
  const plugin = cap?.Plugins?.TextToSpeech;
  return plugin && (cap.isPluginAvailable?.("TextToSpeech") ?? true) ? plugin : null;
}

/** The app's "now playing" notification, or null (the website, older builds). */
export function nativeMediaNotification(): MediaNotificationPlugin | null {
  const cap = capacitor();
  const plugin = cap?.Plugins?.MediaNotification;
  return plugin && (cap.isPluginAvailable?.("MediaNotification") ?? false) ? plugin : null;
}

/**
 * Opens a page in the phone's own browser (Meta doesn't allow its login inside apps' web views). Builds without the
 * Browser plugin (before 2026-09-30) hand it to the system instead. False on the website.
 */
export async function openInPhoneBrowser(url: string): Promise<boolean> {
  const cap = capacitor();
  if (!cap) return false;
  const browser = cap.Plugins?.Browser;
  if (browser && (cap.isPluginAvailable?.("Browser") ?? true)) {
    await browser.open({ url });
    return true;
  }
  window.open(url, "_system");
  return true;
}

/** The app's native share sheet (Android's WebView has no Web Share API), or null on the website. */
export function nativeSharePlugin(): SharePlugin | null {
  return capacitor()?.Plugins?.Share ?? null;
}

/**
 * Opens one of `packages` (the first installed: e.g. WhatsApp, then WhatsApp Business) with `text` and the image at
 * `file` attached. False on the website, in builds without ShareTarget (before 2026-10-02), or when none is installed.
 */
export async function shareToApp(packages: readonly string[], text: string, file: string | null): Promise<boolean> {
  const cap = capacitor();
  const target = cap?.Plugins?.ShareTarget;
  if (!cap || !target || !(cap.isPluginAvailable?.("ShareTarget") ?? false)) return false;
  for (const name of packages) {
    try {
      await target.share({ package: name, text, ...(file ? { file } : {}) });
      return true;
    } catch {
      // Not installed: try the next one.
    }
  }
  return false;
}

/** Whether this app build can share straight to one app (ShareTarget). */
export function hasShareToApp(): boolean {
  const cap = capacitor();
  return Boolean(cap?.Plugins?.ShareTarget && (cap.isPluginAvailable?.("ShareTarget") ?? false));
}

/**
 * Saves an image to the app's cache and returns its file URI for the share sheet, or null — on the website and in
 * builds without the Filesystem plugin (before 2026-10-02), which then share the link alone.
 */
export async function shareFileUri(blob: Blob, name: string): Promise<string | null> {
  return shareFileUriFromParts([blob], name);
}

/**
 * The same for a big file kept in parts (a press meet recording, owner 2026-10-05): written piece by piece, so the
 * whole video never sits in the phone's memory at once.
 */
export async function shareFileUriFromParts(parts: Blob[], name: string): Promise<string | null> {
  const cap = capacitor();
  const fs = cap?.Plugins?.Filesystem;
  if (!cap || !fs || !(cap.isPluginAvailable?.("Filesystem") ?? false) || parts.length === 0) return null;
  const path = `share/${name}`;
  const { uri } = await fs.writeFile({ path, data: await base64(parts[0]!), directory: "CACHE", recursive: true });
  for (const part of parts.slice(1)) await fs.appendFile({ path, data: await base64(part), directory: "CACHE" });
  return uri;
}

/**
 * Saves a file straight onto the phone (owner 2026-10-31: "download, not only share"): Documents/WebNEWS/<name> through
 * the Filesystem plugin. Returns false where that isn't possible (website, older builds, storage refused).
 */
export async function saveFileToDevice(blob: Blob, name: string): Promise<boolean> {
  const cap = capacitor();
  const fs = cap?.Plugins?.Filesystem;
  if (!cap || !fs || !(cap.isPluginAvailable?.("Filesystem") ?? false)) return false;
  try {
    await fs.writeFile({ path: `WebNEWS/${name}`, data: await base64(blob), directory: "DOCUMENTS", recursive: true });
    return true;
  } catch {
    return false;
  }
}

function base64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Whether this app build has the native Google account picker (builds from before 2026-09-29 don't: Google blocks its
 * web sign-in page inside app web views, so those keep offering email + password only). Android only for now: the
 * iPhone app needs its own iOS OAuth client first (mobile/README.md).
 */
export function hasNativeGoogleSignIn(): boolean {
  const cap = capacitor();
  if (cap?.getPlatform?.() !== "android") return false;
  return Boolean(cap.Plugins?.SocialLogin && (cap.isPluginAvailable?.("SocialLogin") ?? true));
}

let googleReady: Promise<unknown> | null = null;

/**
 * Opens the phone's Google account picker and resolves with the chosen account's ID token (addressed to the backend's
 * web client ID, which verifies it: `signIn.social({ idToken })`). Resolves null when the person closes the picker.
 */
export async function nativeGoogleIdToken(webClientId: string): Promise<string | null> {
  const plugin = capacitor()?.Plugins?.SocialLogin;
  if (!plugin) throw new Error("Google sign-in isn't available in this version of the app. Update the app and try again.");
  googleReady ??= plugin.initialize({ google: { webClientId, mode: "online" } }).catch((error: unknown) => {
    googleReady = null;
    throw error;
  });
  await googleReady;
  try {
    const { result } = await plugin.login({ provider: "google", options: {} });
    return result.idToken ?? null;
  } catch (error) {
    if (/cancel/i.test(error instanceof Error ? error.message : String(error))) return null;
    throw error;
  }
}

/**
 * In the app: no screenshots or screen recording while `on` (press meet recordings replay only inside WebNEWS, owner
 * 2026-10-01). Websites can't block the computer's own screen recorder, so this is a no-op there.
 */
export function setScreenGuard(on: boolean): void {
  const cap = capacitor();
  const plugin = cap?.Plugins?.ScreenGuard;
  if (!plugin || !(cap.isPluginAvailable?.("ScreenGuard") ?? true)) return;
  void (on ? plugin.enable() : plugin.disable()).catch(() => {});
}
