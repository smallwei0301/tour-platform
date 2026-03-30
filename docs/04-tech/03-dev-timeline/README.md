# 03. 開發時程計劃

## 總覽

| Phase | 時間 | 目標 | 狀態 |
|-------|------|------|------|
| Phase 0 | Week 1~2 | 環境建置 + 基礎架構 | 🔜 待開始 |
| Phase 1 | Week 3~8 | 消費者 MVP（瀏覽 + 預約 + 付款） | 🔜 |
| Phase 2 | Week 9~14 | 導遊後台 + 自動結算 | 🔜 |
| Phase 3 | Week 15~20 | 評價系統 + 優化 + Beta 測試 | 🔜 |
| Phase 4 | Week 21~26 | 成長功能 + LINE Pay + SEO | 🔜 |

---

## Phase 0 — 環境建置（Week 1~2）

### Week 1
- [ ] GitHub repo 建立 + 分支策略（main / develop / feature/*）
- [ ] Next.js 14 專案初始化
- [ ] Supabase 專案建立 + 資料庫 Schema 設計
- [ ] Vercel 部署設定
- [ ] 環境變數管理（.env.local / Vercel env）
- [ ] ESLint + Prettier + Husky 設定

### Week 2
- [ ] 資料庫 Migration 腳本
- [ ] NextAuth.js 設定（Google + LINE 登入）
- [ ] Tailwind CSS + shadcn/ui 元件庫
- [ ] 基本 Layout 元件（Header / Footer / Nav）
- [ ] CI/CD Pipeline（GitHub Actions → Vercel）

---

## Phase 1 — 消費者 MVP（Week 3~8）

### Week 3~4：活動列表
- [ ] 活動資料表（activities table）
- [ ] 活動列表頁（/activities）— 篩選：地區、類型、日期
- [ ] 活動卡片元件
- [ ] 活動詳情頁（/activities/[id]）
- [ ] 導遊個人頁（/guides/[id]）

### Week 5~6：預約流程
- [ ] 日期選擇器（react-day-picker）
- [ ] 人數選擇 + 定員檢查
- [ ] 預約確認頁
- [ ] 訂單建立 API（POST /api/orders）
- [ ] 訂單狀態管理（pending / confirmed / cancelled）

### Week 7~8：金流串接
- [ ] ECPay 商家申請 + 沙箱測試
- [ ] 信用卡付款流程
- [ ] ATM 虛擬帳號
- [ ] 付款完成 Callback 處理
- [ ] 確認信 Email（Resend）
- [ ] 訂單查詢頁（/orders/[id]）

---

## Phase 2 — 導遊後台（Week 9~14）

### Week 9~10：導遊申請
- [ ] 導遊申請表單（/guide/apply）
- [ ] KYC 文件上傳（Supabase Storage）
- [ ] 審核後台（/admin/guides）
- [ ] 導遊狀態：pending / approved / suspended

### Week 11~12：活動管理
- [ ] 導遊儀表板（/guide/dashboard）
- [ ] 活動上架表單（標題、描述、照片、日期、定員、價格）
- [ ] 行事曆元件（react-big-calendar）
- [ ] 接受 / 拒絕預約功能

### Week 13~14：收益結算
- [ ] 收益報表頁（/guide/earnings）
- [ ] 提款申請流程
- [ ] 銀行帳號綁定
- [ ] 自動結算邏輯（活動完成後 T+7）

---

## Phase 3 — 評價 + Beta（Week 15~20）

### Week 15~16：評價系統
- [ ] 行程結束後 Email 提醒評價
- [ ] 消費者評價表單
- [ ] 導遊評分展示（星等 + 評論）
- [ ] 惡意評價檢舉機制

### Week 17~18：通知系統
- [ ] Email 通知（訂單確認、行程提醒、評價邀請）
- [ ] LINE Notify 串接（導遊接案通知）
- [ ] 後台通知中心

### Week 19~20：Beta 測試
- [ ] 邀請 10 位導遊 + 50 位遊客測試
- [ ] Bug 修正
- [ ] 效能優化（Lighthouse 分數 > 85）
- [ ] 安全性稽核

---

## Phase 4 — 成長功能（Week 21~26）

- [ ] LINE Pay 串接
- [ ] SEO 優化（sitemap、meta、結構化資料）
- [ ] Google Analytics 4 + 轉換追蹤
- [ ] 活動搜尋功能（全文搜尋）
- [ ] 促銷碼 / 折扣系統
- [ ] 企業包團詢價表單（B2B）
- [ ] PWA 支援（手機體驗優化）

---

## 分支策略

```
main          ← 生產環境，只接受 PR
  └─ develop  ← 開發主幹
       ├─ feature/booking-flow
       ├─ feature/ecpay-integration
       └─ fix/order-status-bug
```

## Sprint 規則

- Sprint 長度：2 週
- 每週 Code Review：週五
- Deploy to Production：每個 Sprint 結束
