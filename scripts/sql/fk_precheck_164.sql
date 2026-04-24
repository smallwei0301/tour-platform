-- fk_precheck_164.sql
-- Purpose:
--   Inventory-only precheck for the real current schema:
--   1) bookings.order_id -> orders.id
--   2) orders.booking_id -> bookings.id
--   3) payments.order_id -> orders.id
--
-- Notes:
--   - Do NOT mutate data
--   - Designed for PostgreSQL
--   - Uses text-safe comparison in inventory phase
--   - UUID regex is heuristic; adjust if actual PK type is bigint/int
--   - bookings table can be 0 rows and orders.booking_id can be NULL-heavy;
--     treat these as observational facts unless orphan/invalid checks fail.

\pset footer off
\timing on

SELECT NOW() AS generated_at;
SELECT current_database() AS database_name;
SELECT current_user AS executed_by;

SELECT 'orders' AS table_name, COUNT(*) AS row_count FROM orders
UNION ALL
SELECT 'bookings', COUNT(*) FROM bookings
UNION ALL
SELECT 'payments', COUNT(*) FROM payments
ORDER BY table_name;

SELECT table_name, column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name IN ('orders', 'bookings', 'payments')
  AND column_name IN ('id', 'order_id', 'booking_id', 'created_at', 'status', 'amount')
ORDER BY table_name, column_name;

SELECT 'bookings.order_id' AS relation, COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE order_id IS NULL) AS null_count,
  COUNT(*) FILTER (WHERE order_id IS NOT NULL AND btrim(order_id::text) = '') AS blank_count
FROM bookings;

SELECT id, created_at, status, order_id
FROM bookings
WHERE order_id IS NULL OR btrim(order_id::text) = ''
ORDER BY created_at DESC
LIMIT 100;

SELECT 'orders.booking_id' AS relation, COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE booking_id IS NULL) AS null_count,
  COUNT(*) FILTER (WHERE booking_id IS NOT NULL AND btrim(booking_id::text) = '') AS blank_count
FROM orders;

SELECT id, created_at, status, booking_id
FROM orders
WHERE booking_id IS NULL OR btrim(booking_id::text) = ''
ORDER BY created_at DESC
LIMIT 100;

SELECT 'payments.order_id' AS relation, COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE order_id IS NULL) AS null_count,
  COUNT(*) FILTER (WHERE order_id IS NOT NULL AND btrim(order_id::text) = '') AS blank_count
FROM payments;

SELECT id, created_at, status, order_id
FROM payments
WHERE order_id IS NULL OR btrim(order_id::text) = ''
ORDER BY created_at DESC
LIMIT 100;

SELECT 'bookings.order_id' AS relation, COUNT(*) AS orphan_count
FROM bookings b
LEFT JOIN orders o ON b.order_id::text = o.id::text
WHERE b.order_id IS NOT NULL
  AND btrim(b.order_id::text) <> ''
  AND o.id IS NULL;

SELECT b.id, b.created_at, b.status, b.order_id
FROM bookings b
LEFT JOIN orders o ON b.order_id::text = o.id::text
WHERE b.order_id IS NOT NULL
  AND btrim(b.order_id::text) <> ''
  AND o.id IS NULL
ORDER BY b.created_at DESC
LIMIT 200;

SELECT 'orders.booking_id' AS relation, COUNT(*) AS orphan_count
FROM orders o
LEFT JOIN bookings b ON o.booking_id::text = b.id::text
WHERE o.booking_id IS NOT NULL
  AND btrim(o.booking_id::text) <> ''
  AND b.id IS NULL;

SELECT o.id, o.created_at, o.status, o.booking_id
FROM orders o
LEFT JOIN bookings b ON o.booking_id::text = b.id::text
WHERE o.booking_id IS NOT NULL
  AND btrim(o.booking_id::text) <> ''
  AND b.id IS NULL
ORDER BY o.created_at DESC
LIMIT 200;

SELECT 'payments.order_id' AS relation, COUNT(*) AS orphan_count
FROM payments p
LEFT JOIN orders o ON p.order_id::text = o.id::text
WHERE p.order_id IS NOT NULL
  AND btrim(p.order_id::text) <> ''
  AND o.id IS NULL;

SELECT p.id, p.created_at, p.status, p.order_id
FROM payments p
LEFT JOIN orders o ON p.order_id::text = o.id::text
WHERE p.order_id IS NOT NULL
  AND btrim(p.order_id::text) <> ''
  AND o.id IS NULL
ORDER BY p.created_at DESC
LIMIT 200;

SELECT 'bookings.order_id' AS relation, COUNT(*) AS invalid_count
FROM bookings
WHERE order_id IS NOT NULL
  AND btrim(order_id::text) <> ''
  AND order_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

