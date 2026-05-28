# QA Evidence — Issue #850: Daily Test Checklist 2026-05-28

**Date:** 2026-05-28
**Prepared by:** Claudia (automated QA agent)
**Issue:** [#850 — \[QA\] Daily test checklist for recent merged PRs 2026-05-28](https://github.com/smallwei0301/tour-platform/issues/850)

---

## PRs in Scope

| PR | Title | Merged (CST +0800) | Branch | Type |
|----|-------|--------------------|--------|------|
| [#835](https://github.com/smallwei0301/tour-platform/pull/835) | docs: add CLAUDE.md with build commands and architecture overview | 2026-05-27 08:23:16 | `claude/new-session-4ra75` → `main` | Docs-only |
| [#837](https://github.com/smallwei0301/tour-platform/pull/837) | fix(booking-v2): drop stale scheduleId after date change | 2026-05-27 11:21:40 | `kanban/issue-787-stale-schedule-date-change` → `main` | Code fix |

**Commit SHAs:**
- PR #837 merge commit: `2b415dc13f165f91d364b91626971a8575b9b304`
- PR #835 merge commit: `0cfd9835cef52db9a035379954624770722e918d`

---

## PR #835 — docs: CLAUDE.md Review

**Files changed:** `CLAUDE.md` (docs-only, 1 file)

**Checks:**
- [x] File is documentation only — no runtime code, no backend, no migrations
- [x] No secrets, credentials, or tokens in file content
- [x] Build/test commands are present and consistent with repo structure (`npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`)
- [x] Architecture overview references correct paths (`apps/web/`, `supabase/migrations/`, etc.)
- [x] No conflicting or misleading instructions for agents

**Verdict: PASS** — docs-only change, zero production runtime impact.

---

## PR #837 — fix(booking-v2): drop stale scheduleId after date change

**Files changed:**
- `apps/web/app/booking/[activityId]/page.tsx` (+38 / -10)
- `apps/web/tests/ui/booking-v2-min-participants-one-date.test.mjs` (+13 / 0)

**What changed:** UI-only query construction fix. When a traveler changes to a different date in Booking V2, the stale `scheduleId` from the URL is now dropped. The initial deep-link behavior is preserved when the URL `date` still matches the selected date. No backend/API/payment/auth/DB/migration changes.

---

## Automated Test Results

### Focused Regression — `booking-v2-min-participants-one-date.test.mjs`

```
Command: cd apps/web && node --test tests/ui/booking-v2-min-participants-one-date.test.mjs
```

| Test | Result |
|------|--------|
| v2 shell clamps participants to effective minimum and never posts below-min draft | PASS (1248ms) |
| v2 shell shows Traditional Chinese min-participants hint for unformed group | PASS (2ms) |
| v2 shell prefers API Chinese copy for below-min or slot rule errors | PASS (44ms) |
| v2 shell uses date-level availability UI and removes multi-time dropdown | PASS (2ms) |
| v2 shell deduplicates same-date slots and keeps canonical earliest startAt | PASS (1ms) |

**Total: 5 pass / 0 fail / 0 skip — duration 3360ms**

**Verdict: PASS**

### TypeScript Typecheck

```
Command: npm run typecheck  (tsc --noEmit)
Exit code: 0 — no errors
```

**Verdict: PASS**

---

## Manual Test Checklist

> Browser required for all items below. Marked HOLD pending manual execution.

| # | Test | PR | Expected | Status |
|---|------|----|----------|--------|
| M1 | Booking V2 date change clears stale `scheduleId` — open booking URL with `?scheduleId=…`, switch to another date, verify URL/query no longer carries old scheduleId | #837 | No stale scheduleId after date change; draft/checkout uses new date's schedule | **HOLD** (browser required) |
| M2 | Public activity → Booking V2 deep link date-switch smoke — `/activities/taipei/andy-lee-private-tour?date=…&scheduleId=…` → booking page → switch date | #837 | Consistent date semantics; no stale schedule residue; no console/network errors | **HOLD** (browser required) |
| M3 | Mobile Booking V2 one-date / min-participants spot-check — mobile viewport, switch date and participants at boundary | #837 | Mobile CTA not obscured; date + schedule state sync; no horizontal overflow | **HOLD** (browser required) |
| M4 | Availability API query consistency — call `/api/v2/activities/…/available-slots?…` after date switch, verify UI and API agree | #837 | 200 or typed error; no cross-date schedule mismatch | **HOLD** (browser required) |
| M5 | CLAUDE.md developer onboarding doc sanity — review on GitHub, confirm no secrets, commands match repo | #835 | Readable; no secrets; build/test instructions correct | **HOLD** (browser required) |
| M6 | Baseline UI smoke — homepage, activity list, activity detail, login, admin auth boundary | #835/#837 | Main entry points load; unauthenticated admin routes redirect; no 5xx/hydration errors | **HOLD** (browser required) |

---

## Integration Test Checklist

| Test | Status | Notes |
|------|--------|-------|
| Focused Booking V2 regression (`booking-v2-min-participants-one-date.test.mjs`) | **PASS** | 5/5 pass — see above |
| Route/API contract smoke (available-slots + stale scheduleId negative path) | **HOLD** | Requires staging deployment verification |
| Auth/CSRF/RLS boundary check | **HOLD** | Browser + test accounts required |
| Docs consistency — CLAUDE.md vs package.json scripts | **PASS** | Commands verified locally: `npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e` all exist in `tour-platform/apps/web/package.json` |
| Console/network capture during Booking V2 date-switch | **HOLD** | Browser DevTools required |

---

## Full Regression Checklist

All items below are **HOLD** pending browser / staging environment with correct deploy SHA.

| Area | Status | Notes |
|------|--------|-------|
| UI smoke (homepage → booking → checkout boundary, desktop + mobile) | HOLD | Browser required |
| API / DB / RLS (health, available-slots, draft/pre-checkout, role boundaries) | HOLD | Staging + test accounts required |
| Auth / CSRF (login/logout, protected routes, POST guards) | HOLD | Staging required |
| Payment / refund / settlement (sandbox/mock/read-only only) | HOLD | No PR #837/#835 payment surface changes; low risk |
| Admin / guide / traveler role smoke paths | HOLD | Staging + test accounts required |
| Cron / callback / backfill | N/A | No PR in scope touches cron/callback; no production mutation |
| Mobile / responsive (Booking V2 date picker, CTA, activity detail) | HOLD | Browser required |
| Observability (console/server log errors) | HOLD | Staging required |

**Unblock condition:** Confirm Vercel deployment includes PR #837 merge commit `2b415dc13f165f91d364b91626971a8575b9b304` before executing HOLD items.

---

## Summary Report

```text
測試環境：https://tour-platform-nine.vercel.app (deploy SHA verification required)
Commit SHA：PR #837: 2b415dc13f165f91d364b91626971a8575b9b304 / PR #835: 0cfd9835cef52db9a035379954624770722e918d
完成區塊：
- 手動測試：HOLD — 全部 6 項需要瀏覽器/staging 環境
- 整合測試：PASS/HOLD — focused regression 5/5 通過；API/auth/console 待 staging
- 完整回歸：HOLD — 待確認 staging deploy SHA 後執行
失敗項：
- 無 FAIL 項目
Follow-up issue：
- #849 — root Booking V2 smoke script alias 修復（與本日 docs 一致性檢查相關）
Go/No-Go：HOLD — 自動化測試 (typecheck + focused regression) 全通過；HOLD 阻擋點為瀏覽器/staging 手動驗證 PR #837 stale scheduleId 清除行為與 M1-M6 清單。
```

---

## Overall Verdict

| Check | Result |
|-------|--------|
| PR #835 docs review | **PASS** |
| PR #837 focused regression (automated) | **PASS** |
| TypeScript (noEmit) | **PASS** |
| Manual browser tests | **HOLD** |
| Full regression | **HOLD** |

**Go/No-Go: HOLD** — All automatable checks pass. Manual browser verification of the stale `scheduleId` clearing behavior (items M1–M6) and staging deployment confirmation are required before final GO.
