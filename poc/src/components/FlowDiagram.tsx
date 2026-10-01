import { useState, type ReactNode } from "react";
import { cx } from "./ui";
import { useStore } from "../lib/store";

export interface FlowNode { id: string; x: number; y: number; title: string; metric: ReactNode; sub: string; icon: ReactNode; tone: string; onClick?: () => void; detail?: string }
export interface FlowEdge { from: string; to: string; d: string }

const TONE: Record<string, string> = {
  sky: "from-sky-400 to-blue-600", violet: "from-violet-400 to-fuchsia-600", emerald: "from-emerald-400 to-teal-600",
  amber: "from-amber-300 to-orange-500", indigo: "from-indigo-400 to-indigo-700", rose: "from-rose-400 to-rose-600", slate: "from-slate-500 to-slate-800",
};
const W = 150, H = 66;

/** SVG flow diagram: nodes in foreignObject, animated connectors, hover highlights the node's edges. */
export function FlowDiagram({ nodes, edges, height = 300 }: { nodes: FlowNode[]; edges: FlowEdge[]; height?: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const { lang, t } = useStore();
  const rtl = lang === "ar";
  const X = (x: number) => (rtl ? 1000 - x : x);
  const lit = (e: FlowEdge) => !hover || e.from === hover || e.to === hover;
  const hn = nodes.find((n) => n.id === hover);
  return (
    <div className="relative">
      <div className="overflow-x-auto -mx-2 px-2" dir="ltr"><svg viewBox={`0 0 1000 ${height}`} className="w-full min-w-[720px] h-auto select-none" role="img" aria-label={t("How your numbers flow")}>
        <defs>
          <linearGradient id="edge" x1="0" x2="1"><stop offset="0" stopColor="#10b981" /><stop offset="1" stopColor="#4f46e5" /></linearGradient>
          <filter id="glow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <g transform={rtl ? "translate(1000,0) scale(-1,1)" : undefined}>
        {edges.map((e, i) => (
          <g key={i} style={{ opacity: lit(e) ? 1 : 0.15, transition: "opacity .3s" }}>
            <path d={e.d} fill="none" stroke="#e2e8f0" strokeWidth="6" strokeLinecap="round" />
            <path d={e.d} fill="none" stroke="url(#edge)" strokeWidth="2" className="flow-dash" filter={hover && lit(e) ? "url(#glow)" : undefined} />
            <circle r="4" fill="#10b981" filter="url(#glow)"><animateMotion dur={`${2.2 + (i % 3) * 0.4}s`} repeatCount="indefinite" path={e.d} begin={`${(i % 4) * 0.35}s`} /></circle>
          </g>
        ))}
        </g>
        {nodes.map((n) => (
          <foreignObject key={n.id} x={X(n.x) - W / 2} y={n.y - H / 2} width={W} height={H} style={{ overflow: "visible" }}>
            <div dir={rtl ? "rtl" : "ltr"} role="button" tabIndex={0} onFocus={() => setHover(n.id)} onBlur={() => setHover(null)} onKeyDown={(e) => e.key === "Enter" && n.onClick?.()} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onClick={n.onClick}
              className={cx("h-full rounded-2xl bg-white border px-2.5 py-2 flex items-center gap-2 transition-all duration-300 cursor-pointer outline-none",
                hover === n.id ? "border-emerald-300 shadow-[0_12px_30px_-10px_rgba(16,185,129,.45)] scale-[1.06]" : "border-slate-200 shadow-[0_2px_10px_-4px_rgba(15,23,42,.12)]",
                hover && hover !== n.id && !edges.some((e) => (e.from === hover && e.to === n.id) || (e.to === hover && e.from === n.id)) && "opacity-50")}>
              <span className={cx("size-8 shrink-0 rounded-xl grid place-items-center text-white bg-gradient-to-br shadow-sm", TONE[n.tone])}>{n.icon}</span>
              <span className="min-w-0 leading-tight">
                <span className="block text-[10.5px] font-medium text-slate-500 truncate">{n.title}</span>
                <span className="block text-[13px] font-semibold text-slate-900 num truncate">{n.metric}</span>
                <span className="block text-[9.5px] text-slate-400 truncate">{n.sub}</span>
              </span>
            </div>
          </foreignObject>
        ))}
      </svg></div>
      <div className={cx("absolute bottom-0 inset-x-0 text-center text-xs transition-all duration-300", hn ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1")}>
        <span className="inline-block rounded-full bg-ink-900 text-white px-3 py-1.5 shadow-lg">{hn?.detail ?? hn?.sub} {hn?.onClick && <b className="text-emerald-300 ms-1">{t("Click to open →")}</b>}</span>
      </div>
    </div>
  );
}

const S = (x1: number, y1: number, x2: number, y2: number) => { const m = (x1 + x2) / 2; return `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`; };
export const curve = S;
