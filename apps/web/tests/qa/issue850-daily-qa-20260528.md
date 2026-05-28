# QA Evidence: 2026-05-28 Daily Test Checklist (issue #850)

**Issue:** #850  
**Date executed:** 2026-05-28  
**Time window:** Asia/Taipei 2026-05-27 07:07:21 → 2026-05-28 07:07:21 (UTC 2026-05-26T23:07:21Z → 2026-05-27T23:07:21Z)  
**PRs covered:**
- PR #837 — `fix(booking-v2): drop stale scheduleId after date change` (merge SHA `2b415dc1...`)
- PR #835 — `docs: add CLAUDE.md with build commands and architecture overview` (merge SHA `0cfd9835...`)

**Risk level:** LOW (UI-only booking guard + docs; no payment/auth/DB-migration changes).

## Environment / Pre-conditions

| Item | Value |
|------|-------|
| Staging URL | `https://tour-platform-nine.vercel.app` |
| `/api/health` | 200, `version=c67a9ff9e99d1ce047f4a1a3980132ed23b58c0d` |
| Deployed SHA contains PR #837 (`2b415dc`) | YES (`git merge-base --is-ancestor` OK) |
| Deployed SHA contains PR #835 (`0cfd983`) | YES |
| Local checkout SHA | `8c8e1d0` on branch `claude/open-issues-qa-review-76Juq` (only docs commit on top of `69777a2`) |
| Node | 22 (`.nvmrc`) |
| `npm install` | clean (384 entries, react/next/@types/node present) |

No real production payment, refund, payout, settlement, or PII actions performed.

## Automated Test Results

### Lint (`npm run lint -w @tour/web`)
**PASS — exit 0, 0 errors, 1 warning.**

- `app/booking/[activityId]/page.tsx` 574:6 — `react-hooks/exhaustive-deps`: `useEffect` missing dep `v2PlanKey` (the probeOnePersonAddOn effect uses `v2PlanKey` in the URL but only depends on `activeScheduleId`). Pre-existing/introduced by #837; behavior is correct in practice because `matchedScheduleIdForSelectedDate` already lists `v2PlanKey` in its `useMemo` deps and feeds into `activeScheduleId`, but ESLint cannot prove the transitive chain. **Non-blocking; recommend a follow-up to add `v2PlanKey` to the effect deps for clarity.**

### Typecheck (`npm run typecheck -w @tour/web`)
**PASS — exit 0, no errors.**

### Focused regression — PR #837
`tests/ui/booking-v2-min-participants-one-date.test.mjs`: **6/6 PASS**, including the new assertion:

> `v2 shell keeps initial URL scheduleId guard and resolves matching scheduleId after date change`

…verifying source contains `urlDate`, `activeUrlScheduleId = urlScheduleId && (!urlDate || urlDate === selectedDate) ? urlScheduleId : ''`, `matchedScheduleIdForSelectedDate` useMemo, exactPlan / allPlan / first fallback logic, and that `scheduleParam` is built from `activeScheduleId` (not the raw URL `scheduleId`).

### V2 core smoke (`test:smoke:v2-core`)
**131/131 PASS** (v2-available-slots / v2-booking-draft-checkout / booking-state / ecpay-callback / v2-route-contract-smoke). Duration ≈ 0.7s.

### Booking / payment / plan-fallback batch
`v2-booking-draft-checkout`, `booking-state`, `ecpay-callback`, `issue787-v2-available-slots-plan-slug-fallback`, `issue825-booking-page-plan-fallback`: **112/112 PASS**.

Note: this confirms PR #836's Defect B (issue787 standalone hang) is **no longer reproducible** on current main — issue787 test runs 6/6 and finishes in ~270ms.

### Auth / CSRF / soft-launch / orders authz batch
`csrf-route-scope`, `issue461a-csrf-me-guide`, `issue461b-csrf-admin`, `guide-csrf`, `issue805-public-paused-middleware`, `issue551-soft-launch-guards`, `v2-orders-authz`, `v2-order-detail-authz-route`: **74/74 PASS** across 22 sub-suites.

### Full test suite (`npm test -w @tour/web`)
**1663/1664 PASS, 0 FAIL, 1 SKIP** in 11.16s.

