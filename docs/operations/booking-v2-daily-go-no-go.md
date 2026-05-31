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

## Funnel delta metrics — source, denominator, and warning behaviour (issue #965)

Three new delta pairs are emitted by the dashboard and consumed by the go-no-go report:

| Delta pair | Source events | Numerator (legacy) | Numerator (v2) | Denominator (legacy) | Denominator (v2) |
|---|---|---|---|---|---|
| `begin_checkout_rate` | `begin_checkout` where `properties.rollout_variant` = `'legacy'` / `'v2'` | `funnel.beginCheckoutLegacy` | `funnel.beginCheckoutV2` | `funnel.bookingPageViewLegacy` | `funnel.bookingPageViewV2` |
| `purchase_intent_rate` | `purchase_intent` where `properties.rollout_variant` = `'legacy'` / `'v2'` | `funnel.purchaseIntentLegacy` | `funnel.purchaseIntentV2` | `funnel.beginCheckoutLegacy` | `funnel.beginCheckoutV2` |
| `error_rate` | `error` where `properties.rollout_variant` = `'legacy'` / `'v2'` | `errors.errorRateVsPageViewLegacyPct` | `errors.errorRateVsPageViewV2Pct` | `funnel.bookingPageViewLegacy` | `funnel.bookingPageViewV2` |

### DATA_QUALITY_WARNING(variant_instrumentation_untagged)

**Meaning**: Aggregate funnel counts (e.g. `booking_page_view = 100`) are non-zero but **both** legacy and v2 variant counts are 0. This means events are being tracked but the `rollout_variant` property is not set on them — an instrumentation gap, not the absence of traffic.

**Post-#970 context**: PR #970 added dashboard support for reading `events.properties.rollout_variant`. When this warning appears, check that the booking page correctly emits `rollout_variant: 'legacy'` or `rollout_variant: 'v2'` on tracking calls.

**Impact on Go/No-Go**: This is a **warning only** — it does NOT block GO or trigger HOLD. However, operators should not trust delta-based signals (V2 vs legacy conversion comparisons) until this warning is resolved, as all variant comparisons will show N/A.

### Warning behaviour when variant data is missing

- When variant-level counts are absent (field missing from JSON) or produce NaN denominators, the go-no-go emits `MISSING_DELTA_INPUT(begin_checkout_rate)`, `MISSING_DELTA_INPUT(purchase_intent_rate)`, or `MISSING_DELTA_INPUT(error_rate)` under **warnings**, not under `hold_reasons` or `rollback_reasons`.
- Missing delta data **never** fabricates a GO, HOLD, or ROLLBACK WATCH decision on its own — the delta pair is informational only and requires real data to produce a meaningful signal.
- `errorRateVsPageViewLegacyPct` / `errorRateVsPageViewV2Pct` are **omitted from the JSON** (not set to 0) when the corresponding page-view count is zero — this prevents `toNum(undefined)` = `NaN` from being misread as 0% error rate.

### Event instrumentation (issue #965)

- Legacy checkout path (`/checkout`): `begin_checkout` and `purchase_intent` events emit `properties.rollout_variant = 'legacy'`
- V2 booking path (`/booking/[activityId]`): `begin_checkout` fires when the user advances from Step 1 to Step 2 ("下一步：填寫資訊"); `purchase_intent` fires when the user taps "建立訂單並前往付款" in Step 2. Both emit `properties.rollout_variant = 'v2'`.

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

## Related: Synthetic Health Monitoring

Real-time liveness checks complement this daily report. See:
- `docs/operations/synthetic-health-monitoring.md` — external synthetic probe (issue #629)
- Probe runs every 15 minutes via `.github/workflows/synthetic-health-probe.yml`
- On failure: Telegram alert + GitHub Actions job failure
