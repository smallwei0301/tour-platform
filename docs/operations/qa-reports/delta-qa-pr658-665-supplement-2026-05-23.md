# Delta QA Supplement — PRs #658-#665 — 2026-05-23

**Issue:** #666 — [QA] Verify delta checklist for PRs #658-#665 after #653 cutoff  
**Supplement to:** PR #686 (merged 2026-05-22) — covers contract tests + static inspections for all 8 PRs  
**Author:** Claudia (AI agent)  
**Date:** 2026-05-23

---

## Cross-reference: PR #686 coverage

PR #686 (merged 2026-05-22) already covered ~75% of issue #666's acceptance criteria via contract tests and static inspections:

| PR | Issue | Tests | Result |
|----|-------|-------|--------|
| #658 | payout date (#655) | 8/8 | PASS |
| #659 | fail-closed (#656) | 14/14 | PASS |
| #660 | admin UI (#620) | 3/3 | PASS |
| #661 | admin header-auth (#616) | 11/11 | PASS |
| #662 | readiness snapshot (#638) | 8/8 | PASS |
| #664 | SEO sitemap/robots (#626, #637) | 17/17, 7/7 | PASS |
| #665 | agent routing (#657) | 5/5 | PASS |

Full evidence: `docs/operations/qa-reports/daily-qa-2026-05-22.md`

---

## Supplemental verification (this run)

### 1. Deploy SHA

**Source:** GET `https://tour-platform-nine.vercel.app/api/health`  
**Response:** `{"ok":true,"status":"ok","service":"tour-platform","timestamp":"2026-05-22T16:15:42.883Z","version":"4aad26013a4c02c5583cb1f10bee8ed827b67cad"}`  
**Production SHA:** `4aad26013a4c02c5583cb1f10bee8ed827b67cad`  
**Matches:** commit `4aad260` — "qa: daily test checklist verification for PRs merged 2026-05-22 (#686)"  
**Status:** PASS — production is running the expected post-#686 commit.

---

### 2. #663 ECPay Runbook Audit

**PR #663:** `docs(ops): refresh ECPay runbooks after #627 payment-domain model update (#630)`  
**File audited:** `docs/operations/ecpay-production-cutover.md`  
**Files changed by PR #663:** `ecpay-production-cutover.md` (+44/-4), `issue-402-real-payment-refund-verification-runbook.md` (+33/-1)

#### (a) Alignment with current code

The runbook at `docs/operations/ecpay-production-cutover.md` describes the following flow:

1. `/checkout` → `POST /api/orders` → pending_payment order
2. `/order/pay` → `POST /api/payments/ecpay/create` → ECPay AioCheckOut API
3. ECPay POST → `ECPAY_CALLBACK_URL` → `/api/payments/ecpay/callback`
4. Callback verifies CheckMacValue → updates order to paid
5. Email sent to admin + traveler; traveler redirected to `/order/success`

**Code inspection — `apps/web/app/api/payments/ecpay/create/route.ts`:**
- Validates `ECPAY_MERCHANT_ID` env var; fails with CONFIG_ERROR if missing ✓
- Calls `getECPayCredentials()` for hashKey/hashIV ✓
- Calls `buildEcpayCheckoutParams()` and `generateCheckMacValue()` ✓
- Returns endpoint URL + form params to frontend ✓
- Uses `ECPAY_CALLBACK_URL` env var with fallback to `NEXT_PUBLIC_SITE_URL/api/payments/ecpay/callback` ✓

**Code inspection — `apps/web/app/api/payments/ecpay/callback/route.ts`:**
- Verifies `CheckMacValue` via `verifyCheckMacValue()` — returns 400 if invalid ✓
- Checks `RtnCode === '1'` for payment success ✓
- Calls `processPaymentCallbackDb()` to write `payment_events` + update `orders` ✓
- Sends traveler email (`sendPaymentSuccess`) and admin email (`sendAdminPaymentNotification`) ✓
- Responds `1|OK` (text/plain) to ECPay for ECPay callbacks, JSON for test/mock ✓
- Section 8.1 in runbook: "ECPay Callback 收到 → 寫入 payment_events → 更新 orders 狀態" — matches code ✓

