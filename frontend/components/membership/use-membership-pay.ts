"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import type { MembershipOrder } from "@/lib/shared/contracts";

/*
 * Paying for a premium membership (owner 2026-10-14): a Razorpay order opened in Razorpay Checkout, or — test provider,
 * no keys — paid at once. Used by the checkout page.
 */

export const dateText = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

type RazorpaySuccess = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayInstance = { open: () => void; on: (event: string, cb: (response: { error?: { description?: string } }) => void) => void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let checkoutScript: Promise<void> | null = null;
function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  checkoutScript ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      checkoutScript = null;
      reject(new Error("Couldn't load Razorpay. Check your connection and try again."));
    };
    document.body.appendChild(script);
  });
  return checkoutScript;
}

/** `pay()` buys a month; `onPaid` runs once the membership is granted (after the caches are refreshed). */
export function useMembershipPay(username: string, reporterImage: string | null | undefined, onPaid: (activeUntil: string) => void) {
  const queryClient = useQueryClient();
  const [paying, setPaying] = useState(false);

  const done = (activeUntil: string) => {
    toast.success("You're a premium member", { description: `Members-only stories are open until ${dateText(activeUntil)}.` });
    void queryClient.invalidateQueries({ queryKey: ["membership-checkout", username] });
    void queryClient.invalidateQueries({ queryKey: ["profile", username] });
    onPaid(activeUntil);
  };

  const openRazorpay = async (order: Extract<MembershipOrder, { kind: "razorpay" }>) => {
    await loadRazorpay();
    if (!window.Razorpay) throw new Error("Couldn't load Razorpay");
    const rzp = new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amountPaise,
      currency: order.currency,
      name: "WebNEWS",
      description: order.description,
      image: reporterImage ?? undefined,
      prefill: { email: order.email, name: order.name },
      theme: { color: "#E30613" },
      modal: { ondismiss: () => setPaying(false) },
      handler: async (response: RazorpaySuccess) => {
        try {
          const result = await api.memberships.verify({
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          done(result.activeUntil);
        } catch (err) {
          toast.error("Payment received but not confirmed yet", { description: errorMessage(err) });
        } finally {
          setPaying(false);
        }
      },
    });
    rzp.on("payment.failed", (response) => {
      toast.error("Payment failed", { description: response.error?.description ?? "Try again or use another method." });
    });
    rzp.open();
  };

  const pay = async () => {
    setPaying(true);
    try {
      const order = await api.memberships.order(username);
      if (order.kind === "paid") {
        setPaying(false);
        done(order.activeUntil);
        return;
      }
      await openRazorpay(order);
    } catch (err) {
      setPaying(false);
      toast.error("Couldn't start the payment", { description: errorMessage(err) });
    }
  };

  return { pay, paying };
}
