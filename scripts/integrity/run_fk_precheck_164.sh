#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is required"
  exit 1
fi

TS="$(date +%F-%H%M%S)"
OUT_DIR="${1:-artifacts/fk-precheck-164/$TS}"

mkdir -p "$OUT_DIR"

echo "==> Running fk_precheck_164"
echo "==> Output dir: $OUT_DIR"

export PGAPPNAME="fk_precheck_164"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/sql/fk_precheck_164.sql | tee "$OUT_DIR/summary.txt"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "\copy (
  SELECT id, created_at, status, order_id
  FROM bookings
  WHERE order_id IS NULL OR btrim(order_id::text) = ''
) TO '$OUT_DIR/bookings_order_id_null_or_blank.csv' CSV HEADER"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "\copy (
  SELECT b.id, b.created_at, b.status, b.order_id
  FROM bookings b
  LEFT JOIN orders o ON b.order_id::text = o.id::text
  WHERE b.order_id IS NOT NULL
    AND btrim(b.order_id::text) <> ''
    AND o.id IS NULL
) TO '$OUT_DIR/bookings_order_id_orphan.csv' CSV HEADER"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "\copy (
  SELECT id, created_at, status, booking_id
  FROM orders
  WHERE booking_id IS NULL OR btrim(booking_id::text) = ''
) TO '$OUT_DIR/orders_booking_id_null_or_blank.csv' CSV HEADER"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "\copy (
  SELECT o.id, o.created_at, o.status, o.booking_id
  FROM orders o
  LEFT JOIN bookings b ON o.booking_id::text = b.id::text
  WHERE o.booking_id IS NOT NULL
    AND btrim(o.booking_id::text) <> ''
    AND b.id IS NULL
) TO '$OUT_DIR/orders_booking_id_orphan.csv' CSV HEADER"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "\copy (
  SELECT id, created_at, status, order_id
  FROM payments
  WHERE order_id IS NULL OR btrim(order_id::text) = ''
) TO '$OUT_DIR/payments_order_id_null_or_blank.csv' CSV HEADER"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "\copy (
  SELECT p.id, p.created_at, p.status, p.order_id
  FROM payments p
  LEFT JOIN orders o ON p.order_id::text = o.id::text
  WHERE p.order_id IS NOT NULL
    AND btrim(p.order_id::text) <> ''
    AND o.id IS NULL
) TO '$OUT_DIR/payments_order_id_orphan.csv' CSV HEADER"

cat > "$OUT_DIR/README.md" <<EOF
# FK Precheck 164 Artifacts

Generated at: $(date -Is)
Output directory: $OUT_DIR

Files:
- summary.txt
- bookings_order_id_null_or_blank.csv
- bookings_order_id_orphan.csv
- orders_booking_id_null_or_blank.csv
- orders_booking_id_orphan.csv
- payments_order_id_null_or_blank.csv
- payments_order_id_orphan.csv

Notes:
- Inventory only
- Real schema only: bookings.order_id -> orders.id; orders.booking_id -> bookings.id; payments.order_id -> orders.id
- No assumptions on payments.booking_id (column is not part of this precheck contract)
- bookings=0 or orders.booking_id NULL-heavy are observational facts unless orphan/invalid checks fail
EOF

echo "==> Done"
