import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";
import { X, Search, ChevronDown, ChevronUp, ChevronsUpDown, ChevronLeft, ChevronRight, Inbox, SlidersHorizontal } from "lucide-react";
import { createPortal } from "react-dom";
import { useStore } from "../lib/store";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Count-up number with ease-out; re-animates from the previous value when it changes. */
export function Num({ v, f, ms = 900 }: { v: number; f: (n: number) => string; ms?: number }) {
  const [shown, setShown] = useState(v * 0.6);
  const from = useRef(v * 0.6);
  useEffect(() => {
    const start = performance.now(), a = from.current, b = v;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms), e = 1 - Math.pow(1 - t, 4);
      setShown(a + (b - a) * e);
      if (t < 1) raf = requestAnimationFrame(tick); else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [v, ms]);
  return <>{f(Math.round(shown))}</>;
}

export function PageHeader({ title, sub, actions, eyebrow }: { title: string; sub?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-7 fade-in">
      <div>
        {eyebrow && <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600 mb-1.5">{eyebrow}</div>}
        <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight grad-text leading-tight">{title}</h1>
        {sub && <p className="text-sm text-slate-500 mt-1.5">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TONES: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  rose: "bg-rose-50 text-rose-700 ring-rose-600/15",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  sky: "bg-sky-50 text-sky-700 ring-sky-600/15",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/15",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/15",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-600/15",
};
export function Badge({ tone = "slate", children, className, dot }: { tone?: string; children: ReactNode; className?: string; dot?: boolean }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap", TONES[tone] ?? TONES.slate, className)}>{dot && <i className="size-1.5 rounded-full bg-current opacity-80" />}{children}</span>;
}

export function Card({ title, sub, actions, children, className, pad = true, hover = false, icon }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean; hover?: boolean; icon?: ReactNode }) {
  return (
    <section className={cx("card fade-in", hover && "card-hover", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
          <div className="flex items-center gap-2.5">
            {icon && <span className="grid place-items-center size-8 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 text-slate-600 ring-1 ring-slate-200/70">{icon}</span>}
            <div>
              {title && <h3 className="text-sm font-semibold text-slate-900">{title}</h3>}
              {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
            </div>
          </div>
          {actions}
        </header>
      )}
      <div className={pad ? "px-5 pb-5" : ""}>{children}</div>
    </section>
  );
}

const TONE_GRAD: Record<string, { bg: string; stroke: string; glow: string }> = {
  emerald: { bg: "from-emerald-400 to-emerald-600", stroke: "#10b981", glow: "rgba(16,185,129,.18)" },
  rose: { bg: "from-rose-400 to-rose-600", stroke: "#f43f5e", glow: "rgba(244,63,94,.16)" },
  sky: { bg: "from-sky-400 to-blue-600", stroke: "#2a78d6", glow: "rgba(42,120,214,.16)" },
  violet: { bg: "from-violet-400 to-violet-600", stroke: "#7c3aed", glow: "rgba(124,58,237,.15)" },
  amber: { bg: "from-amber-300 to-orange-500", stroke: "#eb6834", glow: "rgba(235,104,52,.16)" },
  indigo: { bg: "from-indigo-400 to-indigo-600", stroke: "#4f46e5", glow: "rgba(79,70,229,.15)" },
};

export function Sparkline({ data, color, h = 36 }: { data: number[]; color: string; h?: number }) {
  const id = useId().replace(/:/g, "");
  const { lang } = useStore();
  if (data.length < 2) return null;
  const w = 120, min = Math.min(...data), max = Math.max(...data), r = max - min || 1;
  const pts = data.map((d, i) => [(i / (data.length - 1)) * w, h - 3 - ((d - min) / r) * (h - 8)] as const);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h, transform: lang === "ar" ? "scaleX(-1)" : undefined }} preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".28" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" fill="white" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Stat({ label, value, delta, icon, tone = "emerald", hint, spark, onClick }: { label: string; value: ReactNode; delta?: { v: string; up: boolean; good?: boolean }; icon?: ReactNode; tone?: string; hint?: ReactNode; spark?: number[]; onClick?: () => void }) {
  const g = TONE_GRAD[tone] ?? TONE_GRAD.emerald;
  return (
    <div onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined} className={cx("card card-hover relative overflow-hidden p-3.5 sm:p-4 group min-w-0", onClick && "cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-500")}>
      <div className="pointer-events-none absolute -top-12 -end-12 size-36 rounded-full blur-2xl opacity-70 transition-opacity group-hover:opacity-100" style={{ background: g.glow }} />
      <div className="relative flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        {icon && <span className={cx("grid place-items-center size-8 rounded-xl text-white shadow-sm bg-gradient-to-br transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3", g.bg)}>{icon}</span>}
      </div>
      <div className="relative mt-2 text-lg sm:text-[22px] font-semibold tracking-tight text-slate-900 num truncate">{value}</div>
      <div className="relative mt-1 flex items-center gap-2 text-xs min-h-4">
        {delta && <span className={cx("inline-flex items-center gap-0.5 font-medium rounded-full px-1.5 py-0.5", (delta.good ?? delta.up) ? "text-emerald-700 bg-emerald-50" : "text-rose-700 bg-rose-50")}>{delta.up ? "↑" : "↓"} {delta.v}</span>}
        {hint && <span className="text-slate-400 truncate">{hint}</span>}
      </div>
      {spark && <div className="relative mt-2 -mx-1"><Sparkline data={spark} color={g.stroke} /></div>}
    </div>
  );
}

