import { describe, expect, it } from "vitest";
import { runSummary } from "./integrity";

describe("integrity summary", () => {
  it("says it plainly", () => {
    expect(runSummary(null)).toBe("Not checked yet");
    expect(runSummary({ status: "ok", errors: 0, warnings: 0 })).toBe("All checks passed");
    expect(runSummary({ status: "error", errors: 2, warnings: 1 })).toBe("2 problems, 1 warning");
    expect(runSummary({ status: "warning", errors: 0, warnings: 2 })).toBe("2 warnings");
    expect(runSummary({ status: "error", errors: 1, warnings: 0 })).toBe("1 problem");
  });
});
