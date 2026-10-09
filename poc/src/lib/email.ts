/** Email templates (Spec 03 §3 — editable in the Admin area, stored in `email_templates`). Pure functions. */

/** Fills `{{name}}` placeholders. Unknown placeholders are left visible so a mistake in a template shows up. */
export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (whole, key: string) => (key in vars ? vars[key] : whole));
}

/** Escapes text for the HTML version of an email, keeping line breaks. */
export function textToHtml(text: string): string {
  const escaped = text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  return escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, "<br>");
}

const ROLE_LABELS: Record<string, string> = {
  firm_admin: "Firm Admin", firm_accountant: "Firm Accountant",
  client_owner: "Client Owner", client_staff: "Client Staff", read_only: "Read-only",
};
export const roleLabel = (role: string): string => ROLE_LABELS[role] ?? role;

/** "7 Oct 2026" — the date style used across the app. */
export const shortDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dubai" });
