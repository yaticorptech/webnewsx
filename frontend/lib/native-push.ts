"use client";

import { useEffect } from "react";
import { api } from "./api";
import { nativePush, type PushPermission, type PushNotificationsPlugin } from "./native-app";

/*
 * Phone push notifications in the WebNEWS app (owner 2026-10-02): everything the bell shows — new followers, stories,
 * likes, comments, messages, press meets (sent by the backend, queries/push.ts). When the app opens it asks for the phone's
 * notification permission (the system popup), gets this phone's token and registers it for whoever is logged in;
 * tapping a notification opens its page. Settings → Notifications turns them off for the account. No-op on the
 * website and in app builds without push.
 */

/** The Android channel the backend sends to (lib/push.ts ANDROID_CHANNEL_ID). */
const CHANNEL_ID = "webnews";

let started = false;
let push: { plugin: PushNotificationsPlugin; platform: "android" | "ios" } | null = null;
let token: string | null = null;
/** Who's logged in on the phone now, and who this phone's token is registered for. */
let viewerId: string | null = null;
let registeredFor: string | null = null;

function syncDevice(): void {
  if (!push || !token || !viewerId || registeredFor === viewerId) return;
  const forUser = viewerId;
  registeredFor = forUser;
  api.pushDevices.register(token, push.platform).catch(() => {
    if (registeredFor === forUser) registeredFor = null; // tried again on the next app open / login
  });
}

/** The phone's permission now, or null on the website / builds without push. */
export async function pushPermission(): Promise<PushPermission | null> {
  const ready = push ?? (await nativePush());
  if (!ready) return null;
  return (await ready.plugin.checkPermissions()).receive;
}

/** Fired on `window` when a push arrives while the app is open (the page then checks for new notifications). */
export const PUSH_RECEIVED_EVENT = "webnews:push-received";

/** Asks for the permission (the system popup; Android shows it at most twice) and registers when allowed. */
export async function askPushPermission(): Promise<PushPermission | null> {
  const ready = push ?? (await nativePush());
  if (!ready) return null;
  const { receive } = await ready.plugin.requestPermissions();
  if (receive === "granted") await ready.plugin.register();
  return receive;
}

/** Logging out on this phone: it stops getting that account's pushes (best effort, never blocks the logout). */
export async function forgetPushDevice(): Promise<void> {
  if (!push || !token || !registeredFor) return;
  const [current, platform] = [token, push.platform];
  registeredFor = null;
  await Promise.race([api.pushDevices.remove(current, platform).catch(() => {}), new Promise((resolve) => setTimeout(resolve, 2500))]);
}

async function start(): Promise<void> {
  push = await nativePush();
  if (!push) return;
  const { plugin } = push;
  await plugin
    .createChannel({ id: CHANNEL_ID, name: "WebNEWS", description: "Followers, stories, likes, comments, messages and press meets", importance: 4, visibility: 1 })
    .catch(() => {});
  await plugin.addListener("registration", ({ value }) => {
    token = value;
    registeredFor = null;
    syncDevice();
  });
  // A push while the app is open (owner 2026-10-08): Android shows nothing itself in the foreground, so the page is
  // told (NotificationToasts pops up the important ones).
  await plugin.addListener("pushNotificationReceived", () => window.dispatchEvent(new Event(PUSH_RECEIVED_EVENT)));
  // A tap opens its page with a full load (owner 2026-10-02): a client-side navigation started while the app is still
  // starting (or waking) could stall on the page's loading skeleton.
  await plugin.addListener("pushNotificationActionPerformed", ({ notification }) => {
    const url = notification.data?.url;
    if (url && url.startsWith("/") && !url.startsWith("//")) window.location.assign(url);
  });
  // Opening the app: the permission popup the first time, then this phone's token.
  let { receive } = await plugin.checkPermissions();
  if (receive === "prompt" || receive === "prompt-with-rationale") ({ receive } = await plugin.requestPermissions());
  if (receive === "granted") await plugin.register();
}

/** Mount once (AppProviders) with the logged-in viewer. */
export function useNativePush(currentViewerId: string | null): void {
  useEffect(() => {
    viewerId = currentViewerId;
    syncDevice();
  }, [currentViewerId]);
  useEffect(() => {
    if (started) return;
    started = true;
    start().catch(() => {});
  }, []);
}
