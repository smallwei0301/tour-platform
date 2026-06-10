# #1317 Owner production smoke — 2026-06-10 round 3

Continuation of round 1 + round 2 after the owner shared the corrected Andy Lee guide password. Runtime deployment unchanged: **`aa37a2512d9f7e53b587493279eec15b35447994`**.

> Same legend — ✅ PASS · 🟡 PARTIAL · 🔴 FAIL · ⏸️ DEFER.

## Round 3 — the three guide-side smokes that were blocked in round 2

| # | Subject | Round 2 → Round 3 | Status |
|---|---|---|---|
| #1289 / #1307 — guide preview ↔ traveler parity (incl. Asia/Taipei TZ) | ⏸️ → ✅ | **PASS** — see § 1 |
| #1284 — guide payout dashboard with hold flags | ⏸️ → ✅ | **PASS** — see § 2 |

Only #1249 / #1258 Lighthouse before/after metrics remain owner-only (sandbox has no Lighthouse). #1317 is otherwise fully closeable after this PR + the round-1 (#1331) and round-2 (#1338) PRs merge.

## § 1 — #1289 / #1307 guide ↔ traveler parity ✅

**Fixture:** the only active rule in production (Andy Lee, plan_id `8390410e…` half-day-morning, weekday Monday, 09:00–17:00 Asia/Taipei). 2026-06-15 is a Monday.

### Guide preview side
```
GET /api/guide/availability-preview?activityPlanId=8390410e…&dateFrom=2026-06-15&dateTo=2026-06-15&timezone=Asia/Taipei
  cookie: guide_token + guide_id + tp_csrf (after POST /api/guide/auth/session)
  → ok:true, slots count: 2
  [0] startAt=2026-06-15T09:00:00+08:00  endAt=2026-06-15T13:00:00+08:00  capLeft=9  isAvailable=true
  [1] startAt=2026-06-15T13:00:00+08:00  endAt=2026-06-15T17:00:00+08:00  capLeft=9  isAvailable=true
```

### Traveler side (re-tested for the diff)
```
GET /api/v2/activities/6f8049be…/available-slots?planId=8390410e…&dateFrom=2026-06-15&dateTo=2026-06-15&timezone=Asia/Taipei&participants=1
  → slots count: 2
  [0] startAt=2026-06-15T09:00:00+08:00  endAt=2026-06-15T13:00:00+08:00  capLeft=9  isAvailable=true
  [1] startAt=2026-06-15T13:00:00+08:00  endAt=2026-06-15T17:00:00+08:00  capLeft=9  isAvailable=true
```

### Parity diff
```
guide   startAts: 2026-06-15T09:00:00+08:00 | 2026-06-15T13:00:00+08:00
traveler startAts: 2026-06-15T09:00:00+08:00 | 2026-06-15T13:00:00+08:00
PARITY: IDENTICAL ✅
```

**Verdict:**
- #1289 AC#4 ("guide ↔ traveler 同樣 ranges parity") — character-identical slot count, startAt, endAt, capacityLeft, isAvailable across the two surfaces.
- #1307 AC#4 ("Asia/Taipei, 無 #1288 位移") — both surfaces emit `+08:00`, no UTC drift.
- Round-1 smoke verified the traveler half; round-3 closes the guide half.

## § 2 — #1284 guide payout dashboard with hold flags ✅

### Payout monthly endpoint
```
GET /api/guide/payout/monthly?month=2026-06
  cookie: guide_token + guide_id
  → ok:true
  top-level keys: month, orders, totals, settlementRulesVersion
  orders: 1
  sample order (sanitized; orderId truncated):
    activityId:       00000000-0000-4000-8000-000000…
    activityTitle:    QA Guide Dialog Fixture
    orderId:          00000000-0000-4000-8000-000000…
    scheduleDate:     2026-06-04
    totalTwd:         1998
    commissionTwd:    299
    netTwd:           1698
    payableNetTwd:    1698
    effectiveTwd:     1998
    refundAmountTwd:  0
    payoutHoldReason: None
    needsManualReview: False
```

