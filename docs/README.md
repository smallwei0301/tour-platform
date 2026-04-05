# Tour Platform 完整文件

> 最後更新：2026-04-06  
> 當前進度：**Phase 8 完成（TP-004）** — 量測地基 + E2E 漏斗測試 + 10/10 testid PASS

## 快速導航

### 📊 策略 & 計劃
- `01-strategy/01-project-plan/02-milestone-tracker.md` — 里程碑追蹤
- `01-strategy/01-project-plan/07-ceo-decision-pack-v1.md` — CEO 決策包

### 📱 產品 & 設計
- `02-product/09-product-spec/10-guide-dashboard-manual.md` — 導遊後台操作手冊
- `02-product/09-product-spec/07-mvp-user-flows.md` — MVP 用戶流程

### 🔧 技術
- `04-tech/03-dev-timeline/01-sprint-log.md` — **Sprint 執行記錄（最重要）**
- `04-tech/04-tech-architecture/02-database-schema.md` — DB Schema
- `04-tech/04-tech-architecture/03-api-spec.md` — API 規格
- `06-analytics/01-event-tracking-design.md` — 事件追蹤設計
- `06-analytics/02-tp004-engineering-report.md` — TP-004 工程報告

### 💰 商業
- `05-business/02-investor-deck/05-progress-report-2026-04.md` — 投資人進度報告

## 最新進度摘要（2026-04-06）

✅ **Phase 8（TP-004）完成**
- 事件追蹤系統：track.ts / utm.ts / /api/events
- E2E 漏斗測試基礎：funnel-booking-payment.spec.ts（10 個 TC）
- 10/10 E2E testid 通過驗證（Judy 手測）
- ECPay 金流回調 API 就位
- Commit: dca4eaf（2026-04-06 01:03）

🔜 **Phase 9（旅客 Auth）**
- Google OAuth 登入
- Session 整合

🔜 **Phase 10（正式金流）**
- ECPay 真實刷卡
- Webhook 驗簽
- 導遊分潤撥款

## 技術棧

- Next.js 15（App Router）
- Supabase PostgreSQL + Storage + Auth
- Playwright E2E 測試
- Vercel 部署

## 關鍵成就

| 項目 | 狀態 |
|------|------|
| 前台 MVP | ✅ 100% |
| Admin 後台 | ✅ 100% |
| 導遊儀表板 | ✅ 100% |
| 訂單流程 | ✅ 100% |
| 量測地基 | ✅ 100% |
| E2E 測試 | ✅ 10/10 PASS |
| 旅客 Auth | 🔜 下一步 |
| 真實金流 | 🔜 待開始 |

## 部署

- **平台：** Vercel
- **Branch：** main
- **Latest：** dca4eaf（2026-04-06）

---

更詳細的文件結構請參考本目錄下各個子資料夾。