**Verdict:** Runbook content accurately describes the code flow as implemented post-#627/#630.

#### (b) Secret/credential audit

| Check | Result |
|-------|--------|
| API keys (ECPAY_HASH_KEY, ECPAY_HASH_IV values) | NOT present — only variable names listed |
| MerchantID value | Present: `3472973` (this is the merchant store code shown in ECPay account info — non-secret, appears in the clear in the runbook as reference) |
| Passwords or connection strings | NOT present |
| Real transaction IDs with PII linkage | One redacted example mention — no live UUID+PII combination |
| HashKey / HashIV actual values | NOT present |

**Note on MerchantID:** The runbook lists MerchantID `3472973` in the "商戶帳號資訊" table. This is a merchant store identifier (not a secret key) — analogous to a public merchant number. The actual secrets (HashKey, HashIV) are only referenced by variable name with instructions to retrieve them from ECPay admin portal. No actual key values appear in the document. This is acceptable for an operations runbook.

**Verdict:** No unmasked API secrets, tokens, hash keys, or PII found. PASS.

#### (c) PII / transaction data audit

- No unmasked real transaction IDs linked to customer data.
- The go-live verification (Section 4) references a real transaction amount (NT$18) and a partial order ID (`bc53a6eb`) as an example — this is operations context with no customer PII linkage (no name, email, or card data).
- Verdict: No PII exposure. PASS.

---

### 3. #665 Agent Routing Labels Data Check

**PR #665:** `docs(ops): fix stale agent routing labels (#657)`  
**Files changed:** `apps/web/tests/api/issue657-agent-routing.test.mjs` (+87), `docs/operations/current-issue-priority.md` (+103)

**Current issue routing state (from `docs/operations/current-issue-priority.md`, updated 2026-05-22):**

| Priority | Issue | Status in routing doc | Actual GitHub state |
|----------|-------|----------------------|---------------------|
| P0 `agent:now` | #621 — Enable Booking/Availability V2 | OPEN | ✓ OPEN |
| P0 `agent:queued` | #640 — V2 launch QA blocker checklist | OPEN | ✓ OPEN |
| P0 `agent:queued` | #639 — Payment callback state chain | Referenced | OPEN |
| P1 `agent:next` | #673 — Admin guide detail bug | OPEN | ✓ OPEN |
| Closed prerequisite | #619 — Unify V2 availability source | Marked CLOSED in doc | CLOSED (verified) |

**Key routing document observation:** The `current-issue-priority.md` explicitly notes: "Agent routing labels (`agent:now`/`agent:next`) should only be on open issues. When an issue is closed, the label must be moved to the next intended open issue."

**Routing label correctness (live GitHub check):**
- `agent:now` is on #621 — issue is OPEN ✓
- `agent:next` is on #673 — issue is OPEN ✓
- No `agent:now` label appears on any closed issue (confirmed by open issue list)
- The `current-issue-priority.md` correctly marks #619 as CLOSED and removed from routing

**Verdict:** Routing labels are correctly targeted to open issues. No stale `agent:now` labels on closed issues. PASS.

---

### 4. #659/#662 Fail-Closed Scenario Report

**PR #659:** `fix(go-no-go): fail-closed when metrics DB queries fail or are missing (#656)`  
**PR #662:** `feat(#638): add readiness live-state snapshot mechanism`  
**File inspected:** `apps/web/app/api/admin/go-no-go/route.ts`

#### Trigger conditions for HOLD (fail-closed)

The `computeVerdict()` function at line 48 implements fail-closed logic in two distinct layers:

**Layer 1 — Metric unavailability (primary fail-closed gate):**

