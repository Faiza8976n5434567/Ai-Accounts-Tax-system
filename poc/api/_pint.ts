/** PINT AE validation (P4-01, D-61): runs the official UAE Peppol Authority Schematron rules — PINT AE Billing 1.0.4,
 *  both rule sets (shared PINT + AE-specific) — over an invoice or credit note, with Saxon-JS (XSLT 2.0).
 *  The official artefacts live in einvoicing/pint-ae-1.0.4 (unchanged copies; see its README). Server-side only. */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type PintKind = "invoice" | "creditnote";
export interface PintFinding { id: string; flag: "fatal" | "warning" | "information"; text: string; location: string }
export interface PintResult { valid: boolean; fatal: PintFinding[]; warnings: PintFinding[] }

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "einvoicing", "pint-ae-1.0.4");
const RULESETS = ["PINT-UBL-validation-preprocessed", "PINT-jurisdiction-aligned-rules"] as const;

/** Compiles an official .xslt once into a Saxon-JS SEF file (cached in the temp folder, refreshed if the source changes). */
function sef(kind: PintKind, ruleset: (typeof RULESETS)[number]): string {
  const xsl = join(ROOT, `trn-${kind}`, "schematron", `${ruleset}.xslt`);
  const dir = join(tmpdir(), "pint-ae-1.0.4");
  const out = join(dir, `${kind}-${ruleset}.sef.json`);
  if (!existsSync(out) || statSync(out).mtimeMs < statSync(xsl).mtimeMs) {
    mkdirSync(dir, { recursive: true });
    const r = spawnSync(process.execPath, [require.resolve("xslt3/xslt3.js"), `-xsl:${xsl}`, `-export:${out}`, "-nogo"], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`Could not compile ${ruleset}: ${r.stderr || r.stdout}`);
  }
  return out;
}

const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** SVRL report → findings. */
export function parseSvrl(svrl: string): PintFinding[] {
  const out: PintFinding[] = [];
  for (const m of svrl.matchAll(/<svrl:failed-assert\b([^>]*)>([\s\S]*?)<\/svrl:failed-assert>/g)) {
    const attr = (n: string) => (m[1].match(new RegExp(`\\b${n}="([^"]*)"`)) ?? [])[1] ?? "";
    const text = (m[2].match(/<svrl:text>([\s\S]*?)<\/svrl:text>/) ?? [])[1] ?? "";
    out.push({ id: attr("id").toUpperCase(), flag: (attr("flag") || "fatal") as PintFinding["flag"], text: unescape(text.replace(/\s+/g, " ").trim()), location: unescape(attr("location")) });
  }
  return out;
}

/** Validates a UBL document against both official rule sets. */
export function validatePint(xml: string, kind: PintKind): PintResult {
  const SaxonJS = require("saxon-js") as { transform: (o: Record<string, unknown>) => { principalResult: string } };
  const findings = RULESETS.flatMap((rs) => {
    const sefText = JSON.parse(readFileSync(sef(kind, rs), "utf8")) as unknown;
    const r = SaxonJS.transform({ stylesheetInternal: sefText, sourceText: xml, destination: "serialized" });
    return parseSvrl(r.principalResult);
  });
  const fatal = findings.filter((f) => f.flag === "fatal");
  return { valid: fatal.length === 0, fatal, warnings: findings.filter((f) => f.flag !== "fatal") };
}

/** The official example files shipped with the specification (for tests). */
export const officialExample = (kind: PintKind, name: string) => readFileSync(join(ROOT, `trn-${kind}`, "example", name), "utf8");
