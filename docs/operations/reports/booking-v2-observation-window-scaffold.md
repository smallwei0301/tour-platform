# Booking V2 Observation Window Report

> Status: PENDING REAL TRAFFIC
> Last updated: 2026-06-03 (automated scaffold — no real traffic yet)
> Parent issue: #642

## Observation Period
- Start: [Date of first real payment]
- Target end: [Start + 7 days]
- Milestone: This window must complete before legacy cleanup begins

## Current V2 Status (as of 2026-06-03)

### Infrastructure
- V2 enabled by default: `NEXT_PUBLIC_BOOKING_V2_ENABLED=true` (default since PR #800)
- V2 endpoint: `GET /api/v2/activities/:id/available-slots`
- V2 draft: `POST /api/v2/bookings/draft`
- Plan/schedule alignment: ✅ All sections of #1079 complete

### Recent Relevant PRs (2026-06-02/03 window)
- #1112: Canonical season + conflict resolver
- #1120: end_at in activity_schedules SELECT (fixes mismatch guard)
- #1123: Strict-plan-validated schedule create endpoint
- #1134: Admin schedule modal sources from V2 activity_plans
- #1135: Readiness gate — LEGACY_ONLY_PLANS, ALL_PLANS_INACTIVE, NO_FUTURE_SCHEDULES
- #1137: Guide availability binds V2 activity_plan_id
- #1138: Activity detail surfaces inactive-plan state (stops masking)
- #1158/#1159: Security HEAD cleanup

## Metrics to Monitor

### Booking Funnel
| Metric | Baseline | Day 1 | Day 3 | Day 7 |
|---|---|---|---|---|
| V2 page loads (`/booking/*`) | - | - | - | - |
| available-slots success rate | - | - | - | - |
| available-slots error rate | - | - | - | - |
| Draft success rate | - | - | - | - |
| Draft: PLAN_SCHEDULE_MISMATCH rate | - | - | - | - |
| Draft: NO_ACTIVE_PLAN rate | - | - | - | - |
| Checkout success rate | - | - | - | - |
| Payment callback success rate | - | - | - | - |

### Legacy Fallback
| Metric | Acceptable threshold | Actual |
|---|---|---|
| Traffic to `/checkout` (legacy path) | < 5% of bookings | - |
| Traffic to `/api/orders` (legacy) | < 5% of bookings | - |
| V2 fallback to legacy slots | Should be zero | - |
| Unexplained fallback spikes | Zero tolerance | - |

## Acceptance Criteria
- [ ] 7-day window completed
- [ ] Legacy fallback traffic explainable and below 5%
- [ ] No unexplained `/checkout` or `/api/orders` primary traffic
- [ ] No PLAN_SCHEDULE_MISMATCH spikes
- [ ] Sentry V2 error rate < 1%