The single skipped test is `traveler auth through Next API can create pending_moderation row owned by auth.uid()`, opt-in via `RUN_LIVE_QA_RLS=1` (expected — requires live env, not regression).

## Read-only staging smoke (curl, sandbox/mock only — no payment mutations)

| Probe | Result |
|------|--------|
| GET `/api/health` | 200, version `c67a9ff` (matches main) |
| GET `/` | 200 |
| GET `/activities/taipei/andy-lee-private-tour` | 200 |
| GET `/admin` (no session) | **307 → `/admin/login?next=%2Fadmin`** (auth boundary OK) |
| GET `/api/activities` | 200 |
| GET `/api/activities/kaohsiung-chaishan-cave-experience` | 200 (plans=2, schedules=11) |
| GET `/api/v2/activities/<UUID>/available-slots` missing `planId` | 400 `VALIDATION_ERROR: planId is required` |
| Same with `planId=default` | 400 `VALIDATION_ERROR: Invalid planId format` |
| Same with date range > 31 d | 400 `VALIDATION_ERROR: Date range cannot exceed 31 days` |
| **Happy path** `planId=half-day&dateFrom=2026-04-01&dateTo=2026-04-01` | **200**, well-formed envelope (`success`, `timezone`, `activityId`, `planId` resolved to UUID `0e975d65-…`, `selectedPlan`, `slots`, `reason: MIN_PARTICIPANTS_NOT_MET`) |
| **Stale-scheduleId cross-date**: schedule belongs to 2026-04-01, query `dateFrom=2026-06-15&dateTo=2026-06-15` with that `scheduleId` | **200**, `slots: []` with same `reason: MIN_PARTICIPANTS_NOT_MET` — **no cross-date pollution from stale `scheduleId`** on the API path |

## Static / runtime verification of PR #837

The fix in `apps/web/app/booking/[activityId]/page.tsx` introduces:

1. `const urlDate = searchParams.get('date') || ''`
2. `const activeUrlScheduleId = urlScheduleId && (!urlDate || urlDate === selectedDate) ? urlScheduleId : ''` — discards URL `scheduleId` once the user picks a different date.
3. `matchedScheduleIdForSelectedDate` — recomputes the schedule for the currently selected date, preferring same-date `open` schedules with remaining capacity, then exact plan match, then plan-less ("allPlan") fallback, then first candidate.
4. `const activeScheduleId = activeUrlScheduleId || matchedScheduleIdForSelectedDate` — single source of truth.
5. Both `probeOnePersonAddOn` and `fetchSlots` now build the `scheduleId` query param from `activeScheduleId` (no more raw `urlScheduleId`), and effect dep arrays use `activeScheduleId`.

Combined with the **API-side cross-date stale-scheduleId smoke above (slots:[] with clear reason)**, the stale-`scheduleId` defect is guarded at both the UI source-of-truth layer and the backend response shape.

## Static / runtime verification of PR #835 (`CLAUDE.md`)

