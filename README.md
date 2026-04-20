# Tour Platform — 台灣在地導遊交易平台

> **一句話定位：** 讓旅客可以直接預約真正在地的導遊與特色行程，讓導遊可以管理場次、接單、收款與營運。  
> **這份 README 的目的：** 讓下一位開發者、PM、QA、營運在 5–10 分鐘內看懂：現在做到哪裡、還缺什麼、下一步該做什麼、做到什麼標準才算正式上線。

---

## 1. 專案現況（2026-04-20）

### 已完成的基礎能力
- 前台 MVP 已完成
- Admin 後台已完成核心功能
- 導遊儀表板已完成第一版
- 訂單建立 / 付款 callback / 席位扣減 / 退款申請等閉環已完成第一輪
- 旅客 Google OAuth / 我的訂單 / Email 通知已完成
- 安全加固第一輪已完成
- secret scan guard 已落地
- GitHub Actions CI 已修復並重新轉綠

### 今天剛完成的收斂
- merged PR：#120, #121, #122, #123, #124, #125, #126, #127
- closed issues：#56, #57, #103, #104, #119
- 保留 open：#96, #105, #117
- open PR：#128

### 現在真正主線
1. **#96** Booking page V2 rewrite evaluation and phased rollout
2. **#105** Daily Go/No-Go report automation
3. **#117** CSRF Phase 2 follow-up
4. **PR #128** trusted client IP resolver for rate-limited routes

### 最新 CI 狀態
- 曾因 `GUIDE_SESSION_SECRET` / `ADMIN_ACCESS_TOKEN` 缺漏導致 main CI fail
- 已由 PR #127 修復
- 最新 main CI：**PASS**

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
Phase 11 Go-Live 準備                 ███░░░░░░░░░  25% 🛠️
Phase 12 Booking Engine + POS Lite    █░░░░░░░░░░░  10% 🛠️
Phase 13 Rollout / 營運穩定化         ░░░░░░░░░░░░   0% 🔜
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
- [`docs/operations/booking-v2-b3-rollout.md`](./docs/operations/booking-v2-b3-rollout.md)
- [`docs/operations/booking-v2-daily-go-no-go.md`](./docs/operations/booking-v2-daily-go-no-go.md)
- [`docs/qa/booking-v2-rollout-manual-checklist.md`](./docs/qa/booking-v2-rollout-manual-checklist.md)

### Step 2：先看 open issues / PR
目前不要自己發明主線，先接：
- issue **#96**
- issue **#105**
- issue **#117**
- PR **#128**

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

### B. Booking V2 / Rollout 必做
1. **#96 Booking V2 phased rollout 推進**
2. **#105 Daily Go/No-Go automation 完成**
3. **rollback / dashboard / QA checklist 形成閉環**
4. **feature flag / rollout gating 有明確切流策略**

### C. 安全 / 穩定化必做
1. **#117 CSRF Phase 2**
2. **PR #128 trusted client IP resolver 完成並 merge**
3. **CI / security guard 持續綠燈**
4. **secret / env / rate limit 不可回退**

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
1. merge / resolve **PR #128**
2. 推進 **#117**
3. 推進 **#96** 主線
4. 推進 **#105** 的 go/no-go automation

### 第二優先
5. 補齊 Go-Live 所需：
   - ECPay 正式串接最終驗證
   - refund policy final
   - settlement rules final
   - onboarding / CS SOP 實跑

### 第三優先
6. 開始收斂 Phase 12 / POS Lite / availability-driven booking engine

---

## 8. 重要文件索引

### 當前主線
- [`docs/implementation/issue-96-rollout-contract.md`](./docs/implementation/issue-96-rollout-contract.md)
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
- [`docs/05-business/06-payment-plan/04-refund-policy-detail.md`](./docs/05-business/06-payment-plan/04-refund-policy-detail.md)
- [`docs/05-business/07-operations-plan/01-guide-onboarding-sop.md`](./docs/05-business/07-operations-plan/01-guide-onboarding-sop.md)
- [`docs/05-business/07-operations-plan/02-customer-service-sop.md`](./docs/05-business/07-operations-plan/02-customer-service-sop.md)
- [`docs/05-business/07-operations-plan/03-quality-control.md`](./docs/05-business/07-operations-plan/03-quality-control.md)
- [`docs/05-business/07-operations-plan/04-incident-response.md`](./docs/05-business/07-operations-plan/04-incident-response.md)

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
