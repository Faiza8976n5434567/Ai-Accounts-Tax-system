/**
 * POST /api/test-email — "Send test email" from Admin → Email templates (P3-05 · CFG-12). Only a Super Admin, signed in
 * with two-factor. The chosen template is filled with sample values and sent to the Super Admin's own address; the
 * result is recorded in email_log with Resend's message id.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { renderTemplate, textToHtml } from "../src/lib/email";
import { adminClient, json, mailSettings, sendWithResend, type MailSettings, type OutgoingMail, type SendResult } from "./_mail";

export const SAMPLE_VARS = (appName: string): Record<string, string> => ({
  app_name: appName, client_name: "Sample Trading LLC", deadline_title: "VAT return and payment", due_date: "28 Jan 2027", days_left: "7",
  link: "https://example.com", inviter_name: "Faizan", firm_name: "TFS Plus Tax & Accountancy LLC", role: "Firm Accountant",
  invite_link: "https://example.com/invite", expires_on: "15 Oct 2026", document: "INV-2026-10-0001", prepared_by: "Aisha Khan",
  run_date: "8 Oct 2026", failures: "1",
});

export interface TestEmailDeps {
  caller(token: string): Promise<{ email: string; superAdmin: boolean; aal2: boolean } | null>;
  template(key: string): Promise<{ subject: string; body: string } | null>;
  settings(): Promise<MailSettings>;
  send(mail: OutgoingMail): Promise<SendResult>;
  log(entry: { to: string; subject: string; status: "sent" | "failed"; providerId?: string; error?: string }): Promise<void>;
}

export async function handleTestEmail(request: Request, deps: TestEmailDeps): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json(401, { error: "Please sign in again." });
  const who = await deps.caller(token);
  if (!who) return json(401, { error: "Please sign in again." });
  if (!who.aal2) return json(403, { error: "Two-factor sign-in is required." });
  if (!who.superAdmin) return json(403, { error: "Only a Super Admin can send test emails." });
  let key: unknown;
  try { key = ((await request.json()) as { templateKey?: unknown }).templateKey; } catch { return json(400, { error: "Invalid request." }); }
  if (typeof key !== "string" || !/^[a-z_]+$/.test(key)) return json(400, { error: "Invalid template." });
  const tpl = await deps.template(key);
  if (!tpl) return json(404, { error: "Template not found." });
  const settings = await deps.settings();
  const vars = SAMPLE_VARS(settings.appName);
  const text = renderTemplate(tpl.body, vars);
  const mail = { to: who.email, subject: `[Test] ${renderTemplate(tpl.subject, vars)}`, text, html: textToHtml(text) };
  const r = await deps.send(mail);
  await deps.log({ to: who.email, subject: mail.subject, status: r.sent ? "sent" : "failed", providerId: r.providerId, error: r.error });
  return json(r.sent ? 200 : 502, r.sent ? { sent: true, to: who.email, providerId: r.providerId } : { sent: false, error: r.error });
}

export async function serve(request: Request, env: Record<string, string | undefined>): Promise<Response> {
  const admin = adminClient(env);
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL, publishable = env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return handleTestEmail(request, {
    async caller(token) {
      if (!url || !publishable) return null;
      const asUser = createClient<Database>(url, publishable, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
      const { data } = await asUser.auth.getUser(token);
      if (!data.user?.email) return null;
      const aal2 = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString() || "{}").aal === "aal2";
      const { data: p } = await admin.from("profiles").select("is_super_admin, status").eq("id", data.user.id).single();
      return { email: data.user.email, superAdmin: !!p?.is_super_admin && p.status === "active", aal2 };
    },
    async template(key) {
      const { data } = await admin.from("email_templates").select("subject, body").eq("key", key).single();
      return data ?? null;
    },
    settings: () => mailSettings(admin),
    send: async (mail) => sendWithResend(env.RESEND_API_KEY, await mailSettings(admin), mail),
    async log(e) {
      await admin.from("email_log").insert({ kind: "test", to_email: e.to, subject: e.subject, status: e.status, provider_id: e.providerId ?? null, error: e.error ?? null });
    },
  });
}

export const POST = (request: Request): Promise<Response> => serve(request, process.env);