- File is markdown only, no secrets, no inline tokens.
- Build/test commands cited (`npm run dev|build|lint|typecheck|test`) all exist verbatim in root `package.json` (workspace proxies to `@tour/web`). PASS.
- `test:smoke:phase12-full` script referenced via `apps/web/package.json` is real (`bash ../../scripts/phase12/run-full-regression.sh`); the helper exists at `scripts/phase12/run-full-regression.sh`. PASS.
- CLAUDE.md does **not** reference the broken `test:smoke:booking-core` root alias (which is the subject of separate issue #849 — already triaged); therefore no docs-consistency conflict introduced by PR #835.

## Manual checklist — per #850

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| 1 | Booking V2 date change clears stale `scheduleId` (URL + UI state) | **PASS** (via focused regression + API stale-cross-date smoke + static code review). Browser-eyeball confirmation: **HOLD — not automatable in this session (no interactive browser).** | focused 6/6, API stale-cross-date 200 slots:[], static review of `activeUrlScheduleId` guard |
| 2 | Public activity → Booking V2 deep-link date switch | PARTIAL PASS — activity detail page 200 on staging; full deep-link round-trip needs interactive browser (HOLD). | staging activity detail 200; static code shows URL-vs-selectedDate guard |
| 3 | Mobile Booking V2 one-date / min-participants spot-check | **HOLD — needs mobile-viewport interactive browser; not automatable in this session.** Source-level mobile dedup verified by focused test 5 (`deduplicates same-date slots`). | tests/ui/booking-v2-min-participants-one-date.test.mjs 5/6, 6/6 |
| 4 | available-slots API query consistency | **PASS** | staging happy 200 + 3× negative 400; cross-date stale scheduleId returns slots:[] cleanly |
| 5 | CLAUDE.md developer onboarding sanity | **PASS** | All 5 cited commands present; no secrets; phase12 helper exists |
| 6 | Baseline UI smoke (`/`, activities, admin auth boundary) | **PASS** | `/` 200, activity page 200, `/admin` 307 → login |

## Integration checklist — per #850

| Item | Verdict |
|------|---------|
| Focused Booking V2 regression | PASS (6/6) |
| Route/API contract smoke (positive + negative paths) | PASS (v2-core 131/131; staging negatives 3× clean) |
| Auth / CSRF / RLS boundary | PASS (74/74 across CSRF, soft-launch, orders authz) |
| Docs consistency vs `package.json` | PASS for PR #835 references; #849 is the only outstanding alias gap (already tracked) |
| Console/network capture during date switch | HOLD — needs interactive browser; API-layer regression covered by automated smoke |

## Full regression checklist — per #850

| Area | Verdict | Notes |
|------|---------|-------|
| UI smoke (desktop) | PARTIAL PASS — endpoint 200s; full browser walkthrough HOLD (no interactive browser) | `/`, activity, `/admin` redirect verified |
| API / DB / RLS | PASS | available-slots + RLS isolation suites green; **full `npm test` 1663/1664 pass, 0 fail, 1 RLS-live skip (opt-in)** |
| Auth / CSRF | PASS | 74/74 + full suite green |
| Payment / refund / settlement (sandbox/mock/read-only) | PASS | ecpay-callback + booking-state PASS; no real-money actions |
| Admin / guide / traveler roles | PASS | authz suites green; `/admin` redirect to login |
| Cron / callback / backfill | N/A (no PRs touched these today) |
| Mobile / responsive | HOLD — needs mobile viewport in interactive browser |
| Observability | PASS — no 5xx, no JSON parse error, no CSRF token mismatch observed in any probed endpoint |

## Defects / Follow-ups

- **lint warning** — `app/booking/[activityId]/page.tsx:574:6` missing `v2PlanKey` dep in probeOnePersonAddOn effect. Behaviorally correct via `activeScheduleId` chain; recommend tightening dep list. Non-blocking, **suggest a small follow-up issue/PR** (out of scope for #850 per the issue's own instruction not to modify production code).
- **#849** (root `test:smoke:booking-core` alias broken) — already tracked; not regressed by #835 (CLAUDE.md does not cite that alias).

No launch-critical Booking / payment / auth / content defects were found.

## Final report (per #850 template)

```
測試環境：https://tour-platform-nine.vercel.app (deploy SHA c67a9ff)
Commit SHA：local 8c8e1d0 (claude/open-issues-qa-review-76Juq); staging c67a9ff (includes PR #837 2b415dc, PR #835 0cfd983)
完成區塊：
- 手動測試：PASS with HOLDs — 6 項中 4 項自動化/API/staging 證據完整 PASS；2 項 (mobile viewport / 完整 browser console capture) HOLD，因本 session 無互動式 browser
- 整合測試：PASS — focused 6/6 + v2-core 131/131 + auth/csrf/authz 74/74 + booking/payment/plan-fallback 112/112；staging stale-scheduleId cross-date 200 slots:[] 無污染
- 完整回歸：PASS / partial HOLD — 自動化全綠（見 appendix）；browser UI walkthrough 與 mobile viewport HOLD
失敗項：
- 無 production / payment / auth 失敗
- 1 個非阻擋 lint warning：booking page 574:6 useEffect 缺 v2PlanKey dep（行為正確，建議 follow-up）
Follow-up issue：
- (建議) 修補 booking page 574:6 react-hooks/exhaustive-deps 警告
- (既有) #849 root smoke alias 修復
Go/No-Go：GO — PR #837 stale scheduleId 修正在 UI 與 API 兩層皆驗證；PR #835 docs 與真實 package.json 一致；無 launch-critical 缺陷
```
