import { describe, expect, it } from "vitest";
import { handleReminders, reminderEmails, type ReminderDeps, type ReminderRow } from "./reminders";
import { handleTestEmail, type TestEmailDeps } from "./test-email";

const tpl = { subject: "{{client_name}}: {{deadline_title}} due {{due_date}}", body: "Reminder: {{deadline_title}} for {{client_name}} is due on {{due_date}} ({{days_left}} days left).\n\nOpen {{app_name}}: {{link}}" };
const row = (over: Partial<ReminderRow> = {}): ReminderRow => ({
  organization_id: "org-1", legal_name: "Alpha Trading LLC", rule_key: "vat_return", title: "VAT return and payment", due_date: "2027-01-28",
  days_left: 7, detail: null, email: "acct@tfsplus.ae", full_name: "Aisha", audience: "firm", dedupe_key: "org-1|vat_return|2027-01-28|7", ...over,
});

describe("deadline reminder emails (P3-05)", () => {
  it("fills the editable template and links to the client's VAT return", () => {
    const [m] = reminderEmails([row()], tpl, "TFS+ Smart Ledger", "https://ledger.tfsplus.ae/");
    expect(m.subject).toBe("Alpha Trading LLC: VAT return and payment due 28 Jan 2027");
    expect(m.text).toBe("Reminder: VAT return and payment for Alpha Trading LLC is due on 28 Jan 2027 (7 days left).\n\nOpen TFS+ Smart Ledger: https://ledger.tfsplus.ae/#/clients/org-1/vat");
  });
  it("CFG-07 · the licence reminder shows the expiry date", () => {
    const [m] = reminderEmails([row({ rule_key: "licence_renewal", title: "Trade licence renewal", detail: "Licence expires 30 Nov 2026", due_date: "2026-10-31", days_left: 14 })], tpl, "App", "https://x");
    expect(m.subject).toBe("Alpha Trading LLC: Trade licence renewal (Licence expires 30 Nov 2026) due 31 Oct 2026");
    expect(m.text).toContain("https://x/#/clients/org-1\n".trim());
  });
});

const fakeDeps = (over: Partial<ReminderDeps> = {}): ReminderDeps & { sentTo: string[]; logged: string[] } => {
  const sentTo: string[] = [], logged: string[] = [];
  return {
    sentTo, logged,
    reminders: async () => [row(), row({ email: "owner@alpha.ae", audience: "client" })],
    template: async () => tpl,
    settings: async () => ({ appName: "App", from: "no-reply@x", fromName: "App" }),
    alreadySent: async (to) => to === "owner@alpha.ae",
    send: async (m) => { sentTo.push(m.to); return { sent: true, providerId: "re_1" }; },
    log: async (e) => { logged.push(`${e.to}:${e.status}:${e.providerId}`); },
    ...over,
  };
};
const cron = (auth: string | null) => new Request("http://localhost/api/reminders", { headers: auth ? { authorization: auth } : {} });

describe("GET /api/reminders — the daily job", () => {
  it("refuses without the cron secret", async () => {
    expect((await handleReminders(cron(null), fakeDeps(), "s3cret", "https://x", "2027-01-21")).status).toBe(401);
    expect((await handleReminders(cron("Bearer wrong"), fakeDeps(), "s3cret", "https://x", "2027-01-21")).status).toBe(401);
    expect((await handleReminders(cron("Bearer s3cret"), fakeDeps(), undefined, "https://x", "2027-01-21")).status).toBe(500);
  });
  it("sends each reminder once, skips what was already sent, and logs the provider id", async () => {
    const d = fakeDeps();
    const res = await handleReminders(cron("Bearer s3cret"), d, "s3cret", "https://x", "2027-01-21");
    expect(await res.json()).toEqual({ date: "2027-01-21", reminders: 2, sent: 1, skipped: 1, failed: 0 });
    expect(d.sentTo).toEqual(["acct@tfsplus.ae"]);
    expect(d.logged).toEqual(["acct@tfsplus.ae:sent:re_1"]);
  });
  it("a failed send is logged as failed", async () => {
    const d = fakeDeps({ alreadySent: async () => false, send: async () => ({ sent: false, error: "Resend error 500" }) });
    const body = await (await handleReminders(cron("Bearer s3cret"), d, "s3cret", "https://x", "2027-01-21")).json();
    expect(body.failed).toBe(2);
    expect(d.logged[0]).toBe("acct@tfsplus.ae:failed:undefined");
  });
});

const testDeps = (over: Partial<TestEmailDeps> = {}): TestEmailDeps & { logged: string[] } => {
  const logged: string[] = [];
  return {
    logged,
    caller: async () => ({ email: "faizan@tfsplus.ae", superAdmin: true, aal2: true }),
    template: async () => tpl,
    settings: async () => ({ appName: "App", from: "no-reply@x", fromName: "App" }),
    send: async () => ({ sent: true, providerId: "re_42" }),
    log: async (e) => { logged.push(`${e.to}:${e.status}:${e.providerId}`); },
    ...over,
  };
};
const post = (body: unknown, token: string | null = "jwt") => new Request("http://localhost/api/test-email", {
  method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

describe("POST /api/test-email — CFG-12", () => {
  it("sends the template with sample values to the Super Admin and logs the provider id", async () => {
    const d = testDeps();
    const res = await handleTestEmail(post({ templateKey: "deadline_reminder" }), d);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true, to: "faizan@tfsplus.ae", providerId: "re_42" });
    expect(d.logged).toEqual(["faizan@tfsplus.ae:sent:re_42"]);
  });
  it("only a Super Admin with two-factor", async () => {
    expect((await handleTestEmail(post({ templateKey: "invite" }, null), testDeps())).status).toBe(401);
    expect((await handleTestEmail(post({ templateKey: "invite" }), testDeps({ caller: async () => ({ email: "a@b", superAdmin: false, aal2: true }) }))).status).toBe(403);
    expect((await handleTestEmail(post({ templateKey: "invite" }), testDeps({ caller: async () => ({ email: "a@b", superAdmin: true, aal2: false }) }))).status).toBe(403);
  });
  it("rejects an unknown or malformed template", async () => {
    expect((await handleTestEmail(post({ templateKey: "../x" }), testDeps())).status).toBe(400);
    expect((await handleTestEmail(post({ templateKey: "nope" }), testDeps({ template: async () => null }))).status).toBe(404);
  });
});