/** Semi-circular gauge. value 0..max. */
export function Gauge({ value, max = 100, label, sub, color = "#10b981", size = 150, fmt = (n: number) => `${Math.round(n)}%` }: { value: number; max?: number; label?: string; sub?: string; color?: string; size?: number; fmt?: (n: number) => string }) {
  const id = useId().replace(/:/g, "");
  const pct = Math.max(0, Math.min(1, value / max));
  const r = 52, c = Math.PI * r;
  const [p, setP] = useState(0);
  useEffect(() => { const t = setTimeout(() => setP(pct), 60); return () => clearTimeout(t); }, [pct]);
  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg viewBox="0 0 128 74" style={{ width: size }} role="img" aria-label={`${label ?? ""} ${fmt(value)}`}>
        <defs><linearGradient id={id} x1="0" x2="1"><stop offset="0" stopColor={color} stopOpacity=".55" /><stop offset="1" stopColor={color} /></linearGradient></defs>
        <path d="M12 66 A52 52 0 0 1 116 66" fill="none" stroke="#eef2f7" strokeWidth="11" strokeLinecap="round" />
        <path d="M12 66 A52 52 0 0 1 116 66" fill="none" stroke={`url(#${id})`} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} style={{ transition: "stroke-dasharray 1.2s cubic-bezier(.16,1,.3,1)" }} />
        <text x="64" y="58" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 17, fontWeight: 650 }}>{fmt(value)}</text>
      </svg>
      {label && <div className="text-xs font-medium text-slate-700 -mt-1 text-center">{label}</div>}
      {sub && <div className="text-[11px] text-slate-400 text-center">{sub}</div>}
    </div>
  );
}

