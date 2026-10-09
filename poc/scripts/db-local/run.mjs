// Fast local check of the database migrations and tests WITHOUT Docker.
// Runs supabase/migrations + supabase/tests on PGlite (Postgres in WebAssembly) with small
// stand-ins for Supabase's auth/storage schemas and a pgTAP subset (stubs.sql).
// This is a developer convenience only — the real gate (G-6) is `supabase test db` in CI.
// Usage (from poc/): node scripts/db-local/run.mjs [test-file-filter]
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SUPABASE = join(here, "..", "..", "..", "supabase");
const inline = (file) =>
  readFileSync(file, "utf8")
    .replace(/^\\ir\s+(\S+)\s*$/gm, (_, p) => inline(join(dirname(file), p)))
    .replace(/^create extension if not exists pgtap.*$/gm, "");

const db = new PGlite({ extensions: { citext, btree_gist } });
await db.exec(readFileSync(join(here, "stubs.sql"), "utf8"));
for (const f of readdirSync(join(SUPABASE, "migrations")).sort()) {
  try {
    await db.exec(readFileSync(join(SUPABASE, "migrations", f), "utf8"));
  } catch (e) {
    console.log(`MIGRATION FAILED ${f}: ${e.message}`);
    process.exit(1);
  }
}
console.log("migrations ok");

const filter = process.argv[2] ?? "";
let failed = 0;
const files = readdirSync(join(SUPABASE, "tests")).filter((x) => x.endsWith(".sql") && x.includes(filter)).sort();
for (const f of files) {
  console.log(`\n== ${f}`);
  try {
    const results = await db.exec(inline(join(SUPABASE, "tests", f)));
    for (const r of results) {
      for (const row of r.rows) {
        const v = Object.values(row);
        if (v.length !== 1 || typeof v[0] !== "string" || !/^(ok|not ok|1\.\.|#)/.test(v[0])) continue;
        if (v[0].startsWith("not ok")) {
          failed++;
          console.log(v[0]);
        } else if (!v[0].startsWith("ok")) console.log(v[0]);
      }
    }
  } catch (e) {
    failed++;
    console.log(`ERROR: ${e.message}`);
    await db.exec("rollback").catch(() => {});
  }
  await db.exec("reset role; truncate public._tap restart identity;").catch(() => {});
}
console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
