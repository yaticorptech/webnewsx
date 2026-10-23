import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

/*
 * WhatsApp Cloud API (owner 2026-10-23): the reader sends us a ready-typed code from their own WhatsApp
 * (routes/phone-auth.ts), and we answer in that chat. A reply inside the 24 hours after their message is a free-form
 * "service" message — no approved template needed. Without the keys (development) the reply is printed here instead.
 */

const TIMEOUT_MS = 10_000;

/** A text message to `to` (digits, as the webhook gives it). Failures are logged, never thrown: the check stands anyway. */
export async function sendWhatsAppText(to: string, text: string): Promise<void> {
  if (!env.whatsappEnabled) {
    console.log(`[whatsapp] not configured — reply to +${to}: ${text}`);
    return;
  }
  try {
    const response = await fetch(`https://graph.facebook.com/${env.META_GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) console.error(`[whatsapp] reply failed (${response.status}): ${(await response.text().catch(() => "")).slice(0, 300)}`);
  } catch (error) {
    console.error("[whatsapp] reply failed:", error instanceof Error ? error.message : error);
  }
}

/** Meta signs every webhook call with the app secret (X-Hub-Signature-256: "sha256=<hex HMAC of the raw body>"). */
export function validWebhookSignature(rawBody: string, header: string | undefined): boolean {
  if (!env.META_APP_SECRET) return !env.isProduction;
  const expected = `sha256=${createHmac("sha256", env.META_APP_SECRET).update(rawBody).digest("hex")}`;
  const given = header ?? "";
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** The wa.me link that opens a chat with our business number, `text` typed in and ready to send. */
export function whatsAppChatLink(text: string): string {
  const number = (env.WHATSAPP_BUSINESS_NUMBER ?? "").replace(/\D/g, "");
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
