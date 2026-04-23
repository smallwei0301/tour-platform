#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ -z "${DATABASE_URL:-}" && -z "${PGHOST:-}" ]]; then
  echo "[ERROR] DATABASE_URL 或 PGHOST/PG* 未設定，無法執行 DB regression pack" >&2
  exit 1
fi

TS="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="reports/issue-169/${TS}"
mkdir -p "$OUT_DIR"

SQL_FILE="supabase/scripts/phase12/issue-169-integrity-regression-pack.sql"
DB_OUT="$OUT_DIR/precheck-postcheck-sql-output.txt"
TEST_OUT="$OUT_DIR/write-path-contract-tests.txt"
SUMMARY_OUT="$OUT_DIR/summary.md"

echo "[INFO] Running SQL regression pack: $SQL_FILE"
if [[ -n "${DATABASE_URL:-}" ]]; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE" | tee "$DB_OUT"
else
  psql -v ON_ERROR_STOP=1 -f "$SQL_FILE" | tee "$DB_OUT"
fi

echo "[INFO] Running write-path contract tests"
npm run -w @tour/web test -- \
  tests/api/payment-callback-order-payment-status-contract.test.mjs \
  tests/api/payment-callback-booking-loop-contract.test.mjs \
  tests/api/ecpay-callback-mapping-contract.test.mjs \
  tests/api/v2-route-contract-smoke.test.mjs \
  | tee "$TEST_OUT"

{
  echo "# Issue #169 Regression Pack Summary"
  echo
  echo "- executed_at: $(date -Iseconds)"
  echo "- out_dir: \\`$OUT_DIR\\`"
  echo "- sql_output: \\`$DB_OUT\\`"
  echo "- write_path_tests: \\`$TEST_OUT\\`"
  echo
  echo "## Metric quick grep"
  for key in \
    total_bookings \
    bookings_order_id_null_count \
    bookings_order_id_orphan_count \
    total_payments \
    payments_order_id_null_count \
    payments_order_id_orphan_count \
    payments_order_to_booking_mismatch_count \
    recent_24h_bookings_missing_order_id \
    recent_24h_payments_missing_order_id \
    payments_booking_id_column_present
  do
    echo
    echo "### $key"
    grep -n "$key" "$DB_OUT" || true
  done
  echo
  echo "## Contract test summary"
  tail -n 40 "$TEST_OUT"
} > "$SUMMARY_OUT"

echo "[DONE] Issue #169 regression pack complete"
echo "[DONE] Evidence dir: $OUT_DIR"
