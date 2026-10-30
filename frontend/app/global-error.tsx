"use client";

import { useEffect } from "react";
import { ErrorView } from "@/components/layout/status-views";
import "./globals.css";

/**
 * Last-resort boundary when the root layout itself fails. It replaces the whole document, so it
 * brings its own <html>/<body> and styles (no providers are available here).
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <head>
        <title>Something went wrong · WebNEWS</title>
      </head>
      <body className="min-h-dvh bg-bg font-sans text-ink antialiased">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex h-16 max-w-300 items-center px-4 sm:px-6">
            {/* Plain <a>: the router may be the thing that failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" aria-label="WebNEWS home" className="inline-flex">
              <img src="/brand/logo-light.png" alt="WebNEWS" width={199} height={40} className="block h-10 w-auto" />
            </a>
          </div>
        </header>
        <main className="mx-auto max-w-300 px-4 sm:px-6">
          <ErrorView onRetry={retry} digest={error.digest} />
        </main>
      </body>
    </html>
  );
}
