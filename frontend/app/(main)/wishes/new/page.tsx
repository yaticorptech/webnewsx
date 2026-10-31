import type { Metadata } from "next";
import { WishComposer } from "@/components/wishes/wish-composer";
import { canPublish, requireOnboardedViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Birthday wish or invitation", robots: { index: false, follow: false } };

/** Any member posts a birthday wish or an invitation here (owner 2026-10-31) — no Press Pass needed. */
export default async function NewWishPage() {
  const viewer = await requireOnboardedViewer("/wishes/new");
  // Invitations need a Press Pass; everyone can post a birthday wish (owner 2026-10-31).
  return <WishComposer author={{ username: viewer.username, name: viewer.name, image: viewer.image }} invitations={canPublish(viewer)} />;
}
