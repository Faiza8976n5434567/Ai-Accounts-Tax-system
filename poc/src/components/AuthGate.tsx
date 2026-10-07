/**
 * Sign-in gate (P1-09). Nothing behind it renders until the user has:
 *   1. signed in with email + password (invite-only: there is no sign-up screen — SEC-08),
 *   2. set a password if they arrived from an invite or reset link,
 *   3. set up / entered their two-factor code (R6, SEC-09).
 * Signed-in users are signed out after 30 minutes without activity in any tab (SEC-21).
 * The database enforces the same rules (RLS + MFA policy); these screens are the friendly front.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { KeyRound, LogOut, Mail, ShieldCheck, Smartphone } from "lucide-react";
import { DEMO_MODE, linkOnArrival, supabase } from "../lib/supabase";
import { friendlyAuthError, isIdle, isSixDigitCode, mfaStep, MIN_PASSWORD_LENGTH, passwordProblem, IDLE_LIMIT_MS } from "../lib/auth";

interface AuthInfo { email: string; fullName: string; signOut: () => Promise<void> }
const AuthContext = createContext<AuthInfo | null>(null);
/** The signed-in user, or null in the demo build. */
export const useAuth = () => useContext(AuthContext);

const LAST_ACTIVITY_KEY = "tfs.lastActivity";
const readActivity = (): number => { try { return Number(localStorage.getItem(LAST_ACTIVITY_KEY)) || 0; } catch { return 0; } };
const writeActivity = (t: number) => { try { localStorage.setItem(LAST_ACTIVITY_KEY, String(t)); } catch { /* private mode: in-tab timer still works */ } };
const clearLinkFromAddressBar = () => { if (location.hash.includes("access_token") || location.hash.includes("error")) history.replaceState(null, "", location.pathname + location.search); };

type Step = "loading" | "signin" | "forgot" | "set_password" | "mfa" | "ready";

export function AuthGate({ children }: { children: ReactNode }) {
  if (DEMO_MODE) return <>{children}</>;
  if (!supabase) return <Shell title="Not configured"><p className="text-sm text-slate-600">This copy of the app has no database connection. Ask the administrator to set the Supabase address and key.</p></Shell>;
  return <Gate>{children}</Gate>;
}

function Gate({ children }: { children: ReactNode }) {
  const sb = supabase!;
  const [appName, setAppName] = useState("Smart Ledger");
  const [session, setSession] = useState<Session | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [needsPassword, setNeedsPassword] = useState(linkOnArrival.kind === "invite" || linkOnArrival.kind === "recovery");
  const [notice, setNotice] = useState<string | null>(linkOnArrival.error);
  const [fullName, setFullName] = useState("");
  // Arriving from an emailed link is fresh activity, not a stale session.
  useEffect(() => { if (linkOnArrival.kind) writeActivity(Date.now()); }, []);

  // App name is a platform setting (readable before sign-in), never hard-coded (D-20).
  useEffect(() => {
    void sb.from("platform_settings").select("value").eq("key", "app_name").maybeSingle()
      .then(({ data }) => { if (typeof data?.value === "string") setAppName(data.value); });
  }, [sb]);

  useEffect(() => {
    void sb.auth.getSession().then(({ data }) => { setSession(data.session); clearLinkFromAddressBar(); });
    const { data } = sb.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setNeedsPassword(true);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, [sb]);

  // Decide the step whenever the session changes.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!session) { setStep((s) => (s === "forgot" ? s : "signin")); return; }
      // A session that went quiet for 30+ minutes (e.g. laptop closed) is ended on return.
      const last = readActivity();
      if (last && isIdle(last, Date.now())) {
        await sb.auth.signOut({ scope: "local" });
        if (!cancelled) setNotice("You were signed out after 30 minutes without activity.");
        return;
      }
      // A waiting invitation becomes a firm membership on first sign-in (P1-10); no-op otherwise.
      await sb.rpc("accept_invitation");
      if (cancelled) return;
      if (needsPassword) { setStep("set_password"); return; }
      const [{ data: aal }, { data: factors }] = await Promise.all([sb.auth.mfa.getAuthenticatorAssuranceLevel(), sb.auth.mfa.listFactors()]);
      if (cancelled) return;
      const next = mfaStep(aal?.currentLevel ?? null, (factors?.totp.length ?? 0) > 0);
      if (next !== "done") { setStep("mfa"); return; }
      const { data: profile } = await sb.from("profiles").select("full_name").eq("id", session.user.id).maybeSingle();
      if (cancelled) return;
      setFullName(profile?.full_name ?? session.user.email ?? "");
      writeActivity(Date.now());
      setStep("ready");
    })();
    return () => { cancelled = true; };
  }, [session, needsPassword, sb]);

  useEffect(() => {
    const titles: Record<Step, string> = { loading: "Loading", signin: "Sign in", forgot: "Reset password", set_password: "Set your password", mfa: "Two-factor sign-in", ready: "" };
    if (step !== "ready") document.title = `${titles[step]} · ${appName}`;
  }, [step, appName]);

  const signOut = useCallback(async (message?: string) => {
    await sb.auth.signOut({ scope: "local" });
    try { localStorage.removeItem(LAST_ACTIVITY_KEY); } catch { /* ignore */ }
    setNotice(message ?? null);
  }, [sb]);

  const onIdle = useCallback(() => void signOut("You were signed out after 30 minutes without activity."), [signOut]);
  useIdleSignOut(step === "ready", onIdle);

  if (step === "ready" && session) {
    return <AuthContext.Provider value={{ email: session.user.email ?? "", fullName, signOut: () => signOut() }}>{children}</AuthContext.Provider>;
  }
  return (
    <Shell title={appName}>
      {notice && <p role="status" className="mb-4 rounded-xl bg-amber-50 text-amber-800 ring-1 ring-amber-200 px-3 py-2 text-sm">{notice}</p>}
      {step === "loading" && <p className="text-sm text-slate-500">Loading…</p>}
      {step === "signin" && <SignIn onForgot={() => { setNotice(null); setStep("forgot"); }} />}
      {step === "forgot" && <Forgot onBack={() => setStep("signin")} />}
      {step === "set_password" && <SetPassword onDone={() => { setNotice(null); setNeedsPassword(false); }} />}
      {step === "mfa" && session && <TwoFactor onDone={async () => { const { data } = await sb.auth.getSession(); setSession(data.session); }} onCancel={() => void signOut()} email={session.user.email ?? ""} appName={appName} />}
    </Shell>
  );
}

