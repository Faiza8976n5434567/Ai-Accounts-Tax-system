// Saves Supabase-generated TypeScript types (P1-08) to src/lib/database.types.ts.
// Usage: node scripts/save-types.mjs <file with the generate_typescript_types JSON output>
import { readFileSync, writeFileSync } from "node:fs";
const raw = JSON.parse(readFileSync(process.argv[2], "utf8"));
const text = Array.isArray(raw) ? raw[0].text : JSON.stringify(raw);
const types = JSON.parse(text).types.replace(/\r/g, "");
const head = "// Generated from the Supabase project schema (P1-08). Do not edit by hand —\n// regenerate after every migration (Supabase MCP generate_typescript_types).\n// Money columns are bigint fils in Postgres and arrive as integer numbers.\n\n";
writeFileSync(new URL("../src/lib/database.types.ts", import.meta.url), head + types);
console.log("saved database.types.ts");
