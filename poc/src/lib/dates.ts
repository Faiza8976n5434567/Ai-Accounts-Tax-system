/** Date helpers. All accounting dates are ISO `YYYY-MM-DD` strings in local time. */

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Today's date. The only source of "now" for business logic. */
export const today = (): string => iso(new Date());

export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return iso(d);
}

export const daysBetween = (a: string, b: string) => Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 864e5);

/** Last day of the month that is `months` after the month of `date`. */
export function endOfMonthAfter(date: string, months: number): string {
  const d = new Date(date + "T00:00:00");
  return iso(new Date(d.getFullYear(), d.getMonth() + months + 1, 0));
}

/** Financial year containing `ref`, given the year-end date of any year (e.g. 31 December). */
export function financialYear(fyEnd: string, ref: string = today()) {
  const end = new Date(fyEnd + "T00:00:00");
  const r = new Date(ref + "T00:00:00");
  let to = new Date(r.getFullYear(), end.getMonth(), end.getDate());
  if (to < r) to = new Date(r.getFullYear() + 1, end.getMonth(), end.getDate());
  const from = new Date(to.getFullYear() - 1, to.getMonth(), to.getDate() + 1);
  return { from: iso(from), to: iso(to), label: `FY${to.getFullYear()}` };
}

/** Months (`YYYY-MM`) from `from` up to and including the month of `to`. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from.slice(0, 7) + "-01T00:00:00");
  const last = to.slice(0, 7);
  while (true) {
    const m = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    out.push(m);
    if (m >= last) break;
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}
