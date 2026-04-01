# Sprint 執行日誌

> 最後更新：2026-03-31
> 當前進度：Sprint 3.3 完成，進入 Sprint 4 規劃

---

## 已完成 Sprint 總覽

### Sprint 0 — 基礎架構
- monorepo 架構（apps/web, packages/ui, packages/config）
- Next.js App Router scaffold
- Vercel 部署設定
- GitHub Actions CI
- Supabase adapter（含 fallback）
- 煙霧測試腳本

### Sprint 1 — 前台 MVP UI
- 首頁（Hero、精選行程、導遊 Spotlight、FAQ、主題 CTA）
- 活動列表頁（篩選側欄、排序）
- 活動詳情頁（sticky booking sidebar、時間軸）
- 導遊列表頁、導遊個人頁
- 3-step 預訂流程（booking → checkout → success）
- 訂單列表 / 訂單詳情（含退款進度 UI）
- Cave / River 主題 landing page
- Blog、Contact、About、Why Choose Us
- 法律頁（隱私政策、退款規則、服務條款）
- 導遊申請頁

### Sprint 1.5–1.9 — 後台基礎 + 金流
- ECPay 金流 callback API
- Order create + seat occupancy API
- Payment callback flow
- `/api/experiences` — Supabase 接線
- `/api/orders` — 建立訂單
- `/api/me/orders` — 我的訂單 + 退款申請
- Admin refund panel MVP

### Sprint 2.0–2.9 — Admin 後台深化
- Sprint 2.0：Admin 訂單 2.0 + 導遊審核 1.0
- Sprint 2.1：訂單詳情 + 手動備註 + admin note
- Sprint 2.2：例外處理 + audit log skeleton
- Sprint 2.3：營運追蹤 MVP（contribution margin、人工成本、健康度、CSV 匯出）
- Sprint 2.4：admin dashboard 首頁整合
- Sprint 2.5–2.6：dashboard UX + 互動優化 + 行動版
- Sprint 2.7：KPI 定義校準 + 說明面板
- Sprint 2.8：可配置 KPI 計算器（admin settings）
- Sprint 2.9：KPI audit/versioning + 一鍵 rollback

### Sprint 3.0–3.3 — Admin 安全 + UI 精修
- Sprint 3.0：Admin RBAC 最小保護
- Sprint 3.1：Admin 登入（email + token → cookie session）
- Sprint 3.2：登出 + session 過期提示
- Sprint 3.3：Token 輪替 + 強制登出所有 session
- KKday 風格 UI/UX 重設計
- 行動版 layout 修正（hamburger、overflow、avatar crop）
- Andy Lee 資料整合（本地圖片資產、guide profile page）
- 日期選擇器 30 天捲軸、月曆 modal header 修正
- Activity badges / policy row 優化

---

## 🔖 當前狀態標記（更新：2026-03-31）

**最後 commit：** `5da524c` — fix: improve title block spacing and typography
**Sprint 編號：** Sprint 4.2 完成
**整體完成度：** ~95%

### Sprint 4 執行摘要
- ✅ Sprint 4.0 — Admin 行程 CRUD 完成（新增/編輯/發佈/下架）
- ✅ Sprint 4.1 — Supabase activities table 接線（前台已由 DB 提供資料，非 fixture）
- ✅ Sprint 4.2 — Admin 場次管理 UI 完成（`/admin/activities/[id]/slots`）

### ✅ 已完成功能
- 前台所有頁面（含行動版）
- Admin 後台：登入/登出/安全、訂單管理、退款管理、導遊審核、營運追蹤、KPI 設定
- ECPay 金流串接（callback）
- API 層（experiences、orders、admin）
- Vercel 部署設定
- Admin 行程 CRUD（新增/編輯/發佈/下架）
- Supabase activities table 正式接線（前台已連 DB）
- Admin 場次管理 UI (`/admin/activities/[id]/slots`)

### 已解決（原列於「尚未完成」）
- Admin **行程 CRUD** — ✅ 已完成（見 Admin 行程管理）
- Supabase 正式接線 — ✅ 已於 Sprint 4.1 完成
- Admin 場次管理 UI — ✅ 已於 Sprint 4.2 完成
- Vercel Production 正式上線 — 排定為近階段驗證（小幅設定調整後立即上線）

---

## Sprint 4 — 行程後台 + 上線（規劃中）

> 目標：讓 Admin 可以在後台直接管理行程，上線後不需要工程師改 code。
> 決策背景：行程內容（Andy Lee Tour 1 / Tour 2）後填，先把後台做好，讓非技術人員自行更新。

### P0 — 必做（無法上線）

| 任務 | 說明 |
|------|------|
| `feat: Admin 行程管理列表頁` | `/admin/activities` — 顯示所有行程、狀態（草稿/已發佈）、快速操作 |
| `feat: Admin 行程新增/編輯頁` | `/admin/activities/new` + `/admin/activities/[id]/edit` — 完整欄位表單：標題、描述、費用、時長、人數、地點、包含項目、注意事項、取消政策等 |
| `feat: Admin 行程發佈/下架控制` | published / draft 狀態切換，下架不刪資料 |
| `feat: Supabase activities table 接線` | 前台從 fixture 切換到 DB，admin 修改即時反映 |

### P1 — 高優先

| 任務 | 說明 |
|------|------|
| `feat: Admin 場次管理頁` | `/admin/activities/[id]/slots` — 新增場次、設定容量、開關梯次 |
| `feat: Vercel Production 部署` | 正式域名上線，設定 env variables |
| `feat: 行程圖片上傳` | Admin 後台支援上傳活動照片（Supabase Storage 或 Cloudinary） |

### P2 — 有空再做

| 任務 | 說明 |
|------|------|
| 行程 SEO meta 設定 | Admin 後台可填 og:title / og:description |
| 多語言欄位支援 | 中文 / 英文版本切換 |
| Andy Lee 真實照片整合 | 待 Andy 提供照片後由 Admin 後台上傳 |

---

## 下一步行動

1. **Tracy 接手 Sprint 4 P0 任務**，從 Admin 行程管理頁開始
2. Supabase `activities` table schema 確認（參考 `04-tech-architecture/02-database-schema.md`）
3. P0 完成後 → Vercel production 部署 → Andy 行程在後台填寫 → 上線
