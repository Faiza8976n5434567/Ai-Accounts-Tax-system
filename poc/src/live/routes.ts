/** Page addresses of the live app, kept in the URL after `#` so Back/Forward and bookmarks work. */
export type ClientTab = "overview" | "journals" | "approvals" | "reports" | "accounts" | "periods";
export type AdminTab = "profile" | "tax" | "firm" | "platform" | "email";
export type Route = { page: "clients" } | { page: "team" } | { page: "admin"; tab: AdminTab } | { page: "client"; clientId: string; tab: ClientTab };

const TABS: ClientTab[] = ["overview", "journals", "approvals", "reports", "accounts", "periods"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "team") return { page: "team" };
  if (parts[0] === "admin") {
    const tab = (["profile", "tax", "firm", "platform", "email"] as AdminTab[]).find((t) => t === parts[1]) ?? "profile";
    return { page: "admin", tab };
  }
  if (parts[0] === "clients" && parts[1] && UUID.test(parts[1])) {
    const tab = TABS.includes(parts[2] as ClientTab) ? (parts[2] as ClientTab) : "overview";
    return { page: "client", clientId: parts[1].toLowerCase(), tab };
  }
  return { page: "clients" };
}

export function routeHash(r: Route): string {
  if (r.page === "team") return "#/team";
  if (r.page === "admin") return `#/admin/${r.tab}`;
  if (r.page === "client") return `#/clients/${r.clientId}${r.tab === "overview" ? "" : `/${r.tab}`}`;
  return "#/clients";
}
