/** UAE CT computation: accounting profit → taxable income → CT payable. Rules engine, not AI. */
import { TAX_CONFIG } from "./config";
import { applyBp, type Fils } from "./money";
import { trialBalance } from "./ledger";
import { financialYear } from "./dates";
import type { Journal, Org } from "./types";

export interface CtLine { label: string; amount: Fils; basis: string; kind: "base" | "add" | "less" | "total"; p?: Record<string, string> }

export function computeCt(js: Journal[], org: Org, periodEnd: string = financialYear(org.fyEnd).to) {
  const c = TAX_CONFIG.ct;
  const tb = trialBalance(js);
  const bal = (code: string) => tb.find((r) => r.code === code)?.balance ?? 0;
  const revenue = tb.filter((r) => r.type === "REVENUE").reduce((s, r) => s + r.balance, 0);
  const expenses = tb.filter((r) => r.type === "EXPENSE" && r.code !== "7000").reduce((s, r) => s + r.balance, 0);
  const profit = revenue - expenses;
  const lines: CtLine[] = [];
  const warnings: string[] = [];
  lines.push({ label: "Accounting profit before tax (IFRS)", amount: profit, basis: "Posted ledger", kind: "base" });

  const ent = applyBp(bal("6140"), c.entertainmentDisallowBp.value);
  if (ent) lines.push({ label: "Client entertainment — 50% disallowed", amount: ent, basis: c.entertainmentDisallowBp.ref, kind: "add" });
  const fines = bal("6160");
  if (fines) lines.push({ label: "Fines and penalties — not deductible", amount: fines, basis: "Art 33", kind: "add" });
  const don = bal("6170");
  if (don) lines.push({ label: "Donations to non-qualifying bodies", amount: don, basis: "Art 33", kind: "add" });
  const nd = bal("6500");
  if (nd) lines.push({ label: "Personal / non-business expenditure", amount: nd, basis: "Art 28 / Art 33", kind: "add" });

  const adds = lines.filter((l) => l.kind === "add").reduce((s, l) => s + l.amount, 0);
  const taxable = Math.max(0, profit + adds);
  lines.push({ label: "Taxable income", amount: taxable, basis: "", kind: "total" });

  const sbrEligible = revenue <= c.sbrLimit.value && org.priorRevenue <= c.sbrLimit.value && periodEnd <= c.sbrLastPeriodEnd.value && org.regime !== "qfzp";
  let ct = 0;
  if (org.regime === "sbr" && sbrEligible) {
    warnings.push("Small Business Relief elected — taxable income treated as nil. Losses in SBR periods cannot be carried forward.");
  } else {
    if (org.regime === "sbr") warnings.push("SBR elected but eligibility FAILS — computed under the standard regime.");
    ct = applyBp(Math.max(0, taxable - c.zeroBand.value), c.rateBp.value);
    lines.push({ label: "0% on first AED {band}", p: { band: (c.zeroBand.value / 100).toLocaleString("en-AE") }, amount: 0, basis: c.zeroBand.ref, kind: "less" });
    lines.push({ label: "9% on AED {amt}", p: { amt: (Math.max(0, taxable - c.zeroBand.value) / 100).toLocaleString("en-AE") }, amount: ct, basis: c.rateBp.ref, kind: "total" });
  }
  if (org.regime === "standard" && sbrEligible) warnings.push("Client is eligible for Small Business Relief (revenue ≤ AED 3m). Consider electing SBR.");
  const pe = new Date(periodEnd + "T00:00:00Z");
  const due = new Date(Date.UTC(pe.getUTCFullYear(), pe.getUTCMonth() + 1 + c.returnDueMonths.value, 0)); // last day of 9th month after period end
  return { revenue, profit, adds, taxable, ct, sbrEligible, lines, warnings, dueDate: due.toISOString().slice(0, 10), configVersion: TAX_CONFIG.version };
}

/** Per-expense CT treatment shown at capture time. */
export function ctTreatment(account: string): { label: string; tone: "ok" | "warn" | "bad" } {
  if (account === "6140") return { label: "50% deductible", tone: "warn" };
  if (["6160", "6170", "6500"].includes(account)) return { label: "Disallowed", tone: "bad" };
  if (account === "1500" || account === "1200") return { label: "Capital / balance sheet", tone: "ok" };
  return { label: "Deductible", tone: "ok" };
}