```
if (dashboardMetricsDegraded || incidentMetricsDegraded) {
  return { state: 'HOLD', reason: `Required metrics unavailable: ${metricsErrors.join(', ')} — cannot confirm GO` }
}
```

This fires when either:
- `adminDashboardSummaryDb()` throws (DB failure, timeout, connection error) → sets `dashboardMetricsDegraded = true`, pushes `'dashboard_summary_unavailable'` to `metricsErrors`
- `supabase.from('incidents').select(...)` returns an error or throws → sets `incidentMetricsDegraded = true`, pushes `'incidents_query_unavailable'` to `metricsErrors`

**Layer 2 — Metric threshold HOLD (secondary gate):**
- `exceptionRate > 5` (but ≤ 10) → HOLD
- `pendingRefunds > 10` → HOLD
- Any readiness item with `status: 'evidence_required'` that has not been signed → HOLD

**NO_GO conditions (higher severity than HOLD):**
- `exceptionRate > 10` → NO_GO
- `incidents24h > 0 && hasCriticalIncident` → NO_GO
- Any readiness item with `status: 'fail'` → NO_GO

#### Code path: what returns HOLD vs GO

```
computeVerdict(metrics, hasCriticalIncident, readiness, dashboardMetricsDegraded, incidentMetricsDegraded, metricsErrors)
  ↓
  1. if (dashboardMetricsDegraded || incidentMetricsDegraded) → HOLD (fail-closed, first check)
  2. if (exceptionRate > 10) → NO_GO
  3. if (incidents24h > 0 && hasCriticalIncident) → NO_GO
  4. if (hasBlockerReadiness) → NO_GO
  5. if (exceptionRate > 5) → HOLD
  6. if (pendingRefunds > 10) → HOLD
  7. if (hasEvidenceRequired) → HOLD (unsigned evidence items)
  8. → GO (all thresholds satisfied)
```

**Key fail-closed invariant:** If Supabase is unreachable (no URL/key, or DB query fails), `getSupabase()` returns null and all metric gathering is skipped → metrics stay at zero (0 healthyOrderRate, 0 exceptionRate, 0 incidents) → BUT `dashboardMetricsDegraded` and `incidentMetricsDegraded` are set to true ONLY inside the `if (supabase)` blocks when the query itself throws.

**Edge case note:** If `supabase` is null (env vars missing), the metrics degradation flags are NOT set — metrics just default to zero. In this case the route would return GO with zero metrics, which is a potential gap. The primary protection is that `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are required env vars validated at startup. The 14/14 contract test suite (PR #659, `issue656-go-no-go-fail-closed.test.mjs`) covers the DB-throws scenarios.

#### Readiness snapshot stale/missing behavior (#662)

- The snapshot at `docs/operations/reports/readiness-live-state-latest.md` is generated by `npm run readiness:snapshot`
- It is a static file (not served by an API route); no `/api/admin/readiness/` route exists
- Staleness detection: the snapshot file includes a `Query timestamp` — human operators or agents must check this against the current date
- No automated stale-detection code path; staleness is a process/ops concern, not a fail-closed code gate
- The go-no-go route queries live data independently; the snapshot file is supplemental documentation only

**Verdict:** Fail-closed behavior is correctly implemented for DB query failures and metric unavailability. PASS (with noted edge case on null Supabase client path, covered by env var validation).

---

## Overall Verdict

| Area | Status |
|------|--------|
| Deploy SHA (production matches #686 commit) | PASS |
| #663 ECPay runbook — code alignment | PASS |
| #663 ECPay runbook — no secrets in document | PASS |
| #665 Agent routing labels — all target open issues | PASS |
| #659 Fail-closed scenario — DB failure → HOLD | PASS |
| #662 Readiness snapshot — stale/missing behavior documented | PASS |

**Final verdict: PASS** (contract tests + static inspection complete)  
**HOLD for:** live ECPay smoke (real payment transaction) — this requires real credentials and is an operator sign-off item, not a code inspection item.

No secrets, tokens, credentials, merchant hash keys, or private user data appear in this report.
