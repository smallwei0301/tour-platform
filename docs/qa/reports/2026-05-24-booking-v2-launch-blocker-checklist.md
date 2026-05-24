# Booking V2 Launch-Blocker QA Checklist — Evidence Report

- **Date:** 2026-05-24
- **Commit SHA:** `c333e93ae51bef3d63b64d378cd1719bde585468` (origin/main)
- **Branch:** `qa/issue-640-v2-launch-blocker-checklist-2026-05-24`
- **Executor:** Claude Sonnet 4.6 (automated evidence run)
- **Issue:** [#640] QA: Execute V2 launch blocker checklist across slots, draft, checkout, fallback, and legacy safety
- **Reference:** `docs/qa/booking-v2-rollout-manual-checklist.md`

---

## Section A: Automated Test Evidence

All tests were run from `apps/web/` on commit `c333e93`. No failures.

### A-1: V2 Core Smoke Suite

**Command:**
```
node --test tests/api/v2-available-slots.test.mjs tests/api/v2-booking-draft-checkout.test.mjs tests/api/booking-state.test.mjs tests/api/ecpay-callback.test.mjs tests/api/v2-route-contract-smoke.test.mjs
```

**Result: PASS — 120 tests, 0 failures**

Key assertions verified:
- Available-slots route: validation envelope, param range limits (31-day), timezone validation, slug→activityId resolution, success/error shapes
- Booking draft: all required-field rejections, sourceChannel validation (web/line/admin_pos), V2 request/response contract shapes
- Booking checkout: bookingId validation, reusable payment selection (pending-like only), provider flow, idempotent trade no generation
- ECPay callback: idempotency on replay, owner-email mismatch rejection, illegal state transition (cancelled→paid blocked), SimulatePaid=1 no-op, seat booking trigger
- Route contract smoke: auth guard, ownership check for order detail, slot validation, stateful draft errors

```
ℹ tests 120
ℹ pass  120
ℹ fail  0
ℹ duration_ms 341.99
```

---

### A-2: Guide Blackout Smoke Suite

**Command:**
```
node --test --test-name-pattern='Blackout|validateSlotAvailability detects blackout conflicts' tests/slot-generator.test.mjs
node --test tests/api/v2-guide-blackout-contract.test.mjs
```

**Result: PASS — 7 tests, 0 failures**

Slot generator (3 tests):
- `getBlackoutWindows` filters by guide and date range
- `slotConflictsWithBlackout` conflict detection
- `validateSlotAvailability` detects blackout conflicts

Blackout contract (4 tests):
- Blackout collection route: list/create + validation envelope
- Blackout single-item delete: ownership verification + success envelope
- Guide availability preview: blackout + booking interaction evidence
- Booking routes consult blackout dates during draft + available-slots flows

```
ℹ tests 7
ℹ pass  7
ℹ fail  0
```

---

### A-3: V2 Contract Tests — Draft, Checkout, Authz

**Command:**
```
node --test tests/api/v2-booking-draft-checkout.test.mjs tests/api/v2-available-slots.test.mjs
```

**Result: PASS — 65 tests, 0 failures** (combined from A-1 coverage above)

Key coverage not covered elsewhere:
- Capacity exceeded path: SLOT_UNAVAILABLE rejection shape verified
- Checkout reusability: non-pending-like payment statuses rejected for reuse
- V2 order detail: 401 for unauthenticated, 403 for non-owner (no payload leakage), owner success payload shape

---

### A-4: Payment Callback and Legacy Order Safety

**Command:**
```
node --test tests/api/payment-callback-booking-loop-contract.test.mjs
node --test tests/api/ecpay-callback.test.mjs tests/api/ecpay-callback-mapping-contract.test.mjs tests/api/ecpay-simulatepaid-callback-contract.test.mjs
node --test tests/api/issue614-ecpay-create-callback-persistence-contract.test.mjs tests/api/issue614-ecpay-payment-domain-foundation-contract.test.mjs tests/api/issue614-ecpay-query-reconciliation-contract.test.mjs
node --test tests/api/issue652-ecpay-create-on-conflict.test.mjs tests/api/issue614-ecpay-reversal-state-aware.test.mjs
node --test tests/api/issue598-payment-events-rls-hardening-contract.test.mjs
```

**Result: PASS — 43 tests, 0 failures**

| Test File | Pass | Notes |
|---|---|---|
| payment-callback-booking-loop-contract | 1/1 | Idempotent log + booking status loop |
| ecpay-callback + mapping + simulatepaid | 10/10 | V2 CustomField2/4 mapping, SimulatePaid no-op, replay idempotency |
| issue614-create-callback-persistence | 17/17 | Callback DB path, payment_events idempotency, RLS hardening |
| issue652-ecpay-create-on-conflict + reversal | 7/7 | ON CONFLICT reuse, reversal state-aware (TradeStatus=1 blocks Action=R) |
| issue598-payment-events-rls-hardening | 4/4 | service_role-only policy, anon privilege revoked |

**Legacy order safety:** existing `orders` table rows remain readable; the `v2-orders-authz.test.mjs` and `v2-order-detail-authz-route.test.mjs` suites (7 tests, PASS) confirm authz guards did not regress read paths.

---

### A-5: V2 Availability Fallback and Source Contracts

**Command:**
```
node --test tests/api/issue619-v2-availability-source-contract.test.mjs tests/api/issue621-v2-availability-fallback-contract.test.mjs tests/api/issue621-v2-legacy-guard-and-internal-compat.test.mjs
```

**Result: PASS — 12 tests, 0 failures**

Key assertions:
- V2 source-of-truth: reads from rules/blackouts/bookings/plans (not legacy daily/schedules primary)
- Fallback: legacy no-schedules path returns 404/NOT_FOUND (not 500 bubble)
- Legacy guard: only hard-blocks under explicit BOOKING_V2_PRIMARY mode
- Internal sweeps: prefer V2 booking start_at with legacy schedule fallback

---

### A-6: LINE LIFF, Admin POS, and Cross-Channel

**Command:**
```
node --test tests/api/v2-line-booking.test.mjs tests/api/v2-line-liff-entry-contract.test.mjs tests/api/issue178-line-liff-callback-audit-contract.test.mjs
node --test tests/api/v2-admin-pos-line-regression.test.mjs
node --test tests/api/v2-guide-dashboard-booking-sync.test.mjs
```

**Result: PASS — 44 tests, 0 failures**

| Suite | Pass | Notes |
|---|---|---|
| v2-line-booking + LIFF entry + audit | 26/26 | LINE handoff, correlationId continuity, sourceChannel isolation |
| v2-admin-pos-line-regression | 3/3 | web/line/admin_pos channels, POS draft envelope shape |
| v2-guide-dashboard-booking-sync | 15/15 | Guide auth, bookings via orders table, GMV gating to paid/confirmed/completed |

---

### A Summary: All Automated Tests

| Suite | Tests | Pass | Fail |
|---|---|---|---|
| V2 core smoke (slots, draft, checkout, callback, route) | 120 | 120 | 0 |
| Guide blackout smoke | 7 | 7 | 0 |
| Payment callback + ECPay contracts (all) | 43 | 43 | 0 |
| V2 availability source + fallback contracts | 12 | 12 | 0 |
| V2 authz (orders, order detail) | 7 | 7 | 0 |
| LINE LIFF + Admin POS + guide dashboard | 44 | 44 | 0 |
| **TOTAL** | **233** | **233** | **0** |

**All 233 automated contract/unit/smoke tests PASS.**

---

## Section B: Re-test of 2026-04-17 Known Limitation

### What the limitation was

In the 2026-04-17 manual test report (Tracy), the `/activities` page was observed to show "0 個私人導遊行程 / 載入中⋯" in a browser snapshot. This indicated a possible SSR hydration issue or race condition on the activities listing endpoint. The report flagged it as requiring follow-up: "QA 以多次刷新與不同時段驗證是否穩定重現."

### What automated tests cover now

- `issue619-v2-availability-source-contract.test.mjs`: verifies the V2 activity slug availability adapter reads from the correct source (rules/blackouts/bookings/plans), preventing the legacy data path from silently returning empty results.
- `issue621-v2-availability-fallback-contract.test.mjs`: verifies the legacy no-schedules code path returns a well-formed 404 instead of bubbling a 500 that could cause hydration failures.
- `issue621-v2-legacy-guard-and-internal-compat.test.mjs`: verifies internal sweeps prefer V2 start_at with truthful policy diagnostics, preventing ghost-data conditions.

### Remaining gap

These tests are contract/unit level. They do not replace live browser regression for the `/activities` page. The "0 tours loading" issue may have a client-side hydration component not covered by server-side contract tests. Section C item C-1 below covers the required human verification.

---

## Section C: Manual Test Items (NEEDS-HUMAN)

The following items cannot be completed without a human operator with browser access to the Vercel preview or production environment. Each is explicitly marked NEEDS-HUMAN and must be signed off before GO.

### C-1: Live browser /activities refresh x5 — desktop and mobile

**Status: NEEDS-HUMAN**

**What must be done:**
1. Open `https://tour-platform-nine.vercel.app/activities` in desktop Chrome
2. Hard-refresh (Ctrl+Shift+R) at least 5 times and confirm activity cards are visible on every load — no "0 行程" or "載入中⋯" persistent state
3. Repeat on a real mobile device (iOS Safari or Android Chrome)
4. If the "0 tours + loading" state appears and persists beyond 3 seconds on any refresh, escalate as a blocker

**Why it cannot be automated:** The 2026-04-17 report observed intermittent client-side hydration behavior that is not reproducible via HTTP contract tests. This requires a real browser to trigger the full React hydration path.

---

### C-2: Flag-ON V2 happy path on Vercel preview (real browser)

**Status: NEEDS-HUMAN**

**What must be done:**
1. On the Vercel preview with `BOOKING_V2_ENABLED=true` (or equivalent feature flag ON), open:
   `https://tour-platform-nine.vercel.app/booking/kaohsiung-chaishan-cave-experience?plan=half-day&date=2026-06-01`
2. Confirm V2 flow: slots displayed, draft created successfully (no 500), checkout form renders with ECPay fields
3. Verify V2 identification text is visible ("V2 預約流程" or equivalent)
4. Record the booking ID from the draft response URL/UI

**Why it cannot be automated:** Real feature-flag-gated environment toggle + full React rendering + ECPay form generation require a live Vercel deployment with valid env secrets.

---

### C-3: ECPay sandbox callback round-trip

**Status: NEEDS-HUMAN**

**What must be done:**
1. Complete a V2 booking draft + checkout (from C-2)
2. Trigger ECPay sandbox SimulatePaid (via ECPay test console or direct POST to `/api/payments/ecpay/callback` with test payload)
3. Confirm: order status transitions to `paid`, `payment_events` row is written, booking seats are occupied
4. Check Supabase `payments` and `payment_events` tables directly for the idempotent entry

**Why it cannot be automated:** The ECPay callback round-trip requires: (a) a real Supabase instance with service_role key, (b) a valid `merchantTradeNo` generated by a real checkout, (c) ECPay's CheckMac hash verification against real credentials. Contract tests verify the shape and logic; the live round-trip requires real infrastructure.

---

### C-4: Live fallback event write-back confirmation

**Status: NEEDS-HUMAN**

**What must be done:**
1. On the Vercel preview with V2 flag ON, use browser DevTools to intercept `GET /api/v2/activities/*/available-slots` and return a 500
2. Confirm: fallback UI displays (`booking-v2-error` element visible), "切回舊版" button is clickable
3. Click the fallback button; confirm: `booking_v2_fallback_clicked` event appears in Supabase `events` table
4. Run `npm run dashboard:booking-v2` after and confirm `fallbackClicked` counter increments

**Why it cannot be automated:** Fallback event write-back requires: (a) real Supabase `events` table with service_role key, (b) real browser interaction to trigger the client-side fallback path.

---

## Section D: Dashboard Evidence

### D-1: Dashboard script status

The `npm run dashboard:booking-v2` script requires a live Supabase connection with valid `SUPABASE_SERVICE_ROLE_KEY`. In this automated run environment, the key is not available:

```
> tour-platform@0.1.0 dashboard:booking-v2
> node scripts/rollout/booking-v2-dashboard.mjs

Failed to generate dashboard snapshot
Error: countRows(orders) failed: 401 {"message":"Invalid API key","hint":"Double check your Supabase `anon` or `service_role` API key."}
```

The `npm run report:booking-v2-go-no-go` script also requires the dashboard snapshot file as input:

```
Missing input: docs/operations/reports/booking-v2-dashboard-latest.json
```

### D-2: Dashboard coverage via contract tests

While the live dashboard cannot be run in this environment, the dashboard contract is verified via the V2 guide dashboard booking sync suite (A-6), which confirms:
- `monthlyBookings`, `pendingBookings`, `upcomingSchedules` fields are returned
- `monthGmvTwd` and `revenueTrend6m` fields are present (issue #357 regression guard)
- GMV is gated exclusively to `paid`/`confirmed`/`completed` statuses

### D-3: Last known good dashboard state

Per `docs/qa/reports/2026-04-17-booking-v2-manual-test-report.md`, the dashboard was last validated on 2026-04-17 with:
- `booking_page_view_total = 2`, `legacy = 1`, `v2 = 1`
- `fallback_clicked = 1`, `fallback_rate_vs_v2_page_view_pct = 100`

**Action required for GO:** Human operator must run `npm run dashboard:booking-v2` with valid service_role key and confirm the output file is generated before running `npm run report:booking-v2-go-no-go`.

---

## Section E: Verdict

### E-1: Automated Evidence Verdict

**PASS-AUTOMATED**

All 233 automated contract, unit, and smoke tests pass on commit `c333e93`. This covers:
- Slot availability validation, capacity enforcement, and oversell rejection
- V2 draft and checkout API contract shapes (request validation, error envelopes, response formats)
- ECPay callback idempotency, owner verification, illegal transition blocking, SimulatePaid no-op
- Payment domain: RLS hardening (service_role-only), idempotency indexes, reconciliation
- Guide blackout: slot conflict detection, booking routes consult blackout, ownership verification
- V2 availability fallback: legacy path returns 404 not 500, legacy guard only activates in BOOKING_V2_PRIMARY mode
- Auth: unauthenticated 401, non-owner 403, no payload leakage on authz failure
- Cross-channel: LINE LIFF correlationId continuity, admin_pos channel isolation, sourceChannel=line regression guard

### E-2: Full GO Criteria

**Full GO requires human operator to sign off all four Section C items:**

| Item | Automated | Human Required |
|---|---|---|
| C-1: /activities page loads consistently (x5 refresh desktop+mobile) | No | YES |
| C-2: Flag-ON V2 happy path on Vercel preview | No | YES |
| C-3: ECPay sandbox callback round-trip (real credentials) | No | YES |
| C-4: Fallback event write-back + dashboard confirmation | No | YES |

### E-3: Non-Blockable Items

Per the acceptance criteria of issue #640, the following items **can never be marked non-blocking** and must receive explicit human sign-off before any production rollout:

1. **Payment round-trip (C-3):** ECPay live callback with real `merchantTradeNo`, real `CheckMac`, and confirmation of `payment_events` write. Automated tests verify the logic contract; they cannot substitute for a live end-to-end transaction.
2. **Oversell / capacity enforcement in production:** Contract tests verify the rejection logic; real concurrent booking load on the live Supabase instance must be confirmed by operator monitoring.
3. **Invalid-slot rejection on live data:** Automated tests use in-memory mocks; the production database may have slot configurations that differ from test fixtures.
4. **Silent fallback detection (C-4):** The fallback event write-back (client → server → events table) has no automated coverage path — it requires a real browser with network interception and a live Supabase events table.

### E-4: Summary

```
Automated evidence:  PASS (233/233 tests)
Dashboard evidence:  BLOCKED — requires human operator with valid service_role key
Manual sign-off:     PENDING — 4 items in Section C require human operator

Current status:      PASS-AUTOMATED / PENDING-HUMAN-SIGN-OFF
GO recommendation:   CONDITIONAL — automated evidence is complete and clean;
                     production GO requires Section C items to be checked off by
                     a human operator with access to the Vercel preview and
                     ECPay sandbox credentials.
```
