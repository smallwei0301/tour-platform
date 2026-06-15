# Tour Platform — 台灣在地導遊交易平台

> **一句話定位：** 讓旅客可以直接預約真正在地的導遊與特色行程，讓導遊可以管理場次、接單、收款與營運。  
> **這份 README 的目的：** 讓下一位開發者、PM、QA、營運在 5–10 分鐘內看懂：現在做到哪裡、還缺什麼、下一步該做什麼、做到什麼標準才算正式上線。

---

## 🎯 品牌識別（Midao · 祕島）

本專案採用 **Midao（祕島）** 品牌系統。所有網頁文案、配色、設計、社群內容**必須參考** **[BRAND_BOOK.md](./BRAND_BOOK.md)**。

### 🚀 快速導航

| 工作項目 | 參考位置 |
|---------|--------|
| 🎨 **網頁文案編寫** | [BRAND_BOOK.md](./BRAND_BOOK.md) → Section 05 · Copywriting Library |
| 🎭 **品牌語氣（必讀！）** | [BRAND_BOOK.md](./BRAND_BOOK.md) → Section 06 · Voice & Tone |
| 🌈 **配色系統** | [BRAND_BOOK.md](./BRAND_BOOK.md) → Section 03 · Color System |
| 🔤 **字體規範** | [BRAND_BOOK.md](./BRAND_BOOK.md) → Section 04 · Typography |
| 🏷️ **Logo 使用** | [BRAND_BOOK.md](./BRAND_BOOK.md) → Section 02 · Logo System |
| 📝 **命名系統** | [BRAND_BOOK.md](./BRAND_BOOK.md) → Section 01 · Naming Architecture |
| 📱 **社群 Bio / Email** | [BRAND_BOOK.md](./BRAND_BOOK.md) → Section 05-08 |
| ⚡ **前端效能（提 PR 前必讀）** | [docs/04-tech/04-tech-architecture/11-frontend-perf-pitfalls.md](./docs/04-tech/04-tech-architecture/11-frontend-perf-pitfalls.md) → preload 洩漏 / Suspense fallback / CJK 字體 / SSR re-fetch 反模式 |
| 🩺 **全 Repo 健檢與優化指南（2026-06-11）** | [docs/operations/reports/repo-health-audit-20260611.md](./docs/operations/reports/repo-health-audit-20260611.md) → KKday 視角功能缺口 / 架構技術債 / SEO / 資安 / 優化路線圖 |

### ✅ 最新品牌應用

- **2026-04-27**
  - ✅ Hero Section 文案改寫（Commit: `9e641f1`）
  - ✅ ValueTrustSection 文案精煉（Commit: `6e535a0`）
  - ✅ [完整 PR 文檔](./PR_BRAND_IDENTITY.md)

---

## 1. 專案現況（2026-06-01）

### 已完成的基礎能力
- 前台 MVP 已完成
- Admin 後台已完成核心功能（含 POS additional-payment、order detail + timeline、refund timeline）
- 導遊儀表板已完成第一版
- 訂單建立 / 付款 callback / 席位扣減 / 退款申請等閉環已完成第一輪
- 旅客 Google OAuth / 我的訂單 / Email 通知已完成
- 安全加固第二輪已完成（owner/session authz、idempotent checkout、rate-limit headers、slot capacityLeft）
- LINE / LIFF audit trail 第一輪已落地（#178 closed）
- secret scan guard 已落地
- GitHub Actions CI 已修復並維持轉綠

### 2026-05-20 → 2026-05-25 收斂（近 7 天重點）

**Booking V2 / Traveler Flow：**
- **#621 CLOSED**：Booking / Availability V2 已成為旅客主要流程（已結案）
- **#787 CLOSED**：Booking V2 沿用 legacy booking UI 已落地（已結案）
- PR #786 已合併：Booking V2 minimum participants 與 one-date UX 已對齊
- PR #789 已合併：Booking V2 legacy booking UI 已落地

**Launch / Observation：**
- #642 繼續監看 V2 observation window，避免 legacy fallback 靜默回歸
- #784 / #704 維持近期 merged PR 的 daily QA checklist
- open PR 目前為 1；主線工作集中在 open issues 與下一批 PR

**Ops / Readiness：**
- #607 / #714：production alert drill 與 operator evidence
- #594 / #724：Supabase backup/restore runbook 與 live restore drill
- #320 / #319 / #318 / #593 / #606：上線前仍需人類決策的 readiness / SOP / guide / risk / KYC 類議題

