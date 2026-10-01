import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { buildSeed } from "./seed";
import { classify, review, type Extracted } from "./ai";
import { validateJournal, reverse as reverseLines } from "./ledger";
import { applyBp } from "./money";
import { invoiceTotals, validatePint } from "./einvoice";
import { t as tr, type Lang } from "./i18n";
import type { AppState, Journal, JLine, PurchaseDoc, Role, SalesInvoice, Session } from "./types";

const KEY = "tfs-smart-ledger-poc-v2"; // v2: journals carry customer/supplier (party) for AR/AP
export const USERS: Record<Role, { user: string; label: string; firm: boolean; canApprove: boolean }> = {
  FIRM_PARTNER: { user: "Faizan (Partner)", label: "Firm Partner", firm: true, canApprove: true },
  FIRM_ACCOUNTANT: { user: "Aisha (Accountant)", label: "Firm Accountant", firm: true, canApprove: false },
  CLIENT_OWNER: { user: "Omar (Owner)", label: "Client Owner", firm: false, canApprove: true },
  CLIENT_FINANCE: { user: "Priya (Finance)", label: "Client Finance", firm: false, canApprove: false },
};

function load(): AppState {
  let st: AppState;
  try { const raw = localStorage.getItem(KEY); st = raw ? JSON.parse(raw) : buildSeed(); } catch { st = buildSeed(); }
  const qp = new URLSearchParams(location.search).get("lang");
  if (qp === "ar" || qp === "en") st.session.lang = qp;
  return st;
}

export type Toast = { id: number; tone: "ok" | "err" | "info"; msg: string };

