#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ -z "${DATABASE_URL:-}" && -z "${PGHOST:-}" ]]; then
  echo "[ERROR] DATABASE_URL 或 PGHOST/PG* 未設定，無法執行 issue-210 booking/cancel verification" >&2
  exit 1
fi

TS="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="reports/issue-210/${TS}"
mkdir -p "$OUT_DIR"

SQL_FILE="supabase/scripts/phase12/issue-210-booking-cancel-verification.sql"
DB_OUT="$OUT_DIR/booking-cancel-verification-sql-output.txt"
TEST_OUT="$OUT_DIR/booking-cancel-contract-tests.txt"
SUMMARY_OUT="$OUT_DIR/summary.md"

echo "[INFO] Running booking/cancel SQL verification: $SQL_FILE"
if [[ -n "${DATABASE_URL:-}" ]]; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE" | tee "$DB_OUT"
else
  psql -v ON_ERROR_STOP=1 -f "$SQL_FILE" | tee "$DB_OUT"
fi

echo "[INFO] Running booking/cancel contract tests"
npm run -w @tour/web test -- \
  tests/api/booking-state.test.mjs \
  tests/api/v2-booking-draft-checkout.test.mjs \
  tests/api/issue-210-booking-cancel-contract.test.mjs \
  | tee "$TEST_OUT"

{
  echo "# Issue #210 Booking/Cancel Verification Summary"
  echo
  echo "- executed_at: $(date -Iseconds)"
  echo "- out_dir: \`$OUT_DIR\`"
  echo "- sql_output: \`$DB_OUT\`"
  echo "- contract_tests: \`$TEST_OUT\`"
  echo
  echo "## Metric quick grep"
  for key in \
    total_bookings \
    booking_status_cancelled_count \
    recent_30d_cancelled_bookings \
    cancelled_status_missing_cancelled_at_count \
    non_cancelled_with_cancelled_at_count \
    cancelled_bookings_missing_order_count \
    cancelled_booking_order_status_not_cancelled_count \
    cancelled_booking_paid_payment_count
  do
    echo
    echo "### $key"
    grep -n "$key" "$DB_OUT" || true
  done
  echo
  echo "## Contract test summary"
  tail -n 40 "$TEST_OUT"
} > "$SUMMARY_OUT"

echo "[DONE] Issue #210 booking/cancel verification pack complete"
echo "[DONE] Evidence dir: $OUT_DIR"
