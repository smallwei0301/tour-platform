# Post-Merge Verification Report: Emergency Patch Train PRs #521–#535
> 日期：2026-05-14 (patch merge) / verified 2026-05-16
> 驗證人：Claudia (automated static + contract tests)
> 查詢時間：2026-05-16 UTC+8
> 引用：#537, #500, #502, #518

---

## 1. Automated Test Results (驗證於 2026-05-16)

| 項目 | 結果 |
|------|------|
| Unit / contract / behavioral tests | **1342 pass / 0 fail** ✅ |
| TypeScript (tsc --noEmit) | **PASS** ✅ |
| 測試涵蓋的 patch train 功能 | activity detail render, guide auth, schema-tolerant fallback |

---

## 2. Patch Train Coverage (#521–#535)

The following 10 PRs constitute the emergency patch train merged 2026-05-14 through 2026-05-15:

| PR | Title | Merged | Related Issue | Test Coverage |
|----|-------|--------|---------------|---------------|
| #521 | partial patch: refund preview start time and schema error handling | 2026-05-14 | #502 | `issue-502-refund-preview-start-time.test.mjs` ✅ |
| #522 | partial patch: public activity detail schema tolerant fallback | 2026-05-14 | #502 | `issue502-activity-detail-resilience.test.mjs` ✅ |
| #523 | partial patch: activity detail runtime path avoids fixture-first fallback | 2026-05-14 | #502 | `issue502-render-path-runtime-smoke.test.mjs` ✅ |
| #525 | partial patch: activity detail dynamic runtime for GH #502 | 2026-05-14 | #502 | `issue502-render-path-timeout-guard.test.mjs` ✅ |
| #526 | partial patch: bounded activity detail lookup for GH #502 | 2026-05-14 | #502 | `issue-502-query-contract.test.mjs` ✅ |
| #527 | partial patch: remove activity detail relational embed for GH #502 | 2026-05-14 | #502 | `issue502-activity-detail-resilience.test.mjs` ✅ |
| #532 | fix(web): harden activity detail render path | 2026-05-15 | #502 | `issue502-page-ssr-timeout-behavior.test.mjs` ✅ |
| #533 | partial patch: fail fast activity detail page SSR | 2026-05-15 | #502 | `issue502-render-path-runtime-smoke.test.mjs` ✅ |
| #534 | fix(web): resolve activity detail route param conflict | 2026-05-15 | #502 | `issue502-render-path-runtime-smoke.test.mjs` ✅ |
| #535 | fix(web): bound guide login auth flow | 2026-05-15 | #518 | `issue518-guide-login-ui-contract.test.mjs` ✅ |

**Note:** PRs #524, #528–#531 do not exist in the repository (gap in numbering); the patch train consists of the 10 PRs above.

PRs with manual production verification pending (no automated production smoke): all 10 PRs require production spot-check (see Section 5).

---

## 3. Activity Detail Verification (Static)

### Issue #502 fix coverage:
- ✅ `app/activities/[region]/[slug]/page.tsx` uses `force-dynamic` + `revalidate=60`
- ✅ `withTimeout()` wrapper prevents render hang (timeout test: 239ms)
- ✅ `notFound()` called on timeout (behavioral test)
- ✅ Route params use Promise pattern (Next.js 15 compliant)
- ✅ Metadata generation stays independent from DB calls

Test files:
- `tests/ui/issue502-page-ssr-timeout-behavior.test.mjs` — 1/1 pass
- `tests/ui/issue502-render-path-runtime-smoke.test.mjs` — 3/3 pass
- `tests/ui/issue502-render-path-timeout-guard.test.mjs` — 1/1 pass
- `tests/api/issue502-activity-detail-resilience.test.mjs` — 11/11 pass
- `tests/api/issue-502-query-contract.test.mjs` — pass
- `tests/api/issue-502-refund-preview-start-time.test.mjs` — pass

---

## 4. Guide Auth / Login (Static)

### Issue #518 fix coverage (PR #535):

Files hardened by the patch:
- `apps/web/app/guide/login/page.tsx` — bounded auth flow with `AbortController` + `setTimeout`

Static verification:
- ✅ `fetchWithTimeout()` wraps `/api/guide/auth/csrf` call with abort signal
- ✅ `fetchWithTimeout()` wraps `/api/guide/auth/session` call with abort signal
- ✅ `AUTH_REQUEST_TIMEOUT` error name set on timeout, surface to UI error state
- ✅ `clearTimeout(timeoutId)` in finally block — no timeout leak
- ✅ `REQUEST_TIMEOUT_MS` constant governs both fetch calls (single source of truth)

Test file:
- `tests/ui/issue518-guide-login-ui-contract.test.mjs` — pass
- `tests/api/guide-auth-session-post-bounded.test.mjs` — pass
- `tests/api/guide-csrf.test.mjs` — pass

---

## 5. Production Verification Gaps

| 項目 | 狀態 | Owner |
|------|------|-------|
| Activity detail pages load in production (no hang) | ⚠️ PENDING | Wei/Rita |
| Guide login flow completes within timeout | ⚠️ PENDING | Wei/Rita |
| Public activity list loads correctly | ⚠️ PENDING | Wei/Rita |
| Schema-tolerant fallback works for missing columns | ⚠️ PENDING | Wei/Rita |
| Traveler entry points (wishlist, order) accessible | ⚠️ PENDING | Wei/Rita |

---

## 6. Verdict

**Automated: PASS** (1342/0 tests, tsc clean)
**Production regression: PENDING** (manual steps listed in section 5)

Overall: **HOLD** — automated contract tests pass but production smoke test not executed.
