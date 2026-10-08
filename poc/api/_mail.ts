/** Shared server-side email helpers (P3-05). Files starting with "_" are not web addresses on Vercel. The secret keys
 *  (Supabase secret key, Resend key) are only ever read here on the server, never in the browser. */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

export interface MailSettings { appName: string; from: string; fromName: string; replyTo?: string }
export interface OutgoingMail { to: string; subject: string; text: string; html: string }
export interface SendResult { sent: boolean; providerId?: string; error?: string }

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export function adminClient(env: Record<string, string | undefined>) {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const secret = env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("Server is missing SUPABASE_URL or SUPABASE_SECRET_KEY");
  return createClient<Database>(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function mailSettings(admin: ReturnType<typeof adminClient>): Promise<MailSettings> {
  const { data } = await admin.from("platform_settings").select("key, value").in("key", ["app_name", "email_from", "email_from_name", "email_reply_to"]);
  const get = (k: string) => { const v = data?.find((s) => s.key === k)?.value; return typeof v === "string" && v ? v : undefined; };
  const appName = get("app_name") ?? "Smart Ledger";
  return { appName, from: get("email_from") ?? "onboarding@resend.dev", fromName: get("email_from_name") ?? appName, replyTo: get("email_reply_to") };
}

/** Sends through Resend. The development sender (onboarding@resend.dev) only reaches the Resend account owner (D-24). */
export async function sendWithResend(apiKey: string | undefined, settings: MailSettings, mail: OutgoingMail): Promise<SendResult> {
  if (!apiKey) return { sent: false, error: "Email is not configured on the server (RESEND_API_KEY)" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from: `${settings.fromName} <${settings.from}>`, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html,
      ...(settings.replyTo ? { reply_to: settings.replyTo } : {}) }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (res.ok) return { sent: true, providerId: body.id };
  return { sent: false, error: res.status === 403 ? "The development sender can only email the Resend account owner" : (body.message ?? `Resend error ${res.status}`) };
}

/** Today's date in the UAE (the reminders and deadlines are UAE dates). */
export const uaeToday = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
