import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";
import type { PaymentProviderId } from "../shared/contracts.js";
import { ApiError } from "./errors.js";

/** What a provider needs to start a checkout for a Spotlight order. */
export type CheckoutRequest = { orderId: string; amountInr: number; description: string; customerEmail: string };
export type CheckoutResult = { providerRef: string | null; checkoutUrl: string | null };

/**
 * Payment providers for Spotlight (SPEC §3.11). Payments are not connected yet: `manual` records the
 * request and the Editor Desk grants it by hand; `razorpay` is a stub for when the owner connects it.
 */
export interface PaymentProvider {
  readonly id: PaymentProviderId;
  /** True when the provider can take real payments. */
  readonly enabled: boolean;
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
}

export const manualProvider: PaymentProvider = {
  id: "manual",
  enabled: false,
  async createCheckout() {
    return { providerRef: null, checkoutUrl: null };
  },
};

/** Reads RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET; not implemented until the owner connects payments. */
export const razorpayProvider: PaymentProvider = {
  id: "razorpay",
  get enabled() {
    return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  },
  async createCheckout() {
    throw new ApiError(501, "payments_unavailable", "Online payments are not connected yet");
  },
};

/** The provider used for new orders. Always `manual` until Razorpay checkout is implemented. */
export function activePaymentProvider(): PaymentProvider {
  return manualProvider;
}

/* ─────────────── Razorpay (premium memberships, owner 2026-10-14) ─────────────── */

/** True when RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are set. */
export const razorpayEnabled = () => Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

/** Creates a Razorpay order (Orders API) for Checkout to pay; returns its id (`order_…`). */
export async function createRazorpayOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<string> {
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: input.amountPaise, currency: "INR", receipt: input.receipt.slice(0, 40), notes: input.notes }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  const body = (await res?.json().catch(() => null)) as { id?: unknown } | null;
  if (!res?.ok || typeof body?.id !== "string") throw new ApiError(502, "payment_failed", "Couldn't start the payment. Try again.");
  return body.id;
}

/** Checkout's success signature: HMAC-SHA256(order_id + "|" + payment_id) with the key secret. */
export function razorpaySignatureValid(orderId: string, paymentId: string, signature: string): boolean {
  const expected = createHmac("sha256", env.RAZORPAY_KEY_SECRET ?? "").update(`${orderId}|${paymentId}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
