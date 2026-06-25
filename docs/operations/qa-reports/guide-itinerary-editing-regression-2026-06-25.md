# 導遊行程／方案自助編輯 + 審核 — 再驗收快照（2026-06-25）

- **目的**：在目前分支 HEAD 上重跑完整測試門，確認「導遊活動審核（Phase 1）＋方案自助編輯/審核（Phase 2）＋站點時間表（送審）/季節供應（即時）（Phase 2.5/3）」三階段在 main 對齊後仍全綠、無回歸。
- **分支**：`claude/guide-itinerary-editing-design-q5g8ny`
- **Commit SHA**：`bb61e9aadaef43c9992b03c692ef64daccb9028e`
- **驗收時間**：2026-06-25 Asia/Taipei
- **環境**：本地 Node 22.22.2 + npm workspaces。後端/型別/Lint 為實測；E2E 真實瀏覽器 smoke 沿用 06-24 既有 9/9 綠結果（本輪程式碼未動 guide 流程，僅產線資料 tagline 文案調整，不影響測試）。
- **判定**：**PASS（單測 / 型別 / Lint 全綠，無回歸）。**

## 測試結果

| 測試門 | 指令 | 結果 |
|--------|------|------|
| 本輪新增針對性測試（unit + contract） | `node --test`（11 檔，見下） | ✅ **59 pass / 0 fail** |
| 全套單測回歸 | `npm test` | ✅ **3757 pass / 0 fail / 3 skip**（3760 tests、299 suites、~33s） |
| 型別檢查 | `npm run typecheck`（`tsc --noEmit`） | ✅ **0 error** |
| Lint（Node 22） | `npm run lint` | ✅ **0 error**（僅 eslintrc 棄用警告，非錯誤） |

### 本輪針對性測試清單（59/59 綠）
```
tests/unit/guide-activity-ownership.test.mjs
tests/unit/guide-activity-pending-overlay.test.mjs
tests/unit/guide-activity-review-transition.test.mjs
tests/unit/guide-editable-activity-fields.test.mjs
tests/unit/guide-editable-plan-fields.test.mjs
tests/unit/plan-column-patch.test.mjs
tests/api/guide-activity-review-gateway-contract.test.mjs
tests/api/guide-activity-review-routes-contract.test.mjs
tests/api/guide-plan-review-gateway-contract.test.mjs
tests/api/guide-plan-review-routes-contract.test.mjs
tests/api/guide-plan-seasons-contract.test.mjs
```

## 與既有報告的關係
- 逐條 AC 證據、live browser smoke（9/9 真實 chromium）、安全性重點、建置 manifest，已分別記於：
  - `docs/operations/qa-reports/guide-activity-review-2026-06-24.md`（Phase 1）
  - `docs/operations/qa-reports/guide-plan-review-2026-06-24.md`（Phase 2 + 2.5：站點時間表送審 / 季節供應即時）
- 本報告為「目前 HEAD 之測試門再驗收快照」，數據與 06-24 報告一致（`npm test` 3757 pass / 0 fail / 3 skip、typecheck 0、lint 0），確認對齊 main 後無回歸。

## 不含
本報告不含任何密鑰／cookie／token／service-role key／完整付款 payload／未遮蔽 PII。