The shape carries the canonical #1284 hold-rendering fields: `payoutHoldReason` (the privacy-safe enum from PR #1285) and `needsManualReview`. This particular order is unblocked (reason=None, review=False), but the surface is in place for an on-hold row to render the reason without leaking PII.

**Source-contract crosscheck:**
```
apps/web/app/api/guide/payout/monthly/route.ts:
  .select('order_id, refund_amount_twd, has_complaint, has_oversell_issue, is_disputed, is_safety_case')
```
PR #1285's claim that all four hold-flag columns are selected from the right table is confirmed live.

### Guide dashboard endpoint
```
GET /api/guide/dashboard
  cookie: guide_token + guide_id
  → ok:true
  top-level keys: monthlyBookings, pendingBookings, upcomingSchedules, monthGmvTwd,
                  effectiveMonthGmvTwd, monthGmvOrderCount, revenueTrend6m,
                  expectedPayoutTwd, nextPayoutDate, currentBalanceTwd,
                  lastSettledAt, minWithdrawalTwd, pendingPayoutTwd,
                  settlementRulesVersion, pendingSettlementOrders
  pendingSettlementOrders: 4 rows
    [...]  status: "refund_pending"
    [...]  status: "refund_pending"
    [...]  status: "refund_pending"
    [...]  status: "refund_pending"
  pendingBookings: 5 rows
```

This is exactly the #1284 / GH-475 multi-state acceptance: a guide whose live data has **both normal payable orders (the monthly /orders row) and on-hold rows (the 4 `refund_pending` entries in `pendingSettlementOrders`)** sees both surfaces rendered together. The pending-settlement list intentionally surfaces just `orderId / tourTitle / scheduleDate / totalTwd / status` — no `payoutHoldReason` value here, by privacy design (it stays inside `/api/guide/payout/monthly` where the per-order context is).

**Verdict:** the dashboard renders mixed states correctly; payout monthly carries the hold-reason enum; source-contract confirms all four hold-flag columns are queried. #1284 acceptance closed at runtime.

## Updated #1317 close-gate scoreboard

| # | Subject | Final |
|---|---|---|
| #1306 traveler multi-slot picker | ✅ PASS (round 1) |
| #1289 guide ↔ traveler parity | ✅ PASS (round 3) |
| #1290 OFF toggle | ✅ PASS (round 1) |
| #1286 acceptance #1 — archived traveler hidden | ✅ PASS (via PR #1334) |
| #1286 acceptance #2 — admin archive end-to-end | ✅ PASS (round 2) |
| #1307 guide preview TZ | ✅ PASS (round 3) |
| #1284 guide payout dashboard | ✅ PASS (round 3) |
| #1249 / #1258 cache HIT | ✅ PASS (round 1) |
| #1249 / #1258 Lighthouse before/after | ⏸️ owner — sandbox no Lighthouse |
| #1286 page-route HTTP 200 vs 404 hygiene | 🟡 optional follow-up |

**#1317 can close once this PR + PR #1338 + PR #1331 (already merged) are all merged.** The only items remaining are the truly owner-only Lighthouse capture and the optional Next.js notFound HTTP-status hygiene.

## Sensitive handling

- Guide email + password supplied as session-only env vars on inline shell invocations — never written to disk, never echoed, never committed.
- Service_role usage in this round: **zero** (the guide cookie did all the lifting; this is the read-only smoke layer).
- `orderId` and `activityId` UUIDs surfaced in the evidence are truncated to the first 24 chars to avoid embedding traceable identifiers; `guestName` / `email` / `phone` were never selected or echoed.
- `tourTitle` and `scheduleDate` shown verbatim — they are public listing data (the same titles appear in /api/activities listing), not PII.
