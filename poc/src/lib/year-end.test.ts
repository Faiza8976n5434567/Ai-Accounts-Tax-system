import { describe, expect, it } from "vitest";
import { fyEnds, resultLabel } from "./year-end";

const months = (fromY: number, fromM: number, n: number) => Array.from({ length: n }, (_, i) => {
  const y = fromY + Math.floor((fromM - 1 + i) / 12), m = ((fromM - 1 + i) % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start_date: `${y}-${String(m).padStart(2, "0")}-01`, end_date: `${y}-${String(m).padStart(2, "0")}-${last}` };
});

describe("Year-end close (P5-05)", () => {
  it("lists calendar financial years, latest first", () => {
    expect(fyEnds(months(2025, 1, 24), 1)).toEqual(["2026-12-31", "2025-12-31"]);
  });
  it("lists April–March years only when all 12 months exist", () => {
    expect(fyEnds(months(2025, 1, 24), 4)).toEqual(["2026-03-31"]);
  });
  it("labels the result", () => {
    expect(resultLabel(49000000)).toEqual({ label: "Profit for the year", amount: 49000000 });
    expect(resultLabel(-500000)).toEqual({ label: "Loss for the year", amount: 500000 });
  });
});
