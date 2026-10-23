# Issue #1925 worklog：其餘 v2 route 不回傳 DB／例外字串（Run `2026-10-23-midao2-r07`）

## 範圍
- 依 r06 盤點出的清單施工，總計修了 33 支 v2 route。
  - r06 清單：admin 端 13 處，加上 guide 端的 `bookings/pending-approval`。
  - Sonnet 另外 grep 出同類寫法，一併修掉。
- 本輪沒有另派 scout 盤點，算一個缺口，已記在帳本。

## 施工（sonnet）
### `21b88a8d`
- 33 支 route 的 envelope、code、status 都維持原樣，只把 client 看到的訊息換成通用文案；原始錯誤一律交給 `reportRouteError`。
- `src/lib/route-error.ts` 新增：
  - `pickSafeMessage`
  - `getErrorText`
  - `isDomainError`
  - `ORDER_DOMAIN_ERROR_PATTERNS`：整句錨定的業務訊息白名單
  - `GENERIC_SERVER_ERROR_MESSAGE`
- 新增 source guard `tests/api/issue1925-v2-no-db-error-leak-guard.test.mjs`，允許清單 5 項，只能縮不能增。
- 新增行為測試 `tests/api/issue1925-v2-route-error-no-leak.test.mjs`。
- issue1598 WHITELIST 移除 conflict-overrides（縮減）。
- 驗證結果：
  - RED 13/20 → GREEN 637 項
  - unit 全量 33 fail，與 base 相同
  - 突變 3/3 被擋下

### `3f27ccfe`（rework）
- 審查發現 guard 抓不到兩種寫法：`getErrorText(err)` 直接放進回應，以及先存成變數再回傳。已補上。
- 另補 10 個行為測試，涵蓋：
  - refund-execute 的 DB_UPDATE_FAILED 與修復路徑
  - 旅客端 refund-requests、cancel 的業務訊息保留與 DB 錯誤不外洩
  - manual-payment
  - 白名單錨定的正例與反例
- 這次只改測試與註解，沒有動 route 實作。
- 驗證結果：647 項全綠；突變 7/7 被擋下。

## 審查（opus，fresh context）
- 結論：PASS，blocking 0。
- 業務訊息回歸：
  - 33 支 route 都追到 gateway 的 throw 點。
  - 35 句業務訊息全部命中白名單。
  - 16 句 DB 字串沒有被誤放行。
- 前端相容：沒有任何程式依賴 API 回傳的 message 原文。admin 退款畫面只用 `code` 對照 `REFUND_ERROR_HINTS`。
- 回應形狀：抽查 15 支以上，code 與 status 都沒變。
  - 唯一刻意的變更：approval 的未知錯誤原本回例外字串前綴作為 code，現在改為 `SERVER_ERROR`。
- 凍結區：沒有碰到。`route-error.ts` 只有新增、沒有刪改，凍結區也沒有 import 它。
- base vs HEAD：HEAD 沒有新增失敗。
- 審查自設的突變有 7 項存活（測試缺口），已在 `3f27ccfe` 補上測試。
- 後續另開 #1928：`src/lib/refund-execute.ts` 在 ECPay 退款例外時，會把 `err.message` 原樣回給 client。
