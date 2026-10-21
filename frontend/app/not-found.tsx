import type { Metadata } from "next";
import { MinimalHeader } from "@/components/layout/minimal-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { NotFoundView } from "@/components/layout/status-views";

export const metadata: Metadata = { title: "Page not found" };

/** Global 404 for URLs outside the app shell's routes. */
export default function NotFound() {
  return (
    <>
      <MinimalHeader />
      <main id="main" className="mx-auto max-w-300 px-4 sm:px-6">
        <NotFoundView />
      </main>
      <SiteFooter />
    </>
  );
}
