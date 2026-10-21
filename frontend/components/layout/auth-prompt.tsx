"use client";

import { LayoutDashboard } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { useViewer } from "@/components/providers/viewer-provider";
import { Button } from "@/components/ui/button";
import { GoogleButton, useGoogleSignIn } from "@/components/ui/google-button";
import { Modal } from "@/components/ui/modal";
import { ADMIN_HOME } from "@/lib/admin-home";

export type AuthPromptApi = {
  /** Show the "log in to continue" sheet. `reason` becomes the title, e.g. "Log in to like stories". */
  open: (reason?: string) => void;
  close: () => void;
  /**
   * Gate for actions that need an account: returns true when logged in, otherwise opens the
   * prompt and returns false. `if (!authPrompt.guard("Log in to follow publishers")) return;`
   */
  guard: (reason?: string) => boolean;
  /** An admin browsing as a visitor: even account-free actions (liking) explain that instead. */
  adminVisit: boolean;
};

const DEFAULT_REASON = "Log in to join the conversation";

const AuthPromptContext = createContext<AuthPromptApi | null>(null);

/** Current path + query, used as the post-login destination. */
function currentPath(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

/**
 * `adminVisit`: an admin browsing the site as a visitor ("Visit site", <AdminVisit>) — account actions explain that
 * and lead back to the admin panel instead of offering to log in.
 */
export function AuthPromptProvider({ children, adminVisit = false }: { children: ReactNode; adminVisit?: boolean }) {
  const google = useGoogleSignIn();
  const viewer = useViewer();
  const [state, setState] = useState<{ open: boolean; reason: string; next: string }>({
    open: false,
    reason: DEFAULT_REASON,
    next: "/",
  });

  const open = useCallback((reason?: string) => {
    setState({ open: true, reason: reason || DEFAULT_REASON, next: currentPath() });
  }, []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  const api = useMemo<AuthPromptApi>(
    () => ({
      open,
      close,
      guard: (reason) => {
        if (viewer) return true;
        open(reason);
        return false;
      },
      adminVisit,
    }),
    [open, close, viewer, adminVisit],
  );

  const next = encodeURIComponent(state.next);

  return (
    <AuthPromptContext.Provider value={api}>
      {children}
      <Modal
        open={state.open}
        onOpenChange={(value) => (value ? setState((s) => ({ ...s, open: true })) : close())}
        title={adminVisit ? "You're viewing the site as a visitor" : state.reason}
        description={
          adminVisit
            ? "Likes, follows, saves and reports need a reader or reporter account. The admin account only runs the admin panel."
            : "Follow publishers, like and save stories — and apply for a Press Pass to report. It takes a minute."
        }
        size="sm"
      >
        <div className="panel-tint mb-5 flex items-center justify-between gap-4 overflow-hidden px-5 py-5">
          <BrandLockup size="xs" align="start" />
          <SpeedBarsSvg className="hidden w-12 text-brand min-[360px]:block" />
        </div>
        {adminVisit ? (
          <Button href={ADMIN_HOME} fullWidth size="lg" leftIcon={<LayoutDashboard aria-hidden />} onClick={close}>
            Back to the admin panel
          </Button>
        ) : (
          <div className="flex flex-col gap-2.5">
            <Button href={`/login?next=${next}`} fullWidth size="lg" onClick={close}>
              Log in
            </Button>
            <Button href={`/signup?next=${next}`} variant="outline" fullWidth size="lg" onClick={close}>
              Create an account
            </Button>
            {google && (
              <>
                <div className="my-1 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-faint">
                  <span className="h-px flex-1 bg-border" />
                  or
                  <span className="h-px flex-1 bg-border" />
                </div>
                <GoogleButton callbackURL={state.next} />
              </>
            )}
          </div>
        )}
      </Modal>
    </AuthPromptContext.Provider>
  );
}

/** Access the auth prompt (must be inside <AuthPromptProvider>, mounted in the root layout). */
export function useAuthPrompt(): AuthPromptApi {
  const context = useContext(AuthPromptContext);
  if (!context) throw new Error("useAuthPrompt must be used inside <AuthPromptProvider>");
  return context;
}
