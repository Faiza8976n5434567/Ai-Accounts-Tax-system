/** Deterministic posting engine + report builders. Reports read ONLY posted journal lines. */
import { ACC, COA } from "./coa";
import type { Journal, JLine, AccType } from "./types";
import type { Fils } from "./money";

export function validateJournal(lines: JLine[]): string[] {
  const errs: string[] = [];
  if (lines.length < 2) errs.push("A journal needs at least two lines.");
  for (const [i, l] of lines.entries()) {
    if (!ACC[l.account]) errs.push(`Line ${i + 1}: unknown account ${l.account}.`);
    if (l.debit && l.credit) errs.push(`Line ${i + 1}: cannot have both debit and credit.`);
    if (l.debit < 0 || l.credit < 0) errs.push(`Line ${i + 1}: negative amounts are not allowed.`);
    if (!Number.isInteger(l.debit) || !Number.isInteger(l.credit)) errs.push(`Line ${i + 1}: amounts must be whole fils.`);
  }
  const dr = lines.reduce((s, l) => s + l.debit, 0);
  const cr = lines.reduce((s, l) => s + l.credit, 0);
  if (dr !== cr) errs.push(`Journal does not balance: Dr ${dr / 100} ≠ Cr ${cr / 100}.`);
  if (dr === 0) errs.push("Journal total is zero.");
  return errs;
}

export const posted = (js: Journal[], orgId: string, from?: string, to?: string) =>
  js.filter((j) => j.orgId === orgId && (j.status === "POSTED" || j.status === "REVERSED") && (!from || j.date >= from) && (!to || j.date <= to));

/** opexLines are [accountCode, amount] pairs — display names via accName(code, lang). */
/** Natural-sign balance: debit-positive for assets/expenses, credit-positive otherwise. */
const natural = (type: AccType, dr: Fils, cr: Fils) => (type === "ASSET" || type === "EXPENSE" ? dr - cr : cr - dr);

export interface TbRow { code: string; name: string; type: AccType; debit: Fils; credit: Fils; balance: Fils }
export function trialBalance(js: Journal[]): TbRow[] {
  const m = new Map<string, { dr: Fils; cr: Fils }>();
  for (const j of js) for (const l of j.lines) {
    const r = m.get(l.account) ?? { dr: 0, cr: 0 };
    r.dr += l.debit; r.cr += l.credit; m.set(l.account, r);
  }
  return COA.filter((a) => m.has(a.code)).map((a) => {
    const { dr, cr } = m.get(a.code)!;
    const net = dr - cr;
    return { code: a.code, name: a.nameEn, type: a.type, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, balance: natural(a.type, dr, cr) };
  });
}

export const balanceOf = (tb: TbRow[], pred: (r: TbRow) => boolean) => tb.filter(pred).reduce((s, r) => s + r.balance, 0);

export function profitAndLoss(js: Journal[]) {
  const tb = trialBalance(js);
  const revenue = balanceOf(tb, (r) => r.code === "4000" || r.code === "4010");
  const otherIncome = balanceOf(tb, (r) => r.type === "REVENUE" && r.code !== "4000" && r.code !== "4010");
  const cogs = balanceOf(tb, (r) => r.code.startsWith("50"));
  const opex = balanceOf(tb, (r) => r.type === "EXPENSE" && !r.code.startsWith("50") && r.code !== "7000");
  const tax = balanceOf(tb, (r) => r.code === "7000");
  const gross = revenue - cogs;
  const pbt = gross + otherIncome - opex;
  const groups = new Map<string, Fils>();
  for (const r of tb) if (r.type === "EXPENSE" && !r.code.startsWith("50") && r.code !== "7000") groups.set(r.code, (groups.get(r.code) ?? 0) + r.balance);
  return { tb, revenue, otherIncome, cogs, gross, opex, pbt, tax, net: pbt - tax, opexLines: [...groups].sort((a, b) => b[1] - a[1]) };
}

export function balanceSheet(js: Journal[]) {
  const tb = trialBalance(js);
  const pl = profitAndLoss(js);
  const sec = (t: AccType) => tb.filter((r) => r.type === t && r.balance !== 0);
  const assets = sec("ASSET"), liabilities = sec("LIABILITY"), equity = sec("EQUITY");
  const sum = (rs: TbRow[]) => rs.reduce((s, r) => s + r.balance, 0);
  const totalEquity = sum(equity) + pl.net;
  return { assets, liabilities, equity, currentProfit: pl.net, totalAssets: sum(assets), totalLiabilities: sum(liabilities), totalEquity };
}

export function monthly(js: Journal[], months: string[]) {
  return months.map((m) => {
    const pl = profitAndLoss(js.filter((j) => j.date.startsWith(m)));
    return { month: m, label: new Date(m + "-01").toLocaleString("en", { month: "short" }), revenue: pl.revenue / 100, expenses: (pl.cogs + pl.opex) / 100, profit: pl.net / 100, pl };
  });
}

export function accountLedger(js: Journal[], code: string) {
  let run = 0;
  const type = ACC[code]?.type ?? "ASSET";
  return js.flatMap((j) => j.lines.filter((l) => l.account === code).map((l) => ({ j, l })))
    .sort((a, b) => a.j.date.localeCompare(b.j.date))
    .map(({ j, l }) => { run += natural(type, l.debit, l.credit); return { j, l, running: run }; });
}

export function reverse(j: Journal): Journal["lines"] {
  return j.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit, vat: l.vat ? -l.vat : l.vat }));
}
