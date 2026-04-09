# Tour Platform 完整文件

> 最後更新：2026-04-09  
> 當前進度：**Phase 12 規劃中** — Booking Engine + POS Lite + LINE / LIFF 架構設計已補齊

## 快速導航

### 📊 策略 & 計劃
- `01-strategy/01-project-plan/02-milestone-tracker.md` — 里程碑追蹤
- `01-strategy/01-project-plan/07-ceo-decision-pack-v1.md` — CEO 決策包

### 📱 產品 & 設計
- `02-product/09-product-spec/10-guide-dashboard-manual.md` — 導遊後台操作手冊
- `02-product/09-product-spec/07-mvp-user-flows.md` — MVP 用戶流程

### 🔧 技術
- `04-tech/03-dev-timeline/01-sprint-log.md` — **Sprint 執行記錄（最重要）**
- `04-tech/03-dev-timeline/07-tracy-implementation-task-list-v1.md` — **Tracy 工程任務拆分版（Booking + POS）**
- `04-tech/04-tech-architecture/02-database-schema.md` — DB Schema
- `04-tech/04-tech-architecture/03-api-spec.md` — API 規格（v1）
- `04-tech/04-tech-architecture/08-booking-pos-improvement-plan.md` — **Booking + POS 改造總方案**
- `04-tech/04-tech-architecture/09-booking-pos-migration-plan.md` — **Migration 設計**
- `04-tech/04-tech-architecture/10-api-spec-v2-booking-pos.md` — **API Spec V2**
- `06-analytics/01-event-tracking-design.md` — 事件追蹤設計
- `06-analytics/02-tp004-engineering-report.md` — TP-004 工程報告

### 💰 商業
- `05-business/02-investor-deck/05-progress-report-2026-04.md` — 投資人進度報告

## 最新進度摘要（2026-04-09）

✅ **Phase 9 / 10 已完成**
- Google OAuth 登入
- Email 通知基礎
- ECPay 沙箱與安全加固

✅ **Booking Engine + POS Lite 規劃文件已補齊**
- `08-booking-pos-improvement-plan.md`
- `09-booking-pos-migration-plan.md`
- `10-api-spec-v2-booking-pos.md`
- `07-tracy-implementation-task-list-v1.md`

🔜 **下一步（Phase 12 規劃）**
- Availability-driven booking engine
- Admin POS Lite
- LINE / LIFF booking flow
- Web booking v2 切流

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
