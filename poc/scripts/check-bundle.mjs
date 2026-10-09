#!/usr/bin/env node
// Gate G-4 (second half): the built site in dist/ must never contain secret keys.
// Only the Supabase *publishable* key may reach the browser.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist", import.meta.url));
if (!existsSync(dist)) { console.error("check:bundle — dist/ not found; run the build first"); process.exit(1); }

const PATTERNS = [
  [/sb_secret_[A-Za-z0-9_-]{10,}/, "Supabase secret key"],
  [/service_role/, "Supabase service_role reference"],
  [/\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}/, "Resend API key"],
  [/SUPABASE_SECRET_KEY|RESEND_API_KEY|SITE_PASSWORD/, "server-only variable name"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
];

const hits = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(js|css|html|json|map|txt|webmanifest)$/.test(n)) { const s = readFileSync(p, "utf8"); for (const [re, what] of PATTERNS) if (re.test(s)) hits.push(`${p}: ${what}`); } } };
walk(dist);

if (hits.length) { console.error(`check:bundle — ${hits.length} secret(s) found in the built site:\n${hits.join("\n")}`); process.exit(1); }
console.log("check:bundle — no secrets in dist/");
