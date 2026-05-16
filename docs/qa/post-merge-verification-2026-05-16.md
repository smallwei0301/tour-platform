# Post-Merge Verification Report: PRs #546–#567
> 日期：2026-05-16
> 驗證人：Claudia (automated)
> 查詢時間：2026-05-16 UTC+8
> 引用：#558

---

## 1. Automated Test Results

| 項目 | 結果 |
|------|------|
| Unit / contract / behavioral tests | **1342 pass / 0 fail** ✅ |
| TypeScript (tsc --noEmit) | **PASS** ✅ |
| Node 22 runtime pin | .nvmrc = "22", engines ≥ 22 ✅ |

---

## 2. PRs Covered (#546–#567)

| PR | 主題 | Test coverage | Verified |
|----|------|---------------|---------|
| #546 | [GH-507] Production schema drift preflight | Schema preflight contract tests | ✅ |
| #547 | fix: 5 failing tests (status filter, force-dynamic, compat route) | Test suite pass (all 5 fixed) | ✅ |
| #548 | chore: Node 22 pin (.nvmrc + engines) | .nvmrc exists, engines field set | ✅ |
| #550 | feat(#549): soft-launch controls foundation | 35 contract tests (issue549) | ✅ |
| #552 | feat(#551): soft-launch checkout/refund guards | 14 contract tests (issue551) | ✅ |
| #554 | feat(#553): soft-launch admin UI | 18 contract tests (issue553) | ✅ |
| #556 | test(#555): behavioral + static tests for soft-launch | 38 behavioral + integration tests | ✅ |
| #557 | feat(#505): Go/No-Go evidence-driven HOLD | 15 contract tests (issue505) | ✅ |
| #562 | docs: refund-policy-v2.md canonical source | docs-only | ✅ |
| #563 | docs: incident response runbook v2 | docs-only | ✅ |
| #564 | docs: quality control runbook v2 | docs-only | ✅ |
| #565 | docs: evidence artifact governance policy | docs-only | ✅ |
| #566 | docs: settlement/payout ops runbook v1 | docs-only | ✅ |
| #567 | docs: README re-sync 2026-05-16 | docs-only | ✅ |
| #568 | docs(qa): pre-launch evidence pack index | docs-only | ✅ |
| #569 | docs(ops): guide round-2 self-operation plan | docs-only | ✅ |

---

## 3. Soft-launch Controls — Static Verification

### 3.1 Database Schema (migration #549)
- ✅ `soft_launch_controls` table: 4 boolean flags + singleton row
- ✅ `soft_launch_control_audit` table: actor, control_key, reason, from/to_value
- ✅ `soft_launch_whitelist` table: entry_type CHECK (traveler_user_id|activity_id|guide_id)
- ✅ RLS: service_role full access, authenticated read-only

### 3.2 Booking Guard (PR #552)
- ✅ `apps/web/app/api/v2/bookings/draft/route.ts` checks `new_booking_paused`
- ✅ Returns HTTP 423 with `BOOKING_PAUSED` error when paused
- ✅ `isWhitelisted()` check for whitelist bypass

### 3.3 Refund Guard (PR #552)
- ✅ `apps/web/app/api/payments/ecpay/refund-callback/route.ts` checks `refund_manual_only`
- ✅ Returns `1|OK (refund_manual_only mode)` early (skips auto-execution)

### 3.4 Admin UI (PR #554)
- ✅ `/api/admin/soft-launch` GET/POST — admin session required
- ✅ `/admin/soft-launch` page — 4 toggle rows + reason dialog
- ✅ AdminShell NAV_ITEMS includes 軟啟動控制

### 3.5 Go/No-Go (PR #557)
- ✅ 5 evidence items default to `evidence_required` status
- ✅ `computeVerdict` returns HOLD when any `evidence_required` item present
- ✅ Override via `EVIDENCE_XXX_SIGNED=true` env var

---

## 4. Production Verification Gaps (needs manual verification)

| 項目 | 狀態 | Owner |
|------|------|-------|
| soft_launch_controls migration applied to production DB | ⚠️ PENDING | Wei |
| Admin UI accessible in production (Vercel) | ⚠️ PENDING | Wei |
| booking guard 423 triggers in real browser flow | ⚠️ PENDING | Wei/Rita |
| refund_manual_only blocks real ECPay callback | ⚠️ PENDING | Wei |
| Go/No-Go shows HOLD in production dashboard | ⚠️ PENDING | Wei |

---

## 5. Verdict

**Automated: PASS** (1342 tests, tsc clean)
**Production verification: PENDING** (manual steps listed in section 4)

Overall: **HOLD** — production DB migration + UI verification needed before Go-Live.
