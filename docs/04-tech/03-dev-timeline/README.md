# 03. 開發時程 / 里程碑索引

> 最後更新：2026-04-20

本目錄不再作為單純流水帳，而是：
1. 里程碑索引
2. 技術演進與 handoff 入口
3. 歷史紀錄歸檔區

---

## 當前最重要文件
- `01-sprint-log.md` — 歷史 sprint 記錄（已偏歷史檔）
- `07-tracy-implementation-task-list-v1.md` — Booking / POS 實作清單
- `08-tracy-handoff-booking-pos.md` — handoff / engineering context
- `docs-audit-summary-2026-04-20.md` — 本輪 docs 掃描摘要

---

## 里程碑索引

### 已完成里程碑
- **Phase 1–4**：前台 MVP、Admin 核心、UI 精修、行程後台 CRUD
- **Phase 5**：付款扣位完整閉環
- **Phase 6**：導遊儀表板
- **Phase 7**：前台訂單流程完整化
- **Phase 8**：量測地基 + E2E 基礎
- **Phase 9**：旅客 Auth + Email 通知
- **Phase 10**：正式金流與安全加固第一輪

### 2026-04-20 文件 / 安全 / CI 收斂里程碑
- issue #56 / #57 / #103 / #104 / #119 已關閉
- 舊衝突 PR 已拆成乾淨小 PR 重開並 merge
- PR #127 修復 GitHub Actions `GUIDE_SESSION_SECRET` / `ADMIN_ACCESS_TOKEN` env 缺口
- 最新 main CI 已 PASS

### 當前主線里程碑
- **#96** Booking V2 phased rollout（進行中）
- **#105** Daily Go/No-Go automation（進行中）
- **#117** CSRF Phase 2 follow-up（進行中）
- **PR #128** trusted client IP resolver（open）

---

## 如何使用這個目錄
- 想看「現在在做什麼」：先回 repo 根 README 與 `docs/README.md`
- 想看「舊 sprint 怎麼演進」：看 `01-sprint-log.md`
- 想看「Booking / POS 工程主線」：看 `07-*`、`08-*`
- 想看「文件治理盤點」：看 `docs-audit-summary-2026-04-20.md`

---

## 後續整理建議
- `01-sprint-log.md` 保留為歷史檔，不再承擔當前狀態首頁功能
- 新的重大收斂事件（如安全、CI、主線切換）優先更新本檔與 repo 根 README
