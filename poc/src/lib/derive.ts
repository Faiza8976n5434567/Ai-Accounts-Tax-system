import { useMemo } from "react";
import { useStore } from "./store";
import { posted, profitAndLoss, balanceSheet, monthly, trialBalance } from "./ledger";
import { buildVat201, quarters } from "./vat";
import { computeCt } from "./ct";
import { subledger } from "./subledger";
import { TAX_CONFIG } from "./config";
import { today, addDays, daysBetween, financialYear, monthsBetween, endOfMonthAfter } from "./dates";
import type { AppState, Org } from "./types";

/** "Now" for the session, from the real clock (never a fixed date). */
export const TODAY = today();
/** Firm-level financial year (all demo clients use a 31 Dec year end). */
const FIRM_FY = financialYear(`${TODAY.slice(0, 4)}-12-31`, TODAY);
/** Months of the current financial year up to this month — chart axes and monthly P&L. */
export const MONTHS = monthsBetween(FIRM_FY.from, TODAY);
export { daysBetween };

/** The VAT quarter most recently ended (the return being prepared / due next). */
function currentVatQuarter() {
  const year = Number(TODAY.slice(0, 4));
  const done = [...quarters(year - 1), ...quarters(year)].filter((q) => q.to < TODAY);
  return done[done.length - 1];
}

export function orgData(state: AppState, org: Org) {
  const all = posted(state.journals, org.id);
  const fy = financialYear(org.fyEnd, TODAY);
  const ytd = posted(state.journals, org.id, fy.from, fy.to);
  const pl = profitAndLoss(ytd);
  const bs = balanceSheet(all);
  const tb = trialBalance(all);
  const mon = monthly(ytd, MONTHS);
  const curQ = currentVatQuarter();
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
  const monthsDone = Math.max(1, MONTHS.filter((m) => m < TODAY.slice(0, 7)).length);
  const ytdRevenueAnnualised = Math.round((pl.revenue / monthsDone) * 12);
  let run = 0; const opening = all.filter((j) => j.date < fy.from);
  for (const j of opening) for (const l of j.lines) if (l.account === "1010") run += l.debit - l.credit;
  const cashSeries = MONTHS.map((m) => { for (const j of all) if (j.date.startsWith(m)) for (const l of j.lines) if (l.account === "1010") run += l.debit - l.credit; return run; });
  const counts = {
    docs: state.purchases.filter((p) => p.orgId === org.id).length,
    sales: state.sales.filter((s) => s.orgId === org.id).length,
    bank: state.bank.filter((b) => b.orgId === org.id).length,
    pending: state.purchases.filter((p) => p.orgId === org.id && p.status === "PENDING").length,
    journals: all.length,
  };
  return { fy, arL, apL, cashSeries, counts, all, ytd, pl, bs, tb, mon, vat, curQ, ct, cash, ar, ap, ageing, buckets, docs, missingTrn, vatAtRisk, ctAdj, unmatched, pendingJ, ytdRevenueAnnualised };
}

export function useOrgData(org: Org | null) {
  const { state } = useStore();
  return useMemo(() => (org ? orgData(state, org) : null), [state, org]);
}

export interface Deadline { date: string; orgId: string; orgName: string; title: string; p?: Record<string, string>; kind: "VAT" | "CT" | "EINV" | "LICENCE" | "WPS"; ref?: string }
/** Compliance deadlines generated from rules and config (F-05, F-12, F-20, F-22) — no fixed dates. */
export function deadlines(state: AppState): Deadline[] {
  const out: Deadline[] = [];
  const year = Number(TODAY.slice(0, 4));
  const vatRef = TAX_CONFIG.vat.returnDueDays.ref, ctRef = TAX_CONFIG.ct.returnDueMonths.ref, ein = TAX_CONFIG.einvoicing.below50m;
  const nextMonths = monthsBetween(TODAY, endOfMonthAfter(TODAY, 2));
  for (const o of state.orgs) {
    const base = { orgId: o.id, orgName: o.name };
    for (const q of [...quarters(year - 1), ...quarters(year), ...quarters(year + 1)]) if (daysBetween(TODAY, q.due) >= -120 && daysBetween(TODAY, q.due) <= 400) out.push({ ...base, date: q.due, title: "VAT return {q} — file & pay", p: { q: q.label }, kind: "VAT", ref: vatRef });
    const fyNow = financialYear(o.fyEnd, TODAY);
    for (const end of [addDays(fyNow.from, -1), fyNow.to]) {
      out.push({ ...base, date: endOfMonthAfter(end, TAX_CONFIG.ct.returnDueMonths.value), title: "CT return {fy} — file & pay", p: { fy: `FY${end.slice(0, 4)}` }, kind: "CT", ref: ctRef });
    }
    out.push({ ...base, date: ein.aspBy, title: "Appoint e-invoicing ASP (revenue < AED 50m)", kind: "EINV", ref: `${ein.ref} — VERIFY` });
    out.push({ ...base, date: ein.goLive, title: "E-invoicing go-live", kind: "EINV", ref: `${ein.ref} — VERIFY` });
    out.push({ ...base, date: o.licenceExpiry, title: "Trade licence renewal", kind: "LICENCE" });
    for (const m of nextMonths) out.push({ ...base, date: `${m}-15`, title: "WPS salary run ({m})", p: { m }, kind: "WPS" });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
