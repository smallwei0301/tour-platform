# issue1613 — db.mjs strangler 續拆：解循環 import＋逐領域整塊搬遷
> 最後更新：2026-07-05 08:27（Asia/Taipei）｜負責 session：claude-fable-5／2026-07-04~05

## 目標
db.mjs god gateway 降到 <5,000 行，且解除 db.mjs ⇄ db-* 循環 import。

## AC 清單
- [x] 第 0 步：db-kpi／db-auto-complete／db-redeem 不再 import db.mjs（supabase-env.mjs 抽出）
- [x] export 分群與搬遷（9 個領域檔、2,178 行）
- [x] 每輪 db-mjs-size-guard CEILING 下修（6,986→6,973→4,846→4,847）
- [x] 里程碑：db.mjs <5,000 行（現 4,847，含 #1616 的 +1 import 行）
- [x] 全套 npm test 0 fail＋typecheck 綠；凍結區零觸碰

## 已完成（附證據）
- 07-04 supabase-env.mjs 抽出、循環解除（commit 06111a2｜run-checks 6 檔綠＋typecheck）
- 07-05 批次抽出 db-settlement-ops／db-guide-applications／db-wishlist／db-payouts／
  db-reschedule／db-booking-approvals／db-order-messages／db-homepage-featured／
  db-messaging-bindings（commit 347318e｜全套 npm test 0 fail）
- 8+ 個 source-contract 測試改指領域檔；3 檔 cwd 依賴路徑改 import.meta.url 錨定

## 下一步
- 後續領域（admin-orders／activities／plans／refund 鏈）續拆——refund/payments 相關函式屬凍結區邊界，另開 issue 評估
- 新領域檔補 `// @ts-check`（併入 #1597，本輪刻意型別中性）

## 絕不重做（Do-NOT-redo）
- supabase-env.mjs 的 getSupabase 回傳型別維持 any——收緊會讓下游 route 的
  Supabase 查詢型別變嚴而爆 typecheck（已驗證過一次，#1597 另案處理）
- db-settlement-ops 對 listAdminOrdersDb 用呼叫時動態 import——靜態 import 會重建循環
- db.mjs 的 132 個對外 export 以 re-export 維持——callers 不需改 import 路徑
