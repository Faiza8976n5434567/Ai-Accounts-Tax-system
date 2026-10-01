import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axis, tipStyle, aedK } from "./charts";
import { useStore } from "../lib/store";

export interface WStep { label: string; value: number; kind: "start" | "up" | "down" | "total" }
/** Waterfall built from stacked bars with a transparent base. Values in AED (not fils). */
export function Waterfall({ steps, height = 260 }: { steps: WStep[]; height?: number }) {
  const { lang } = useStore();
  const rtl = lang === "ar";
  let run = 0;
  const data = steps.map((s) => {
    if (s.kind === "start" || s.kind === "total") { run = s.value; return { ...s, base: 0, bar: s.value }; }
    const base = s.kind === "up" ? run : run - s.value;
    run = s.kind === "up" ? run + s.value : run - s.value;
    return { ...s, base, bar: s.value };
  });
  const color = (k: WStep["kind"]) => (k === "up" ? "url(#wUp)" : k === "down" ? "url(#wDown)" : "url(#wTot)");
  return (
    <div style={{ height }} dir="ltr">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: -6, right: 8, top: 22 }} barCategoryGap="22%">
          <defs>
            <linearGradient id="wUp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f6a97f" /><stop offset="1" stopColor="#eb6834" /></linearGradient>
            <linearGradient id="wDown" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b7fe0" /><stop offset="1" stopColor="#4a3aa7" /></linearGradient>
            <linearGradient id="wTot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5b9be6" /><stop offset="1" stopColor="#2a78d6" /></linearGradient>
          </defs>
          <CartesianGrid stroke="#eef2f7" vertical={false} strokeDasharray="3 4" />
          <XAxis dataKey="label" {...axis} reversed={rtl} interval={0} tick={{ fontSize: 10.5, fill: "#64748b" }} {...(steps.length > 6 ? { angle: rtl ? 28 : -28, textAnchor: "end", height: 56 } : {})} />
          <YAxis {...axis} tickFormatter={aedK} orientation={rtl ? "right" : "left"} />
          <Tooltip {...tipStyle} cursor={{ fill: "rgba(148,163,184,.08)", radius: 8 }} formatter={(v, n) => (n === "base" ? null : `AED ${Number(v).toLocaleString("en-AE", { maximumFractionDigits: 0 })}`)} />
          <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="bar" name="Amount" stackId="w" radius={[6, 6, 6, 6]} animationDuration={1200}>
            {data.map((d, i) => <Cell key={i} fill={color(d.kind)} />)}
            <LabelList dataKey="bar" position="top" formatter={(v: unknown) => aedK(Number(v))} style={{ fontSize: 10.5, fill: "#334155", fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