/** Signs out after IDLE_LIMIT_MS without mouse/keyboard/touch activity in any open tab. */
function useIdleSignOut(active: boolean, onIdle: () => void) {
  const lastWrite = useRef(0);
  useEffect(() => {
    if (!active) return;
    const touch = () => { const now = Date.now(); if (now - lastWrite.current > 15_000) { lastWrite.current = now; writeActivity(now); } };
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = window.setInterval(() => { if (isIdle(readActivity() || lastWrite.current, Date.now(), IDLE_LIMIT_MS)) onIdle(); }, 30_000);
    return () => { events.forEach((e) => window.removeEventListener(e, touch)); window.clearInterval(timer); };
  }, [active, onIdle]);
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-slate-50 via-white to-emerald-50 px-4 py-10">
      <main className="w-full max-w-sm card !bg-white shadow-xl p-6 sm:p-8 fade-in">
        <div className="flex items-center gap-2.5 mb-6">
          <span className="size-9 rounded-xl grid place-items-center text-white font-bold bg-gradient-to-br from-emerald-500 to-indigo-600" aria-hidden>★</span>
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        </div>
        {children}
      </main>
    </div>
  );
}

function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block mb-4">
      <span className="block text-xs font-medium text-slate-600 mb-1.5">{label}</span>
      <input {...props} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 focus:border-emerald-400" />
    </label>
  );
}

const ErrorText = ({ text }: { text: string | null }) => (text ? <p role="alert" className="mb-4 text-sm text-rose-700">{text}</p> : null);

function SignIn({ onForgot }: { onForgot: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    writeActivity(Date.now()); // a fresh sign-in resets the idle clock
    const { error: err } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(friendlyAuthError(err.message));
  };
  return (
    <form onSubmit={submit} noValidate>
      <ErrorText text={error} />
      <Field label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Field label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      <button type="submit" disabled={busy || !email || !password} className="btn-primary w-full justify-center bg-emerald-600"><KeyRound size={15} />{busy ? "Signing in…" : "Sign in"}</button>
      <button type="button" onClick={onForgot} className="mt-4 w-full text-center text-sm text-emerald-700 hover:underline cursor-pointer">Forgot or never set your password?</button>
      <p className="mt-6 text-xs text-slate-500 text-center">Access is by invitation only.</p>
    </form>
  );
}

