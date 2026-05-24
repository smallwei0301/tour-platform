# Booking V2 — 7-Day Observation Window Report

**Start date (V2 default launch):** [OPERATOR TO FILL — Asia/Taipei ISO8601]
**End date:** [Start + 7 days]
**Launch commit SHA:** [from /api/health version field]
**Environment:** production
**Operator:** Wei

## Prerequisite gate checklist
- [ ] #621 closed (V2 primary flow confirmed live)
- [ ] #640 human sign-off complete (Section C items)
- [ ] #641 rollback drill completed
- [ ] NEXT_PUBLIC_BOOKING_V2_ENABLED=true confirmed on Vercel production
- [ ] BOOKING_V2_PRIMARY=1 confirmed on Vercel production (enables /api/orders legacy guard)

## Daily monitoring log
(One row per day; operator fills in after each 24h period)

| Day | V2 Page Loads | Slots Success% | Draft Success% | Checkout Success% | Payment Callbacks | Fallback Clicks | Legacy /checkout Hits | /api/orders non-opt-in | Slot Rejections | HOLD? |
|-----|---------------|----------------|----------------|-------------------|-------------------|-----------------|----------------------|----------------------|-----------------|-------|
| 1   | [N/A]         | [N/A]          | [N/A]          | [N/A]             | [N/A]             | [N/A]           | [N/A]                | [N/A]                | [N/A]           | -     |
| 2   | ...           |                |                |                   |                   |                 |                      |                      |                 |       |
| 3   |               |                |                |                   |                   |                 |                      |                      |                 |       |
| 4   |               |                |                |                   |                   |                 |                      |                      |                 |       |
| 5   |               |                |                |                   |                   |                 |                      |                      |                 |       |
| 6   |               |                |                |                   |                   |                 |                      |                      |                 |       |
| 7   |               |                |                |                   |                   |                 |                      |                      |                 |       |

## Alert thresholds (HOLD triggers)

Any of these → log in "Incidents" section + consider HOLD:
- Draft success rate < 95% on any day
- Checkout success rate < 95% on any day
- Payment callback failure > 2% on any day
- Fallback click rate > 5% of V2 page loads
- Unexplained legacy /checkout traffic > 10 hits/day from non-logged-in users
- /api/orders non-legacy-opt-in 410 responses > 0 on any day

## Monitoring query contracts

### V2 booking metrics (run via scripts/rollout/booking-v2-dashboard.mjs)
```sql
-- V2 page loads / slots / draft / checkout daily breakdown
SELECT 
  date_trunc('day', created_at AT TIME ZONE 'Asia/Taipei') AS day,
  event_name,
  properties->>'rollout_variant' AS variant,
  count(*) AS event_count
FROM events
WHERE event_name IN ('booking_page_view', 'booking_slots_loaded', 'booking_draft_created', 'booking_checkout_started', 'booking_v2_fallback_clicked')
  AND created_at >= '[START_DATE]'::timestamptz
GROUP BY 1, 2, 3
ORDER BY 1, 2;
```

### Legacy traffic guard
```sql
-- Unexpected legacy /checkout hits from non-order-detail navigations
SELECT date_trunc('day', created_at AT TIME ZONE 'Asia/Taipei') AS day, count(*) 
FROM events
WHERE event_name = 'checkout_page_view' 
  AND properties->>'rollout_variant' = 'legacy'
  AND created_at >= '[START_DATE]'::timestamptz
GROUP BY 1 ORDER BY 1;

-- /api/orders non-legacy-opt-in submissions (should be 0 once BOOKING_V2_PRIMARY=1)
SELECT date_trunc('day', created_at AT TIME ZONE 'Asia/Taipei') AS day, count(*)
FROM orders
WHERE booking_id IS NULL
  AND created_at >= '[START_DATE]'::timestamptz
GROUP BY 1 ORDER BY 1;
```

### Payment callback success
```sql
SELECT date_trunc('day', created_at AT TIME ZONE 'Asia/Taipei') AS day,
  payment_status, count(*)
FROM payments
WHERE created_at >= '[START_DATE]'::timestamptz
GROUP BY 1, 2 ORDER BY 1;
```

## Incidents during observation window
(Operator fills in as they occur)

| Day | Incident | Severity | Action taken | Resolved? |
|-----|----------|----------|--------------|-----------|
|     |          |          |              |           |

## Day 7 rollup verdict

- Overall V2 adoption rate: [%]
- Fallback rate: [%]
- Any unexplained legacy traffic? Y/N
- Any incidents? Y/N (ref above)
- Any HOLD triggers breached? Y/N

**Verdict:** GO-CLEANUP | HOLD-PENDING-INVESTIGATION | NO-GO

## Legacy cleanup gate

Legacy cleanup issues may only start when ALL of the following are true:
- [ ] This report's Day 7 verdict is GO-CLEANUP
- [ ] Fallback rate < 2% sustained for 7 days
- [ ] No HOLD incidents unresolved
- [ ] Wei has signed off on this report

Cleanup issues to create upon GO-CLEANUP:
1. Deprecate /checkout route (add 301 redirect to /booking/[slug])
2. Guard /api/orders as legacy-only (enforce BOOKING_V2_PRIMARY gate)
3. activity_schedules — decide final role (legacy reads only or V2 override manager)
4. activity_availability_daily — migrate to V2 slot cache or archive
5. guide/admin schedules pages — convert to V2 override manager or mark legacy
