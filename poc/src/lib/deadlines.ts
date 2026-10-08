/** Compliance calendar (P3-05 · F-20 · D-51). Deadlines come from the rules in the database; this file only reads them
 *  and groups them for the screen (unit-tested). */
import { supabase } from "./supabase";
import type { Database } from "./database.types";

export type Deadline = Database["public"]["Functions"]["compliance_calendar"]["Returns"][number];

export async function deadlines(from: string, to: string): Promise<Deadline[]> {
  if (!supabase) throw new Error("Not connected");
  const r = await supabase.rpc("compliance_calendar", { p_from: from, p_to: to });
  if (r.error) throw r.error;
  return r.data ?? [];
}

export async function sendTestEmail(templateKey: string): Promise<{ to: string; providerId: string }> {
  if (!supabase) throw new Error("Not connected");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch("/api/test-email", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ templateKey }) });
  const body = (await res.json().catch(() => ({}))) as { to?: string; providerId?: string; error?: string };
  if (!res.ok) throw new Error(body.error ?? "The test email could not be sent.");
  return { to: body.to ?? "", providerId: body.providerId ?? "" };
}

export const STATUS: Record<string, [string, "rose" | "amber" | "emerald" | "indigo" | "slate"]> = {
  overdue: ["Overdue", "rose"], open: ["To do", "amber"], ready_to_file: ["Approved — file it", "indigo"], done: ["Filed", "emerald"],
};

/** Whole days from today to the due date (negative = late). */
export const daysUntil = (due: string, today: string) => Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000);

/** Groups deadlines by month ("Overdue" first), keeping date order. */
export function groupByMonth(items: Deadline[], today: string): { label: string; items: Deadline[] }[] {
  const groups = new Map<string, Deadline[]>();
  for (const d of [...items].sort((a, b) => a.due_date.localeCompare(b.due_date) || a.legal_name.localeCompare(b.legal_name))) {
    const key = d.status === "overdue" && d.due_date < today ? "Overdue"
      : new Date(`${d.due_date}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  return [...groups.entries()].map(([label, list]) => ({ label, items: list }));
}
