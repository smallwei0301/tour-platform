# Tour Platform — Web App（前台 + Admin 後台 + Guide 後台）

> 整合前台旅客介面、Admin 管理後台、導遊儀表板

## 當前狀態（2026-04-06）

✅ **Phase 8 完成** — 量測地基 + E2E 漏斗測試（10/10 testid PASS）

### 最新成就
- ✅ 事件追蹤系統上線：track.ts / utm.ts / /api/events
- ✅ E2E 漏斗測試基礎就位：funnel-booking-payment.spec.ts
- ✅ ECPay 回調 API 準備好
- ✅ 所有前台頁面 + 訂單流程 + 導遊後台 完整

## 技術棧

- **Framework：** Next.js 15 (App Router)
- **UI：** React + CSS-in-JS
- **DB：** Supabase PostgreSQL + RLS
- **Storage：** Supabase Storage（WebP，Canvas 壓縮）
- **Auth：** 導遊自製 session + UUID invite token
- **支付：** ECPay（目前 mock，真實串接待開始）
- **Testing：** Playwright E2E

## 文件

- `/app` — Next.js App Router 路由
- `/src/lib` — 共用邏輯（DB、API、track）
- `/src/components` — React 元件庫
- `/e2e` — Playwright 測試用例
- `/public` — 靜態資源

## 開發

```bash
npm install
npm run dev          # localhost:3000
npm run build
npm test             # Playwright
```

## 部署（Vercel）

```bash
vercel
```

**主要部署分支：** `main`  
**最新 commit：** `dca4eaf` Merge PR#2（2026-04-06 01:03）
