# issue1615 — 拆解 4 個 1,200 行級 god-page
> 最後更新：2026-07-05（Asia/Taipei）｜負責 session：claude-fable-5＋claude-opus-4-8／2026-07-05

## 目標
4 個千行頁面拆成組裝式結構，各頁 <800 行並脫離 ratchet 白名單。

## AC 清單
- [x] guide/availability：1,218→623 行；admin availability：1,221→631 行
      （共用元件 `src/components/availability/`：rule-form-fields／blackout-form-fields／
      guide-sections／admin-sections／admin-conflict-override-modal／shared.ts）
- [x] admin activities edit：1,538→721；plans：1,306→639
      （`src/components/admin/activity-form/`：ScheduleSection／SocialProofQuotesEditor／
      FaqEditorCard／export-template／form-styles；`activity-plans/`：PlanFormModal／
      PlanSeasonsPanel／plan-types／button-styles）
- [x] 4 頁全部 <800 行、自 architecture-ratchet-guard 白名單移除（白名單 9→5 檔）
- [x] UI 行為零變更（純結構搬移；文案/testid/API 呼叫未動）
- [x] 全套 npm test 0 fail＋typecheck 0 err
- [x] browser smoke（見 qa 報告）

## 已完成（附證據）
- 07-05 兩個 subagent 並行拆頁＋主線收整 16+ 個 source-contract 測試路徑
  （commit 見 branch claude/code-architecture-review-t6p1px）
- source-contract 測試更新原則：讀檔改指新元件檔或合併掃描，斷言意圖不變

## 下一步
- 剩餘白名單 5 檔（draft route 1200／booking page 1080／guide profile 992／
  email.ts 863／me orders 827）依 P3 延續逐檔拆
- agent 發現的既有 bug（AddScheduleModal UTC 日期偏移、FAQ fetch 無 try/catch 等）
  記錄於 issue #1615 留言，另開票修

## 絕不重做（Do-NOT-redo)
- 「時段預覽」等中文錨字在檔頭註解也會出現——source-contract 距離斷言要錨定
  最近出現位置（booking-help-pages 已改 matchAll+min）
- availability 雙頁的 state／API handler 留頁面層、UI 拆元件——不要把 state 下放元件
