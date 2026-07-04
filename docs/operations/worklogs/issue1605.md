# issue1605 — perf(guide): 導遊後台儀表板載入慢 — dashboard API 約 25 個序列 DB round-trip
> 最後更新：2026-07-03（Asia/Taipei）｜負責 session：claude-fable-5 / claude/tour-guide-backend-performance-8pfaus

## 目標
把 `/api/guide/dashboard` 的 DB 查詢從約 25 個序列 round-trip 壓成 3 個序列階段（階段內 Promise.all，共 13 支查詢），回應 JSON 契約完全不變。

## AC 清單
- [x] AC1 既有 10 個靜態源碼契約測試不改任何斷言、全綠（guide-revenue-dashboard-contract / issue1284 / issue475 / issue631 / issue307 / dashboard-gmv-bounds / v2-guide-dashboard-booking-sync / settlement-rules-alignment / partial-refund-settlement-status / operations-tracking-hold-columns-migration）— 12 檔 139/139 綠（apps/web cwd）
- [x] AC2 新增 2 個測試全綠：issue1605-taipei-month-grouping（台北月鍵分組邊界，7 tests）、issue1605-dashboard-query-batching（趨勢迴圈無 await、≥2 處 Promise.all、from('orders') ≤4 次、refund_pending 有 limit，5 tests）
- [x] AC3 `.claude/hooks/run-checks.sh --all --typecheck` exit 0（4330 tests、0 fail、3 skipped＋tsc 綠；targeted 模式因 dashboard-gmv-bounds / settlement-rules-alignment 用 cwd 相對路徑讀源碼、從 repo root 跑必 ENOENT，故以 --all 取證）
- [x] AC4 回應等價性 smoke：以本地假 PostgREST server（fixtures 含台北月界前後 30 分/1 小時訂單、退款>總額、hold 訂單、區間外訂單、他導遊訂單、refund_pending×2）分別實跑舊版（git HEAD）與新版 route GET，回應 JSON deepEqual 完全一致（monthGmv=7500、expectedPayout=2550、trend 6 鍵逐月一致）
- [x] AC5 延遲比對（模擬每 DB round-trip 30ms）：舊版 23 支序列查詢 837ms → 新版 13 支查詢 3 階段 111ms，**改善 86.7%**（生產實測待部署後以 Vercel runtime logs 佐證）

## 基準線（重構前）
- 2026-07-03：10 個契約測試於 `apps/web` 目錄下實跑 **127/127 全綠**（node --test）。
  - ⚠️ 注意：這些測試用 cwd 相對路徑讀源碼，必須從 `apps/web` 執行，從 repo root 跑會 ENOENT 假紅。
- ⚠️ pre-existing 紅燈（與本次無關、不修）：`tests/api/settlement-config.test.js` 有 2 條紅（`route imports computeExpectedPayout/computeNextPayoutDate` — #1284 換成 computeGuidePayoutEstimate 後該測試未更新）。不納入 targeted 清單，建議另開 issue。

## 已完成（附證據）
- 2026-07-03 調查完成：主因為 dashboard route 全序列 await（6 個月趨勢迴圈每月 2 支查詢）；前端無瀑布、驗證不打 DB、slot-generator 不在此路徑。開 issue #1605。
- 2026-07-03 TDD 完成：新測試先紅（6 fail）→ 寫 `src/lib/guide-dashboard-trend.mjs` → 重構 `app/api/guide/dashboard/route.ts`（3 階段 Promise.all；趨勢單一區間查詢＋台北月鍵記憶體分組；本月 GMV 重用趨勢資料；refund_pending 加 `.limit(50)`）→ 12 檔 139/139 綠。
- 2026-07-03 `run-checks.sh --all --typecheck` 綠（4330 tests、0 fail、3 skipped）。
- 2026-07-03 等價性/延遲驗證：假 PostgREST harness 實跑新舊兩版 route，回應 JSON deepEqual 一致；23 支序列查詢 → 13 支 3 階段，模擬延遲 837ms → 111ms（-86.7%）。

- 2026-07-03 開 PR #1611（https://github.com/smallwei0301/tour-platform/pull/1611），rebase 撞牆改用 merge origin/main（f527650 #1407/#1606 legacy 退役，不衝突）納入最新 main。CI 綠燈：
  - scan：success（https://github.com/smallwei0301/tour-platform/actions/runs/28687408196/job/85082504492）
  - test：success（https://github.com/smallwei0301/tour-platform/actions/runs/28687408204/job/85082504477）
  - `mergeable_state: clean`，無 review comments（僅 Vercel bot 自動化部署通知，Ready）。

- 2026-07-03 PR #1611 已 squash-merge 進 `main`（merge commit `1d84bab6d0ebd661117f95cd5876b7af0a5812b8`）。CI 綠燈確認後 merge，issue #1605 留言收尾並關閉。

## 下一步
- 部署後以 Vercel runtime logs 對照 `/api/guide/dashboard` 實際 duration；真瀏覽器 QA `/guide/dashboard`（營收卡、6 個月趨勢、待對帳區）確認與重構前一致。
- 後續 optional（另開 issue）：`/api/guide/qa` 的 activity_qa 查詢加 limit；dashboard 前端 SWR/短 TTL 快取（等生產實測數字再評估）；`tests/api/settlement-config.test.js` pre-existing 2 紅修正。

## 絕不重做（Do-NOT-redo）
- 契約測試型態已查證：全部是 readFileSync + regex 靜態源碼測試，無 runtime supabase mock — 重構風險在「保留變數名與語句字面」，不在 mock 順序。
- 決策：operations_tracking 保留兩支查詢（兩欄版＋六欄 hold-flags 版）不合併 — issue631 有精確 regex `select\('order_id,\s*refund_amount_twd'\)`，合併就得改測試；兩支在 Stage 3 平行，成本可忽略。
- 決策：/api/guide/qa 兩支序列查詢不動（sentinel `guide:<guideId>` 行為受 #373 測試保護，join 會漏資料）；前端 page.tsx 不動；GMV 保持 Node 端 row-level reduce（#631 政策 fixture 鎖死 6382≠6380）。
- refund_pending 查詢加 `.limit(50)`：>50 筆時為行為變更，冷啟動風險為零，PR 描述明確標註。

## P0-OVERRIDE 使用紀錄（如有）
- 無
