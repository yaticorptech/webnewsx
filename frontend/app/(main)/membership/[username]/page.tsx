import type { Metadata } from "next";
import { MembershipCheckoutView } from "@/components/membership/checkout-view";
import { membershipHref } from "@/components/feed/premium";
import { requireOnboardedViewer } from "@/lib/session";

type Params = Promise<{ username: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata: Metadata = { title: "Buy premium", robots: { index: false } };

/** /membership/<username>?next= — premium membership checkout (owner 2026-10-14): price, Razorpay. */
export default async function MembershipPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { username } = await params;
  const raw = (await searchParams).next;
  // Only same-site paths (never "//host" or a full URL).
  const next = typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : null;
  await requireOnboardedViewer(membershipHref(username, next ?? undefined));
  return <MembershipCheckoutView username={decodeURIComponent(username)} next={next} />;
}
