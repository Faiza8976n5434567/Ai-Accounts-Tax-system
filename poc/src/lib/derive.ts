import { useMemo } from "react";
import { useStore } from "./store";
import { posted, profitAndLoss, balanceSheet, monthly, trialBalance } from "./ledger";
import { buildVat201, quarters } from "./vat";
import { computeCt } from "./ct";
import { subledger } from "./subledger";
import type { AppState, Org } from "./types";

export const TODAY = "2026-10-01";
export const MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
export const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 864e5);

export function orgData(state: AppState, org: Org) {
  const all = posted(state.journals, org.id);
  const ytd = posted(state.journals, org.id, "2026-01-01", "2026-12-31");
  const pl = profitAndLoss(ytd);
  const bs = balanceSheet(all);
  const tb = trialBalance(all);
  const mon = monthly(ytd, MONTHS);
  const q = quarters(2026);
  const curQ = q[2]; // Q3 2026 — the return due next (28 Oct 2026)
  const vat = buildVat201(posted(state.journals, org.id, curQ.from, curQ.to));
  const ct = computeCt(ytd, org);
  const cash = tb.find((r) => r.code === "1010")?.balance ?? 0;
  const ar = tb.find((r) => r.code === "1100")?.balance ?? 0;
  const ap = tb.find((r) => r.code === "2000")?.balance ?? 0;
  const arL = subledger(all, "1100", TODAY);
  const apL = subledger(all, "2000", TODAY);
  const ageing = arL.items.map((i) => ({ id: i.jid, name: i.party, inv: i.ref, days: i.overdueDays, amount: i.open }));
  const buckets = arL.buckets.map((b) => ({ label: b.label, v: b.v }));
  const docs = state.purchases.filter((p) => p.orgId === org.id && p.status !== "REJECTED" && p.status !== "POSTED");
  const missingTrn = docs.filter((p) => p.checks.some((c) => c.id === "trn" && !c.ok));
  const vatAtRisk = docs.filter((p) => p.checks.some((c) => !c.ok && c.severity === "error")).reduce((s, p) => s + p.vat, 0);
  const ctAdj = ct.lines.filter((l) => l.kind === "add").length;
  const unmatched = state.bank.filter((b) => b.orgId === org.id && !b.journalId).length;
  const pendingJ = state.journals.filter((j) => j.orgId === org.id && j.status === "PENDING").length;
  const ytdRevenueAnnualised = Math.round((pl.revenue / 9) * 12);
  let run = 0; const opening = all.filter((j) => j.date < "2026-01-01");
  for (const j of opening) for (const l of j.lines) if (l.account === "1010") run += l.debit - l.credit;
  const cashSeries = MONTHS.map((m) => { for (const j of all) if (j.date.startsWith(m)) for (const l of j.lines) if (l.account === "1010") run += l.debit - l.credit; return run; });
  const counts = {
    docs: state.purchases.filter((p) => p.orgId === org.id).length,
    sales: state.sales.filter((s) => s.orgId === org.id).length,
    bank: state.bank.filter((b) => b.orgId === org.id).length,
    aiJournals: all.filter((j) => j.ai).length,
    pending: state.purchases.filter((p) => p.orgId === org.id && p.status === "PENDING").length,
    journals: all.length,
  };
  return { arL, apL, cashSeries, counts, all, ytd, pl, bs, tb, mon, vat, curQ, ct, cash, ar, ap, ageing, buckets, docs, missingTrn, vatAtRisk, ctAdj, unmatched, pendingJ, ytdRevenueAnnualised };
}

export function useOrgData(org: Org | null) {
  const { state } = useStore();
  return useMemo(() => (org ? orgData(state, org) : null), [state, org]);
}

export interface Deadline { date: string; orgId: string; orgName: string; title: string; p?: Record<string, string>; kind: "VAT" | "CT" | "EINV" | "LICENCE" | "WPS"; ref?: string }
export function deadlines(state: AppState): Deadline[] {
  const out: Deadline[] = [];
  for (const o of state.orgs) {
    const base = { orgId: o.id, orgName: o.name };
    for (const q of quarters(2026)) if (q.due >= "2026-07-01") out.push({ ...base, date: q.due, title: "VAT return {q} — file & pay", p: { q: q.label }, kind: "VAT", ref: "Exec. Reg. Art 69" });
    out.push({ ...base, date: "2027-01-28", title: "VAT return {q} — file & pay", p: { q: "Q4 2026" }, kind: "VAT" });
    out.push({ ...base, date: "2026-09-30", title: "CT return {fy} — file & pay", p: { fy: "FY2025" }, kind: "CT", ref: "Art 53" });
    out.push({ ...base, date: "2027-09-30", title: "CT return {fy} — file & pay", p: { fy: "FY2026" }, kind: "CT", ref: "Art 53" });
    out.push({ ...base, date: "2027-03-31", title: "Appoint e-invoicing ASP (revenue < AED 50m)", kind: "EINV", ref: "MD 244/2025 — VERIFY" });
    out.push({ ...base, date: "2027-07-01", title: "E-invoicing go-live", kind: "EINV", ref: "MD 244/2025 — VERIFY" });
    out.push({ ...base, date: o.licenceExpiry, title: "Trade licence renewal", kind: "LICENCE" });
    for (const m of ["2026-10", "2026-11", "2026-12"]) out.push({ ...base, date: `${m}-15`, title: "WPS salary run ({m})", p: { m }, kind: "WPS" });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
