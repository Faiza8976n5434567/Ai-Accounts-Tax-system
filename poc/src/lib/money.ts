/** Money is integer fils (1 AED = 100 fils). Never floats in the ledger. */
export type Fils = number;

export const toFils = (aed: number | string): Fils => {
  const n = typeof aed === "string" ? Number(aed.replace(/,/g, "")) : aed;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
};

/** Half-up rounding of a basis-point rate (500 = 5%). */
export const applyBp = (amount: Fils, bp: number): Fils => {
  const raw = (amount * bp) / 10_000;
  return raw >= 0 ? Math.floor(raw + 0.5) : -Math.floor(-raw + 0.5);
};

const nf = new Intl.NumberFormat("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("en-AE", { maximumFractionDigits: 0 });

export const fmt = (f: Fils, opts: { dp0?: boolean; aed?: boolean } = {}) => {
  const v = f / 100;
  const s = opts.dp0 ? nf0.format(Math.abs(v)) : nf.format(Math.abs(v));
  const signed = v < 0 ? `(${s})` : s;
  return opts.aed ? `AED ${signed}` : signed;
};

export const compact = (f: Fils) => {
  const v = f / 100;
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}K` : a.toFixed(0);
  return `${v < 0 ? "-" : ""}AED ${s}`;
};
