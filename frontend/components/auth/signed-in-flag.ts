/*
 * "Just signed in" (owner 2026-10-08): set by the log-in / sign-up forms and the Google button the moment the visitor
 * signs in, read once by the site shell (PressPassWelcome) on the first page after it — onboarding in between keeps
 * it. Per tab (sessionStorage), so it survives Google's redirect; storage blocked → simply no welcome.
 */

const KEY = "webnews:just-signed-in";

export function markSignedIn(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    // Storage blocked: no welcome popup.
  }
}

export function hasSignedInMark(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function clearSignedInMark(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

/*
 * "Welcome back" (owner 2026-10-08: an alert card after logging in): set on a log-in (email or Google), shown once as a
 * toast on the first page of the site after it (PressPassWelcome's shell). Finishing onboarding clears it — a new
 * account gets its own "Welcome to WebNEWS" there instead.
 */
const WELCOME_KEY = "webnews:welcome-back";

export function markWelcomeBack(): void {
  try {
    sessionStorage.setItem(WELCOME_KEY, "1");
  } catch {
    // Storage blocked: no welcome toast.
  }
}

/** True once per mark (it's removed as it's read). */
export function takeWelcomeBack(): boolean {
  try {
    const marked = sessionStorage.getItem(WELCOME_KEY) === "1";
    sessionStorage.removeItem(WELCOME_KEY);
    return marked;
  } catch {
    return false;
  }
}

export function clearWelcomeBack(): void {
  try {
    sessionStorage.removeItem(WELCOME_KEY);
  } catch {
    // Nothing to clear.
  }
}
