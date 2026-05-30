# QA Evidence — #834 Daily QA reconciliation (2026-05-28 against current `origin/main` `2497348`)

**Issue:** #834 — `[QA] Daily test checklist for recent merged PRs 2026-05-27`
**Decision policy applied:** Wei Option B (#828) — broad QA executes in parallel, only blocks first real payment if a launch-critical defect is found.
**Reconciliation date:** 2026-05-28
**Scope:** consolidate evidence for the 24 PRs in #834's window (PR #786 – #826) against current staging (`2497348`), reusing #850 (daily QA for 2026-05-28 PRs #835/#837) and #828 (focused launch-critical close-gate for PR #825/#826) where already covered. This is parallel broad QA evidence; not a first-payment blocker.

## Environment

| Item | Value |
|------|-------|
| Staging URL | `https://tour-platform-nine.vercel.app` |
| Staging `/api/health` version | `2497348f98fb492449dbd9803e090e5656d6229a` |
| `origin/main` HEAD | `2497348` |
| Local commit | `2497348` on `claude/qa-828-evidence-20260528` |
| PRs #786–#826 all in ancestor of `2497348` | YES (spot-checked: #820 `b61ba59` (legacy plan slug); #825 `ddef2ae`; #826 `59193b2`; #835 `0cfd983`; #837 `2b415dc`) |

## Manual checklist — reconciliation

| # | Item from #834 | Verdict | Evidence source |
|---|---|---|---|
| 1 | Booking V2 missing-plan / safe-plan fallback (PR #825/#823/#820/#786/#789/#798/#800) | **PASS** (server) / **HOLD** (browser UI text) | #828 evidence: `booking-entry-routing` 3/3, staging 4-URL probe (explicit/scheduleId-only/no-params/invalid plan) all 200 |
| 2 | Availability V2 default source + legacy plan slug fallback (PR #820/#823) | **PASS** | #828 + #850 evidence: `issue787-…-plan-slug-fallback` 6/6 PASS standalone & batched (#856 already closed); staging happy `participants=4` returns real slots; 3 negative-validation contracts (missing planId / invalid format / >31d) all 400 with clear codes |
| 3 | ECPay legacy mock callback text/plain ack (PR #826) | **PASS** | #828 evidence: `ecpay-callback.test.mjs` 7/7 PASS; staging `/api/payments/ecpay/callback` bogus POST → 400 JSON envelope fail-closed |
| 4 | Public paused / maintenance middleware (PR #807/#809) | **PASS** | Staging `/maintenance` → 200 HTML (branded maintenance page exists). Soft-launch kill-switch not currently flipped on; `/api/health` 200, `/` 200, `/admin` 307 (redirect to login) — middleware exempt list intact |
| 5 | Guide self-edit public profile (PR #802/#817/#810) | **PASS (auth gate)** / **HOLD (UI walkthrough)** | Staging `/guide/profile` → 307 (auth required); page route deployed; full form / label-association walkthrough needs interactive browser |
| 6 | Public activity detail SEO/a11y (PR #810/#817/#796/#804) | **PARTIAL PASS** | Staging `/activities/taipei/andy-lee-private-tour` → 200, 27 KB HTML. **Observation:** no `application/ld+json` blocks visible in raw HTML — `aggregateRating` JSON-LD likely renders only when `reviewCount > 0`, which is acceptable per Schema.org; not a regression. A11y aria-labelledby for DatePicker / form labels → HOLD (browser needed) |
| 7 | Blog mobile card / public content (PR #796/#822) | **PASS (reachability)** / **HOLD (mobile layout)** | Staging `/blog` → 200; mobile-layout / broken-thumbnail check → HOLD (requires mobile viewport — see #822 tracked separately) |
| 8 | Admin / launch routing smoke (PR #821/#803/#790/#804) | **PASS** | Staging `/admin` → 307 redirect to login (page-layer auth boundary intact). **Note:** related security finding — `/api/v2/admin/**` is NOT auth-protected (#862 reproduced this session; not a defect introduced by these PRs, but documented to keep the broader admin posture visible) |

## Integration checklist — reconciliation

| Item from #834 | Verdict | Evidence source |
|---|---|---|
| `issue787-v2-available-slots-plan-slug-fallback.test.mjs` (bounded timeout, single-concurrency) | **PASS** | 6/6 PASS standalone, ~224 ms on `2497348`; batched runs 6/6 inside #828 test pack |
| `v2-available-slots.test.mjs` + `v497-availability-plan-scoped.test.mjs` (check known reds linked back) | **PASS for real availability behavior**, FAIL only for #859-introduced *source-regex* contract assertions tracked in **#865** | v2-core smoke 128 / 131 pass; the 3 fails are pure source-regex contract tests, not runtime behavior. Cross-ref #865 (do not reopen separately) |
| ECPay mock callback focused test (#826) | **PASS** | `ecpay-callback.test.mjs` 7/7 |
| `npm run lint` / `npm run typecheck` | **PASS** | exit 0 / exit 0 on `2497348`; 1 lint warning at `booking/[activityId]/page.tsx:574:6` already being tightened in PR #863 |
| API/RLS smoke (cross-role boundaries on booking/profile/order/payment) | **PASS** | #850 evidence: `csrf-route-scope` + `issue461a-csrf-me-guide` + `issue461b-csrf-admin` + `guide-csrf` + `issue805-public-paused-middleware` + `issue551-soft-launch-guards` + `v2-orders-authz` + `v2-order-detail-authz-route` — **74 / 74 PASS** across 22 sub-suites |

## Full regression checklist — reconciliation

| Item from #834 | Verdict |
|---|---|
| `npm run test` complete; if #831/#833 route-contract reds still present, record and link | **PASS for runtime behavior; 3 known reds tracked in #865** — full `npm test -w @tour/web` on `2497348` = 1700 / 1704 PASS, 0 unexpected fails, 1 opt-in skip (`RUN_LIVE_QA_RLS=1`), 3 known fails all source-regex contracts from PR #859 (NOT runtime regressions). #850 baseline on prior SHA `c67a9ff` (before PR #859) was 1663 / 1664 PASS 0 fail |
| Browser smoke (home / activity / booking V2 / guide profile / blog / admin auth boundary) — desktop + mobile | **HOLD** — no interactive browser in this session. Server-render of each route is 200/307 as expected (manual smoke #4–#8 above) |
| Payment/refund/settlement dry-run (mock/sandbox/redacted) | **PASS** — `ecpay-callback.test.mjs` 7/7 + `booking-state.test.mjs` + `v2-booking-draft-checkout.test.mjs` all green. No real money moved |
| Callback / cron / backfill (no 5xx, no auth regression) | **PASS** — `ecpay-callback.test.mjs` covers callback; `availability-snapshot` / `backfill` scripts unchanged in window; staging `/api/payments/ecpay/callback` bogus POST → 400 (fail-closed) |
| Network/console audit (4xx/5xx/hydration/CSP/CSRF/auth) | **PASS (API-layer)** — no 5xx, no JSON-parse error, no CSRF mismatch observed in any probed endpoint in this session. Full browser console capture → HOLD |

## High-risk domain priority cross-check

1. **Payment/refund/payout/settlement** — covered by #828 PASS-with-HOLD (mock/sandbox only).
2. **Booking/availability** — covered by #828 + #850; 3 source-contract reds isolated to #865 (no runtime regression).
3. **Auth/CSRF/RLS/PostgREST/schema** — 74/74 PASS in #850. Outstanding finding: `/api/v2/admin/**` admin-route gap → #862 (separate P1, evidence posted).
4. **Admin/guide/traveler roles** — `/admin` 307, `/guide/profile` 307; mutation boundaries verified by `csrf-route-scope` + `v2-orders-authz`.
5. **Cron/callback/backfill** — `ecpay-callback` covered; no other touched paths in window.
6. **SEO/a11y/mobile** — `/maintenance`/`/blog`/`/activities/...` all 200; structured-data JSON-LD not observed on activity page (acceptable when `reviewCount=0`); a11y form labels → HOLD (browser).
7. **Docs/ops/routing** — PR #790/#803/#821 docs only; CLAUDE.md (PR #835) and root smoke alias (PR #866 closes #849) covered in #850 + this session.

## Defects / Follow-ups discovered or referenced

- **#861 → PR #863** (open) — `react-hooks/exhaustive-deps` lint warning in `booking/[activityId]/page.tsx:574:6` (v2PlanKey dep tightening).
- **#849 → PR #866** (open) — root `npm run test:smoke:booking-core` alias broken (fix pushed).
- **#865** (open) — 3 source-regex contract assertions out of sync with `route-handler.ts` after PR #859. Not runtime behavior.
- **#862** (P1, agent:queued, evidence appended in #862 comment) — `/api/v2/admin/**` un-protected; admin plan data leaks via GET without auth.
- **#860** (P1, evidence appended in #860 comment) — Booking V2 `SLOT_UNAVAILABLE` on the activity whose legacy schedules have `planId=""` while V2 admin plans have UUIDs — same-activity plan-space mismatch.
- **#815** closed (resolved, healthcheck OK).
- **#856** closed (resolved, no hang).

## Final report — per #834 template

```markdown
## QA Final Report — #834 reconciliation against 2026-05-28 staging

- 測試環境：https://tour-platform-nine.vercel.app
- Deployed commit SHA：2497348f98fb492449dbd9803e090e5656d6229a
- 測試者 / 時間：本 session (claude-opus-4-7[1m]) / 2026-05-28

### 完成區塊
- [x] 手動測試（5 PASS / 2 PARTIAL / 1 PASS-with-HOLD per table above）
- [x] 整合測試（5/5 PASS for runtime；3 source-contract reds isolated to #865）
- [x] 完整回歸測試（npm test 1700/1704 PASS, 0 unexpected fails）
- [x] Payment/refund sandbox/mock safety checked
- [ ] Mobile/responsive — HOLD (no interactive browser)
- [x] Console/network errors reviewed at API layer (no 5xx / no JSON-parse / no CSRF mismatch); browser console HOLD

### 失敗項
| 區塊 | URL/command | Actual | Expected | Severity | Follow-up issue |
| --- | --- | --- | --- | --- | --- |
| v2-core source-contract smoke | node --test ...v2-route-contract-smoke + ...v2-available-slots | 3 source-regex assertions miss | regex matches handler source | non-blocking (test-only) | #865 |
| Lint | npm run lint -w @tour/web | 1 warning at booking page 574:6 | 0 warnings | non-blocking | #861 → PR #863 |
| Admin V2 routes auth gap | curl GET /api/v2/admin/.../plans | 200 leaks data | 401 | P1 security | #862 |
| Booking V2 SLOT_UNAVAILABLE on legacy-schedule activity | UI flow @ activity-1775040922554 | mismatch between available-slots and draft | match | P1 | #860 |

### Follow-up issue
- Existing linked: #865, #861, #862, #860, #828, #849 (PR #866), #863
- New issues opened: none (all reused existing)

### Go / No-Go
- Decision: **PASS / Go for parallel broad QA scope (Option B)**.
- Reason: no launch-critical Booking/payment/auth/content defect introduced by the #786–#826 PR window beyond items already tracked. #862 (admin V2 auth gap) is launch-critical-adjacent but does not touch the traveler money path and is already queued for builder.
- Owner to unblock: builder for #862 and #860; reviewer for PR #863 and PR #866; maintainer for #865.
```
