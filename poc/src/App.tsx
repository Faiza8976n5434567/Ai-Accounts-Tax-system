import { useEffect, useState } from "react";
import { Layout, ALL_ITEMS, type Page } from "./components/Layout";
import { useStore, useOrg } from "./lib/store";
import { FirmOverview } from "./pages/FirmOverview";
import { Dashboard } from "./pages/Dashboard";
import { Capture } from "./pages/Capture";
import { Sales } from "./pages/Sales";
import { Ledger } from "./pages/Ledger";
import { Receivables, Payables } from "./pages/Subledger";
import { Reports } from "./pages/Reports";
import { Vat } from "./pages/Vat";
import { Ct } from "./pages/Ct";
import { Bank } from "./pages/Bank";
import { Calendar } from "./pages/Calendar";
import { Audit } from "./pages/Audit";
import { SettingsPage } from "./pages/Settings";

export function App() {
  const { state } = useStore();
  const org = useOrg();
  const initial = (location.hash.slice(1) as Page) || (state.session.orgId === "FIRM" ? "firm" : "dashboard");
  const [page, setPage] = useState<Page>(initial);
  const go = (p: Page) => { setPage(p); if (location.hash.slice(1) !== p) location.hash = p; window.scrollTo(0, 0); };
  useEffect(() => { const h = () => { const p = location.hash.slice(1) as Page; if (p) { setPage(p); window.scrollTo(0, 0); } }; window.addEventListener("hashchange", h); return () => window.removeEventListener("hashchange", h); }, []);
  const { t } = useStore();
  useEffect(() => {
    const label = ALL_ITEMS.find((i) => i.id === page)?.label ?? "";
    const who = org ? (state.session.lang === "ar" ? org.nameAr : org.name) : "TFS Plus";
    document.title = `${t(label)} · ${who} · TFS+ Smart Ledger`;
  }, [page, org, state.session.lang, t]);
  useEffect(() => { if (!org && !["firm", "calendar", "audit", "settings"].includes(page)) go("firm"); }, [org, page]);
  const { setSession } = useStore();
  const open = (orgId: string, p: Page = "dashboard") => { setSession({ orgId }); go(p); };

  return (
    <Layout page={page} go={go}>
      {page === "firm" && <FirmOverview open={open} />}
      {org && page === "dashboard" && <Dashboard org={org} go={go} />}
      {org && page === "capture" && <Capture org={org} />}
      {org && page === "sales" && <Sales org={org} />}
      {org && page === "ledger" && <Ledger org={org} />}
      {org && page === "ar" && <Receivables org={org} go={go} />}
      {org && page === "ap" && <Payables org={org} go={go} />}
      {org && page === "reports" && <Reports org={org} />}
      {org && page === "vat" && <Vat org={org} />}
      {org && page === "ct" && <Ct org={org} />}
      {org && page === "bank" && <Bank org={org} />}
      {page === "calendar" && <Calendar open={open} />}
      {page === "audit" && <Audit />}
      {page === "settings" && <SettingsPage />}
    </Layout>
  );
}
