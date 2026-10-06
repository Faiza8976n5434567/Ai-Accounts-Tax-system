import { defineConfig } from "vitest/config";

// Gate G-5: tax & ledger code must keep ≥ 95% line coverage (PLAN.md §3).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/lib/{money,ledger,vat,ct,subledger,einvoice,posting,rules,dates}.ts"],
      reporter: ["text-summary", "text"],
      thresholds: { lines: 95 },
    },
  },
});
