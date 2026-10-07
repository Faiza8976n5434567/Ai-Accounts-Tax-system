import { defineConfig, devices } from "@playwright/test";

// Gate G-9: end-to-end journeys in a real browser against the production build.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:5181", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Demo build (sign-in skipped, browser-only sample data) — see DEMO_MODE in src/lib/supabase.ts.
    command: "node node_modules/vite/bin/vite.js build --mode demo --outDir dist-demo && node node_modules/vite/bin/vite.js preview --outDir dist-demo --port 5181 --strictPort",
    url: "http://localhost:5181",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
