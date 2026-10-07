import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Menu, X, HandCoins, Wallet, Building2, LayoutDashboard, ScanLine, Receipt, BookOpen, FileBarChart, Landmark, Calculator, Banknote, CalendarClock, ShieldCheck, Settings, ChevronDown, Languages, CheckCircle2, AlertTriangle, Info, Search, Bell, CornerDownLeft, ArrowRight, LogOut, UserPlus } from "lucide-react";
import { useStore, USERS } from "../lib/store";
import { useAuth } from "./AuthGate";
import type { Role } from "../lib/types";
import { cx } from "./ui";

export type Page = "firm" | "dashboard" | "capture" | "sales" | "ledger" | "ar" | "ap" | "reports" | "vat" | "ct" | "bank" | "calendar" | "audit" | "settings" | "team";

const NAV: { section: string; items: { id: Page; label: string; icon: ReactNode; client?: boolean; firmOnly?: boolean }[] }[] = [
  { section: "Workspace", items: [
    { id: "firm", label: "Firm overview", icon: <Building2 size={17} />, firmOnly: true },
    { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={17} />, client: true },
  ] },
  { section: "Accounting", items: [
    { id: "capture", label: "Purchase bills", icon: <ScanLine size={17} />, client: true },
    { id: "sales", label: "Sales & e-invoicing", icon: <Receipt size={17} />, client: true },
    { id: "bank", label: "Bank reconciliation", icon: <Banknote size={17} />, client: true },
    { id: "ledger", label: "Accounts", icon: <BookOpen size={17} />, client: true },
    { id: "ar", label: "Accounts Receivable (AR)", icon: <HandCoins size={17} />, client: true },
    { id: "ap", label: "Accounts Payable (AP)", icon: <Wallet size={17} />, client: true },
    { id: "reports", label: "Reports", icon: <FileBarChart size={17} />, client: true },
  ] },
  { section: "Tax", items: [
    { id: "vat", label: "VAT 201", icon: <Landmark size={17} />, client: true },
    { id: "ct", label: "Corporate tax", icon: <Calculator size={17} />, client: true },
    { id: "calendar", label: "Compliance calendar", icon: <CalendarClock size={17} /> },
  ] },
  { section: "Insights", items: [
    { id: "audit", label: "Audit trail", icon: <ShieldCheck size={17} /> },
    { id: "settings", label: "Settings", icon: <Settings size={17} /> },
    { id: "team", label: "Users & invites", icon: <UserPlus size={17} />, firmOnly: true },
  ] },
];
export const ALL_ITEMS = NAV.flatMap((s) => s.items);