### 還 open 的主線

> **Live state is not encoded here to prevent recurring drift.**
> For the current open issues, open PRs, and latest merged PRs, see the auto-generated snapshot:
> **[docs/operations/reports/readiness-live-state-latest.md](./docs/operations/reports/readiness-live-state-latest.md)**
> Refresh with: `npm run readiness:snapshot`
>
> Snapshot auto-refreshed every 6h by CI; treat as stale if header timestamp is >12h old. Run `npm run readiness:snapshot` to refresh. Not live truth.

**已結案 / 歷史參考（不再是當前 open blocker）：**
- **#621 CLOSED** — Booking / Availability V2 已成為旅客主要流程（PR #800）
- **#787 CLOSED** — Booking V2 沿用 legacy booking UI 已落地（PR #789）
- **#640 / #641 CLOSED** — V2 Launch QA blocker checklist 與 rollback drill 已完成
- **#586 CLOSED** — docs readiness sync（PR #587 merged）
- **#588 CLOSED** — evidence pack live-state resync（已結案）
- **#402 CLOSED** — 真實付款/退款/Email 證據；文件仍保留為歷史 runbook 參考。
- **#403 CLOSED** — Google traveler browser session 證據；storageState 已失效，後續驗證需重建。
- **#545 / #559 / #572 / #573 / #574 / #516 / #515 / #514 CLOSED** — 已完成/已關閉，非當前主線 blocker。

### 最新 CI / 主線真值

> **For current PR and issue counts, see the live-state snapshot.**
> [`docs/operations/reports/readiness-live-state-latest.md`](./docs/operations/reports/readiness-live-state-latest.md)

