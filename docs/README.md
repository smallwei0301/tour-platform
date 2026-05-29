# Tour Platform 文件總覽

> 最後更新：2026-05-30（refs #846：移除已關閉 #621/#787/#640/#641 作為當前主線；指向 live-state 快照）
> 當前主線：**Booking V2 已上線且為預設**（#621/#787 已 CLOSED）；當前優先事項請查閱 live-state 快照
> 即時 live state 請看：[`operations/reports/readiness-live-state-latest.md`](./operations/reports/readiness-live-state-latest.md)（執行 `npm run readiness:snapshot` 刷新）
> Snapshot auto-refreshed every 6h by CI; treat as stale if header timestamp is >12h old. Run `npm run readiness:snapshot` to refresh. Not live truth.

本目錄的目的不是保存所有歷史，而是讓人快速找到：
1. 現在專案在做什麼
2. 哪些文件是當前主線
3. 哪些文件是歷史背景 / 補充資料

---

## 先看這些（最高優先）

### 專案總覽
- `../README.md` - repo 根總覽

### 當前主線：Booking V2 上線 / 觀察視窗
- `../README.md` - repo 根總覽
- `NEXT_PHASE_PLAN.md` - 當前下一步與就緒判斷
- `operations/reports/readiness-live-state-latest.md` — **即時 live state 快照（自動生成，勿手改）**
- `operations/issue-402-real-payment-refund-verification-runbook.md`（Issue #402：真實付款/退款/Email 證據 runbook，歷史參考）
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

## 目前 open issue 對應文件主線

> **Live-state 不在本文硬編碼，以防 drift。**
> 即時 open issues / open PRs / latest merged PRs，請查閱：
> **[`operations/reports/readiness-live-state-latest.md`](./operations/reports/readiness-live-state-latest.md)**
> 或執行 `npm run readiness:snapshot` 刷新。

**當前主線 issue：請以 live-state 快照為準（上方連結）**

**已完成，僅供參考（歷史）：**
- **#621 CLOSED** — Booking / Availability V2 成為旅客主要流程（PR #800）
- **#787 CLOSED** — Booking V2 沿用 legacy booking UI（PR #789）
- **#640 / #641 CLOSED** — V2 Launch QA blocker checklist 與 rollback drill（已完成）；`qa/booking-v2-rollout-manual-checklist.md` 保留為歷史參考
- **#642**（V2 觀察視窗 + legacy fallback 守護）— 狀態請以 live-state 快照為準
- **#586 / #588 CLOSED** — docs readiness sync / evidence pack resync（PR #587/#589 merged）
- **#402/#403 CLOSED** — 真實付款/退款/Email 證據；`operations/issue-402-real-payment-refund-verification-runbook.md` 保留為歷史/運維參考，非當前完成條件。
- **#545 / #559 / #572 / #573 / #574 / #516 / #515 / #514 CLOSED** — 已關閉，非當前 blocker。
- **#505 / #506 COMPLETE** — Go/No-Go evidence-driven（PR #557）、soft-launch 控制全套（PR #550 / #552 / #554）均已落地。
- **#528 COMPLETE** — Node 22 pin（PR #548）

**注意：** 以上為目前就緒路徑的 source-of-truth 指引，凡未有對應實際文件者，待 issue/PR 補齊後再更新。

---

## 2026-05-22 文件同步重點
- **本次更新（PR 解決 #590）**：移除硬編碼 live-state，改以 `operations/reports/readiness-live-state-latest.md` 為 source of truth，防止下次 drift
- #586/#588 已 CLOSED — 保留歷史指標；docs readiness sync 任務已收斂
- Booking V2 已上線為主流程（PR #678 merged）
- Soft-launch 控制機制全套落地；Go/No-Go 機制持續運行
- Node 22 已 pin（PR #548）


---

## 文件維護原則
1. 根 README 不再維護過長歷史流水帳
2. `docs/README.md` 只負責導航與優先級，不複製全部內容
3. issue 關閉時：更新對應文件與索引，不一定要改所有歷史檔
4. 若主線改變，先更新：
   - `../README.md`
   - 本檔
   - 對應 implementation / operations / security 文件
