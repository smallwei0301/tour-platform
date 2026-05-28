# QA Evidence — #828 Focused Launch-Critical QA Gate (2026-05-28 refresh)

**Issue:** #828 — `[QA Gate] Focused launch-critical QA before first real payment`
**Decision policy applied:** Option B (Wei, 2026-05-27) — focused critical QA only before first real payment.
**Re-verification date:** 2026-05-28
**Scope of this refresh:** restate AI evidence for PR #825 / PR #826 against the *current* `origin/main` and `staging` (deploy SHA has advanced since the original evidence in [#828 comment 4545815273](https://github.com/smallwei0301/tour-platform/issues/828#issuecomment-4545815273)).

## Environment / Pre-conditions

| Item | Value |
|------|-------|
| Staging URL | `https://tour-platform-nine.vercel.app` |
| `/api/health` | 200, `version=2497348f98fb492449dbd9803e090e5656d6229a` |
| `origin/main` HEAD | `2497348` (`feat(home): swap 特色主題 …` — PR #864) |
| Staging matches `origin/main` | YES (`/api/health version == origin/main HEAD`) |
| PR #825 `ddef2ae` ancestor of staging SHA | YES (`git merge-base --is-ancestor ddef2ae 2497348`) |
| PR #826 `59193b2` ancestor of staging SHA | YES |
| Also-in-staging: PR #837 (`2b415dc`), PR #835 (`0cfd983`) | YES, YES |
| Local checkout SHA | `2497348` on branch `claude/qa-828-evidence-20260528` (evidence-only; no production code changes) |

No real production payment, refund, payout, settlement, or PII actions were performed. All probes used bogus/test payloads on read-only endpoints.

## Automated test results (on `origin/main 2497348`)

### Lint
`npm run lint -w @tour/web` → exit 0, **0 errors, 1 warning** (`app/booking/[activityId]/page.tsx:574:6` — `v2PlanKey` exhaustive-deps; behavior correct, being tightened in **PR #863**).

### Typecheck
`npm run typecheck -w @tour/web` → exit 0, no errors.

### Focused #828 critical-path test batch
`node --test` over the 7 files most relevant to AC1–4 + auth/CSRF boundary:

```
tests/unit/booking-entry-routing.test.mjs            (PR #825 AC1+AC2)
tests/api/ecpay-callback.test.mjs                    (PR #826 AC3+AC4)
tests/api/v2-booking-draft-checkout.test.mjs         (V2 draft boundary)
tests/api/booking-state.test.mjs                     (booking-state machine)
tests/api/issue787-v2-available-slots-plan-slug-fallback.test.mjs  (#787 legacy slug fallback)
tests/api/csrf-route-scope.test.mjs                  (CSRF role boundary)
tests/api/v2-orders-authz.test.mjs                   (RLS / order ownership)
```

Result: **129 / 129 PASS, 0 fail, 0 skipped, ~1.95s** on `2497348`.

`issue787-v2-available-slots-plan-slug-fallback.test.mjs` runs **standalone** too: 6 sub-tests PASS, 224 ms — confirms #856 hang no longer reproduces (already closed).

## Read-only staging probes (no payment mutations)

### PR #825 — Booking V2 URL plan inference (server-side render)

| URL | HTTP | Notes |
|-----|------|-------|
| `/booking/kaohsiung-chaishan-cave-experience?plan=half-day&date=2026-06-15` | 200 | explicit plan |
| `/booking/kaohsiung-chaishan-cave-experience?scheduleId=03c6b15c-…` | 200 | scheduleId only |
| `/booking/kaohsiung-chaishan-cave-experience` | 200 | no params |
| `/booking/kaohsiung-chaishan-cave-experience?plan=nonexistent-plan&date=2026-06-15` | 200 | invalid plan |

Server-side render succeeds in all four cases without 5xx. Client-side fail-closed UI behavior for the *ambiguous / invalid plan* path is governed by `inferPlanIdForBookingUrl` + `canRunV2PlanFlow` (already PASS in `booking-entry-routing.test.mjs` 3/3) and the V2 shell, but the visible "請選擇方案 / fail-closed message" rendering remains a browser-smoke item → **HOLD** (this session has no interactive browser).

### PR #826 — ECPay callback parsing

| Request | HTTP | Body / CT | Verdict |
|---------|------|-----------|---------|
| `GET /api/payments/ecpay/callback` | 405 | — | method-not-allowed, expected |
| `POST /api/payments/ecpay/callback` (bogus `MerchantTradeNo`, `RtnCode`, `CheckMacValue`) | **400** | `application/json` `{"ok":false,"error":{"code":"INVALID_REQUEST","message":"orderId is required"}}` | fail-closed with clear error envelope, no 5xx, no crash |
| `GET/POST /api/payments/ecpay/callback/mock` | 404 | — | path absent from current staging; the legacy/mock branch was internalized into `/api/payments/ecpay/callback` after #787 — `tests/api/ecpay-callback.test.mjs` covers the text/plain `1\|OK` ack path under the same handler |

### Booking V2 availability engine sanity

```
GET /api/v2/activities/c0000003-0000-0000-0000-000000000001/available-slots
   ?planId=half-day&dateFrom=2026-06-01&dateTo=2026-06-15
   &timezone=Asia/Taipei&participants=4
→ 200 success
→ slots: [
     { startAt: "2026-06-01T09:00:00+08:00", endAt: "2026-06-01T13:00:00+08:00",
       capacityLeft: 8, bookingType: "scheduled", isAvailable: true },
     ...
   ]
→ planId resolved slug "half-day" → UUID "0e975d65-…" (success)
→ selectedPlan.maxParticipants: 12
```

V2 availability primary path returns real-data slots for `participants=4` (the unformed-group min). Same path under `participants=1` correctly returns `slots:[]` with `reason:MIN_PARTICIPANTS_NOT_MET` (see #850 evidence). Both behaviors match the V2 contract.

### Negative validation contracts (carry-over from #850, still green on `2497348`)

| Probe | Verdict |
|-------|---------|
| `available-slots` missing `planId` | 400 `VALIDATION_ERROR: planId is required` |
| `planId=default` (not UUID/slug) | 400 `VALIDATION_ERROR: Invalid planId format` |
| `dateFrom`/`dateTo` > 31 days apart | 400 `VALIDATION_ERROR: Date range cannot exceed 31 days` |
| stale `scheduleId` cross-date | 200 `slots:[]` (no pollution) |

## Acceptance criteria (#828)

| AC | Verdict |
|----|---------|
| Test report records env + commit SHA, no secrets | ✅ |
| PR #825: explicit-plan URL works to pre-checkout boundary | ✅ (server-render 200 + `booking-entry-routing` 3/3) |
| PR #825: scheduleId-without-plan derives only when unambiguous | ✅ (`booking-entry-routing` AC2 covers single-active-plan derivation + ambiguous fail-closed `''`) |
| PR #825: ambiguous/invalid missing-plan fails closed without half orders | ✅ (test coverage); **browser-visible error string HOLD** |
| PR #826: exact `text/plain` `1\|OK` ack accepted | ✅ (`ecpay-callback.test.mjs` 7/7 incl. text-ack path) |
| PR #826: JSON response handling still works + unexpected non-ok still safe | ✅ (`ecpay-callback.test.mjs` covers; staging POST bogus → 400 JSON fail-closed) |
| Linked back from #818 / #824 or final comment on #828 | (this evidence doc + #828 comment) |
| FAIL/HOLD has linked follow-up | ✅ (HOLDs below) |
| Final conclusion | **PASS with accepted HOLD** (browser smoke) |

## HOLDs (not closing as launch-critical blockers)

1. **Browser smoke for PR #825** — visible fail-closed UI text and "請選擇方案" prompt under ambiguous-plan / invalid-plan / no-params client navigation. Server-render is 200 in all 4 URL shapes; underlying plan-inference logic has unit coverage. Per Wei Option B, broad browser smoke continues in parallel and is not a first-payment blocker unless a critical defect is found.
2. **Browser confirm of `1\|OK` ack in network panel** — `ecpay-callback.test.mjs` exercises the request/response shape at the API layer; full browser DevTools confirmation is an evidence nice-to-have, not a critical blocker.
3. **PR #863** (closes #861) — `v2PlanKey` exhaustive-deps tightening on `booking/[activityId]/page.tsx:574:6`. Non-blocking lint warning; behavior already correct.
4. **#865** (`closes` action item) — 3 source-contract assertion regressions introduced by PR #859. Out of scope for #828; tracked separately. Does not affect the booking/payment runtime behavior verified above.

## Cross-reference

- #850 daily QA evidence (commit `c730868` on `claude/open-issues-qa-review-76Juq`) — independent verification of overlapping surface against staging `c67a9ff`.
- Original #828 AI evidence — [#828 comment 4545815273](https://github.com/smallwei0301/tour-platform/issues/828#issuecomment-4545815273) (2026-05-26, base SHA `ddef2ae`/`603b136`).

## Verdict

**PASS with accepted HOLD** for the first-payment QA gate scope (Option B).

The launch-critical money-moving + traveler-conversion path (Booking V2 entry → plan inference → V2 availability → ECPay callback parsing → CSRF/auth/RLS boundaries) is verified by 129/129 PASS tests and clean staging probes against the current deploy SHA. HOLDs above are browser-smoke nice-to-haves and minor follow-ups, none of which are launch-critical defects under the Option B policy.
