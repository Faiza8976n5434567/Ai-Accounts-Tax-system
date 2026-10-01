/**
 * AR / AP sub-ledgers derived from the general ledger control accounts
 * (1100 Trade receivables, 2000 Trade payables). Nothing is stored separately:
 * documents = postings that increase the control account, settlements = postings
 * that decrease it, allocated oldest-first (FIFO) per counterparty.
 */
import type { Journal } from "./types";
import type { Fils } from "./money";

export type Control = "1100" | "2000";
export const TERMS_DAYS = 30;
export const UNALLOCATED = "Unallocated";

export interface OpenItem { jid: string; ref: string; date: string; due: string; party: string; memo: string; original: Fils; settled: Fils; open: Fils; overdueDays: number }
export interface Movement { jid: string; ref: string; date: string; party: string; memo: string; kind: "doc" | "settlement"; amount: Fils }
export interface PartyRow { party: string; docs: number; invoiced: Fils; settled: Fils; balance: Fils; overdue: Fils; oldestDays: number; lastDate: string; items: OpenItem[]; moves: Movement[] }

const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const diff = (a: string, b: string) => Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 864e5);

export const BUCKETS = ["Current", "1–30", "31–60", "61–90", "90+"] as const;
export const bucketOf = (days: number) => (days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4);

export function subledger(posted: Journal[], account: Control, today: string) {
  const sign = account === "1100" ? 1 : -1; // AR grows with debits, AP with credits
  const moves: Movement[] = [];
  for (const j of posted) {
    const amt = j.lines.filter((l) => l.account === account).reduce((s, l) => s + (l.debit - l.credit) * sign, 0);
    if (!amt) continue;
    moves.push({ jid: j.id, ref: j.ref, date: j.date, party: j.party ?? UNALLOCATED, memo: j.memo, kind: amt > 0 ? "doc" : "settlement", amount: Math.abs(amt) });
  }
  moves.sort((a, b) => a.date.localeCompare(b.date) || a.jid.localeCompare(b.jid));

  const byParty = new Map<string, Movement[]>();
  for (const m of moves) { const arr = byParty.get(m.party) ?? []; arr.push(m); byParty.set(m.party, arr); }

  const parties: PartyRow[] = [];
  const items: OpenItem[] = [];
  for (const [party, ms] of byParty) {
    const docs = ms.filter((m) => m.kind === "doc");
    let pool = ms.filter((m) => m.kind === "settlement").reduce((s, m) => s + m.amount, 0);
    const its: OpenItem[] = docs.map((d) => {
      const used = Math.min(pool, d.amount); pool -= used;
      const due = addDays(d.date, TERMS_DAYS);
      return { jid: d.jid, ref: d.ref, date: d.date, due, party, memo: d.memo, original: d.amount, settled: used, open: d.amount - used, overdueDays: Math.max(0, diff(due, today)) };
    });
    const open = its.filter((i) => i.open > 0);
    const invoiced = docs.reduce((s, d) => s + d.amount, 0);
    const settled = ms.filter((m) => m.kind === "settlement").reduce((s, m) => s + m.amount, 0);
    parties.push({
      party, docs: docs.length, invoiced, settled, balance: invoiced - settled,
      overdue: open.filter((i) => i.overdueDays > 0).reduce((s, i) => s + i.open, 0),
      oldestDays: open.reduce((m, i) => Math.max(m, i.overdueDays), 0),
      lastDate: ms[ms.length - 1]?.date ?? "", items: its, moves: ms,
    });
    items.push(...open);
  }
  const total = parties.reduce((s, p) => s + p.balance, 0);
  const buckets = BUCKETS.map((label, i) => ({ label, v: items.filter((x) => bucketOf(x.overdueDays) === i).reduce((s, x) => s + x.open, 0), n: items.filter((x) => bucketOf(x.overdueDays) === i).length }));
  const settledLast30 = moves.filter((m) => m.kind === "settlement" && diff(m.date, today) <= 30).reduce((s, m) => s + m.amount, 0);
  const dueNext7 = items.filter((x) => { const d = diff(today, x.due); return d >= 0 && d <= 7; }).reduce((s, x) => s + x.open, 0);
  return { parties: parties.sort((a, b) => b.balance - a.balance), items: items.sort((a, b) => b.overdueDays - a.overdueDays || a.due.localeCompare(b.due)), moves, total, buckets, settledLast30, dueNext7 };
}
