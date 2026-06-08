# QA 驗收 — #1279 available-slots 衝突例外隱私邊界（post-#1278）

**Issue:** #1279 — [QA] Verify post-#1278 available-slots conflict-override privacy boundary
**對應修正:** PR #1278（修 #1277）— public Booking V2 `available-slots` 必須剝除 admin-only 衝突例外欄位（`adminNote`、`createdByAdminEmail`），內部 draft/audit snapshot 仍保留完整 metadata
**執行者:** AI agent（Claude Code）
**分支:** `claude/issue-1279-conflict-override-privacy-qa`（基於 `origin/main` `8473e49`）
**測試時間:** 2026-06-08 21:0x（Asia/Taipei）

---

## 結論

**PASS — 此 slice 上線安全、無回歸。** public available-slots 邊界不外洩任何 admin-only／內部稽核欄位;safe UI 欄位完整保留;內部 draft/audit snapshot 仍保有完整可追溯 metadata。

---

## 環境

| 項目 | 值 |
|------|----|
| Preview 部署 | `https://tour-platform-nine.vercel.app` |
| 部署 SHA | `8473e49ef7bc47d0d2273c0f4d9f782966028902`（`/api/health` `version`,= main HEAD）|
| 受測 route | `GET /api/v2/activities/:activityId/available-slots` |
| 焦點測試指令 | `node --test apps/web/tests/api/issue1067-conflict-override-contract.test.mjs` |

---

## 驗收標準對應證據

### AC1 — public 回應不含 `adminNote`／`createdByAdminEmail` 等 admin-only 欄位 ✅

- **來源契約:** `app/api/v2/activities/[activityId]/available-slots/route-handler.ts:585-589` 在 PUBLIC 邊界對每個 slot 套用 `serializeConflictOverrideForPublic`:
  ```ts
  const publicSlots = availability.slots.map((slot) =>
    slot.conflictOverride != null
      ? { ...slot, conflictOverride: serializeConflictOverrideForPublic(slot.conflictOverride as any) }
      : slot
  );
  ```
- `serializeConflictOverrideForPublic`（`src/lib/availability-v2/conflict-override.ts:95-105`）只輸出 `id / reason / requiresHelper / helperStatus / guideNote`——**不含** `adminNote`、`createdByAdminEmail`。
- **無其他洩漏路徑:** public 回應另回傳 `dateAvailability` / `dates`,但其 `selectedSlot` 投影（`src/lib/availability-v2/date-availability-summary.ts:10-16, 68-74`）只含 `startAt / endAt / capacityLeft / bookingType / isAvailable`,**從不攜帶 conflictOverride**。因此唯一帶 override 的欄位 `slots` 已被剝除。
- **線上 smoke:** `GET …/available-slots`（真實 activity/plan,participants=1）→ HTTP 200,回應全文掃描 `adminNote|createdByAdminEmail|admin_note|created_by_admin_email` → **0 命中**。top-level keys = `activityId, dateAvailability, dates, planId, selectedPlan, slots, timezone`(皆 safe)。

### AC2 — public 仍保留必要的 safe UI 欄位 ✅

`serializeConflictOverrideForPublic` 保留 `id / reason / requiresHelper / helperStatus / guideNote`(旅客/導遊安全欄位),符合契約。焦點測試 `GH-1277 RED: serializeConflictOverrideForPublic preserves traveler-safe fields` 涵蓋。

### AC3 — 內部 draft/audit snapshot 仍保留完整 metadata ✅

- evaluator（`src/lib/availability-v2/booking-availability-evaluator.ts:299`）以 `serializeConflictOverrideForClient`(`conflict-override.ts:75-88`,含 `adminNote`、`createdByAdminEmail`)產生**完整** snapshot 供內部使用。
- draft route（`app/api/v2/bookings/draft/route.ts:904-916`）寫入 `conflict_override_snapshot` 時保留完整欄位,包含 `adminNote`(911)、`createdByAdminEmail`(913)、`createdAt`、`canonicalState`。
- 焦點測試 `GH-1277-v2 RED: evaluator core produces FULL conflict override snapshot (adminNote + createdByAdminEmail preserved for draft/audit)` 涵蓋。

### AC4 — 焦點回歸測試證據 ✅

```
node --test apps/web/tests/api/issue1067-conflict-override-contract.test.mjs
# tests 19 / pass 19 / fail 0
```
其中與本 issue 直接相關的測項:
- `GH-1277 RED: serializeConflictOverrideForPublic MUST NOT include adminNote or createdByAdminEmail`
- `GH-1277 RED: serializeConflictOverrideForPublic preserves traveler-safe fields`
- `GH-1277-v2 RED: evaluator core produces FULL conflict override snapshot (adminNote + createdByAdminEmail preserved for draft/audit)`
- `GH-1277-v2: source contract — evaluator uses full (client) serializer; public route-handler applies strip`

### AC5 — 線上 smoke 命名 deploy URL / SHA / route / 時間 ✅

見上方「環境」表 + AC1 線上 smoke。deploy URL、SHA `8473e49`、route `GET /api/v2/activities/:id/available-slots`、時間 2026-06-08 21:0x CST 皆記錄。

### AC6 — 證據不含密鑰/PII ✅

報告與證據無任何 secret、cookie、JWT、service-role key、完整付款 payload 或未遮蔽 PII。

### AC7 — 若有回歸則開 follow-up 並標 HOLD

**未發現回歸**,不需 follow-up,不需 HOLD。

---

## 限制說明（誠實附註）

- **Active override 的線上實證為 `NOT_PROD_EXECUTED`:** 受測的真實 activity 目前無 active conflict override(且 slots 為 0),要在線上觸發 `allowed_with_admin_override` 需 seed「重疊預約 + override」資料,會異動正式資料,超出範圍。因此 **strip 行為（有 active override 時）由 contract 測試 fixtures（含 active override）+ 來源檢視（route-handler:585-589）涵蓋**;線上 smoke 提供「public 契約不暴露 admin 欄位鍵」的負向證據。
- 此替代方式符合 issue 對 `NOT_PROD_EXECUTED` 的指示。

---

## 判定

**PASS** — #1279 全部驗收標準達成,#1278/#1277 的隱私邊界正確且無回歸,可用於軟上線 / 首次付款就緒證據。