/** Full ring with centre value (used for scores). */
export function Ring({ value, color = "#10b981", size = 64, stroke = 7, children }: { value: number; color?: string; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const [p, setP] = useState(0);
  useEffect(() => { const t = setTimeout(() => setP(Math.max(0, Math.min(100, value))), 60); return () => clearTimeout(t); }, [value]);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(c * p) / 100} ${c}`} style={{ transition: "stroke-dasharray 1.1s cubic-bezier(.16,1,.3,1)" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-sm font-semibold num text-slate-900">{children ?? Math.round(value)}</div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useStore();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-close])");
    (first ?? ref.current)?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>("a, button, input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((x) => !x.hasAttribute("disabled"));
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div dir={document.documentElement.dir} className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-slate-950/45 backdrop-blur-md sm:p-4 fade-in" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={cx("card w-full max-h-[92vh] flex flex-col page-enter !bg-white shadow-2xl outline-none rounded-b-none sm:rounded-b-2xl", wide ? "sm:max-w-5xl" : "sm:max-w-lg")} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <IconButton label={t("Close")} onClick={onClose} data-close><X size={18} /></IconButton>
        </div>
        <div className="p-5 sm:p-6 overflow-auto">{children}</div>
        {footer && <div className="px-5 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-end gap-2 shrink-0 rounded-b-2xl">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function IconButton({ label, children, className, ...rest }: { label: string; children: ReactNode; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement> & { "data-close"?: boolean }) {
  return <button type="button" aria-label={label} title={label} className={cx("size-8 grid place-items-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-500", className)} {...rest}>{children}</button>;
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100/80 p-1 gap-1 ring-1 ring-slate-200/60">
      {items.map((i) => (
        <button key={i.id} onClick={() => onChange(i.id)} className={cx("px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 cursor-pointer", value === i.id ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/70" : "text-slate-500 hover:text-slate-800")}>{i.label}</button>
      ))}
    </div>
  );
}

export function Empty({ children, icon, action }: { children: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      <div className="size-12 rounded-2xl bg-slate-100 text-slate-400 grid place-items-center mb-3">{icon ?? <Inbox size={22} />}</div>
      <div className="text-sm text-slate-500 max-w-sm">{children}</div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export const VerifyTag = () => <Badge tone="amber">VERIFY</Badge>;

/* ───────────── Form primitives ───────────── */
export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="label">{label}</label>
      <div data-field-id={id} className="[&>*]:w-full">{withId(children, id)}</div>
      {error ? <p className="mt-1 text-[11px] text-rose-600">{error}</p> : hint ? <p className="mt-1 text-[11px] text-slate-400">{hint}</p> : null}
    </div>
  );
}
function withId(children: ReactNode, id: string) {
  if (children && typeof children === "object" && "props" in (children as object)) {
    const el = children as React.ReactElement<{ id?: string }>;
    return { ...el, props: { ...el.props, id: el.props.id ?? id } } as React.ReactElement;
  }
  return children;
}

export function Input({ prefix, suffix, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { prefix?: ReactNode; suffix?: ReactNode }) {
  if (!prefix && !suffix) return <input className={cx("input", className)} {...rest} />;
  return (
    <div className={cx("relative flex items-center", className)}>
      {prefix && <span className="absolute start-3 text-xs font-medium text-slate-400 pointer-events-none">{prefix}</span>}
      <input className={cx("input", prefix ? "!ps-11" : "", suffix ? "!pe-10" : "")} {...rest} />
      {suffix && <span className="absolute end-3 text-xs text-slate-400 pointer-events-none">{suffix}</span>}
    </div>
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cx("relative", className)}>
      <select className="input appearance-none !pe-9 cursor-pointer" {...rest}>{children}</select>
      <ChevronDown size={15} className="absolute end-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cx("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-300 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500", checked ? "bg-gradient-to-r from-emerald-500 to-teal-600" : "bg-slate-200")}>
      <span className={cx("inline-block size-5 rounded-full bg-white shadow transition-transform duration-300", checked ? "translate-x-[22px] rtl:-translate-x-[22px]" : "translate-x-0.5 rtl:-translate-x-0.5")} />
    </button>
  );
}

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const { t } = useStore();
  return (
    <div className={cx("relative", className)}>
      <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input type="search" aria-label={placeholder ?? t("Search")} className="input !ps-9 !py-1.5" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? t("Search…")} />
    </div>
  );
}

/* ───────────── KPI strip & section header ───────────── */
export function KpiGrid({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 }) {
  return <div className={cx("grid grid-cols-2 gap-3 sm:gap-4 mb-5 stagger", cols === 4 ? "xl:grid-cols-4" : "lg:grid-cols-3")}>{children}</div>;
}

/* ───────────── DataTable ───────────── */
export interface Col<T> { key: string; header: string; cell: (r: T) => ReactNode; sort?: (r: T) => string | number; align?: "end" | "center"; hide?: "sm" | "md" | "lg"; width?: string }
export interface Filter<T> { key: string; label: string; options: { value: string; label: string }[]; get: (r: T) => string }

const HIDE: Record<string, string> = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" };

export function DataTable<T>({ rows, cols, rowKey, search, filters = [], pageSize: ps0 = 10, onRowClick, actions, toolbar, empty, title, sub, initialSort, rowClass }: {
  rows: T[]; cols: Col<T>[]; rowKey: (r: T) => string; search?: (r: T) => string; filters?: Filter<T>[]; pageSize?: number;
  onRowClick?: (r: T) => void; actions?: (r: T) => ReactNode; toolbar?: ReactNode; empty?: ReactNode; title?: ReactNode; sub?: ReactNode;
  initialSort?: { key: string; dir: "asc" | "desc" }; rowClass?: (r: T) => string;
}) {
  const { t } = useStore();
  const [q, setQ] = useState("");
  const [fv, setFv] = useState<Record<string, string>>({});
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  const [ps, setPs] = useState(ps0);
  const filtered = useMemo(() => {
    let r = rows;
    if (q && search) { const s = q.toLowerCase(); r = r.filter((x) => search(x).toLowerCase().includes(s)); }
    for (const f of filters) if (fv[f.key]) r = r.filter((x) => f.get(x) === fv[f.key]);
    if (sort) { const col = cols.find((x) => x.key === sort.key); if (col?.sort) { const g = col.sort; r = [...r].sort((a, b) => { const A = g(a), B = g(b); const v = A < B ? -1 : A > B ? 1 : 0; return sort.dir === "asc" ? v : -v; }); } }
    return r;
  }, [rows, q, fv, sort, cols, filters, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / ps));
  const pg = Math.min(page, pages - 1);
  const view = filtered.slice(pg * ps, pg * ps + ps);
  const activeFilters = Object.values(fv).filter(Boolean).length + (q ? 1 : 0);
  const toggleSort = (k: string) => setSort((s) => (s?.key === k ? (s.dir === "asc" ? { key: k, dir: "desc" } : null) : { key: k, dir: "asc" }));
  const nums = Array.from({ length: pages }, (_, i) => i).filter((i) => pages <= 7 || i === 0 || i === pages - 1 || Math.abs(i - pg) <= 1);

  return (
    <section className="card fade-in overflow-hidden">
      {(title || search || filters.length > 0 || toolbar) && (
        <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-slate-100 space-y-3">
          {(title || toolbar) && <div className="flex flex-wrap items-center justify-between gap-3">
            <div>{title && <h3 className="text-sm font-semibold text-slate-900">{title}</h3>}{sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}</div>
            {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
          </div>}
          {(search || filters.length > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {search && <SearchInput value={q} onChange={(v) => { setQ(v); setPage(0); }} className="w-full sm:w-64" />}
              {filters.length > 0 && <SlidersHorizontal size={15} className="text-slate-400 hidden sm:block ms-1" />}
              {filters.map((f) => (
                <div key={f.key} className="relative">
                  <select aria-label={f.label} value={fv[f.key] ?? ""} onChange={(e) => { setFv({ ...fv, [f.key]: e.target.value }); setPage(0); }}
                    className={cx("appearance-none rounded-full border ps-3 pe-8 py-1.5 text-xs font-medium outline-none cursor-pointer transition focus-visible:ring-4 focus-visible:ring-emerald-100", fv[f.key] ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
                    <option value="">{f.label}: {t("All")}</option>
                    {f.options.map((o) => <option key={o.value} value={o.value}>{f.label}: {o.label}</option>)}
                  </select>
                  <ChevronDown size={13} className="absolute end-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                </div>
              ))}
              {activeFilters > 0 && <button className="text-xs font-medium text-slate-500 hover:text-rose-600 px-2 py-1 rounded-lg hover:bg-rose-50 transition cursor-pointer" onClick={() => { setQ(""); setFv({}); setPage(0); }}>{t("Clear")} ({activeFilters})</button>}
              <span className="ms-auto text-xs text-slate-400 num">{t("{n} results", { n: filtered.length })}</span>
            </div>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-[1]">
            <tr>
              {cols.map((c) => (
                <th key={c.key} scope="col" className={cx("th whitespace-nowrap", c.align === "end" && "!text-end", c.align === "center" && "!text-center", c.hide && HIDE[c.hide])} style={{ width: c.width }} aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                  {c.sort ? (
                    <button type="button" onClick={() => toggleSort(c.key)} className={cx("inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-800 transition cursor-pointer", sort?.key === c.key && "text-emerald-700")}>
                      {c.header}{sort?.key === c.key ? (sort.dir === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ChevronsUpDown size={12} className="opacity-40" />}
                    </button>
                  ) : c.header}
                </th>
              ))}
              {actions && <th className="th !text-end"><span className="sr-only">{t("Actions")}</span></th>}
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} tabIndex={onRowClick ? 0 : undefined} onKeyDown={onRowClick ? (e) => { if (e.key === "Enter") onRowClick(r); } : undefined}
                className={cx("group transition-colors", onRowClick && "cursor-pointer hover:bg-emerald-50/40 focus-visible:bg-emerald-50/60 outline-none", !onRowClick && "hover:bg-slate-50/70", rowClass?.(r))}>
                {cols.map((c) => <td key={c.key} className={cx("td", c.align === "end" && "text-end num", c.align === "center" && "text-center", c.hide && HIDE[c.hide])}>{c.cell(r)}</td>)}
                {actions && <td className="td text-end whitespace-nowrap" onClick={(e) => e.stopPropagation()}>{actions(r)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {view.length === 0 && (empty ?? <Empty>{activeFilters ? t("No rows match your filters.") : t("Nothing here yet.")}</Empty>)}
      </div>
      {filtered.length > ps0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>{t("Rows per page")}</span>
            <div className="relative"><select aria-label={t("Rows per page")} value={ps} onChange={(e) => { setPs(Number(e.target.value)); setPage(0); }} className="appearance-none rounded-lg border border-slate-200 bg-white ps-2 pe-6 py-1 outline-none cursor-pointer">{[...new Set([10, ps0, 25, 50])].sort((a, b) => a - b).map((n) => <option key={n}>{n}</option>)}</select><ChevronDown size={12} className="absolute end-1.5 top-1/2 -translate-y-1/2 pointer-events-none" /></div>
            <span className="num">{t("{a}–{b} of {n}", { a: pg * ps + 1, b: Math.min(filtered.length, pg * ps + ps), n: filtered.length })}</span>
          </div>
          <nav className="flex items-center gap-1" aria-label={t("Pagination")}>
            <IconButton label={t("Previous page")} disabled={pg === 0} onClick={() => setPage(pg - 1)} className="disabled:opacity-30"><ChevronLeft size={15} className="rtl:rotate-180" /></IconButton>
            {nums.map((i, idx) => (
              <span key={i} className="flex items-center">
                {idx > 0 && i - nums[idx - 1] > 1 && <span className="px-1 text-slate-300">…</span>}
                <button type="button" onClick={() => setPage(i)} aria-current={i === pg ? "page" : undefined} className={cx("min-w-8 h-8 px-2 rounded-lg font-medium transition cursor-pointer num", i === pg ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm" : "hover:bg-white hover:shadow-sm text-slate-600")}>{i + 1}</button>
              </span>
            ))}
            <IconButton label={t("Next page")} disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)} className="disabled:opacity-30"><ChevronRight size={15} className="rtl:rotate-180" /></IconButton>
          </nav>
        </div>
      )}
    </section>
  );
}
