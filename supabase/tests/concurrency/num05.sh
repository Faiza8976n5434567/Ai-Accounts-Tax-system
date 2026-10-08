#!/usr/bin/env bash
# NUM-05 · Two (here: twenty) users take document numbers at the same moment → all different, consecutive,
# no gaps, no duplicates. pgTAP runs in one session, so this test uses real parallel connections.
# Runs in CI (G-6) against the temporary Supabase only — never the project database (D-18).
set -euo pipefail
DB="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
N=20

ORG=$(psql "$DB" -qAtc "insert into public.organizations (firm_id, legal_name, emirate_code)
  select id, 'NUM-05 concurrency ' || clock_timestamp(), 'AUH' from public.firms where is_platform_owner returning id")
OUT=$(mktemp)
for i in $(seq 1 "$N"); do
  # each connection holds its transaction briefly so the others really have to wait for the row lock
  psql "$DB" -qAt -c "begin; select app.next_document_number('$ORG', 'sales_invoice', '2026-10-15'); select pg_sleep(0.2); commit;" \
    | grep '^INV-' >> "$OUT" &
done
wait

TOTAL=$(wc -l < "$OUT")
UNIQUE=$(sort -u "$OUT" | wc -l)
EXPECTED=$(for i in $(seq 1 "$N"); do printf 'INV-2026-10-%04d\n' "$i"; done)
ACTUAL=$(sort "$OUT")
echo "NUM-05: $TOTAL numbers taken by $N parallel connections, $UNIQUE unique"
if [ "$TOTAL" -ne "$N" ] || [ "$UNIQUE" -ne "$N" ] || [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "NUM-05 FAILED — numbers were:"; sort "$OUT"; exit 1
fi
echo "NUM-05 passed: INV-2026-10-0001 … INV-2026-10-$(printf '%04d' "$N"), no gaps, no duplicates"
