# Booking V2 — Day-0 Readiness Snapshot

**Status: PRE-LAUNCH — observation window not yet started**
**Date:** 2026-06-04 (Asia/Taipei)
**Author:** tour-loop (issue #1199, leaf of #642)
**Purpose:** Verify all pre-launch preparation is in place and capture the day-0 baseline before the 7-day observation window begins.

---

## 1. Observation Window Start Condition

The 7-day observation window (parent issue #642) begins on the **date of the first real production payment**. At the time of this report, no real payments have been recorded (all funnel metrics are 0 in the live Supabase database). The template from #716 has been committed and all monitoring tooling is operational.

**7-day window start trigger:** Date of first real production payment via ECPay callback.

---

## 2. Template and Deliverables Checklist (#716 verification)

| Deliverable | Status | Path |
|-------------|--------|------|
| 7-day daily monitoring log table | ✅ Present | `booking-v2-observation-window-TEMPLATE.md` lines 16–27 |
| HOLD/alert thresholds | ✅ Present | Template lines 29–37 (6 threshold conditions) |
| SQL monitoring query contracts (4 queries) | ✅ Present | Template lines 39–81 (V2 funnel, legacy /checkout guard ×2, payment callback) |
| Incidents table | ✅ Present | Template lines 83–88 |
| Day-7 rollup verdict section | ✅ Present | Template lines 90–98 |
| Legacy-cleanup gate preconditions | ✅ Present | Template lines 100–114 (5 cleanup items) |
| Daily-decision log template | ✅ Present | `booking-v2-go-no-go-latest.md` format |

All #716 deliverables are confirmed complete.

---

## 3. Monitoring Script Verification

### 3a. `npm run dashboard:booking-v2`
- **Wired in:** `package.json:16` → `node scripts/rollout/booking-v2-dashboard.mjs`
- **Supabase creds:** Required (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`). Script hard-fails without them (no offline fallback).
- **Run result (2026-06-04):** ✅ Success — produced `booking-v2-dashboard-latest.json` with live Supabase query.

### 3b. `scripts/rollout/booking-v2-go-no-go.mjs`
- **Run result (2026-06-04):** ✅ Executed — produced `booking-v2-go-no-go-latest.md`
- **Verdict:** `ROLLBACK WATCH`
- **Decision reason:** `PAYMENT_SUCCESS_LOW(0%<95%)` + `LOW_SAMPLE_PAGE_VIEW(0<20)` + `LOW_SAMPLE_CALLBACK(0<5)`

> ⚠️ **Important interpretation:** ROLLBACK WATCH here is a **pre-launch artifact**, not a quality regression. With 0 real payment callbacks, the script computes payment success rate as 0% (0/0), which falls below the 95% threshold. This is expected behavior before any real traffic. Once real bookings and payments exist, the rate will reflect actual funnel health. The real pre-launch status is: **NO REAL TRAFFIC YET**.

---

## 4. Live Dashboard Baseline (2026-06-04)

Snapshot from `booking-v2-dashboard-latest.json` (generated: 2026-06-03T23:13:00Z, 24h window):

| Metric | Value | Notes |
|--------|-------|-------|
| V2 Page Loads | 0 | No real traveler traffic |
| Legacy Page Loads | 0 | No real traveler traffic |
| Begin Checkout (total) | 0 | — |
| Payment Callbacks | 0 | — |
| Fallback Clicks | 0 | — |
| Orders Paid | 0 | — |
| Orders Failed | 0 | — |
| Error Rate | 0% | — |
| Payment Success Rate | 0% | ⚠️ Pre-launch artifact: 0 callbacks |
| Go/No-Go Verdict | ROLLBACK WATCH | ⚠️ Pre-launch artifact (see §3b above) |

**This is the day-0 baseline.** Once real traveler bookings begin, the 7-day observation window opens.

---

## 5. V2 Default Launch Posture

| Check | Status |
|-------|--------|
| `isBookingV2Enabled()` defaults `true` | ✅ Confirmed (`apps/web/src/config/feature-flags.mjs:18`) |
| `isBookingV2ShellEnabled()` defaults `true` | ✅ Confirmed (`apps/web/src/config/feature-flags.mjs:28`) |
| Rollback mechanism: `NEXT_PUBLIC_BOOKING_V2_ENABLED=0` | ✅ Available |
| Prerequisite gate (#1135 readiness checks) | ✅ Merged |

### Operator-owned production preconditions (not yet confirmed)
These remain for the operator (Wei) to verify before the observation window is formally declared open:

- [ ] `NEXT_PUBLIC_BOOKING_V2_ENABLED=true` confirmed on Vercel production (not just default — must be explicitly set or verified absent)
- [ ] `BOOKING_V2_PRIMARY=1` confirmed on Vercel production (enables `/api/orders` legacy guard)
- [ ] #621 closed (V2 primary flow confirmed live in production)
- [ ] #640 human sign-off complete (Section C items)
- [ ] #641 rollback drill completed

---

## 6. Corrected Documentation Reference

Parent issue #642 cites `docs/operations/booking-v2-launch-priority-plan.md` as the launch plan — **this file does not exist**. The live equivalent is:

**`docs/operations/current-issue-priority.md`** — the canonical launch routing + issue priority snapshot (lists #642 at line 46 as the V2 observation window tracker).

The same broken reference also appears in `docs/operations/drills/2026-05-23-booking-v2-rollback-production-dry-run.md` (lines 18 and 136). This has been corrected in that file as part of this PR.

---

## 7. Legacy Cleanup Gate

Legacy cleanup issues (**do not open until all conditions are met**):

- [ ] Parent #642 Day-7 rollup verdict: **GO-CLEANUP**
- [ ] Fallback rate < 2% sustained for 7 days
- [ ] No unresolved HOLD incidents
- [ ] Wei has signed off on the observation window report
- [ ] This day-0 snapshot is referenced in the observation window report header

Cleanup issues to create upon GO-CLEANUP (from template):
1. Deprecate `/checkout` route (301 → `/booking/[slug]`)
2. Guard `/api/orders` as legacy-only (enforce `BOOKING_V2_PRIMARY` gate)
3. `activity_schedules` — decide final role (legacy reads only or V2 override manager)
4. `activity_availability_daily` — migrate to V2 slot cache or archive
5. Guide/admin schedules pages — convert to V2 override manager or mark legacy

---

## 8. Parent Issue Status

Parent #642 (**[Traveler Booking] Monitor V2 observation window and guard legacy fallback**) remains **OPEN** pending:
- First real production payment (starts the 7-day clock)
- 7 days of daily metric rows filled in the TEMPLATE
- Day-7 GO-CLEANUP verdict by operator Wei

**Do not close #642 or begin any cleanup issues until this process is complete.**
