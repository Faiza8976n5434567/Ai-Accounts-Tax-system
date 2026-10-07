/** Sign-in rules (P1-09 · Spec 04 S-1.2 → S-1.4). Pure functions — the screens live in components/AuthGate. */

/** Minimum password length (Spec 04 S-1.3); Supabase Auth enforces the same server-side (OA-04). */
export const MIN_PASSWORD_LENGTH = 12;

/** Idle sign-out after 30 minutes without activity (Spec 04 S-1.4, SEC-21). */
export const IDLE_LIMIT_MS = 30 * 60 * 1000;

export type LinkKind = "invite" | "recovery" | "other" | null;

/**
 * Reads what an emailed link brought back in the address bar, e.g.
 * `#access_token=…&type=invite` or `#error=access_denied&error_code=otp_expired&error_description=…`.
 * Must be read before the Supabase client consumes the hash.
 */
export function parseAuthRedirect(hash: string): { kind: LinkKind; error: string | null } {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const code = p.get("error_code");
  const description = p.get("error_description");
  if (p.get("error") || code) {
    return { kind: null, error: code === "otp_expired" ? "This link has expired or has already been used. Ask for a new one below." : description ?? "The link could not be used." };
  }
  if (!p.get("access_token")) return { kind: null, error: null };
  const type = p.get("type");
  return { kind: type === "invite" ? "invite" : type === "recovery" ? "recovery" : "other", error: null };
}

/** Returns why a new password is not acceptable, or null when it is. */
export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use both letters and numbers.";
  if (password !== confirm) return "The two passwords do not match.";
  return null;
}

export const isSixDigitCode = (code: string): boolean => /^\d{6}$/.test(code.trim());

export type Aal = string | null; // Supabase reports "aal1" or "aal2"
/**
 * Which two-factor step a signed-in user needs (R6: firm users must use two-factor).
 * aal2 → done · has a verified factor but session is aal1 → enter code · no factor → set one up.
 */
export function mfaStep(currentLevel: Aal, hasVerifiedFactor: boolean): "done" | "verify" | "enroll" {
  if (currentLevel === "aal2") return "done";
  return hasVerifiedFactor ? "verify" : "enroll";
}

/** True when the last activity (from any tab) is older than the idle limit. */
export const isIdle = (lastActivity: number, now: number, limitMs: number = IDLE_LIMIT_MS): boolean =>
  now - lastActivity >= limitMs;

/** Plain-language messages for the errors users can actually cause. */
export function friendlyAuthError(message: string | undefined | null): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("invalid login credentials")) return "Email or password is incorrect.";
  if (m.includes("email not confirmed")) return "Please use the link in your invitation email first.";
  if (m.includes("invalid totp") || m.includes("invalid mfa") || m.includes("code")) return "That code didn't match. Check your authenticator app and try again.";
  if (m.includes("same") && m.includes("password")) return "Choose a password different from your current one.";
  if (m.includes("weak") || m.includes("pwned") || m.includes("leaked")) return "That password is too easy to guess. Choose a stronger one.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait a few minutes and try again.";
  if (m.includes("fetch") || m.includes("network")) return "Can't reach the server. Check your internet connection.";
  return "Something went wrong. Please try again.";
}
