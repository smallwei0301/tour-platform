# Tour Platform 文件總覽

> 最後更新：2026-05-14
> 當前主線：**上線前就緒（Pre-launch Readiness）**：聚焦真實付款/退款/Email 證據、手動回歸與營運接管（以 #402 為核心）

本目錄的目的不是保存所有歷史，而是讓人快速找到：
1. 現在專案在做什麼
2. 哪些文件是當前主線
3. 哪些文件是歷史背景 / 補充資料

---

## 先看這些（最高優先）

### 專案總覽
- `../README.md` - repo 根總覽

### 當前主線：Pre-Launch Readiness / 金流證據 / 營運接管
- `../README.md` - repo 根總覽與 #402 狀態
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

## 目前 open issue 對應文件主線
- **#402** - `operations/issue-402-real-payment-refund-verification-runbook.md`（真實付款/退款/Email side-effect 證據 runbook）
- **#500** - manual regression / evidence：`qa/booking-v2-rollout-manual-checklist.md`（若未涵蓋 #500 子項，需以 issue #500 記錄為主）
- **#403** - real Google traveler session evidence（目前主要為 issue / code 討論，文件待補：建議新增後在此同步）
- **#318** - onboarding 與營運接手文件（以 `operations/` / `security/` / `qa/` 交叉更新）
- **#319** - CS SOP 演練（相關 SOP 文件由 `operations/` 執行中主題補齊）
- **#320** - readiness gate / soft launch control / Admin Go-No-Go dashboard（文件索引待對齊）
- **#504** - 統整上線證據封裝（目標來源為 issue 討論與驗證回傳）
- **PR #501**：僅作為 SimulatePaid no-op guard，不能作為 #402 結案證據

**注意：** 以上為目前就緒路徑的 source-of-truth 指引，凡未有對應實際文件者，待 issue/PR 補齊後再更新。

**同樣補充：** PR #501 只做 SimulatePaid 模擬回調保護，未驗證真實付款成功/退款/Email side-effect；#402 仍為未結案 blocker。

---

## 今天（2026-05-14）文件清理重點
- 已更新根 README，改成精簡就緒主線地圖：PR #501 是 SimulatePaid no-op guard，不代表 #402 結案
- 已把 docs 主線明確切成：
  - 會造成上線差異的就緒主線
  - 歷史背景
  - 待整理區塊
- 已將 #402 證據路徑收斂到 `operations/issue-402-real-payment-refund-verification-runbook.md`（待人工執行後補齊實測紀錄）
- 已同步 open issue 對應與就緒路徑（#402 / #500 / #403 / #318 / #319 / #320）


---

## 文件維護原則
1. 根 README 不再維護過長歷史流水帳
2. `docs/README.md` 只負責導航與優先級，不複製全部內容
3. issue 關閉時：更新對應文件與索引，不一定要改所有歷史檔
4. 若主線改變，先更新：
   - `../README.md`
   - 本檔
   - 對應 implementation / operations / security 文件
