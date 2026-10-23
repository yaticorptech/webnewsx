import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { env } from "../env.js";

/*
 * Phone push notifications (owner 2026-10-02) through Firebase Cloud Messaging — the WebNEWS app (mobile/) registers
 * its FCM token after login. Off without a service account (env.pushEnabled): the worker then leaves the queue alone.
 */

export type PushMessage = {
  title: string;
  body: string;
  /** Opened in the app when the notification is tapped (a site path, e.g. "/a/some-story"). */
  url: string;
  /** Same tag = the newer push replaces the older one on the phone (a like group shows once, updated). */
  tag: string;
  /** Large picture (the story's cover), optional. */
  imageUrl?: string | null;
  /**
   * Instagram-style extras (owner 2026-10-16), drawn by the app (mobile/ WebnewsMessagingService): the person it's
   * about (their photo, round, on the right), how it looks — `picture` (expands to the story's photo), `message` (a chat,
   * stacked per conversation) or `text` — and one action button.
   */
  avatarUrl?: string | null;
  sender?: string | null;
  style?: "picture" | "message" | "text";
  action?: { label: string; url: string } | null;
  /** Grouping key for `message` (the conversation). */
  thread?: string | null;
};

/** The app's Android notification channel (created by the site on the phone, lib/native-push.ts). */
export const ANDROID_CHANNEL_ID = "webnews";

let app: App | null = null;

function firebase(): App {
  if (app) return app;
  const json = env.FIREBASE_SERVICE_ACCOUNT_JSON ?? readFileSync(env.FIREBASE_SERVICE_ACCOUNT_FILE ?? "", "utf8");
  app = getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(json)) });
  return app;
}

/** FCM error codes that mean the token is dead (app uninstalled, data cleared, token rotated). */
const DEAD_TOKEN = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token", "messaging/invalid-argument"]);

/** Sends one notification to a user's phones. Returns the tokens FCM says are dead (to delete). */
export async function sendPush(tokens: string[], message: PushMessage): Promise<string[]> {
  if (tokens.length === 0) return [];
  // Android gets data only: the app draws the notification itself (photo, big picture, chat style, action button).
  // iPhones get a standard alert.
  const data: Record<string, string> = {
    url: message.url,
    wn_title: message.title,
    wn_body: message.body,
    wn_tag: message.tag,
    wn_style: message.style ?? (message.imageUrl ? "picture" : "text"),
  };
  if (message.imageUrl) data.wn_image = message.imageUrl;
  if (message.avatarUrl) data.wn_avatar = message.avatarUrl;
  if (message.sender) data.wn_sender = message.sender;
  if (message.thread) data.wn_thread = message.thread;
  if (message.action) {
    data.wn_action_label = message.action.label;
    data.wn_action_url = message.action.url;
  }
  const result = await getMessaging(firebase()).sendEachForMulticast({
    tokens,
    data,
    android: { priority: "high", collapseKey: message.tag, ttl: 24 * 60 * 60 * 1000 },
    apns: {
      payload: { aps: { alert: { title: message.title, body: message.body }, threadId: message.thread ?? message.tag, sound: "default", mutableContent: true } },
      ...(message.imageUrl ? { fcmOptions: { imageUrl: message.imageUrl } } : {}),
    },
  });
  const dead: string[] = [];
  result.responses.forEach((response, i) => {
    const code = response.error?.code;
    const token = tokens[i];
    if (code && token && DEAD_TOKEN.has(code)) dead.push(token);
  });
  return dead;
}
