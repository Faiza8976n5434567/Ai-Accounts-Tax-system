/**
 * POST /api/invite — invite a member of firm staff (P1-10 · Spec 03 §3.2 · D-17, D-24).
 *
 * 1. The caller's own session asks the database (create_invitation) — the database checks that
 *    they are a Firm Admin signed in with two-factor and that the role/email are allowed.
 * 2. Only then does this server use the secret key to create the one-time sign-in link.
 * 3. The link is emailed through Resend using the editable `invite` template, and is also
 *    returned so the admin can "Copy invite link" (D-24: the dev sender only reaches the
 *    Resend account owner).
 * Runs as a Vercel Function; in local development the Vite dev server runs it (vite.config.ts).
 * The secret key never reaches the browser.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { renderTemplate, roleLabel, shortDate, textToHtml } from "../src/lib/email";

export interface InvitationRow { invitation_id: string; email: string; full_name: string; role: string; expires_at: string; firm_name: string; inviter_name: string }
/** Firm staff (no organizationId) or a client login (P3-06: organizationId, and validTo for Read-only). */
export interface InviteInput { email: string; fullName: string; role: string; organizationId?: string; validTo?: string }
export interface InviteDeps {
  createInvitation(token: string, input: InviteInput): Promise<{ row?: InvitationRow; error?: { code?: string; message: string } }>;
  generateLink(email: string, fullName: string): Promise<{ link?: string; error?: string }>;
  sendInviteEmail(row: InvitationRow, link: string): Promise<{ sent: boolean; note?: string }>;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// Our own plain-language database messages may be shown; anything else stays generic (Spec 04 S-2.8).
const SAFE_CODES = new Set(["P0001", "P0002", "23514", "23505"]);

export async function handleInvite(request: Request, deps: InviteDeps): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json(401, { error: "Please sign in again." });                                  // SEC-15

  let body: { email?: unknown; fullName?: unknown; role?: unknown; organizationId?: unknown; validTo?: unknown };
  try { body = await request.json(); } catch { return json(400, { error: "Invalid request." }); }
  const { email, fullName, role, organizationId, validTo } = body;
  if (typeof email !== "string" || typeof fullName !== "string" || typeof role !== "string") {
    return json(400, { error: "Email, name and role are required." });
  }
  if (organizationId !== undefined && (typeof organizationId !== "string" || !/^[0-9a-f-]{36}$/i.test(organizationId))) return json(400, { error: "Invalid request." });
  if (validTo !== undefined && validTo !== null && (typeof validTo !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(validTo))) return json(400, { error: "Invalid end date." });

  const { row, error } = await deps.createInvitation(token, {
    email, fullName, role, ...(organizationId ? { organizationId } : {}), ...(typeof validTo === "string" ? { validTo } : {}),
  });
  if (error || !row) {
    const code = error?.code ?? "";
    if (code === "PGRST301" || code === "PGRST302" || /jwt/i.test(error?.message ?? "")) return json(401, { error: "Please sign in again." });
    if (code === "42501") return json(403, { error: error?.message ?? "You are not allowed to do that." }); // SEC-15
    if (SAFE_CODES.has(code)) return json(400, { error: error?.message });
    return json(500, { error: "The invitation could not be created. Please try again." });
  }

  const { link, error: linkError } = await deps.generateLink(row.email, row.full_name);
  if (!link) return json(500, { error: `The invitation was saved but its sign-in link could not be created${linkError ? ` (${linkError})` : ""}. Revoke it and try again.`, invitationId: row.invitation_id });

  const mail = await deps.sendInviteEmail(row, link);
  return json(200, { invitationId: row.invitation_id, link, expiresAt: row.expires_at, emailSent: mail.sent, emailNote: mail.note ?? null });
}

