import { describe, expect, it } from "vitest";
import { configInputText, formatConfigValue, parseConfigInput, suggestLabel, versionInForce, type ConfigVersion } from "./admin";

describe("formatConfigValue — tax rules as people read them", () => {
  it("rates in basis points as percentages", () => {
    expect(formatConfigValue("bp", 500)).toBe("5.00%");
    expect(formatConfigValue("bp", 900)).toBe("9.00%");
    expect(formatConfigValue("bp", 7500)).toBe("75.00%");
  });
  it("money in fils as AED", () => expect(formatConfigValue("fils", 37500000)).toBe("AED 375,000.00"));
  it("days, months, dates and the USD rate", () => {
    expect(formatConfigValue("days", 28)).toBe("28 days");
    expect(formatConfigValue("months", 9)).toBe("9 months");
    expect(formatConfigValue("months", 1)).toBe("1 month");
    expect(formatConfigValue("date", "2029-12-31")).toBe("2029-12-31");
    expect(formatConfigValue("rate", 3.6725)).toBe("3.6725");
  });
});

describe("parseConfigInput — exact, validated (CFG-03)", () => {
  it("percent → basis points", () => {
    expect(parseConfigInput("bp", "5")).toEqual({ value: 500 });
    expect(parseConfigInput("bp", "5.25")).toEqual({ value: 525 });
  });
  it("CFG-03 · VAT rate of 150% is refused", () => expect(parseConfigInput("bp", "150")).toEqual({ error: "A percentage cannot exceed 100%." }));
  it("AED → fils", () => expect(parseConfigInput("fils", "375,000")).toEqual({ value: 37500000 }));
  it("refuses negative money and fractions of a fils", () => {
    expect("error" in parseConfigInput("fils", "-1")).toBe(true);
    expect("error" in parseConfigInput("fils", "10.005")).toBe(true);
  });
  it("days and months are whole numbers within range", () => {
    expect(parseConfigInput("days", "28")).toEqual({ value: 28 });
    expect(parseConfigInput("days", "400")).toEqual({ error: "At most 366 days." });
    expect(parseConfigInput("months", "9.5")).toEqual({ error: "Enter a whole number." });
  });
  it("dates must be real dates", () => {
    expect(parseConfigInput("date", "2029-12-31")).toEqual({ value: "2029-12-31" });
    expect("error" in parseConfigInput("date", "soon")).toBe(true);
  });
  it("the USD rate must be positive", () => {
    expect(parseConfigInput("rate", "3.6725")).toEqual({ value: 3.6725 });
    expect("error" in parseConfigInput("rate", "0")).toBe(true);
    expect("error" in parseConfigInput("rate", "-3")).toBe(true);
  });
  it("round-trips through the edit box", () => {
    expect(parseConfigInput("bp", configInputText("bp", 500))).toEqual({ value: 500 });
    expect(parseConfigInput("fils", configInputText("fils", 37500000))).toEqual({ value: 37500000 });
    expect(parseConfigInput("days", configInputText("days", 28))).toEqual({ value: 28 });
  });
});

describe("versions", () => {
  const v = (label: string, from: string, status: "draft" | "approved" = "approved") => ({ id: label, label, effective_from: from, status }) as ConfigVersion;
  it("CFG-01 · the version in force is the latest approved one starting on or before the date", () => {
    const list = [v("uae-2026.09", "2018-01-01"), v("uae-2027.01", "2027-01-01"), v("draft", "2026-06-01", "draft")];
    expect(versionInForce(list, "2026-12-31")?.label).toBe("uae-2026.09");
    expect(versionInForce(list, "2027-01-01")?.label).toBe("uae-2027.01");
  });
  it("suggests a free label from the effective date", () => {
    expect(suggestLabel("2026-11-01", ["uae-2026.09"])).toBe("uae-2026.11");
    expect(suggestLabel("2026-09-01", ["uae-2026.09"])).toBe("uae-2026.09-2");
  });
});