- main 持續以 CI / readiness snapshot 作為真值；本 README 不手寫即時數字
- 最新 merge（截至 2026-06-01）：PR #1062（docs: add GH-1061 late PR regression QA report）
- **Node 22 已 pin**：.nvmrc + engines field（PR #548）
- **目前主線焦點：** #621 / #787 已 CLOSED；#642 持續監看 observation window 與 legacy fallback。當前優先事項請查閱 `docs/operations/reports/readiness-live-state-latest.md` 或執行 `npm run readiness:snapshot`。
- **Automated health-check issue policy:** for dedupe lookup, required labels, sanitized body fields, and survivor designation, see [`docs/ISSUE_ROUTING_AND_CLASSIFICATION_SOP.md` — "Automated health-check issues"](./docs/ISSUE_ROUTING_AND_CLASSIFICATION_SOP.md#automated-health-check-issues).

### Go-Live 仍缺

- **#402/#403 已 CLOSED**，不再是目前 open blocker；仍保留 runbook/證據歷史作為運維參考。
- Soft-launch 控制機制已全套就緒（admin kill-switch + checkout guards + admin UI）
- 操作人員可在 `docs/operations/issue-402-real-payment-refund-verification-runbook.md` 取得可執行驗證參考（非當前開啟 blocker）

> ℹ️ For the current live state of issues and PRs, run `npm run readiness:snapshot` or see `docs/operations/reports/readiness-live-state-latest.md`.

#### 實作前資料同步檢查（每次更新 readiness docs）
- 先跑 `gh issue list --repo smallwei0301/tour-platform --state open --limit 100 --json number,title,labels,updatedAt,url`
- 再跑 `gh pr list --repo smallwei0301/tour-platform --state open --limit 50 --json number,title,headRefName,baseRefName,isDraft,updatedAt,url`
- 最後確認近期 merged PR（`gh pr list --repo smallwei0301/tour-platform --state merged --limit 20 --json number,title,mergedAt,headRefName,url`）是否反映到文件中
- 或直接執行 `npm run readiness:snapshot` 自動產生 `docs/operations/reports/readiness-live-state-latest.md`

---

## 2. Phase 全貌（從已完成到正式營運）

```text
Phase 1  前台 MVP                     ████████████ 100% ✅
Phase 2  Admin 後台核心               ████████████ 100% ✅
Phase 3  UI 精修                      ████████████ 100% ✅
Phase 4  行程後台                     ████████████ 100% ✅
Phase 5  付款扣位完整閉環             ████████████ 100% ✅
Phase 6  導遊儀表板                   ████████████ 100% ✅
Phase 7  前台訂單流程完整             ████████████ 100% ✅
Phase 8  量測地基 + E2E               ████████████ 100% ✅
Phase 9  旅客 Auth + 通知             ████████████ 100% ✅
Phase 10 正式金流 + 安全加固          ████████████ 100% ✅
Phase 11 Go-Live 準備                 ██████████░░  75% 🛠️
Phase 12 Booking Engine + POS Lite    █████████░░░  70% 🛠️
Phase 13 Rollout / 營運穩定化         ███░░░░░░░░░  25% 🛠️
Phase 14 正式營運                     ░░░░░░░░░░░░   0% 🎯
```

---

## 3. 每個 Phase 的實際意義

### Phase 1–10：已完成的基礎建設
這一段已經把平台最重要的底座做出來：
- 可瀏覽活動
- 可建立訂單
- 可付款 / callback / 更新狀態
- 有 Admin 後台
- 有 Guide Dashboard
- 有旅客登入與通知
- 有第一輪安全與 CI 基礎

### Phase 11：Go-Live 準備（現在最重要）
這不是再做酷功能，而是把平台變成「**真的能收錢、能出團、能處理客服與退款**」的狀態。

### Phase 12：Booking Engine + POS Lite
這是下一代 booking 核心，目的是：
- 不再只靠靜態 schedule 思維
- 轉向 availability / slots / booking engine
- 讓前台、客服、櫃台、導遊的訂單流程更穩

### Phase 13：Rollout / 營運穩定化
這一段的目標是：
- 分階段切流
- 每日 go/no-go
- rollback 可執行
- 監控、客服、事故應變、品質控制一起就位

### Phase 14：正式營運
標準不是「網站可以開」，而是：
- 能穩定接單
- 能穩定收款
- 能穩定退款 / 結算
- 有客服 / 事故處理 / 品質控制 SOP
- 有基本營運指標與 daily review

---

## 4. 下一位開發者最應該先做什麼

### Step 1：先理解主線，不要亂接舊 roadmap
先看：
- [`docs/README.md`](./docs/README.md)
- [`docs/implementation/issue-96-rollout-contract.md`](./docs/implementation/issue-96-rollout-contract.md)
- [`docs/implementation/issue-181-line-liff-go-no-go-readiness.md`](./docs/implementation/issue-181-line-liff-go-no-go-readiness.md)
- [`docs/operations/booking-v2-b3-rollout.md`](./docs/operations/booking-v2-b3-rollout.md)
- [`docs/operations/booking-v2-daily-go-no-go.md`](./docs/operations/booking-v2-daily-go-no-go.md)
- [`docs/qa/booking-v2-rollout-manual-checklist.md`](./docs/qa/booking-v2-rollout-manual-checklist.md)

### Step 2：先看現在還開著的主線 issue

> 查詢即時 open issues 請用: `gh issue list --repo smallwei0301/tour-platform --state open --limit 20`
> 或參閱: [`docs/operations/reports/readiness-live-state-latest.md`](./docs/operations/reports/readiness-live-state-latest.md)

目前不要自己發明主線，先確認 open issues（依優先順序接手）。**#621 / #787 已 CLOSED**；當前主線請以 live-state 快照為準：`docs/operations/reports/readiness-live-state-latest.md`（執行 `npm run readiness:snapshot` 刷新）。

歷史已結案（勿視為當前主線）：
- **#621 CLOSED** — Booking / Availability V2 作為旅客主要流程（已完成）
- **#787 CLOSED** — 用 legacy booking UI 呈現 Booking V2（已完成）

**已完成 / 歷史參考，不需再接：**
- **#586 / #588 CLOSED** — docs readiness sync（PR #587/#589 merged）
- **#402 / #403 CLOSED** — 真實付款、退款、Email 證據未形成正式上線完成條件；文件僅保留為歷史/歷史運維參考。
- **#545 / #559 / #572 / #573 / #574 / #516 / #515 / #514 CLOSED** — 已為已關閉議題（勿當作 open blocker）
- **#505 / #506 / #528 COMPLETED** — Go/No-Go evidence-driven 機制、soft-launch 全套控制、Node 22 pin 均已落地

### Step 3：確認本地與 CI 都健康
- `npm install`
- `npm run build`
- `npm test`
- 確認 `.github/workflows/ci.yml` 的 env guard 邏輯理解正確

### Step 4：判斷你要接的是哪一類任務
- **產品 / rollout / phase 任務** -> 看 `implementation/`、`operations/`、`qa/`
- **技術架構 / schema / API** -> 看 `04-tech/04-tech-architecture/`
- **Go-Live / payment / ops** -> 看 `05-business/06-payment-plan/`、`07-operations-plan/`
- **安全 / incident** -> 看 `security/`

---

## 5. 現在還缺什麼，才可以正式上線

下面不是「想做更好」，而是比較接近「**真的能穩定營運**」還缺的東西。

### A. Go-Live 必做
1. **Andy Lee 真實內容上架完成**
   - 封面圖 / Gallery / 行程細節 / 注意事項 / 集合點 / 價格完整
2. **正式金流最終驗證**
   - ECPay 正式商戶資訊
   - callback / 對帳 / 退款流程可驗證
3. **退款規則拍板**
   - 現在是 Draft v1，還需要業務拍板
4. **結算規則拍板**
   - T+7 / 抽成 / 最低提款門檻 / 對帳流程需定案
5. **導遊 onboarding 可執行**
   - 不只是文件，還要真的能跑一次 onboarding
6. **客服 SOP 可執行**
   - 取消、退款、出團異常、緊急事故要有人能照流程處理

### B. Booking V2 / Traveler Flow 必做
1. ~~**#621** 要完成 V2 primary traveler flow~~ — **CLOSED** (PR #800 已落地)
2. ~~**#787** 要讓 V2 使用 legacy booking UI~~ — **CLOSED** (PR #789 已落地)
3. **#642** 要持續監看 observation window，確認 legacy fallback 不會靜默變回主流程
4. **#1079 Booking V2 plan/source alignment** — 5 個子 section 已於 2026-06-03 全部合併（PR #1123/#1134/#1135/#1137/#1138）；後續子工作詳見 open issues
5. **Payment / order / booking 狀態鏈路** 仍需保留上線前證據：callback、idempotency、booking/order/payment 三層狀態一致
6. **Ops drills**：production alert drill、Supabase restore drill、operator handoff 需要可執行證據
7. 當前主線焦點：查閱 `docs/operations/reports/readiness-live-state-latest.md` 或執行 `npm run readiness:snapshot`

### C. 安全 / 穩定化必做
1. **#68 TypeScript strict mode** 逐步擴大到 booking-critical 以外模組
2. **CI / security guard 持續綠燈**
3. **secret / env / rate limit 不可回退**
4. **post-merge readiness artifacts** 要持續和真實主線同步，避免 docs 漂移

---

## 6. 正式上線（Go-Live）判定標準

### 最低上線標準
以下全部成立，才算可以正式上線：

#### 產品 / 用戶流程
- 旅客可正常瀏覽活動
- 旅客可正常建立訂單
- 旅客可完成付款
- 旅客可看到訂單狀態
- 旅客可取消 / 申請退款

#### 導遊 / 後台
- Admin 可管理活動、訂單、退款
- 導遊可登入並管理基本接單資訊
- 至少一位真實導遊完成 onboarding 並有真實活動內容

#### 金流 / 營運
- 正式金流可用
- callback / 驗簽 / 訂單狀態同步正確
- 退款流程可執行
- 結算規則明確
- 客服 SOP 可執行

#### 安全 / 品質
- main CI 維持 PASS
- 關鍵安全 issue 不處於 open blocker 狀態
- 有 rollback / incident response / quality control 文件與流程
- 至少完成一輪 Go/No-Go 演練

#### 現場營運
- 當日出團資訊明確
- 異常聯絡窗口明確
- 若導遊失聯 / 金流異常 / 用戶爭議，能在 SOP 內找到處理路徑

---

## 7. 建議的下一步執行順序

### 第一優先

> **#621 / #787 已 CLOSED**，不再是執行優先項。當前第一優先請查閱 live-state 快照：
> [`docs/operations/reports/readiness-live-state-latest.md`](./docs/operations/reports/readiness-live-state-latest.md)
> 或執行 `npm run readiness:snapshot` 取得最新狀態。

1. ~~推進 **#621**~~（已 CLOSED — Booking V2 已上線）
2. ~~收斂 **#787**~~（已 CLOSED — legacy booking UI 已落地）
3. 監看 **#642**：V2 observation window 運行，守護 legacy fallback
4. 維持 daily QA checklist，避免近期 merged PR 回歸
5. 保持 readiness docs 與 live state 一致 — 執行 `npm run readiness:snapshot` 定期刷新 `docs/operations/reports/readiness-live-state-latest.md`

### 第二優先
6. 補齊 Go-Live 所需：
   - ECPay 正式串接最終驗證
   - refund policy final
   - settlement rules final
   - onboarding / CS SOP 實跑

### 第三優先
7. 持續收斂 Phase 12 / rollout / docs index，避免 readiness artifact 與真實主線脫節

---

## 8. 重要文件索引

### 當前主線
- [`docs/operations/reports/readiness-live-state-latest.md`](./docs/operations/reports/readiness-live-state-latest.md)
- [`docs/operations/issue-402-real-payment-refund-verification-runbook.md`](./docs/operations/issue-402-real-payment-refund-verification-runbook.md)
- [`docs/operations/booking-v2-b3-rollout.md`](./docs/operations/booking-v2-b3-rollout.md)
- [`docs/operations/booking-v2-daily-go-no-go.md`](./docs/operations/booking-v2-daily-go-no-go.md)
- [`docs/qa/booking-v2-rollout-manual-checklist.md`](./docs/qa/booking-v2-rollout-manual-checklist.md)
- [`docs/qa/reports/2026-04-17-booking-v2-manual-test-report.md`](./docs/qa/reports/2026-04-17-booking-v2-manual-test-report.md)

### 技術設計
- [`docs/04-tech/04-tech-architecture/02-database-schema.md`](./docs/04-tech/04-tech-architecture/02-database-schema.md)
- [`docs/04-tech/04-tech-architecture/03-api-spec.md`](./docs/04-tech/04-tech-architecture/03-api-spec.md)
- [`docs/04-tech/04-tech-architecture/08-booking-pos-improvement-plan.md`](./docs/04-tech/04-tech-architecture/08-booking-pos-improvement-plan.md)
- [`docs/04-tech/04-tech-architecture/09-booking-pos-migration-plan.md`](./docs/04-tech/04-tech-architecture/09-booking-pos-migration-plan.md)
- [`docs/04-tech/04-tech-architecture/10-api-spec-v2-booking-pos.md`](./docs/04-tech/04-tech-architecture/10-api-spec-v2-booking-pos.md)

### 金流 / 營運 / Go-Live
- [`docs/05-business/06-payment-plan/01-ecpay-integration-guide.md`](./docs/05-business/06-payment-plan/01-ecpay-integration-guide.md)
- [`docs/05-business/06-payment-plan/03-settlement-rules.md`](./docs/05-business/06-payment-plan/03-settlement-rules.md)
- [`docs/05-business/06-payment-plan/04-refund-policy-v2.md`](./docs/05-business/06-payment-plan/04-refund-policy-v2.md)（退款政策 Source of Truth）
- [`docs/05-business/06-payment-plan/04-refund-policy-detail.md`](./docs/05-business/06-payment-plan/04-refund-policy-detail.md)（實作參考）
- [`docs/05-business/07-operations-plan/01-guide-onboarding-sop.md`](./docs/05-business/07-operations-plan/01-guide-onboarding-sop.md)
- [`docs/05-business/07-operations-plan/02-customer-service-sop.md`](./docs/05-business/07-operations-plan/02-customer-service-sop.md)
- [`docs/05-business/07-operations-plan/03-quality-control.md`](./docs/05-business/07-operations-plan/03-quality-control.md)
- [`docs/05-business/07-operations-plan/04-incident-response.md`](./docs/05-business/07-operations-plan/04-incident-response.md)
- [`docs/operations/notifications-line-telegram-email.md`](./docs/operations/notifications-line-telegram-email.md)（通知系統現況：LINE/Email/Telegram、覆蓋率落差、目標架構 — LINE 事件 push 目前**暫停**，旗標預設 OFF）

### 安全 / 收斂
- [`docs/security/issue-119-evidence-2026-04-20.md`](./docs/security/issue-119-evidence-2026-04-20.md)
- [`docs/security/issue-119-history-rewrite-runbook.md`](./docs/security/issue-119-history-rewrite-runbook.md)
- [`docs/security/issue-56-secret-rotation-checklist.md`](./docs/security/issue-56-secret-rotation-checklist.md)
- [`docs/security/issue-56-blocker-followup-status.md`](./docs/security/issue-56-blocker-followup-status.md)

---

## 9. Repo 結構

```text
tour-platform/
├── apps/web/            Next.js Web（前台 / API / Admin / Guide）
├── supabase/            migrations / scripts
├── docs/                策略 / 產品 / 技術 / 商業 / 法務 / 營運文件
└── README.md            專案總覽（本文件）
```

---

## 10. README 維護規則
- 這份 README 應優先反映「現在要做什麼」與「要做到什麼才可正式上線」
- 不再維護過長歷史流水帳
- 若 issue / PR / CI 主線有重大變動，優先更新：
  1. 本 README
  2. `docs/README.md`
  3. 對應 implementation / operations / security 文件
