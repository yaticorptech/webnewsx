"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { ViewerProvider } from "@/components/providers/viewer-provider";
import { AuthPromptProvider } from "./auth-prompt";
import { setViewAsVisitor } from "@/lib/api";

/*
 * "Visit site" from the Editor Desk (owner rule 2026-09-25): an admin sees the site exactly as the public does — no
 * account menu, no publishing, likes/follows ask to log in — plus an "Admin panel" button back to the console.
 * Client components get no viewer, and every site API call is answered as for a logged-out visitor.
 */

const AdminVisitContext = createContext(false);

export function AdminVisit({ children }: { children: ReactNode }) {
  // Set during render so the very first requests of the page already go out as a visitor (client only).
  if (typeof window !== "undefined") setViewAsVisitor(true);
  useEffect(() => {
    setViewAsVisitor(true);
    return () => setViewAsVisitor(false);
  }, []);
  return (
    <AdminVisitContext.Provider value={true}>
      <ViewerProvider viewer={null}>
        <AuthPromptProvider adminVisit>{children}</AuthPromptProvider>
      </ViewerProvider>
    </AdminVisitContext.Provider>
  );
}

/** True while an admin browses the site from "Visit site". */
export function useAdminVisit(): boolean {
  return useContext(AdminVisitContext);
}
