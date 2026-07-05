# issue1614 — 共用 API 回應 helper（jsonOk/jsonError）＋v2 手刻樣板 ratchet
> 最後更新：2026-07-05 08:27（Asia/Taipei）｜負責 session：claude-fable-5／2026-07-05

## 目標
新 v2 route 的回應一律走共用 helper，手刻 `Response.json` 樣板只能縮不能增。

## AC 清單
- [x] src/lib/api-response.ts：jsonOk/jsonError 回傳 Response，envelope 沿用 successV2/errorV2
- [x] 單測：status／content-type／shape 逐欄一致、init 透傳、status 參數優先
- [x] 示範接入 3 個 v2 GET route（bookings 詳情、transfer-info、orders 詳情），行為零回歸
- [x] ratchet guard：28 檔白名單＋毒丸測試（tests/unit/issue1614-v2-response-helper-ratchet-guard）
- [x] 與 #1600（parseBody）、#1598（handleRouteError）的組合骨架記於 helper 檔頭

## 已完成（附證據）
- 07-05 全部完成（commit 1a9d679｜run-checks 綠＋typecheck 綠｜全套 npm test 0 fail）

## 下一步
- #1600／#1598 落地後，於健檢報告速查表補「新 route 標準骨架」完整範例
- 白名單 28 檔隨改隨換，每改一檔自白名單移除（毒丸測試會提醒）

## 絕不重做（Do-NOT-redo）
- .ts lib 檔互相 import 必帶 `.ts` 副檔名（allowImportingTsExtensions；無副檔名在
  node --test type-stripping 下 ERR_MODULE_NOT_FOUND，已踩過）
- v2-order-detail-authz-route 測試的 regex 已鎖 jsonError 新寫法，勿回改舊樣式
