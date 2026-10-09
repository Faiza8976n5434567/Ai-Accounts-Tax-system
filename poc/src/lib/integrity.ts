/** Nightly integrity checks (P2-08 · S-5.4). The database runs and stores them; this only reads them. */
import { supabase } from "./supabase";
import type { Database } from "./database.types";

export type IntegrityRun = Database["public"]["Tables"]["integrity_runs"]["Row"];
export type IntegrityResult = Database["public"]["Tables"]["integrity_results"]["Row"];
export type IntegrityLatest = Database["public"]["Views"]["integrity_latest"]["Row"];

const db = () => { if (!supabase) throw new Error("Not connected"); return supabase; };
const ok = <D>(r: { data: D; error: unknown }) => { if (r.error) throw r.error; return r.data; };

export const latestRuns = async () => ok(await db().from("integrity_latest").select("*")) ?? [];
export const runHistory = async (orgId: string) =>
  ok(await db().from("integrity_runs").select("*").eq("organization_id", orgId).order("started_at", { ascending: false }).limit(14)) ?? [];
export const runResults = async (runId: string) =>
  ok(await db().from("integrity_results").select("*").eq("run_id", runId).order("check_code")) ?? [];
export const runChecksNow = async (orgId: string) => ok(await db().rpc("run_integrity_checks", { p_organization_id: orgId })) as string;

/** Plain-language summary of a run, e.g. "2 problems, 1 warning". */
export function runSummary(r: Pick<IntegrityRun, "status" | "errors" | "warnings"> | null | undefined): string {
  if (!r) return "Not checked yet";
  if (r.status === "ok") return "All checks passed";
  const parts = [r.errors ? `${r.errors} problem${r.errors === 1 ? "" : "s"}` : "", r.warnings ? `${r.warnings} warning${r.warnings === 1 ? "" : "s"}` : ""].filter(Boolean);
  return parts.join(", ");
}