SELECT 'orders.booking_id' AS relation, COUNT(*) AS invalid_count
FROM orders
WHERE booking_id IS NOT NULL
  AND btrim(booking_id::text) <> ''
  AND booking_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

SELECT 'payments.order_id' AS relation, COUNT(*) AS invalid_count
FROM payments
WHERE order_id IS NOT NULL
  AND btrim(order_id::text) <> ''
  AND order_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

SELECT
  CASE
    WHEN b.created_at >= NOW() - INTERVAL '7 days' THEN 'last_7d'
    WHEN b.created_at >= NOW() - INTERVAL '30 days' THEN 'last_30d'
    WHEN b.created_at >= NOW() - INTERVAL '90 days' THEN 'last_90d'
    ELSE 'older'
  END AS recency_bucket,
  b.status,
  COUNT(*) AS orphan_count
FROM bookings b
LEFT JOIN orders o ON b.order_id::text = o.id::text
WHERE b.order_id IS NOT NULL
  AND btrim(b.order_id::text) <> ''
  AND o.id IS NULL
GROUP BY 1, 2
ORDER BY 1, 2;

SELECT
  CASE
    WHEN o.created_at >= NOW() - INTERVAL '7 days' THEN 'last_7d'
    WHEN o.created_at >= NOW() - INTERVAL '30 days' THEN 'last_30d'
    WHEN o.created_at >= NOW() - INTERVAL '90 days' THEN 'last_90d'
    ELSE 'older'
  END AS recency_bucket,
  o.status,
  COUNT(*) AS orphan_count
FROM orders o
LEFT JOIN bookings b ON o.booking_id::text = b.id::text
WHERE o.booking_id IS NOT NULL
  AND btrim(o.booking_id::text) <> ''
  AND b.id IS NULL
GROUP BY 1, 2
ORDER BY 1, 2;

SELECT
  CASE
    WHEN p.created_at >= NOW() - INTERVAL '7 days' THEN 'last_7d'
    WHEN p.created_at >= NOW() - INTERVAL '30 days' THEN 'last_30d'
    WHEN p.created_at >= NOW() - INTERVAL '90 days' THEN 'last_90d'
    ELSE 'older'
  END AS recency_bucket,
  p.status,
  COUNT(*) AS orphan_count
FROM payments p
LEFT JOIN orders o ON p.order_id::text = o.id::text
WHERE p.order_id IS NOT NULL
  AND btrim(p.order_id::text) <> ''
  AND o.id IS NULL
GROUP BY 1, 2
ORDER BY 1, 2;

WITH bookings_stats AS (
  SELECT COUNT(*) AS total_rows,
    COUNT(*) FILTER (WHERE order_id IS NULL OR btrim(order_id::text) = '') AS null_or_blank,
    COUNT(*) FILTER (
      WHERE order_id IS NOT NULL AND btrim(order_id::text) <> ''
        AND order_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) AS invalid_format,
    COUNT(*) FILTER (
      WHERE order_id IS NOT NULL AND btrim(order_id::text) <> ''
        AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id::text = bookings.order_id::text)
    ) AS orphan_count
  FROM bookings
),
orders_stats AS (
  SELECT COUNT(*) AS total_rows,
    COUNT(*) FILTER (WHERE booking_id IS NULL OR btrim(booking_id::text) = '') AS null_or_blank,
    COUNT(*) FILTER (
      WHERE booking_id IS NOT NULL AND btrim(booking_id::text) <> ''
        AND booking_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) AS invalid_format,
    COUNT(*) FILTER (
      WHERE booking_id IS NOT NULL AND btrim(booking_id::text) <> ''
        AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.id::text = orders.booking_id::text)
    ) AS orphan_count
  FROM orders
),
payments_stats AS (
  SELECT COUNT(*) AS total_rows,
    COUNT(*) FILTER (WHERE order_id IS NULL OR btrim(order_id::text) = '') AS null_or_blank,
    COUNT(*) FILTER (
      WHERE order_id IS NOT NULL AND btrim(order_id::text) <> ''
        AND order_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) AS invalid_format,
    COUNT(*) FILTER (
      WHERE order_id IS NOT NULL AND btrim(order_id::text) <> ''
        AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id::text = payments.order_id::text)
    ) AS orphan_count
  FROM payments
)
SELECT 'bookings.order_id' AS relation, total_rows, null_or_blank, invalid_format, orphan_count FROM bookings_stats
UNION ALL
SELECT 'orders.booking_id', total_rows, null_or_blank, invalid_format, orphan_count FROM orders_stats
UNION ALL
SELECT 'payments.order_id', total_rows, null_or_blank, invalid_format, orphan_count FROM payments_stats;
