/** Rule-based analysis of the posted ledger (plain arithmetic — no AI). */

type Tr = (k: string, p?: Record<string, string | number>) => string;
interface MonthPl { month: string; pl: { revenue: number; cogs: number; opex: number; net: number; opexLines: [string, number][] } }
export interface Variance { text: string; cur?: string; prev?: string; rows: { label: string; value: string; tone: "good" | "bad" }[] }

/** Net-profit movement between the last two months that have activity, with the biggest drivers. */
export function profitVariance(monthly: MonthPl[], t: Tr, acc: (code: string) => string, mon: (m: string) => string): Variance {
  const f = (n: number) => `AED ${(n / 100).toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
  const sg = (n: number) => `${n >= 0 ? "+" : "-"}${f(Math.abs(n))}`;
  const m = monthly.filter((x) => x.pl.revenue || x.pl.opex);
  const cur = m[m.length - 1], prev = m[m.length - 2];
  if (!cur || !prev) return { text: t("Not enough monthly history yet."), rows: [] };
  const dNet = cur.pl.net - prev.pl.net, dRev = cur.pl.revenue - prev.pl.revenue, dC = cur.pl.cogs - prev.pl.cogs;
  const rows: Variance["rows"] = [
    { label: t("Revenue"), value: sg(dRev), tone: dRev >= 0 ? "good" : "bad" },
    { label: t("Cost of sales"), value: sg(dC), tone: dC <= 0 ? "good" : "bad" },
  ];
  const prevMap = new Map(prev.pl.opexLines);
  const moves = cur.pl.opexLines.map(([n, v]) => [n, v - (prevMap.get(n) ?? 0)] as const).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 4);
  for (const [n, d] of moves) if (d) rows.push({ label: acc(n), value: sg(d), tone: d <= 0 ? "good" : "bad" });
  const text = t(dNet >= 0 ? "Net profit increased by {amt} in {cur} vs {prev} ({a} → {b}). Main drivers:" : "Net profit decreased by {amt} in {cur} vs {prev} ({a} → {b}). Main drivers:",
    { amt: f(Math.abs(dNet)), cur: mon(cur.month), prev: mon(prev.month), a: f(prev.pl.net), b: f(cur.pl.net) });
  return { text, cur: cur.month, prev: prev.month, rows };
}