/** The real dependencies: Supabase (user session + secret key) and Resend. */
export function liveDeps(env: Record<string, string | undefined>): InviteDeps {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const publishable = env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const secret = env.SUPABASE_SECRET_KEY;
  const appUrl = env.APP_BASE_URL;
  if (!url || !publishable || !secret || !appUrl) throw new Error("Server is missing SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY or APP_BASE_URL");
  const admin = createClient<Database>(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

  return {
    async createInvitation(token, input) {
      const asUser = createClient<Database>(url, publishable, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data, error } = input.organizationId
        ? await asUser.rpc("create_client_invitation", { p_organization_id: input.organizationId, p_email: input.email, p_full_name: input.fullName,
            p_role: input.role, ...(input.validTo ? { p_valid_to: input.validTo } : {}) })
        : await asUser.rpc("create_invitation", { p_email: input.email, p_full_name: input.fullName, p_role: input.role });
      if (error) return { error: { code: error.code, message: error.message } };
      const row = Array.isArray(data) ? data[0] : undefined;
      return row ? { row } : { error: { message: "No invitation returned" } };
    },

    async generateLink(email, fullName) {
      const redirectTo = appUrl;
      const invite = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo, data: { full_name: fullName } } });
      if (invite.data?.properties?.action_link) return { link: invite.data.properties.action_link };
      // Already has a login (e.g. invited before, then revoked): send a set-password link instead.
      if (invite.error && /already|exists|registered/i.test(invite.error.message)) {
        const recovery = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
        if (recovery.data?.properties?.action_link) return { link: recovery.data.properties.action_link };
        return { error: recovery.error?.message };
      }
      return { error: invite.error?.message };
    },

    async sendInviteEmail(row, link) {
      if (!env.RESEND_API_KEY) return { sent: false, note: "Email is not configured on the server — copy the link instead." };
      const [{ data: tpl }, { data: settings }] = await Promise.all([
        admin.from("email_templates").select("subject, body").eq("key", "invite").single(),
        admin.from("platform_settings").select("key, value").in("key", ["app_name", "email_from", "email_from_name", "email_reply_to"]),
      ]);
      const setting = (k: string) => { const v = settings?.find((s) => s.key === k)?.value; return typeof v === "string" ? v : undefined; };
      if (!tpl) return { sent: false, note: "The invite email template is missing — copy the link instead." };
      const vars = {
        app_name: setting("app_name") ?? "Smart Ledger", inviter_name: row.inviter_name, firm_name: row.firm_name,
        role: roleLabel(row.role), invite_link: link, expires_on: shortDate(row.expires_at),
      };
      const text = renderTemplate(tpl.body, vars);
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: `${setting("email_from_name") ?? vars.app_name} <${setting("email_from") ?? "onboarding@resend.dev"}>`,
          to: [row.email], subject: renderTemplate(tpl.subject, vars), text, html: textToHtml(text),
          ...(setting("email_reply_to") ? { reply_to: setting("email_reply_to") } : {}),
        }),
      });
      if (res.ok) return { sent: true };
      // The development sender (onboarding@resend.dev) only delivers to the Resend account owner (D-24).
      return { sent: false, note: res.status === 403 ? "The development email sender can only email the Resend account owner — copy the link and send it yourself." : "The email could not be sent — copy the link and send it yourself." };
    },
  };
}

/** Entry point with explicit server settings (used by the local dev server). */
export async function serve(request: Request, env: Record<string, string | undefined>): Promise<Response> {
  // No session → 401 before any server configuration or secret is touched.
  if (!/^Bearer\s+\S+/i.test(request.headers.get("authorization") ?? "")) return json(401, { error: "Please sign in again." });
  try {
    return await handleInvite(request, liveDeps(env));
  } catch (e) {
    console.error("[api/invite]", e instanceof Error ? e.message : e); // server log only (S-2.8)
    return json(500, { error: "The invite service is not available." });
  }
}

/** Vercel Function entry point: settings come from the Vercel project's environment variables. */
export const POST = (request: Request): Promise<Response> => serve(request, process.env);
