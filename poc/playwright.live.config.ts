import { defineConfig, devices } from "@playwright/test";

// Gate G-9 (live): the real app against a temporary local Supabase started in CI (D-18).
// Needs VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY pointing at that local Supabase.
export default defineConfig({
  testDir: "e2e-live",
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:5184", trace: "retain-on-failure", viewport: { width: 1366, height: 900 } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } }],
  webServer: {
    command: "node node_modules/vite/bin/vite.js build --outDir dist-live && node node_modules/vite/bin/vite.js preview --outDir dist-live --port 5184 --strictPort",
    url: "http://localhost:5184",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
