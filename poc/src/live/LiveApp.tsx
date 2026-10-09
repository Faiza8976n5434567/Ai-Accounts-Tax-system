/**
 * The live app (P1-13): everything here reads and writes the Supabase database, protected by
 * sign-in, two-factor and Row-Level Security. Screens are added as each phase lands; the old
 * demo screens remain available only in the demo build (`vite --mode demo`).
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Banknote, BookOpen, BookOpenCheck, Building2, CalendarClock, CalendarRange, CheckSquare, ChevronDown, Contact, FileCheck2, Gauge, Landmark, LayoutDashboard, LogOut, Menu, Package, ReceiptText, Scale, Settings, ShieldCheck, ShoppingCart, UserPlus, Users, Waypoints, X } from "lucide-react";
import { useAuth } from "../components/AuthGate";
import { cx } from "../components/ui";
import { listClients, myFirmRole, type Client } from "../lib/clients";
import { parseRoute, routeHash, type ClientTab, type Route } from "./routes";
import { ClientsPage } from "./ClientsPage";
import { ClientPage } from "./ClientPage";
import { TeamPage } from "../pages/Team";
import { AdminPage } from "./AdminPage";
import { IntegrityPage } from "./IntegrityPage";
import { DashboardPage } from "./DashboardPage";
import { DeadlinesPage } from "./DeadlinesPage";
import { useLoad } from "./hooks";

export function LiveApp() {
  const auth = useAuth()!;
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const onHash = () => { setRoute(parseRoute(location.hash)); setNavOpen(false); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = useCallback((r: Route) => { location.hash = routeHash(r); }, []);
  const { data: loadedClients, reload: reloadClients } = useLoad(listClients);
  const clients: Client[] = loadedClients ?? [];

  const client = route.page === "client" ? clients.find((c) => c.id === route.clientId) : undefined;
  useEffect(() => {
    const title = route.page === "admin" ? "Admin" : route.page === "team" ? "Users & invites" : route.page === "integrity" ? "Integrity" : route.page === "dashboard" ? "Dashboard" : route.page === "deadlines" ? "Deadlines" : route.page === "client" ? (client?.legal_name ?? "Client") : "Clients";
    document.title = `${title} · ${auth.appName}`;
  }, [route, client, auth.appName]);

  const allNav: { label: string; icon: ReactNode; to: Route; active: boolean }[] = [
    { label: "Dashboard", icon: <Gauge size={17} />, to: { page: "dashboard" }, active: route.page === "dashboard" },
    { label: "Deadlines", icon: <CalendarClock size={17} />, to: { page: "deadlines" }, active: route.page === "deadlines" },
    { label: "Clients", icon: <Building2 size={17} />, to: { page: "clients" }, active: route.page === "clients" },
    { label: "Users & invites", icon: <UserPlus size={17} />, to: { page: "team" }, active: route.page === "team" },
    { label: "Integrity", icon: <ShieldCheck size={17} />, to: { page: "integrity" }, active: route.page === "integrity" },
    { label: "Admin", icon: <Settings size={17} />, to: { page: "admin", tab: "profile" }, active: route.page === "admin" },
  ];
  // Client users (P3-06) see only their own companies — firm screens are for firm staff.
  const { data: firmRole } = useLoad(myFirmRole);
  const nav = firmRole ? allNav : allNav.filter((n) => n.to.page === "clients" || n.to.page === "deadlines").map((n) => ({ ...n, label: firmRole === null && n.to.page === "clients" ? "My companies" : n.label }));
  const clientNav: { label: string; icon: ReactNode; tab: ClientTab }[] = [
    { label: "Overview", icon: <LayoutDashboard size={17} />, tab: "overview" },
    { label: "Customers & suppliers", icon: <Contact size={17} />, tab: "contacts" },
    { label: "Items", icon: <Package size={17} />, tab: "items" },
    { label: "Sales invoices", icon: <ReceiptText size={17} />, tab: "sales" },
    { label: "Purchase bills", icon: <ShoppingCart size={17} />, tab: "bills" },
    { label: "Receipts & payments", icon: <Landmark size={17} />, tab: "payments" },
    { label: "Bank", icon: <Banknote size={17} />, tab: "bank" },
    { label: "VAT return", icon: <FileCheck2 size={17} />, tab: "vat" },
    { label: "Journals", icon: <BookOpenCheck size={17} />, tab: "journals" },
    { label: "Approvals", icon: <CheckSquare size={17} />, tab: "approvals" },
    { label: "Reports", icon: <Scale size={17} />, tab: "reports" },
    { label: "Chart of accounts", icon: <BookOpen size={17} />, tab: "accounts" },
    { label: "Periods", icon: <CalendarRange size={17} />, tab: "periods" },
    { label: "Client users", icon: <Users size={17} />, tab: "users" },
    { label: "Opening balances", icon: <Waypoints size={17} />, tab: "opening" },
  ];


  return (
    <div className="min-h-screen flex">
      {navOpen && <div className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" onClick={() => setNavOpen(false)} />}
      <aside className={cx("fixed lg:sticky top-0 z-50 h-screen w-64 shrink-0 bg-ink-950 text-slate-300 flex flex-col transition-transform lg:translate-x-0", navOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex items-center gap-3 px-5 h-16 border-b border-white/5">
          <span className="size-9 rounded-xl grid place-items-center text-white font-bold bg-gradient-to-br from-emerald-500 to-indigo-600" aria-hidden>★</span>
          <span className="font-semibold text-white truncate">{auth.appName}</span>
          <button className="lg:hidden ms-auto cursor-pointer" aria-label="Close menu" onClick={() => setNavOpen(false)}><X size={18} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-5">
          <div className="space-y-1">
            <div className="px-3 text-[10px] uppercase tracking-[0.14em] text-slate-500 mb-1.5">Firm</div>
            {nav.map((n) => <NavButton key={n.label} label={n.label} icon={n.icon} active={n.active} onClick={() => go(n.to)} />)}
          </div>
          {route.page === "client" && (
            <div className="space-y-1">
              <div className="px-3 text-[10px] uppercase tracking-[0.14em] text-slate-500 mb-1.5 truncate">{client?.trade_name ?? client?.legal_name ?? "Client"}</div>
              {clientNav.map((n) => <NavButton key={n.tab} label={n.label} icon={n.icon} active={route.tab === n.tab} onClick={() => go({ page: "client", clientId: route.clientId, tab: n.tab })} />)}
            </div>
          )}
        </nav>
        <div className="p-4 border-t border-white/5 text-xs">
          <div className="text-white truncate">{auth.fullName}</div>
          <div className="text-slate-500 truncate">{auth.email}</div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-white/70 backdrop-blur-xl border-b border-slate-200/70 flex items-center gap-3 px-3 sm:px-6 sticky top-0 z-30">
          <button className="lg:hidden size-9 grid place-items-center rounded-xl border border-slate-200 bg-white cursor-pointer" aria-label="Open menu" onClick={() => setNavOpen(true)}><Menu size={18} /></button>
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <select aria-label="Client" value={route.page === "client" ? route.clientId : ""}
              onChange={(e) => go(e.target.value ? { page: "client", clientId: e.target.value, tab: "overview" } : { page: "clients" })}
              className="w-full sm:min-w-72 appearance-none rounded-xl border border-slate-200 bg-white ps-3 pe-9 py-2 text-sm font-medium text-slate-800 cursor-pointer">
              <option value="">All clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
            </select>
            <ChevronDown size={14} className="absolute end-3 top-3 pointer-events-none text-slate-400" />
          </div>
          <div className="ms-auto flex items-center gap-2">
            <span className="hidden md:block text-xs text-slate-500 max-w-48 truncate" title={auth.email}>{auth.fullName}</span>
            <button onClick={() => void auth.signOut()} className="btn-ghost !py-1.5 !px-3" aria-label="Sign out"><LogOut size={15} /><span className="hidden sm:inline">Sign out</span></button>
          </div>
        </header>
        <main id="main" className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          <div key={routeHash(route)} className="page-enter">
            {route.page === "clients" && <ClientsPage clients={clients} reload={async () => reloadClients()} open={(id) => go({ page: "client", clientId: id, tab: "overview" })} />}
            {route.page === "client" && <ClientPage clientId={route.clientId} tab={route.tab} />}
            {route.page === "team" && <TeamPage />}
            {route.page === "integrity" && <IntegrityPage clients={clients} />}
            {route.page === "deadlines" && <DeadlinesPage openClient={(id, tab) => go({ page: "client", clientId: id, tab })} />}
            {route.page === "dashboard" && <DashboardPage openClient={(id, tab) => go({ page: "client", clientId: id, tab })} />}
            {route.page === "admin" && <AdminPage tab={route.tab} go={(tab) => go({ page: "admin", tab })} />}
          </div>
        </main>
      </div>
    </div>
  );
}

function NavButton({ label, icon, active, onClick }: { label: string; icon: ReactNode; active: boolean; onClick: () => void }) {
  return (
  <button aria-current={active ? "page" : undefined} onClick={onClick}
    className={cx("w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition cursor-pointer", active ? "text-white bg-emerald-500/15 ring-1 ring-emerald-400/20" : "text-slate-300 hover:bg-white/5 hover:text-white")}>
    <span className={active ? "text-emerald-400" : "text-slate-500"}>{icon}</span>{label}
  </button>
);
}
