"use client";

import { useEffect } from "react";
import { ErrorView } from "@/components/layout/status-views";

/** Error boundary inside the Editor Desk shell: the sidebar stays usable. */
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return <ErrorView onRetry={retry} digest={error.digest} />;
}