function useStoreImpl() {
  const [state, setState] = useState<AppState>(load);
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota */ } }, [state]);
  useEffect(() => { document.documentElement.dir = state.session.lang === "ar" ? "rtl" : "ltr"; document.documentElement.lang = state.session.lang; }, [state.session.lang]);

  const langRef = { current: state.session.lang as Lang };
  const T = (k: string, p?: Record<string, string | number>) => tr(langRef.current, k, p);
  const toast = (msg: string, tone: Toast["tone"] = "ok") => { const id = Date.now() + Math.random(); setToasts((x) => [...x, { id, tone, msg }]); setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 3800); };

  const mutate = (fn: (d: AppState) => void) => setState((prev) => { const d = structuredClone(prev); fn(d); return d; });
  const nid = (d: AppState, p: string) => `${p}-${(++d.seq).toString(36)}`;
  const log = (d: AppState, orgId: string, action: string, detail: string, ai = false) =>
    d.audit.unshift({ id: nid(d, "a"), ts: new Date().toISOString(), user: d.session.user, role: d.session.role, orgId, action, detail, ai });

  const purchaseLines = (p: PurchaseDoc): JLine[] => {
    if (p.taxCode === "RCS") {
      const vat = applyBp(p.net, 500);
      return [
        { account: p.account, debit: p.net, credit: 0, taxCode: "RCS", vat },
        { account: "1310", debit: vat, credit: 0 },
        { account: "2110", debit: 0, credit: vat },
        { account: "2000", debit: 0, credit: p.total },
      ];
    }
    if (p.taxCode === "BLK" || (!p.supplierTrn && p.vat > 0)) return [{ account: p.account, debit: p.total, credit: 0, taxCode: "BLK", vat: p.vat }, { account: "2000", debit: 0, credit: p.total }];
    if (p.taxCode === "SR") return [{ account: p.account, debit: p.net, credit: 0, taxCode: "SR", vat: p.vat }, { account: "1300", debit: p.vat, credit: 0 }, { account: "2000", debit: 0, credit: p.total }];
    return [{ account: p.account, debit: p.total, credit: 0, taxCode: p.taxCode }, { account: "2000", debit: 0, credit: p.total }];
  };

  const postPurchase = (d: AppState, p: PurchaseDoc, approver: string) => {
    const lines = purchaseLines(p);
    const errs = validateJournal(lines);
    if (errs.length) throw new Error(errs.join(" "));
    const j: Journal = { id: nid(d, "j"), orgId: p.orgId, date: p.date, ref: p.invNo, memo: `${p.supplier} — ${p.description}`, source: "PURCHASE", status: "POSTED", lines, preparedBy: p.createdBy, approvedBy: approver, postedAt: new Date().toISOString(), ai: { confidence: p.confidence, reasoning: p.reasoning }, docId: p.id, party: p.supplier };
    d.journals.push(j); p.status = "POSTED"; p.journalId = j.id;
    return j;
  };

  const api = {
    state, toasts, toast,
    lang: state.session.lang as Lang,
    t: (s: string, p?: Record<string, string | number>) => tr(state.session.lang, s, p),
    setSession: (s: Partial<Session>) => mutate((d) => { d.session = { ...d.session, ...s }; }),
    switchRole: (role: Role) => mutate((d) => {
      d.session.role = role; d.session.user = USERS[role].user;
      if (!USERS[role].firm) d.session.orgId = "alnoor"; else d.session.orgId = "FIRM";
      log(d, "FIRM", "Session", `Switched to ${USERS[role].label}`);
    }),
    reset: () => { localStorage.removeItem(KEY); setState(buildSeed()); toast(T("Demo data reset")); },
    importState: (s: AppState) => { setState(s); toast(T("Backup restored")); },

    capture: (orgId: string, ex: Extracted, fileName?: string): PurchaseDoc => {
      const cl = classify(`${ex.supplier} ${ex.description}`, ex.foreign);
      const base = { ...ex, id: `p-${Date.now().toString(36)}`, orgId, fileName, ...cl, status: "REVIEW" as const, createdAt: new Date().toISOString(), createdBy: state.session.user };
      const p: PurchaseDoc = { ...base, ...review(base, state.purchases) };
      mutate((d) => {
        d.purchases.unshift(p);
        log(d, orgId, "AI extraction", `${fileName ?? "sample"} → ${p.supplier} ${p.invNo}, AED ${(p.total / 100).toFixed(2)}, suggested ${p.account} (${Math.round(p.confidence * 100)}%), risk ${p.risk}`, true);
      });
      return p;
    },
    updatePurchase: (id: string, patch: Partial<PurchaseDoc>) => mutate((d) => {
      const p = d.purchases.find((x) => x.id === id); if (!p) return;
      Object.assign(p, patch);
      if (patch.account && patch.account !== p.account) p.reasoning += " (Overridden by user.)";
      Object.assign(p, review(p, d.purchases));
    }),
    submitPurchase: (id: string) => mutate((d) => {
      const p = d.purchases.find((x) => x.id === id); if (!p) return;
      const org = d.orgs.find((o) => o.id === p.orgId)!;
      const hardFail = p.checks.some((c) => !c.ok && c.severity === "error" && (c.id === "dup"));
      if (hardFail) { toast(T("Duplicate invoice — cannot submit"), "err"); return; }
      const aa = org.autoApprove;
      if (aa.enabled && p.risk === "Low" && p.confidence >= aa.minConfidence && p.total <= aa.maxAmount) {
        try { const j = postPurchase(d, p, "Auto-approve rule"); log(d, p.orgId, "Auto-posted", `${p.invNo} posted as ${j.id} (confidence ${Math.round(p.confidence * 100)}% ≥ ${aa.minConfidence * 100}%, total ≤ AED ${aa.maxAmount / 100}, risk Low)`, true); toast(T("Auto-approved & posted {ref} — within tenant thresholds", { ref: p.invNo })); }
        catch (e) { toast(String((e as Error).message), "err"); }
      } else {
        p.status = "PENDING"; log(d, p.orgId, "Submitted for approval", `${p.invNo} — ${p.risk} risk, ${Math.round(p.confidence * 100)}% confidence`);
        toast(T("{ref} sent for approval (maker-checker)", { ref: p.invNo }), "info");
      }
    }),
    approvePurchase: (id: string) => mutate((d) => {
      const p = d.purchases.find((x) => x.id === id); if (!p) return;
      if (!USERS[d.session.role].canApprove) { toast(T("Your role cannot approve. Switch to Partner or Owner."), "err"); return; }
      if (p.createdBy === d.session.user) { toast(T("Maker-checker: the preparer cannot approve their own entry."), "err"); return; }
      try { const j = postPurchase(d, p, d.session.user); log(d, p.orgId, "Approved & posted", `${p.invNo} → ${j.id}`); toast(T("Posted {ref} to the ledger", { ref: p.invNo })); }
      catch (e) { toast(String((e as Error).message), "err"); }
    }),
    rejectPurchase: (id: string) => mutate((d) => { const p = d.purchases.find((x) => x.id === id); if (!p) return; p.status = "REJECTED"; log(d, p.orgId, "Rejected", `${p.invNo} — ${p.supplier}`); toast(T("Rejected {ref}", { ref: p.invNo }), "info"); }),

    createSale: (inv: Omit<SalesInvoice, "id" | "status" | "einv" | "einvLog">) => mutate((d) => {
      const tot = invoiceTotals(inv as SalesInvoice);
      const lines: JLine[] = [{ account: "1100", debit: tot.total, credit: 0 }];
      for (const l of tot.lines) lines.push({ account: l.account, debit: 0, credit: l.net, taxCode: l.taxCode, vat: l.vat, emirate: inv.emirate });
      if (tot.vat) lines.push({ account: "2100", debit: 0, credit: tot.vat });
      const errs = validateJournal(lines); if (errs.length) { toast(errs[0], "err"); return; }
      const j: Journal = { id: nid(d, "j"), orgId: inv.orgId, date: inv.date, ref: inv.invNo, memo: `Sales invoice — ${inv.customer}`, source: "SALE", status: "POSTED", lines, preparedBy: d.session.user, approvedBy: "Posting rule (sales)", postedAt: new Date().toISOString(), party: inv.customer };
      d.journals.push(j);
      d.sales.unshift({ ...inv, id: nid(d, "s"), status: "POSTED", journalId: j.id, einv: "NOT_SENT", einvLog: [] });
      log(d, inv.orgId, "Sales invoice issued", `${inv.invNo} — ${inv.customer} AED ${(tot.total / 100).toFixed(2)}`);
      toast(T("Invoice {ref} issued & posted", { ref: inv.invNo }));
    }),
    receivePayment: (id: string) => mutate((d) => {
      const s = d.sales.find((x) => x.id === id); if (!s) return;
      const tot = invoiceTotals(s).total;
      d.journals.push({ id: nid(d, "j"), orgId: s.orgId, date: "2026-09-30", ref: `RCPT-${s.invNo}`, memo: `Receipt — ${s.customer}`, source: "BANK", status: "POSTED", lines: [{ account: "1010", debit: tot, credit: 0 }, { account: "1100", debit: 0, credit: tot }], preparedBy: d.session.user, approvedBy: "Posting rule (receipts)", party: s.customer, postedAt: new Date().toISOString() });
      s.status = "PAID"; log(d, s.orgId, "Receipt", `${s.invNo} marked paid`); toast(T("Receipt recorded for {ref}", { ref: s.invNo }));
    }),
    /** Settle an AR invoice (customer receipt) or AP bill (supplier payment) — posts to the GL control account. */
    settle: (orgId: string, account: "1100" | "2000", items: { jid: string; ref: string; party: string; open: number }[]) => {
      if (!USERS[state.session.role].canApprove) { toast(T("Your role cannot approve. Switch to Partner or Owner."), "err"); return; }
      mutate((d) => {
        for (const it of items) {
          const ar = account === "1100";
          const lines: JLine[] = ar ? [{ account: "1010", debit: it.open, credit: 0 }, { account: "1100", debit: 0, credit: it.open }] : [{ account: "2000", debit: it.open, credit: 0 }, { account: "1010", debit: 0, credit: it.open }];
          d.journals.push({ id: nid(d, "j"), orgId, date: "2026-09-30", ref: `${ar ? "RCPT" : "PAY"}-${it.ref}`, memo: `${ar ? "Receipt" : "Supplier payment"} — ${it.party}`, source: "BANK", status: "POSTED", lines, preparedBy: d.session.user, approvedBy: d.session.user, postedAt: new Date().toISOString(), party: it.party });
          if (ar) { const sale = d.sales.find((x) => x.journalId === it.jid); if (sale) sale.status = "PAID"; }
          log(d, orgId, ar ? "Receipt" : "Supplier payment", `${it.ref} — ${it.party} AED ${(it.open / 100).toFixed(2)}`);
        }
      });
      toast(T(account === "1100" ? "{n} receipt(s) posted to the ledger" : "{n} payment(s) posted to the ledger", { n: items.length }));
    },
    sendEinvoice: (id: string) => {
      let ok = false;
      mutate((d) => {
        const s = d.sales.find((x) => x.id === id)!; const org = d.orgs.find((o) => o.id === s.orgId)!;
        const res = validatePint(s, org); const fails = res.filter((r) => !r.ok);
        const ts = new Date().toLocaleTimeString();
        if (fails.length) { s.einv = "REJECTED"; s.einvLog.push(`${ts} Pre-validation failed: ${fails.map((f) => f.rule).join(", ")}`); toast(T("PINT AE pre-validation failed"), "err"); return; }
        s.einv = "VALIDATED"; s.einvLog.push(`${ts} PINT AE pre-validation passed (${res.length} rules)`); ok = true;
        log(d, s.orgId, "E-invoice validated", s.invNo);
      });
      const step = (st: SalesInvoice["einv"], msg: string, delay: number) => setTimeout(() => mutate((d) => { const s = d.sales.find((x) => x.id === id)!; s.einv = st; s.einvLog.push(`${new Date().toLocaleTimeString()} ${msg}`); }), delay);
      setTimeout(() => { if (!ok) return; step("SENT", "Transmitted to ASP (sandbox adapter) — corner 2", 900); step("DELIVERED", "Delivered to buyer's ASP (corner 3) · Tax data reported to FTA (corner 5)", 2200); }, 0);
    },

    postManual: (orgId: string, date: string, memo: string, lines: JLine[]) => {
      const errs = validateJournal(lines);
      if (errs.length) { toast(errs[0], "err"); return false; }
      mutate((d) => { const j: Journal = { id: nid(d, "j"), orgId, date, ref: `MJ-${d.seq + 1}`, memo, source: "MANUAL", status: USERS[d.session.role].canApprove ? "POSTED" : "PENDING", lines, preparedBy: d.session.user, approvedBy: USERS[d.session.role].canApprove ? d.session.user : undefined }; d.journals.push(j); log(d, orgId, "Manual journal", `${j.ref} ${memo} (${j.status})`); });
      toast(T("Journal saved")); return true;
    },
    approveJournal: (id: string) => mutate((d) => {
      const j = d.journals.find((x) => x.id === id)!;
      if (!USERS[d.session.role].canApprove) { toast(T("Your role cannot approve."), "err"); return; }
      if (j.preparedBy === d.session.user) { toast(T("Maker-checker: preparer cannot approve."), "err"); return; }
      j.status = "POSTED"; j.approvedBy = d.session.user; log(d, j.orgId, "Journal approved", j.ref); toast(T("{ref} posted", { ref: j.ref }));
    }),
    reverseJournal: (id: string) => mutate((d) => {
      const j = d.journals.find((x) => x.id === id)!;
      if (!USERS[d.session.role].firm) { toast(T("Only firm users can reverse posted journals."), "err"); return; }
      j.status = "REVERSED";
      d.journals.push({ id: nid(d, "j"), orgId: j.orgId, date: "2026-09-30", ref: `REV-${j.ref}`, memo: `Reversal of ${j.ref}`, source: "REVERSAL", status: "POSTED", lines: reverseLines(j), preparedBy: d.session.user, approvedBy: d.session.user, reversalOf: j.id });
      log(d, j.orgId, "Journal reversed", `${j.ref} (posted journals are never edited)`); toast(T("{ref} reversed", { ref: j.ref }), "info");
    }),

    autoMatch: (orgId: string) => mutate((d) => {
      let c = 0;
      for (const b of d.bank.filter((x) => x.orgId === orgId && !x.journalId)) {
        const used = new Set(d.bank.map((x) => x.journalId).filter(Boolean));
        const cand = d.journals.find((j) => j.orgId === orgId && j.status === "POSTED" && !used.has(j.id) && Math.abs((new Date(j.date).getTime() - new Date(b.date).getTime()) / 864e5) <= 5 &&
          j.lines.some((l) => l.account === "1010" && (b.amount > 0 ? l.debit === b.amount : l.credit === -b.amount)));
        if (cand) { b.journalId = cand.id; c++; }
      }
      log(d, orgId, "Bank auto-match", `${c} line(s) matched by amount ± 5 days`, true); toast(T("{n} bank line(s) matched", { n: c }));
    }),
    categoriseBank: (bankId: string, account: string) => mutate((d) => {
      const b = d.bank.find((x) => x.id === bankId)!;
      const amt = Math.abs(b.amount);
      const sr = !["6500", "6120", "6160"].includes(account) && b.amount < 0;
      const net = sr ? Math.round(amt / 1.05) : amt, vat = amt - net;
      const lines: JLine[] = b.amount < 0
        ? [{ account, debit: sr ? net : amt, credit: 0, taxCode: sr ? "SR" : account === "6500" ? "BLK" : "OS", vat: sr ? vat : undefined }, ...(sr ? [{ account: "1300", debit: vat, credit: 0 }] : []), { account: "1010", debit: 0, credit: amt }]
        : [{ account: "1010", debit: amt, credit: 0 }, { account, debit: 0, credit: amt }];
      const j: Journal = { id: nid(d, "j"), orgId: b.orgId, date: b.date, ref: `BNK-${d.seq}`, memo: b.desc, source: "BANK", status: "POSTED", lines, preparedBy: "AI categoriser", approvedBy: d.session.user, ai: { confidence: 0.88, reasoning: "Bank narrative pattern" } };
      d.journals.push(j); b.journalId = j.id; log(d, b.orgId, "Bank line categorised", `${b.desc} → ${account}`, true); toast(T("Bank line posted"));
    }),
    importBank: (orgId: string, rows: { date: string; desc: string; amount: number }[]) => mutate((d) => {
      for (const r of rows) { const cl = classify(r.desc); d.bank.push({ id: nid(d, "b"), orgId, date: r.date, desc: r.desc, amount: r.amount, suggestion: r.amount < 0 ? cl.account : "4300" }); }
      log(d, orgId, "Bank import", `${rows.length} line(s)`); toast(T("{n} bank line(s) imported", { n: rows.length }));
    }),
    setAutoApprove: (orgId: string, aa: AppState["orgs"][number]["autoApprove"]) => mutate((d) => { const o = d.orgs.find((x) => x.id === orgId)!; o.autoApprove = aa; log(d, orgId, "Settings", `Auto-approve ${aa.enabled ? "on" : "off"} ≤ AED ${aa.maxAmount / 100} @ ${aa.minConfidence * 100}%`); }),
    setRegime: (orgId: string, regime: AppState["orgs"][number]["regime"]) => mutate((d) => { const o = d.orgs.find((x) => x.id === orgId)!; o.regime = regime; log(d, orgId, "CT regime", regime); }),
  };
  return api;
}

type Store = ReturnType<typeof useStoreImpl>;
const Ctx = createContext<Store | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) { const s = useStoreImpl(); return <Ctx.Provider value={s}>{children}</Ctx.Provider>; }
export const useStore = () => useContext(Ctx)!;

/** Current org (or null in firm view). */
export function useOrg() {
  const { state } = useStore();
  return useMemo(() => state.orgs.find((o) => o.id === state.session.orgId) ?? null, [state.orgs, state.session.orgId]);
}
