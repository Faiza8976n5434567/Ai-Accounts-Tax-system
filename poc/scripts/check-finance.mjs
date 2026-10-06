#!/usr/bin/env node
// Finance & safety lint (PLAN.md §3.1, gate G-3). Fails if application code contains
// floating-point money maths, hard-coded tax rates/thresholds, hard-coded business dates,
// secret keys or raw-HTML rendering. Tax parameters belong in src/lib/config.ts.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(root, "src");

// Files allowed to hold literal rates/dates: the versioned config, demo seed data,
// translations, and tests.
const ALLOW = [/[\\/]lib[\\/]config\.ts$/, /[\\/]lib[\\/]seed\.ts$/, /[\\/]lib[\\/]ar\.ts$/, /\.test\.ts$/, /[\\/]lib[\\/]testkit\.ts$/];
// toFixed is only checked in calculation code (src/lib); screens may use it for display
// (percentages, chart labels). money.ts holds the formatting helpers.
const NOT_CALC = [/[\\/]lib[\\/]money\.ts$/, /[\\/](pages|components)[\\/]/];

const RULES = [
  { id: "float-parse", re: /\bparseFloat\s*\(/, msg: "parseFloat on money — use toFils()" },
  { id: "to-fixed", re: /\.toFixed\s*\(/, msg: "toFixed in calculation code — use fmt()/fmtPlain() from money.ts", skip: NOT_CALC },
  { id: "vat-1.05", re: /[*/]\s*1\.05\b/, msg: "hard-coded 1.05 VAT factor — use vatInGross()/vatOnNet()" },
  { id: "rate-literal", re: /applyBp\([^,()]+(?:\([^()]*\))?[^,()]*,\s*\d+\s*\)/, msg: "hard-coded basis-point rate — read it from TAX_CONFIG" },
  { id: "rate-0.05", re: /(?<![\d.])0\.05(?![\d])/, msg: "hard-coded 5% — read it from TAX_CONFIG" },
  { id: "threshold", re: /\b375[_,]?000(?:_?00)?\b/, msg: "hard-coded AED 375,000 band — read it from TAX_CONFIG" },
  { id: "date-literal", re: /["'`]20\d\d-[01]\d-[0-3]\d["'`]/, msg: "hard-coded business date — derive it from today()/config" },
  { id: "secret", re: /service_role|sb_secret_|SUPABASE_SECRET_KEY|RESEND_API_KEY/, msg: "secret key reference in browser code" },
  { id: "raw-html", re: /dangerouslySetInnerHTML/, msg: "raw HTML rendering" },
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(name)) yield p;
  }
}

const findings = [];
for (const file of walk(SRC)) {
  if (ALLOW.some((r) => r.test(file))) continue;
  readFileSync(file, "utf8").split(/\r?\n/).forEach((text, i) => {
    if (/check-finance-ignore/.test(text)) return;
    for (const rule of RULES) {
      if (rule.skip?.some((r) => r.test(file))) continue;
      if (rule.re.test(text)) findings.push(`${relative(root, file).split(sep).join("/")}:${i + 1}  [${rule.id}] ${rule.msg}`);
    }
  });
}

if (findings.length) {
  console.error(`check:finance — ${findings.length} finding(s):\n` + findings.join("\n"));
  process.exit(1);
}
console.log("check:finance — 0 findings");
