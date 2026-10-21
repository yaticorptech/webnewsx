"use client";

import { useEffect } from "react";
import { MinimalHeader } from "@/components/layout/minimal-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ErrorView } from "@/components/layout/status-views";

/** Error boundary for pages outside the app shell (auth, onboarding…). */
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <>
      <MinimalHeader />
      <main id="main" className="mx-auto max-w-300 px-4 sm:px-6">
        <ErrorView onRetry={retry} digest={error.digest} />
      </main>
      <SiteFooter />
    </>
  );
}
