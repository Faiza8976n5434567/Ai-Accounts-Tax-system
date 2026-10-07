/** Clients, chart of accounts and periods from Supabase (P1-12/P1-13). Reads go through RLS;
 *  creating a client goes through the database function create_client(). */
import { supabase } from "./supabase";
import type { Database } from "./database.types";

type Tables = Database["public"]["Tables"];
export type Client = Tables["organizations"]["Row"];
export type Account = Tables["accounts"]["Row"];
export type AccountingPeriod = Tables["accounting_periods"]["Row"];
export type TaxPeriod = Tables["tax_periods"]["Row"];
export type Emirate = Tables["emirates"]["Row"];

const db = () => { if (!supabase) throw new Error("Not connected"); return supabase; };
const must = <T,>(r: { data: T | null; error: { message: string } | null }): T => { if (r.error) throw r.error; return r.data as T; };

export const listClients = async (): Promise<Client[]> =>
  must(await db().from("organizations").select("*").order("legal_name"));

export const getClient = async (id: string): Promise<Client | null> =>
  must(await db().from("organizations").select("*").eq("id", id).maybeSingle());

export const listAccounts = async (orgId: string): Promise<Account[]> =>
  must(await db().from("accounts").select("*").eq("organization_id", orgId).order("code"));

export const listAccountingPeriods = async (orgId: string): Promise<AccountingPeriod[]> =>
  must(await db().from("accounting_periods").select("*").eq("organization_id", orgId).order("start_date"));

export const listTaxPeriods = async (orgId: string): Promise<TaxPeriod[]> =>
  must(await db().from("tax_periods").select("*").eq("organization_id", orgId).order("start_date"));

export const listEmirates = async (): Promise<Emirate[]> =>
  must(await db().from("emirates").select("*").order("vat_box"));

/** The signed-in user's own firm role (decides whether "Add client" is offered). */
export async function myFirmRole(): Promise<"firm_admin" | "firm_accountant" | null> {
  const { data: auth } = await db().auth.getUser();
  if (!auth.user) return null;
  const rows = must(await db().from("firm_members").select("role").eq("user_id", auth.user.id).eq("active", true));
  return rows.some((r) => r.role === "firm_admin") ? "firm_admin" : rows.length ? "firm_accountant" : null;
}

export interface NewClient {
  legalName: string; tradeName: string; emirateCode: string; industry: string;
  trn: string; ctTrn: string; licenceNo: string; licenceAuthority: string; licenceExpiry: string;
  fyStartMonth: number; booksStart: string;
  vatRegistered: boolean; vatPeriod: "quarterly" | "monthly"; vatFirstPeriodEnd: string;
  ctRegime: "standard" | "sbr" | "qfzp"; priorYearRevenueFils: number;
  accountantIds: string[]; managerId: string;
}

export async function createClient(c: NewClient): Promise<string> {
  const blank = (s: string) => (s.trim() === "" ? undefined : s.trim());
  return must(await db().rpc("create_client", {
    p_legal_name: c.legalName.trim(), p_emirate_code: c.emirateCode, p_books_start: c.booksStart,
    p_fy_start_month: c.fyStartMonth, p_trade_name: blank(c.tradeName), p_trn: blank(c.trn), p_ct_trn: blank(c.ctTrn),
    p_licence_no: blank(c.licenceNo), p_licence_authority: blank(c.licenceAuthority), p_licence_expiry: blank(c.licenceExpiry),
    p_industry: blank(c.industry), p_vat_registered: c.vatRegistered,
    p_vat_period: c.vatRegistered ? c.vatPeriod : undefined, p_vat_first_period_end: c.vatRegistered ? blank(c.vatFirstPeriodEnd) : undefined,
    p_ct_regime: c.ctRegime, p_prior_year_revenue: c.priorYearRevenueFils,
    p_accountant_ids: c.accountantIds, p_manager_id: blank(c.managerId),
  }));
}

/** The next VAT return still to come for a client (first period whose due date is today or later). */
export const nextVatDue = (periods: TaxPeriod[], today: string): TaxPeriod | undefined =>
  periods.filter((p) => p.kind === "vat" && p.due_date >= today).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

/** Plain-language summary of a client's VAT set-up. */
export const vatSummary = (c: Pick<Client, "vat_registered" | "vat_period">): string =>
  !c.vat_registered ? "Not VAT registered" : c.vat_period === "monthly" ? "VAT · monthly" : "VAT · quarterly";

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
