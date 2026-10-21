import { WEAK_PASSWORD_MESSAGE } from "@/lib/shared/contracts";

/**
 * Better Auth errors are `{ code, message, status }` (not our ApiErrorBody). These helpers turn
 * them into friendly copy and decide which form field (if any) an error belongs to.
 */

export type AuthFormField = "email" | "password";

export type AuthErrorLike = { code?: string | null; message?: string | null; status?: number | null } | null | undefined;

export type MappedAuthError = { field: AuthFormField | null; message: string };

const BY_CODE: Record<string, MappedAuthError> = {
  // The backend answers "no account" / "Google only" first (src/auth.ts), so this is a wrong password.
  INVALID_EMAIL_OR_PASSWORD: { field: "password", message: "Incorrect password. Try again, or reset it with \"Forgot password?\"." },
  ACCOUNT_NOT_FOUND: { field: "email", message: "There's no account with this email. Check it, or create an account below." },
  INVALID_EMAIL: { field: "email", message: "Enter a valid email address." },
  INVALID_PASSWORD: { field: null, message: "Incorrect email or password." },
  USER_ALREADY_EXISTS: { field: "email", message: "An account with this email already exists." },
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: { field: "email", message: "An account with this email already exists." },
  PASSWORD_TOO_SHORT: { field: "password", message: "Use at least 8 characters." },
  PASSWORD_TOO_LONG: { field: "password", message: "Use at most 128 characters." },
  WEAK_PASSWORD: { field: "password", message: WEAK_PASSWORD_MESSAGE },
  USER_NOT_FOUND: { field: null, message: "Incorrect email or password." },
  CREDENTIAL_ACCOUNT_NOT_FOUND: {
    field: null,
    message: "This account uses Google sign-in. Continue with Google instead, or set a password with \"Forgot password?\".",
  },
};

export function mapAuthError(error: AuthErrorLike, fallback = "Something went wrong. Please try again."): MappedAuthError {
  if (!error) return { field: null, message: fallback };
  const code = error.code ?? "";
  const known = BY_CODE[code];
  if (known) return known;
  if (error.status === 429) return { field: null, message: "Too many attempts. Wait a few seconds and try again." };
  if (error.status === 0 || error.status === undefined) {
    return { field: null, message: error.message || "Network error — check your connection and try again." };
  }
  if (error.status && error.status >= 500) return { field: null, message: "Our servers had a hiccup. Please try again." };
  return { field: null, message: error.message || fallback };
}

/**
 * Copy for `?error=` when a Google sign-in is sent back to /login. Fixed text only: the URL is visitor-controlled,
 * so its `error_description` is never shown.
 */
export function googleReturnError(code: string | null | undefined): string | null {
  if (!code) return null;
  if (code === "ADMIN_PASSWORD_ONLY") return "This account logs in with its email and password only. Type them below.";
  if (code === "ACCOUNT_SUSPENDED") {
    return "This account has been suspended by the WebNEWS Editor Desk. Contact the WebNEWS team if you think this is a mistake.";
  }
  return "Google sign-in didn't work. Please try again, or log in with your email and password.";
}

/** Loose but practical email check (the server validates for real). */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
