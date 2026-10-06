/** Compliance calendar generation. Dates are ISO yyyy-mm-dd strings (UTC, date-only). */
import { CURRENT_CONFIG, type UaeTaxConfig } from "./config/uae-tax-config";

const parse = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y!, m! - 1, d!)); };
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  const d = parse(iso); d.setUTCDate(d.getUTCDate() + days); return fmt(d);
}

/** Add months; if the start date is a month-end, the result is the month-end. */
export function addMonths(iso: string, months: number): string {
  const d = parse(iso);
  const isMonthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate() === d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(isMonthEnd ? lastDay : Math.min(d.getUTCDate(), lastDay));
  return fmt(target);
}

export const vatReturnDue = (periodEnd: string, cfg: UaeTaxConfig = CURRENT_CONFIG) =>
  addDays(periodEnd, cfg.vat.returnDueDaysAfterPeriodEnd.value);

export const ctReturnDue = (periodEnd: string, cfg: UaeTaxConfig = CURRENT_CONFIG) =>
  addMonths(periodEnd, cfg.ct.returnDueMonthsAfterPeriodEnd.value);

export interface CalendarEvent { kind: string; title: string; dueDate: string; ref: string }

export interface OrgCalendarInput {
  vatPeriods?: { start: string; end: string }[];
  ctPeriodEnds?: string[];
  einvoiceCohort?: keyof UaeTaxConfig["einvoicing"]["cohorts"];
  licenceExpiry?: string;
}

export function buildCalendar(org: OrgCalendarInput, cfg: UaeTaxConfig = CURRENT_CONFIG): CalendarEvent[] {
  const ev: CalendarEvent[] = [];
  for (const p of org.vatPeriods ?? [])
    ev.push({ kind: "VAT_RETURN", title: `VAT return ${p.start} – ${p.end}`, dueDate: vatReturnDue(p.end, cfg), ref: cfg.vat.returnDueDaysAfterPeriodEnd.ref });
  for (const end of org.ctPeriodEnds ?? [])
    ev.push({ kind: "CT_RETURN", title: `Corporate Tax return & payment — period ending ${end}`, dueDate: ctReturnDue(end, cfg), ref: cfg.ct.returnDueMonthsAfterPeriodEnd.ref });
  if (org.einvoiceCohort) {
    const c = cfg.einvoicing.cohorts[org.einvoiceCohort];
    ev.push({ kind: "EINV_ASP", title: "Appoint e-invoicing ASP", dueDate: c.value.aspAppointBy, ref: c.ref });
    ev.push({ kind: "EINV_GOLIVE", title: "E-invoicing mandatory go-live", dueDate: c.value.goLive, ref: c.ref });
  }
  if (org.licenceExpiry) ev.push({ kind: "LICENCE", title: "Trade licence renewal", dueDate: org.licenceExpiry, ref: "Licensing authority" });
  return ev.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Alert offsets (days before due date) used by the notification job. */
export const ALERT_OFFSETS = [30, 14, 7, 1] as const;
