# Tour Platform 文件總覽

> 最後更新：2026-05-17
> 當前主線：**Soft-Launch 就緒**：soft-launch 控制機制全套上線（#550/#552/#554/#557），Go/No-Go 預設 HOLD，等待人工 QA sign-off（#500）
> 最新 merge：PR #585（docs: restore canonical refund policy v2 source of truth） + PR #584 / #583 / #582 / #581（截至 2026-05-17）

本目錄的目的不是保存所有歷史，而是讓人快速找到：
1. 現在專案在做什麼
2. 哪些文件是當前主線
3. 哪些文件是歷史背景 / 補充資料

---

## 先看這些（最高優先）

### 專案總覽
- `../README.md` - repo 根總覽

### 當前主線：Soft-Launch 就緒 / 手動 QA / Go/No-Go
- `../README.md` - repo 根總覽與 soft-launch 狀態（#402/#403 CLOSED，Go/No-Go 預設 HOLD，需 #500 人工 QA sign-off）
- `NEXT_PHASE_PLAN.md` - 當前下一步與就緒判斷
- `operations/issue-402-real-payment-refund-verification-runbook.md`（Issue #402：真實付款/退款/Email 證據 runbook）
- `operations/booking-v2-daily-go-no-go.md`（Go/No-Go 節奏）
- `operations/booking-v2-b3-rollout.md`（放量與風險控管）
- `qa/booking-v2-rollout-manual-checklist.md`（手動回歸檢核）
- `implementation/issue-96-rollout-contract.md`（readiness 契約參考）

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

## 目前 open issue 對應文件主線（2026-05-17）

**P1（手動 QA）：**
- **#500** - manual regression / evidence：`qa/booking-v2-rollout-manual-checklist.md`

**其他 open：**
- **#586** - docs readiness sync（本任務）
- **#320、#319、#318** - readiness gate、CS SOP、guide onboarding

**已完成，僅供參考：**
- **#402/#403 CLOSED** — 真實付款/退款/Email 證據收斂，`operations/issue-402-real-payment-refund-verification-runbook.md` 保留為歷史/運維操作參考。
- **#545 / #559 / #572 / #573 / #574 / #516 / #515 / #514 CLOSED** — 已關閉，非當前 blocker。
- **#505 / #506 COMPLETE** — Go/No-Go evidence-driven（PR #557）、soft-launch 控制全套（PR #550 / #552 / #554）均已落地。
- **#528 COMPLETE** — Node 22 pin（PR #548）

**注意：** 以上為目前就緒路徑的 source-of-truth 指引，凡未有對應實際文件者，待 issue/PR 補齊後再更新。

---

## 2026-05-17 文件同步重點
- 根 README 與本檔已同步至 2026-05-17 live state（issues：#586, #500, #320, #319, #318）
- #402/#403 已 CLOSED — 保留證據/流程 runbook 作為歷史參考，Go/No-Go 現況仍 HOLD（待人工 QA sign-off）
- Soft-launch 控制機制全套落地：admin kill-switch、checkout guards、admin UI、evidence-driven Go/No-Go（PR #550–#557）
- Node 22 已 pin（PR #548）
- 開放 PR：0（`gh pr list --state open`）
- 最近 merged（截至 2026-05-17）：PR #585/#584/#583/#582/#581
- 目前 open issue 數：5（`gh issue list --state open`）


---

## 文件維護原則
1. 根 README 不再維護過長歷史流水帳
2. `docs/README.md` 只負責導航與優先級，不複製全部內容
3. issue 關閉時：更新對應文件與索引，不一定要改所有歷史檔
4. 若主線改變，先更新：
   - `../README.md`
   - 本檔
   - 對應 implementation / operations / security 文件
