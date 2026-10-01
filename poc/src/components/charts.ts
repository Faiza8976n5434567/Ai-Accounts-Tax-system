// Categorical slots from the validated reference palette (fixed order, never cycled).
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
export const C = { revenue: SERIES[0], expenses: SERIES[1], profit: SERIES[2] };
export const axis = { stroke: "#94a3b8", fontSize: 11, tickLine: false, axisLine: false } as const;
export const tipStyle = { contentStyle: { borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(15,23,42,.08)", fontSize: 12 } };
export const aedK = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1000)}K`);