export function Layout({ page, go, children }: { page: Page; go: (p: Page) => void; children: ReactNode }) {
  const { state, setSession, switchRole, t, toasts } = useStore();
  const auth = useAuth();
  const { session, orgs } = state;
  const isFirm = USERS[session.role].firm;
  const org = orgs.find((o) => o.id === session.orgId);
  const pendingCount = state.purchases.filter((p) => p.status === "PENDING" && (session.orgId === "FIRM" || p.orgId === session.orgId)).length;
  const [palette, setPalette] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const goNav = (p: Page) => { go(p); setNavOpen(false); };
  const rtl = session.lang === "ar";
  const orgLabel = (o: { name: string; nameAr: string }) => (rtl ? o.nameAr : o.name);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);

  const pickOrg = (id: string) => {
    setSession({ orgId: id });
    if (id === "FIRM" && ALL_ITEMS.find((i) => i.id === page)?.client) go("firm");
    if (id !== "FIRM" && page === "firm") go("dashboard");
  };

  return (
    <div className="min-h-screen flex">
      {navOpen && <div className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm lg:hidden fade-in" onClick={() => setNavOpen(false)} />}
      <aside aria-label={t("Main navigation")} className={cx("w-[264px] shrink-0 bg-ink-950 text-slate-300 flex flex-col h-screen overflow-hidden z-50 transition-transform duration-300 fixed lg:sticky top-0 start-0", navOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full lg:translate-x-0 lg:rtl:translate-x-0")}>
        <div className="pointer-events-none absolute -top-24 -start-24 size-72 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 -end-24 size-72 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative px-5 py-5 flex items-center gap-3">
          <div className="shimmer size-10 rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-600 to-teal-800 grid place-items-center text-white font-bold shadow-lg shadow-emerald-900/50 ring-1 ring-white/20">T+</div>
          <div className="flex-1">
            <div className="text-white font-semibold leading-tight tracking-tight">TFS+ Smart Ledger</div>
            <div className="text-[11px] text-slate-500">{t("UAE accounting, VAT & tax")}</div>
          </div>
          <button className="lg:hidden size-8 grid place-items-center rounded-lg text-slate-400 hover:bg-white/10 cursor-pointer" aria-label={t("Close menu")} onClick={() => setNavOpen(false)}><X size={18} /></button>
        </div>
        <button onClick={() => setPalette(true)} className="relative mx-3 mb-1 flex items-center gap-2 rounded-xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-400 hover:bg-white/10 hover:text-slate-200 transition cursor-pointer">
          <Search size={15} /><span className="flex-1 text-start">{t("Jump to…")}</span><kbd className="text-[10px] rounded-md bg-white/10 px-1.5 py-0.5 font-sans">⌘K</kbd>
        </button>
        <nav className="relative flex-1 overflow-y-auto px-3 pb-4">
          {NAV.map((s) => {
            const items = s.items.filter((i) => (i.firmOnly ? isFirm && session.orgId === "FIRM" : i.client ? session.orgId !== "FIRM" : true));
            if (!items.length) return null;
            return (
              <div key={s.section} className="mt-5">
                <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t(s.section)}</div>
                {items.map((i) => {
                  const active = page === i.id;
                  return (
                    <button key={i.id} aria-current={active ? "page" : undefined} onClick={() => goNav(i.id)} className={cx("focus-visible:outline-2 focus-visible:outline-emerald-400 group relative w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-200 cursor-pointer", active ? "text-white bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-transparent ring-1 ring-emerald-400/20" : "hover:bg-white/5 hover:text-white hover:translate-x-0.5 rtl:hover:-translate-x-0.5")}>
                      {active && <span className="absolute start-0 top-2 bottom-2 w-[3px] rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.9)]" />}
                      <span className={cx("transition-colors", active ? "text-emerald-400" : "text-slate-500 group-hover:text-slate-300")}>{i.icon}</span>
                      <span className="flex-1 text-start">{t(i.label)}</span>
                      {i.id === "capture" && pendingCount > 0 && <span className="text-[10px] font-semibold bg-amber-400/15 text-amber-300 ring-1 ring-amber-300/20 rounded-full px-1.5 py-0.5">{pendingCount}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="relative p-4 border-t border-white/5 bg-black/10">
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 mb-1.5">{t("Switch role")}</div>
          <div className="relative">
            <select aria-label={t("Switch role")} value={session.role} onChange={(e) => { const r = e.target.value as Role; switchRole(r); go(USERS[r].firm ? "firm" : "dashboard"); }} className="w-full appearance-none rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none cursor-pointer hover:bg-white/10 transition">
              {(Object.keys(USERS) as Role[]).map((r) => <option key={r} value={r} className="text-slate-900">{t(USERS[r].label)} — {USERS[r].user.split(" ")[0]}</option>)}
            </select>
            <ChevronDown size={14} className="absolute end-3 top-3 pointer-events-none text-slate-400" />
          </div>
          <div className="mt-3 flex items-center gap-2.5">
            <div className="relative size-9 rounded-full bg-gradient-to-br from-amber-300 to-amber-700 grid place-items-center text-white text-xs font-semibold ring-2 ring-white/10">{session.user[0]}<span className="absolute -bottom-0.5 -end-0.5 size-2.5 rounded-full bg-emerald-400 ring-2 ring-ink-950" /></div>
            <div className="text-xs leading-tight min-w-0">
              <div className="text-white truncate">{session.user}</div>
              <div className="text-slate-500 truncate">{isFirm ? t("TFS Plus Tax & Accountancy") : org && orgLabel(org)}</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-white/70 backdrop-blur-xl border-b border-slate-200/70 flex items-center gap-2 sm:gap-4 px-3 sm:px-6 sticky top-0 z-30">
          <button className="lg:hidden size-9 shrink-0 grid place-items-center rounded-xl border border-slate-200 bg-white cursor-pointer" aria-label={t("Open menu")} onClick={() => setNavOpen(true)}><Menu size={18} /></button>
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <select aria-label={t("Client")} disabled={!isFirm} value={session.orgId} onChange={(e) => pickOrg(e.target.value)} className="w-full appearance-none rounded-xl border border-slate-200 bg-white ps-10 pe-9 py-2 text-sm font-medium text-slate-800 outline-none cursor-pointer hover:border-slate-300 hover:shadow-sm transition disabled:cursor-default disabled:bg-slate-50 sm:min-w-72 focus-visible:ring-4 focus-visible:ring-emerald-100">
              {isFirm && <option value="FIRM">{t("All clients")} — TFS Plus</option>}
              {orgs.filter((o) => isFirm || o.id === session.orgId).map((o) => <option key={o.id} value={o.id}>{orgLabel(o)}</option>)}
            </select>
            <span className="absolute start-3 top-2.5 size-5 rounded-md grid place-items-center text-[10px] font-bold text-white" style={{ background: org?.color ?? "linear-gradient(135deg,#10b981,#4f46e5)" }}>{org ? org.name[0] : "★"}</span>
            {isFirm && <ChevronDown size={14} className="absolute end-3 top-3 pointer-events-none text-slate-400" />}
          </div>
          {org && <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500"><span className="rounded-md bg-slate-100 px-2 py-1 font-mono">TRN {org.trn}</span><span className="rounded-md bg-slate-100 px-2 py-1">{t(org.industry)}</span><span className="rounded-md bg-emerald-50 text-emerald-700 px-2 py-1 font-medium">{t(org.regime === "sbr" ? "SBR elected" : org.regime === "qfzp" ? "QFZP" : "Standard CT")}</span></div>}
          <div className="ms-auto flex items-center gap-2">
            <span className="hidden xl:flex items-center gap-1.5 text-xs text-slate-400 me-2"><span className="size-1.5 rounded-full bg-emerald-500 pulse-ring" />{t("Live · stored locally · config uae-2026.09")}</span>
            <button onClick={() => go(session.orgId === "FIRM" ? "firm" : "capture")} className="relative size-9 shrink-0 grid place-items-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:-translate-y-px transition cursor-pointer" title={t("Pending approvals")} aria-label={t("Pending approvals: {n}", { n: pendingCount })}>
              <Bell size={16} className="text-slate-600" />{pendingCount > 0 && <span className="absolute -top-1 -end-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold grid place-items-center">{pendingCount}</span>}
            </button>
            {auth && <span className="hidden md:block text-xs text-slate-500 max-w-48 truncate" title={auth.email}>{auth.fullName}</span>}
            {auth && <button onClick={() => void auth.signOut()} className="btn-ghost !py-1.5 !px-2.5 sm:!px-3.5" aria-label="Sign out"><LogOut size={15} /><span className="hidden sm:inline">Sign out</span></button>}
            <button onClick={() => setSession({ lang: session.lang === "en" ? "ar" : "en" })} className="btn-ghost !py-1.5 !px-2.5 sm:!px-3.5" aria-label={session.lang === "en" ? "التبديل إلى العربية" : "Switch to English"}><Languages size={15} /><span className="hidden sm:inline">{session.lang === "en" ? "العربية" : "English"}</span></button>
          </div>
        </header>
        <main id="main" className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1520px] w-full mx-auto">
          <div key={page + session.orgId} className="page-enter">{children}</div>
        </main>
      </div>

      {palette && <Palette close={() => setPalette(false)} go={goNav} pickOrg={pickOrg} />}

      <div className="fixed bottom-5 end-5 start-5 sm:start-auto z-[60] space-y-2" role="status" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className={cx("page-enter flex items-start gap-2.5 rounded-2xl px-4 py-3 text-sm shadow-2xl max-w-sm ring-1 ring-white/10 backdrop-blur", x.tone === "err" ? "bg-gradient-to-r from-rose-600 to-rose-500 text-white" : x.tone === "info" ? "bg-gradient-to-r from-ink-900 to-ink-800 text-white" : "bg-gradient-to-r from-emerald-600 to-teal-600 text-white")}>
            {x.tone === "err" ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : x.tone === "info" ? <Info size={16} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
            <span>{x.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Palette({ close, go, pickOrg }: { close: () => void; go: (p: Page) => void; pickOrg: (id: string) => void }) {
  const { state, t } = useStore();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const isFirm = USERS[state.session.role].firm;
  const items = useMemo(() => {
    const pages = ALL_ITEMS.filter((i) => !(i.firmOnly && !isFirm)).map((i) => ({ key: "p" + i.id, label: t(i.label), hint: t("Page"), icon: i.icon, run: () => { if (i.client && state.session.orgId === "FIRM") pickOrg(state.orgs[0].id); if (i.firmOnly) pickOrg("FIRM"); go(i.id); } }));
    const clients = isFirm ? state.orgs.map((o) => ({ key: "o" + o.id, label: state.session.lang === "ar" ? o.nameAr : o.name, hint: t("Client"), icon: <span className="size-4 rounded" style={{ background: o.color }} />, run: () => { pickOrg(o.id); go("dashboard"); } })) : [];
    return [...clients, ...pages].filter((x) => x.label.toLowerCase().includes(q.toLowerCase()));
  }, [q, state, isFirm, pickOrg, t, go]);
  const run = (i: number) => { items[i]?.run(); close(); };
  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/40 backdrop-blur-md grid place-items-start justify-center pt-[14vh] px-4 fade-in" onClick={close}>
      <div role="dialog" aria-modal="true" aria-label={t("Jump to…")} className="w-full max-w-xl card !bg-white shadow-2xl overflow-hidden page-enter" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 border-b border-slate-100">
          <Search size={17} className="text-slate-400" />
          <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }} placeholder={t("Search pages and clients…")} aria-label={t("Search pages and clients…")} className="flex-1 py-4 text-[15px] outline-none bg-transparent"
            onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); } if (e.key === "Enter") run(idx); if (e.key === "Escape") close(); }} />
          <kbd className="text-[10px] rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-500">ESC</kbd>
        </div>
        <ul className="max-h-80 overflow-auto p-2">
          {items.map((x, i) => (
            <li key={x.key}><button onMouseEnter={() => setIdx(i)} onClick={() => run(i)} className={cx("w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-start transition cursor-pointer", i === idx ? "bg-emerald-50 text-emerald-900" : "text-slate-700")}>
              <span className={i === idx ? "text-emerald-600" : "text-slate-400"}>{x.icon}</span><span className="flex-1">{x.label}</span><span className="text-[11px] text-slate-400">{x.hint}</span>{i === idx ? <CornerDownLeft size={14} className="text-emerald-600 rtl:-scale-x-100" /> : <ArrowRight size={14} className="text-transparent" />}
            </button></li>
          ))}
          {!items.length && <li className="text-center text-sm text-slate-400 py-8">{t("No matches")}</li>}
        </ul>
      </div>
    </div>
  );
}
