# QA 驗收 — #1283 review invitation sweep manual smoke（post-#1282）

**Issue:** #1283 — [QA] Verify post-#1282 review invitation sweep manual smoke
**對應修正:** PR #1282（closes #1175）— `POST /api/internal/reviews/review-invitation-sweep`（預設 OFF、`x-internal-token` 驗證、idempotent、跳過 refunded/disputed/no-show/cancelled/safety、privacy-safe summary）+ `.github/workflows/review-invitation-sweep.yml`
**執行者:** AI agent（Claude Code）
**分支:** `claude/issue-1283-review-sweep-qa`（基於 `origin/main` `d112f1f`）
**測試時間:** 2026-06-09 16:20（Asia/Taipei）

---

## 結論

**PASS（無回歸）** — 預設 OFF、auth boundary、privacy-safe summary 與全部 eligibility/skip/idempotency 決策邏輯皆已驗證安全。其中「啟用後實際寄送」與「workflow 線上 dispatch」因需 `INTERNAL_ALERT_TOKEN` + 啟用 + 真實 eligible 訂單（會寄真實信件），依 AC7 標記 `NOT_VERIFIED-live`（operator/secret-gated），並以 32 個契約測試等效覆蓋——**未以推測結果當作 pass**。

---

## 環境
| 項目 | 值 |
|------|----|
| Preview 部署 | `https://tour-platform-nine.vercel.app`，SHA `d112f1f`（含 #1282）|
| 受測 | `POST /api/internal/reviews/review-invitation-sweep`、`.github/workflows/review-invitation-sweep.yml` |
| 焦點測試 | `node --test apps/web/tests/api/issue1175-review-invitation-sweep.test.mjs` → **32/32** |

---

## 驗收標準對應證據

### AC1 — 預設 OFF：未啟用時不寄送、回 privacy-safe disabled/skipped ✅（live 部分 NOT_VERIFIED）
- **來源:** route 在 auth 通過後檢查 `isReviewInvitationSweepEnabled`，未啟用回 `200 { status: 'disabled' }`（route.ts:44-48）。
- **測試:** `feature flag: defaults OFF when env var is missing`、`ambiguous/falsey values stay OFF`、`featureEnabled=false short-circuits every order to FEATURE_FLAG_OFF`、`Route: checks isReviewInvitationSweepEnabled and returns disabled status when off`。
- **NOT_VERIFIED-live:** 要在線上看到 `{status:'disabled'}` 需先通過 auth（需真 token，未持有）;以契約測試覆蓋。

### AC2 — Auth boundary：缺/錯 token → 拒絕，證據不含 token ✅（live 驗證）
- **線上 smoke:** `POST …/review-invitation-sweep` 無 token → **HTTP 401** `{"ok":false,"error":"Unauthorized"}`;錯 token → **HTTP 401**。body 無 token/PII 字樣。auth gate 在任何寄送邏輯前先擋（未觸發寄送）。
- **測試:** `Route: guards x-internal-token vs INTERNAL_ALERT_TOKEN`。

### AC3 — Enabled smoke：只處理 eligible completed orders；refunded/disputed/no-show/cancelled/safety 跳過 ✅（測試覆蓋；live NOT_VERIFIED）
- **測試:** `eligible order with no prior log → send`、`refunded → ORDER_REFUNDED`、`no_show → ORDER_NO_SHOW`、`disputed → ORDER_DISPUTED`、`cancelled → ORDER_CANCELLED`、`hasDispute=true 安全案例 → ORDER_DISPUTED skip`、`<24h → ACTIVITY_NOT_FINISHED_24H`。
- **NOT_VERIFIED-live:** 啟用後實際寄送需 token + 啟用 + 真實訂單（會寄真信），屬 operator 於 staging/dry-run 執行;以上述測試等效覆蓋。

### AC4 — Idempotency：已 sent 的 order 再 sweep 不重寄 ✅（測試覆蓋）
- **測試:** `eligible order with prior sent record → skip with IDEMPOTENCY reason`、`only failed records → send (retry_after_failure)`。route 寫入 `review_invitations` delivery log 並忽略 unique violation(23505)。

### AC5 — Workflow：secrets missing graceful skip；prerequisites 完整時產生 run summary ✅（源碼）
- **YAML:** `review-invitation-sweep.yml` 有 `schedule`（每日 cron）+ `workflow_dispatch`;`Check required secrets` 步驟以 `HAS_URL`/`HAS_TOKEN`（`secrets.* != ''`）判定，缺少時 `skip=true`，curl 步驟 `if: steps.check-secrets.outputs.skip != 'true'` → **graceful skip**。
- **NOT_VERIFIED-live:** 實際線上 dispatch 需 repo secrets，屬 operator 步驟。

### AC6 — Evidence privacy-safe ✅
- route summary「counts only, no PII」（route.ts:16, 215+）;測試 `summary: ... no PII`、`Source: sweep module does not log/store/return order email or PII strings`、`Route: returns privacy-safe summary`。本報告與 live 證據僅含狀態碼/字面 `Unauthorized`，無 email/order id/token。

### AC7 — 不可驗證項目標記 ✅
- 「啟用後實際寄送」與「workflow 線上 dispatch」標 `NOT_VERIFIED-live`（需 `INTERNAL_ALERT_TOKEN` + 啟用 + 真實 eligible 訂單，會寄真信，超出安全 agent 範圍），以 32 個契約測試等效覆蓋。**未以推測當 pass。**

### AC8 — 發現 bug → follow-up ✅
- **未發現 bug**，不需 follow-up。

---

## 判定
**PASS** — review invitation sweep 在 default OFF、auth、privacy、eligibility/idempotency/skip 決策上皆安全可觀察、不誤寄、不洩 PII。enabled-live-send 與 workflow-live-dispatch 屬 operator/secret-gated，已誠實標記 `NOT_VERIFIED-live` 並以契約測試覆蓋。

> 若要補做 operator 端的 staging 啟用 dry-run（設 `REVIEW_INVITATION_SWEEP_ENABLED=1` + `INTERNAL_ALERT_TOKEN`，對 seed 的 eligible 訂單跑一次並收集遮罩 counts），請告知;此步驟需 operator 提供安全測試環境與 token。
