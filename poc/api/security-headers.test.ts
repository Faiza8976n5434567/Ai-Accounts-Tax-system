// SEC-12 · The security headers Vercel sends on every page (Spec 04 S-2.2). Checked against
// vercel.json so a change that weakens them fails the build. (Proven in a real browser on
// 2026-10-07: the app, Supabase and Google Fonts load with no policy violations.)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cfg = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
const site = Object.fromEntries(cfg.headers.find((h) => h.source === "/(.*)")!.headers.map((h) => [h.key.toLowerCase(), h.value]));
const csp = Object.fromEntries(site["content-security-policy"].split(";").map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));

describe("SEC-12 · security headers", () => {
  it("only the app's own scripts may run (no inline scripts, no eval)", () => {
    expect(csp["script-src"]).toEqual(["'self'"]);
    expect(csp["default-src"]).toEqual(["'self'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
  });
  it("the browser may talk only to the app itself and the Supabase project", () => {
    expect(csp["connect-src"].every((s: string) => s === "'self'" || /^(https|wss):\/\/[a-z0-9]+\.supabase\.co$/.test(s))).toBe(true);
  });
  it("the app cannot be embedded in another site (clickjacking)", () => {
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    expect(site["x-frame-options"]).toBe("DENY");
  });
  it("HTTPS is enforced for two years", () => expect(site["strict-transport-security"]).toMatch(/max-age=63072000/));
  it("other protective headers are present", () => {
    expect(site["x-content-type-options"]).toBe("nosniff");
    expect(site["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(site["permissions-policy"]).toContain("camera=()");
  });
  it("server function answers are never cached", () =>
    expect(cfg.headers.find((h) => h.source === "/api/(.*)")!.headers).toContainEqual({ key: "Cache-Control", value: "no-store" }));
});
