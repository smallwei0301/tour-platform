# Booking V2 Daily GO / HOLD / ROLLBACK WATCH (Issue #105)

## Purpose
Generate a daily decision packet from #103 dashboard snapshot data, aligned with #96/#104 rollout and rollback policy.

## Input
- `docs/operations/reports/booking-v2-dashboard-latest.json`

## Output
- `docs/operations/reports/booking-v2-go-no-go-YYYY-MM-DD.md`
- `docs/operations/reports/booking-v2-go-no-go-latest.md`

## Trigger / Scheduler
- GitHub Actions workflow: `.github/workflows/booking-v2-daily-go-no-go.yml`
- Daily schedule: 09:30 Asia/Taipei (cron `30 1 * * *`)
- Manual re-run supported via `workflow_dispatch` input `date` (`YYYY-MM-DD`)

## Decision Model (rule-based)

### ROLLBACK WATCH
Triggered if any of:
- callback success below threshold
- checkout init success below threshold
- fallback rate above threshold
- error rate above threshold

### HOLD
Triggered if:
- sample too small (`booking_page_view` below minimum)
- thresholds missing / invalid
- metrics required for decision are missing

### GO
Only when:
- no ROLLBACK WATCH trigger
- no HOLD trigger

## Default thresholds (can override by env)
- `GO_NOGO_MIN_PAGE_VIEW=20`
- `GO_NOGO_MIN_PAYMENT_CALLBACK=5`
- `GO_NOGO_PAYMENT_SUCCESS_MIN_PCT=95`
- `GO_NOGO_CHECKOUT_SUCCESS_MIN_PCT=90`
- `GO_NOGO_FALLBACK_WARN_PCT=10`
- `GO_NOGO_ERROR_WARN_PCT=5`

## Required report fields (daily packet)
- v2 vs legacy funnel conversion deltas:
  - `begin_checkout_rate_legacy_pct`
  - `begin_checkout_rate_v2_pct`
  - `begin_checkout_rate_delta_pct`
  - `purchase_intent_rate_legacy_pct`
  - `purchase_intent_rate_v2_pct`
  - `purchase_intent_rate_delta_pct`
- v2 vs legacy error-rate deltas:
  - `error_rate_legacy_pct`
  - `error_rate_v2_pct`
  - `error_rate_delta_pct`
- checkout success metric:
  - `checkout_init_success_rate_pct`

If required metrics are missing, decision must become `HOLD` with explicit missing reasons.

## Retention
Keep latest 7 daily reports in `docs/operations/reports/`.

## Local Commands
- Generate current day packet:
  - `npm run rollout:booking-v2-daily`
- Re-generate specific day packet:
  - `npm run rollout:booking-v2-daily -- --date=2026-04-20`
  - or `GO_NOGO_DATE=2026-04-20 npm run report:booking-v2-go-no-go`

## Failure Handling
- Workflow uploads markdown reports as artifacts even when job fails (`if: always()`).
- Runner exits non-zero on any dashboard/go-no-go step failure (non-silent failure).
