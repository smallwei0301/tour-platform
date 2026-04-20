# Tour Platform — 台灣在地導遊交易平台

> **一句話定位：** 讓旅客可以直接預約真正在地的導遊與特色行程，讓導遊可以管理場次、接單、收款與營運。

---

## 🔖 目前專案狀態（2026-04-20 更新）

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
Phase 11 Andy Lee Go-Live             ░░░░░░░░░░░░   0% 🔜
Phase 12 Booking Engine + POS Lite    █░░░░░░░░░░░  10% 🛠️ 文件與基礎規劃已落地
Phase 13 成長基礎                     ░░░░░░░░░░░░   0% 🔜
```

**目前主線：** Booking Engine V2 / Booking V2 rollout / 安全與 CI 穩定化。  
**最新狀態：** 今日已完成多張 PR merge、舊衝突 PR 重開整理、Issue 收斂、CI 修復並重新轉綠。

---

## 📌 今日收斂結果（2026-04-20）

### 已 merge 的重點 PR
- **#120** — issue #119 closure / evidence package
- **#121** — block default guide session secret in production
- **#122** — docs(issue-103): metrics dashboard contract
- **#123** — docs(issue-96): rollout phase contract + acceptance matrix
- **#124** — docs(qa): Booking V2 rollout manual checklist + test report
- **#125** — docs(issue-104): rollback runbook + rollback drill evidence
- **#126** — re-land secret scan guard and sanitized env template
- **#127** — fix(ci): provide strong `GUIDE_SESSION_SECRET` for production build guard

### 今日已關閉的 issue
- **#56** — Security Vulnerability: Exposed Secrets in Version Control
- **#57** — Default Cryptographic Secret in Production
- **#103** — Metrics dashboard contract artifact
- **#104** — Rollback runbook / drill evidence
- **#119** — Security follow-up closure issue

### 目前保留 open 的主線 issue
- **#96** — Booking page V2 rewrite evaluation and phased rollout
- **#105** — Daily Go/No-Go automation
- **#117** — CSRF Phase 2 follow-up
- **#128 (open PR)** — trusted client IP resolver for rate-limited routes

### CI 狀態
- 今日 merge 後曾出現 main CI failure
- 根因不是 docs merge regression，而是 **#121 安全 guard 生效後，GitHub Actions workflow 缺少合格的 `GUIDE_SESSION_SECRET` / `ADMIN_ACCESS_TOKEN`**
- 已由 **PR #127** 修復
- 最新 main CI：**PASS**

---

## 🚀 現在建議先看哪些文件

### 1. 專案總覽 / 文件索引
- [`docs/README.md`](./docs/README.md)

### 2. 當前主線（Booking V2 / rollout）
- [`docs/implementation/issue-96-rollout-contract.md`](./docs/implementation/issue-96-rollout-contract.md)
- [`docs/operations/booking-v2-b3-rollout.md`](./docs/operations/booking-v2-b3-rollout.md)
- [`docs/operations/booking-v2-daily-go-no-go.md`](./docs/operations/booking-v2-daily-go-no-go.md)
- [`docs/qa/booking-v2-rollout-manual-checklist.md`](./docs/qa/booking-v2-rollout-manual-checklist.md)

### 3. 技術核心文件
- [`docs/04-tech/04-tech-architecture/02-database-schema.md`](./docs/04-tech/04-tech-architecture/02-database-schema.md)
- [`docs/04-tech/04-tech-architecture/03-api-spec.md`](./docs/04-tech/04-tech-architecture/03-api-spec.md)
- [`docs/04-tech/04-tech-architecture/08-booking-pos-improvement-plan.md`](./docs/04-tech/04-tech-architecture/08-booking-pos-improvement-plan.md)
- [`docs/04-tech/04-tech-architecture/10-api-spec-v2-booking-pos.md`](./docs/04-tech/04-tech-architecture/10-api-spec-v2-booking-pos.md)

### 4. 安全 / 收斂文件
- [`docs/security/issue-119-evidence-2026-04-20.md`](./docs/security/issue-119-evidence-2026-04-20.md)
- [`docs/security/issue-56-secret-rotation-checklist.md`](./docs/security/issue-56-secret-rotation-checklist.md)
- [`docs/security/issue-56-blocker-followup-status.md`](./docs/security/issue-56-blocker-followup-status.md)

---

## ✅ 功能狀態（精簡版）

### 已完成
- 前台 MVP + 活動頁 + 預訂流程
- Admin 後台（訂單、退款、導遊審核、行程 CRUD、營運追蹤）
- 導遊儀表板（登入、場次管理、訂單查看）
- 付款扣位閉環 + callback + 冪等保護
- Google OAuth / 旅客登入 / 我的訂單
- Email 通知基礎
- 事件追蹤 / 基本 E2E 測試地基
- 安全加固第一輪（issue #56 / #57 / #119 收斂）
- secret-scan guard + CI env 修復

### 進行中
- Booking Engine V2 / Booking page V2 rollout
- Availability / slots / POS Lite
- rollout 監控與 go/no-go automation

---

## 🧭 Repo 結構

```text
tour-platform/
├── apps/web/            Next.js Web（前台 / API / Admin / Guide）
├── supabase/            migrations / scripts
├── docs/                策略 / 產品 / 技術 / 商業 / 法務 / 營運文件
└── README.md            專案總覽（本文件）
```

---

## 📝 文件維護原則
- `README.md` 只放：當前狀態、主線、最重要索引
- 細節進度請看 `docs/`，不要把所有歷史都堆回根 README
- 若 issue / PR / CI 狀態有重大變化，優先更新：
  1. `README.md`
  2. `docs/README.md`
  3. 對應主線文件或安全文件
