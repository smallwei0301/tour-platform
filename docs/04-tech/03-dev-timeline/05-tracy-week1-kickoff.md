# Tracy Week 1 Kickoff Plan — Tour Platform MVP

> 目標：讓 Tracy 在第一週不做無效功，直接進入可交付節奏。
> 更新日期：2026-03-27

---

## 1. 第一週總目標

第一週不要追求全站完成，只要拿下這三件事：

1. 建立可跑的專案骨架
2. 打通 MVP 最核心資料流
3. 做出第一條可驗證的主流程雛型

### 第一週驗收標準
- 有可執行的 app skeleton
- 有最小資料模型
- 有活動頁 + 場次顯示 + 建單入口
- 有導遊後台建立活動 / 場次的基本界面
- 有 admin 能查看訂單 / 導遊申請的骨架

---

## 2. Tracy 第一週工作排序

### Day 1：專案骨架與技術基礎
- 建立 Next.js 14 + TypeScript 專案骨架
- 設定 Tailwind + shadcn/ui
- 建立路由骨架
- 建立 Supabase 專案與 env placeholders
- 定義 shared types（User / Guide / Activity / Schedule / Order）

### Day 2：資料模型與 mock / seed 基礎
- 依 `04-tech-architecture/02-database-schema.md` 建立 schema 初版
- 至少建出：
  - users
  - guide_profiles
  - guide_applications
  - activities
  - activity_schedules
  - orders
- 建立最小 seed data
- 先讓頁面可以吃假資料

### Day 3：導遊供給端骨架
- `/guide/apply`
- `/guide/dashboard`
- `/guide/dashboard/activities`
- `/guide/dashboard/schedules`
- 可建立 activity
- 可建立 schedule

### Day 4：旅客交易主流程骨架
- `/activities`
- `/activities/[id]`
- 日期選擇 UI
- 場次名額顯示
- 建單 API stub
- booking 頁骨架

### Day 5：Admin 與系統狀態骨架
- `/admin/guides`
- `/admin/orders`
- `/admin/refunds`
- 可查看主要狀態
- 可手動變更基本狀態（mock 或 stub）

---

## 3. 第一週不能分心的原則

### 不要先做
- 花俏動畫
- SEO 細節
- Blog
- 完整會員中心
- 聊天
- 推薦系統
- 多語
- 精緻行銷頁

### 要先做
- 供給能建立
- 場次能管理
- 名額能顯示
- 訂單能建立
- 後台能人工介入

---

## 4. 技術上建議的實作順序

### Phase A：先用假資料把 UI 與流程串起來
先不要一開始就被真實金流和真實 auth 卡死。

建議：
- 首頁、列表頁、活動頁、導遊後台、admin 後台
- 先吃本地 mock / seed data
- 確認流程與頁面沒走歪

### Phase B：再接資料庫
- 把 mock 替換成 Supabase query
- 把表單寫入 DB

### Phase C：最後接 ECPay
- 金流最容易拖時間
- 第一週不用要求真的付款成功，只需把接口位置留好

---

## 5. 第一週最重要的畫面

Tracy 第一週一定要先做出來的畫面：

1. 活動詳情頁
2. 日期 / 場次選擇元件
3. 導遊建立活動頁
4. 導遊建立場次頁
5. admin 訂單列表頁

因為這五個畫面能最快證明這專案不是內容殼，而是交易骨架。

---

## 6. 第一週產出物

到週末時，Tracy 應該至少交出：
- app route tree
- schema 初版
- seed data 初版
- 活動 / 場次 / 訂單相關主要頁面骨架
- 一段 demo：
  - 導遊建立活動
  - 導遊建立日期
  - 前台看到日期
  - 建單入口可動

---

## 7. Emily 的一句話要求

**第一週的任務不是做漂亮，而是把供給、場次、交易骨架立起來。**
