# issue1812 — 讓加購驗證、快照與訂單總額保持原子一致
> 最後更新：2026-08-12 Asia/Taipei｜負責 session：Codex

## 目標
將加購驗證、快照、Order item 與 `orders.total_twd` 併入 #1811 的原子建單邊界；不可用加購必須拒絕且不建立訂單。

## AC 清單
- [ ] RED → minimal GREEN：停售／庫存不足 public integration regression。
- [ ] 有效加購與 Booking、Order、Order item、`orders.total_twd` 同一 transaction。
- [ ] 加購快照寫入失敗時完整 rollback。
- [ ] Order item／總額寫入失敗時完整 rollback。
- [ ] 不可用加購回傳明確輸入錯誤，無 ID／付款入口／成功通知。
- [ ] client total／加購金額不可改變持久化 `orders.total_twd`。
- [ ] 核心證據為公開入口、最終資料庫狀態與外部結果。
- [ ] 留下可重跑 integration coverage。

## 已完成（附證據）
- 2026-08-12 已重新確認 #1811 已進入目前 `main`（`093a6a57` 為 `origin/main` 的祖先）。
- 2026-08-12 owner 已授權「使用等效人工安全流程執行 #1812」；本輪以手動凍結區檢查、精準 patch、Node 22、TDD、完整測試與獨立 review 替代未載入 hooks。
- 2026-08-12 建立 TDD RED 測試 `apps/web/tests/unit/issue1812-addon-atomic-materialization.test.mjs`，尚待實跑。

## 下一步
- 以 Node 22 實跑 RED，新增 service-role-only add-on atomic RPC migration 與公開入口／PostgREST integration regression。

## 絕不重做（Do-NOT-redo）
- 不修改既有 #1811 migration；#1812 以新、可審查且不會自動套用的 migration 提供新 RPC。
- 不改付款、退款、callback、Auth、middleware、正式資料或部署。

## P0-OVERRIDE 使用紀錄（如有）
- 無；未觸碰凍結區。
