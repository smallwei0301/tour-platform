# Tour Platform 文件總覽

> 最後更新：2026-04-20
> 當前主線：**Booking V2 rollout / Booking Engine V2 / 安全與 CI 穩定化**

本目錄的目的不是保存所有歷史，而是讓人快速找到：
1. 現在專案在做什麼
2. 哪些文件是當前主線
3. 哪些文件是歷史背景 / 補充資料

---

## 先看這些（最高優先）

### 專案總覽
- `../README.md` - repo 根總覽

### 當前主線：Booking V2 / rollout
- `implementation/phase-12-mainline-matrix.md`（Issue #163：Phase 12 主線 owner/status/artifact/source-of-truth matrix）
- `implementation/issue-96-rollout-contract.md`
- `operations/booking-v2-b3-rollout.md`
- `operations/booking-v2-daily-go-no-go.md`
- `qa/booking-v2-rollout-manual-checklist.md`
- `qa/issue-210-booking-cancel-verification-checklist.md`
- `qa/reports/2026-04-17-booking-v2-manual-test-report.md`
- `implementation/issue-103-metrics-dashboard-contract.md`
- `implementation/issue-170-audit-field-contract-and-troubleshooting.md`（POS/LINE/Web/Callback 共用 audit 欄位契約）
- `operations/booking-v2-dashboard-data-source.md`
- `operations/issue-168-phase-12-fk-hardening-runbook.md`（Issue #168：Phase 12 FK hardening 執行/回滾 runbook）

### 技術設計
- `04-tech/04-tech-architecture/02-database-schema.md`
- `04-tech/04-tech-architecture/03-api-spec.md`
- `04-tech/04-tech-architecture/08-booking-pos-improvement-plan.md`
- `04-tech/04-tech-architecture/09-booking-pos-migration-plan.md`
- `04-tech/04-tech-architecture/10-api-spec-v2-booking-pos.md`

### 安全 / 收斂
- `security/issue-119-evidence-2026-04-20.md`
- `security/issue-119-history-rewrite-runbook.md`
- `security/issue-56-secret-rotation-checklist.md`
- `security/issue-56-blocker-followup-status.md`

---

## 目前 docs 分層建議

### A. 當前有效主線文件
這些文件與當前 open issues / rollout / main branch 狀態直接相關：
- `implementation/*`
- `operations/*`
- `qa/*`
- `security/*`
- `04-tech/04-tech-architecture/08~10*`

### B. 歷史背景 / 早期規劃
以下多數是早期 Phase 1~10 的背景資料，仍可參考，但不應被誤認為「當前執行主線」：
- `01-strategy/**`
- `02-product/**`
- `03-design/**`
- `05-business/**`
- `06-legal/**`
- `04-tech/03-dev-timeline/**`

### C. 需要後續持續整理的區塊
- `04-tech/03-dev-timeline/`：歷史很多，應逐步轉為「索引 + 關鍵里程碑」
- `01-strategy/01-project-plan/`：部分 roadmap 與目前 issue reality 已不完全一致
- `05-business/06-payment-plan/` / `07-operations-plan/`：部分文件仍偏空殼或待補

---

## 目前 open issue 對應文件主線
- **#96** - `implementation/issue-96-rollout-contract.md`, `operations/booking-v2-b3-rollout.md`
- **#105** - `operations/booking-v2-daily-go-no-go.md`, `operations/reports/samples/booking-v2-go-no-go-sample.md`
- **#117** - 目前偏 issue / code 主線，文件索引較少，後續可補 `security/` 或 `implementation/`
- **#170** - `implementation/issue-170-audit-field-contract-and-troubleshooting.md`（定義 source_channel / correlation_id / actor-action-target-before-after 契約與排錯路徑）
- **#175** - `implementation/issue-175-admin-pos-lite-operator-sop.md`（Admin POS Lite 營運 SOP：happy path / failure path / escalation / MVP 邊界）
- **#181** - `implementation/issue-181-line-liff-go-no-go-readiness.md`（LINE/LIFF staged rollout checkpoints + GO/HOLD/ROLLBACK WATCH + data-quality HOLD gate）
- **PR #128** — trusted client IP / rate limiting 修正，完成後應補回技術或安全文件

---

## 今天（2026-04-20）文件清理重點
- 已更新根 README，改成較精簡的「當前狀態 + 索引」
- 已把 docs 主線明確切成：
  - 當前有效主線
  - 歷史背景
  - 待整理區塊
- 已確認 issue #103 / #104 / #119 對應文件落地 main
- 已確認 #96 應保留 open，文件已存在但主題尚未完結
- 已確認 CI env guard 問題由 PR #127 修復，最新 main CI PASS

---

## 文件維護原則
1. 根 README 不再維護過長歷史流水帳
2. `docs/README.md` 只負責導航與優先級，不複製全部內容
3. issue 關閉時：更新對應文件與索引，不一定要改所有歷史檔
4. 若主線改變，先更新：
   - `../README.md`
   - 本檔
   - 對應 implementation / operations / security 文件
