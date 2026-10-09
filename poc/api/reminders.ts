/**
 * GET /api/reminders — the daily deadline-reminder job (P3-05 · D-50). Vercel Cron calls it every morning
 * (vercel.json) with `Authorization: Bearer <CRON_SECRET>`. With the secret key it asks the database which reminders
 * are due today (14 / 7 / 1 days before, firm setting), renders the editable `deadline_reminder` template, sends each
 * email through Resend and records it in email_log. A reminder already sent is never sent again.
 */
import { renderTemplate, shortDate, textToHtml } from "../src/lib/email";
import { adminClient, json, mailSettings, sendWithResend, uaeToday, type MailSettings, type OutgoingMail, type SendResult } from "./_mail";

export interface ReminderRow {
  organization_id: string; legal_name: string; rule_key: string; title: string; due_date: string; days_left: number; detail: string | null;
  email: string; full_name: string | null; audience: string; dedupe_key: string;
}
export interface ReminderMail extends OutgoingMail { organizationId: string; dedupeKey: string }
export interface ReminderDeps {
  reminders(today: string): Promise<ReminderRow[]>;
  template(): Promise<{ subject: string; body: string } | null>;
  settings(): Promise<MailSettings>;
  alreadySent(to: string, dedupeKey: string): Promise<boolean>;
  send(mail: OutgoingMail): Promise<SendResult>;
  log(entry: { to: string; subject: string; organizationId: string; dedupeKey: string; status: "sent" | "failed"; providerId?: string; error?: string }): Promise<void>;
}

const TAB: Record<string, string> = { vat_return: "vat", ct_return: "reports" };

/** One email per person per deadline, from the editable template (unit-tested). */
export function reminderEmails(rows: ReminderRow[], tpl: { subject: string; body: string }, appName: string, baseUrl: string): ReminderMail[] {
  return rows.map((r) => {
    const vars = {
      app_name: appName, client_name: r.legal_name, deadline_title: r.detail ? `${r.title} (${r.detail})` : r.title,
      due_date: shortDate(r.due_date), days_left: String(r.days_left),
      link: `${baseUrl.replace(/\/$/, "")}/#/clients/${r.organization_id}${TAB[r.rule_key] ? `/${TAB[r.rule_key]}` : ""}`,
    };
    const text = renderTemplate(tpl.body, vars);
    return { to: r.email, subject: renderTemplate(tpl.subject, vars), text, html: textToHtml(text), organizationId: r.organization_id, dedupeKey: r.dedupe_key };
  });
}

export async function handleReminders(request: Request, deps: ReminderDeps, secret: string | undefined, baseUrl: string, today: string): Promise<Response> {
  if (!secret) return json(500, { error: "CRON_SECRET is not configured" });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return json(401, { error: "Unauthorized" });
  const tpl = await deps.template();
  if (!tpl) return json(500, { error: "The deadline_reminder template is missing" });
  const settings = await deps.settings();
  const mails = reminderEmails(await deps.reminders(today), tpl, settings.appName, baseUrl);
  let sent = 0, skipped = 0, failed = 0;
  for (const m of mails) {
    if (await deps.alreadySent(m.to, m.dedupeKey)) { skipped++; continue; }
    const r = await deps.send(m);
    await deps.log({ to: m.to, subject: m.subject, organizationId: m.organizationId, dedupeKey: m.dedupeKey, status: r.sent ? "sent" : "failed", providerId: r.providerId, error: r.error });
    if (r.sent) sent++; else failed++;
  }
  return json(200, { date: today, reminders: mails.length, sent, skipped, failed });
}

export async function serve(request: Request, env: Record<string, string | undefined>): Promise<Response> {
  const admin = adminClient(env);
  const deps: ReminderDeps = {
    async reminders(today) {
      const { data, error } = await admin.rpc("due_reminders", { p_today: today });
      if (error) throw error;
      return (data ?? []) as ReminderRow[];
    },
    async template() {
      const { data } = await admin.from("email_templates").select("subject, body").eq("key", "deadline_reminder").single();
      return data ?? null;
    },
    settings: () => mailSettings(admin),
    async alreadySent(to, key) {
      const { data } = await admin.from("email_log").select("id").eq("kind", "deadline_reminder").eq("to_email", to).eq("dedupe_key", key).eq("status", "sent").limit(1);
      return (data ?? []).length > 0;
    },
    send: async (mail) => sendWithResend(env.RESEND_API_KEY, await mailSettings(admin), mail),
    async log(e) {
      await admin.from("email_log").insert({ kind: "deadline_reminder", to_email: e.to, subject: e.subject, organization_id: e.organizationId,
        dedupe_key: e.dedupeKey, status: e.status, provider_id: e.providerId ?? null, error: e.error ?? null });
    },
  };
  return handleReminders(request, deps, env.CRON_SECRET, env.APP_BASE_URL ?? "", uaeToday());
}

export const GET = (request: Request): Promise<Response> => serve(request, process.env);
