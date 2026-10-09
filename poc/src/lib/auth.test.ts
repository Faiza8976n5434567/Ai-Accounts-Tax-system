import { describe, expect, it } from "vitest";
import { friendlyAuthError, IDLE_LIMIT_MS, isIdle, isSixDigitCode, mfaStep, parseAuthRedirect, passwordProblem } from "./auth";

describe("parseAuthRedirect — what an emailed link brings back", () => {
  it("recognises an invite link", () => {
    expect(parseAuthRedirect("#access_token=abc&refresh_token=def&type=invite")).toEqual({ kind: "invite", error: null });
  });
  it("recognises a password-reset link", () => {
    expect(parseAuthRedirect("#access_token=abc&type=recovery")).toEqual({ kind: "recovery", error: null });
  });
  it("explains an expired or already-used link in plain words", () => {
    const r = parseAuthRedirect("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
    expect(r.kind).toBeNull();
    expect(r.error).toMatch(/expired or has already been used/);
  });
  it("ignores the app's own page anchors such as #vat", () => {
    expect(parseAuthRedirect("#vat")).toEqual({ kind: null, error: null });
    expect(parseAuthRedirect("")).toEqual({ kind: null, error: null });
  });
});

describe("passwordProblem — Spec 04 S-1.3", () => {
  it("rejects fewer than 12 characters", () => expect(passwordProblem("abc12345678", "abc12345678")).toMatch(/12 characters/));
  it("needs letters and numbers", () => expect(passwordProblem("abcdefghijklmn", "abcdefghijklmn")).toMatch(/letters and numbers/));
  it("needs both entries to match", () => expect(passwordProblem("Ledger2026Safe", "Ledger2026Safx")).toMatch(/do not match/));
  it("accepts a 12+ character password with letters and numbers", () => expect(passwordProblem("Ledger2026Safe", "Ledger2026Safe")).toBeNull());
});

describe("two-factor (R6)", () => {
  it("six-digit codes only", () => {
    expect(isSixDigitCode("123456")).toBe(true);
    expect(isSixDigitCode(" 123456 ")).toBe(true);
    expect(isSixDigitCode("12345")).toBe(false);
    expect(isSixDigitCode("12a456")).toBe(false);
  });
  it("SEC-09 · no factor yet → must set one up before seeing anything", () => expect(mfaStep("aal1", false)).toBe("enroll"));
  it("factor set up but session not yet verified → enter code", () => expect(mfaStep("aal1", true)).toBe("verify"));
  it("verified session → through", () => expect(mfaStep("aal2", true)).toBe("done"));
  it("unknown level is treated as not verified", () => expect(mfaStep(null, false)).toBe("enroll"));
});

describe("isIdle — SEC-21 30-minute sign-out", () => {
  const t0 = Date.UTC(2026, 9, 7, 9, 0, 0);
  it("is not idle after 29 minutes 59 seconds", () => expect(isIdle(t0, t0 + IDLE_LIMIT_MS - 1000)).toBe(false));
  it("is idle at exactly 30 minutes", () => expect(isIdle(t0, t0 + IDLE_LIMIT_MS)).toBe(true));
  it("uses the given limit", () => expect(isIdle(t0, t0 + 5000, 5000)).toBe(true));
});

describe("friendlyAuthError", () => {
  it("wrong password", () => expect(friendlyAuthError("Invalid login credentials")).toBe("Email or password is incorrect."));
  it("wrong code", () => expect(friendlyAuthError("Invalid TOTP code entered")).toMatch(/code didn't match/));
  it("rate limit", () => expect(friendlyAuthError("Request rate limit reached")).toMatch(/Too many attempts/));
  it("offline", () => expect(friendlyAuthError("Failed to fetch")).toMatch(/internet connection/));
  it("anything else is generic, never raw server text", () => expect(friendlyAuthError("pq: relation does not exist")).toBe("Something went wrong. Please try again."));
  it("handles a missing message", () => expect(friendlyAuthError(undefined)).toBe("Something went wrong. Please try again."));
});