function Forgot({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    const { error: err } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    setBusy(false);
    // Same message whether or not the address exists, so the form can't be used to probe for accounts.
    if (err && !/rate limit/i.test(err.message)) setError(friendlyAuthError(err.message)); else setSent(true);
  };
  if (sent) return (
    <div>
      <p className="text-sm text-slate-700 mb-4">If <b>{email.trim()}</b> has an account, an email with a link to set a new password is on its way. The link works once.</p>
      <button type="button" onClick={onBack} className="btn-ghost w-full justify-center">Back to sign in</button>
    </div>
  );
  return (
    <form onSubmit={submit} noValidate>
      <p className="text-sm text-slate-600 mb-4">Enter your email and we'll send you a link to set a new password.</p>
      <ErrorText text={error} />
      <Field label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="submit" disabled={busy || !email} className="btn-primary w-full justify-center bg-emerald-600"><Mail size={15} />{busy ? "Sending…" : "Send link"}</button>
      <button type="button" onClick={onBack} className="mt-4 w-full text-center text-sm text-slate-600 hover:underline cursor-pointer">Back to sign in</button>
    </form>
  );
}

function SetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = passwordProblem(password, confirm);
    if (problem) { setError(problem); return; }
    setBusy(true); setError(null);
    const { error: err } = await supabase!.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(friendlyAuthError(err.message)); else onDone();
  };
  return (
    <form onSubmit={submit} noValidate>
      <p className="text-sm text-slate-600 mb-4">Choose a password of at least {MIN_PASSWORD_LENGTH} characters, with letters and numbers.</p>
      <ErrorText text={error} />
      <Field label="New password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      <Field label="Repeat new password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <button type="submit" disabled={busy} className="btn-primary w-full justify-center bg-emerald-600"><KeyRound size={15} />{busy ? "Saving…" : "Save password"}</button>
    </form>
  );
}

function TwoFactor({ email, appName, onDone, onCancel }: { email: string; appName: string; onDone: () => Promise<void>; onCancel: () => void }) {
  const sb = supabase!;
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await sb.auth.mfa.listFactors();
      const verified = data?.totp[0];
      if (verified) { if (!cancelled) setFactorId(verified.id); return; }
      // Remove half-finished set-ups (e.g. the page was closed before the code was entered).
      for (const f of data?.all ?? []) if (f.factor_type === "totp" && f.status === "unverified") await sb.auth.mfa.unenroll({ factorId: f.id });
      const { data: enrolled, error: err } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `${appName} (${email})`, issuer: appName });
      if (cancelled) return;
      if (err || !enrolled) { setError(friendlyAuthError(err?.message)); return; }
      setEnrolling(true); setFactorId(enrolled.id); setQr(enrolled.totp.qr_code); setSecret(enrolled.totp.secret);
    })();
    return () => { cancelled = true; };
  }, [sb, email, appName]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    if (!isSixDigitCode(code)) { setError("Enter the 6-digit code from your authenticator app."); return; }
    setBusy(true); setError(null);
    const { error: err } = await sb.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (err) { setError(friendlyAuthError(err.message)); setCode(""); return; }
    await onDone();
  };

  return (
    <form onSubmit={submit} noValidate>
      {enrolling ? (
        <>
          <p className="text-sm text-slate-600 mb-3 flex gap-2"><Smartphone size={16} className="shrink-0 mt-0.5 text-emerald-600" />Two-factor sign-in is required. Scan this code with an authenticator app (Microsoft Authenticator, Google Authenticator or similar), then enter the 6-digit code it shows.</p>
          {qr && <img src={qr} alt="QR code for your authenticator app" className="mx-auto mb-3 size-44 rounded-lg ring-1 ring-slate-200 bg-white p-2" />}
          {secret && <details className="mb-4 text-xs text-slate-500"><summary className="cursor-pointer">Can't scan? Enter this key instead</summary><code className="block mt-1 break-all font-mono text-slate-700">{secret}</code></details>}
        </>
      ) : (
        <p className="text-sm text-slate-600 mb-4 flex gap-2"><ShieldCheck size={16} className="shrink-0 mt-0.5 text-emerald-600" />Enter the 6-digit code from your authenticator app.</p>
      )}
      <ErrorText text={error} />
      <Field label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
      <button type="submit" disabled={busy || !factorId} className="btn-primary w-full justify-center bg-emerald-600"><ShieldCheck size={15} />{busy ? "Checking…" : enrolling ? "Turn on two-factor" : "Verify"}</button>
      <button type="button" onClick={onCancel} className="mt-4 w-full text-center text-sm text-slate-600 hover:underline cursor-pointer inline-flex items-center justify-center gap-1.5"><LogOut size={14} />Sign out</button>
    </form>
  );
}
