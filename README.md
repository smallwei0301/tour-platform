# Tour Platform — 台灣在地導遊交易平台

> **一句話定位：** 讓旅客可以直接預約真正在地的導遊與特色行程，讓導遊可以管理場次、接單、收款與營運。

---

## 🔖 目前專案狀態（2026-03-31 17:20 更新）

```
Phase 1 前台 MVP     ████████████ 100%  ✅
Phase 2 Admin 後台   ████████████ 100%  ✅
Phase 3 UI 精修      ████████████ 100%  ✅
Phase 4 行程後台     ████████████ 100%  ✅
整體完成度：約 99%（Sprint 4.0+4.1+4.2 完成）
```

**Sprint 4.0 + 4.1 + 4.2 完成！🎉**
- ✅ Supabase DB 正式接線（活動、導遊、場次、旅客評價）
- ✅ Admin 行程 CRUD UI 完成（列表、新增、編輯、發佈/下架）
- ✅ 前台從 fixture → DB 遷移完成（3 筆行程、9 筆評價實時同步）
- ✅ DatePlanSection 日期選擇完整恢復（半日/全日方案、價格計算）
- ✅ KKday 雙欄 layout 完整恢復（sidebar 預約卡片、全部 section）
- ✅ 旅客評價系統上線（8 筆 seed 評價 + 實時同步驗證）
- ✅ E2E Playwright 測試建立（7 項測試涵蓋行程/價格/評價/admin）
- ✅ **Sprint 4.2：Admin 場次管理** — 完整 CRUD + UI（列表/新增/編輯/刪除）
- ✅ **Haiku 功能測試**：6/6 全通過（Sprint 4.0/4.1/4.2 全面驗收）
- 最後 commit：`f1805dd` on main（Sprint 4.2 場次管理）

### ✅ 已完成

| 類別 | 內容 |
|------|------|
| **前台頁面** | 首頁、活動列表/詳情、導遊列表/詳情、預訂流程、訂單頁、主題頁、Blog、About、法律頁（共 20+ 頁面） |
| **Admin 後台** | 登入/登出/安全、訂單管理、退款管理、導遊審核、營運追蹤（KPI + CSV）、Dashboard、**行程管理（列表/新增/編輯/發佈）** |
| **API** | experiences、orders、payments/ecpay、admin（orders/refunds/guides/operations/kpi/security、**activities CRUD**）、public activities/guides/schedules |
| **DB** | Supabase PostgreSQL 正式接線：users、guide_profiles、activities、activity_schedules、orders、payments、refund_requests、audit_logs、operations_tracking、kpi_settings、**activity_reviews**（13 張表） |
| **數據** | 3 位導遊（Andy Lee + 陳建志 + 林阿明）、3 個行程、8 個場次、**9 筆旅客評價**（含 seed + 驗收測試）已入庫 |
| **UI/UX** | KKday 風格重設計、RWD 行動版、日期選擇器、Admin 行程編輯表單、**完整行程詳情頁（評價/方案/導遊/FAQ）**、**場次管理 Modal UI** |
| **CI/CD** | GitHub Actions CI、Vercel 已部署、Node.js 功能測試（Haiku 模型）、**Playwright E2E 測試** |

### ❌ 未完成（Sprint 4 目標）

| 優先 | 缺少功能 | 說明 |
|------|---------|------|
| 🔴 P0 | ~~Admin 行程 CRUD~~ | ✅ Sprint 4.0+4.1 完成 |
| 🔴 P0 | ~~Supabase 正式接線~~ | ✅ Sprint 4.0 完成（3 位導遊、3 個行程、8 個場次、9 筆評價） |
| 🔴 P0 | ~~旅客評價系統~~ | ✅ Sprint 4.1 完成（8 筆 seed 評價 + 實時同步驗證） |
| 🔴 P0 | ~~E2E Playwright 測試~~ | ✅ Sprint 4.1 完成（7 項測試涵蓋行程/價格/評價/admin） |
| 🔴 P0 | ~~Admin 場次管理~~ | ✅ Sprint 4.2 完成（CRUD + Modal UI + CONFLICT guard）|
| 🔴 P0 | **Vercel Production 正式上線** | 進行中：env setup 完成，等待最終驗收 |
| 🟡 P1 | **圖片上傳** | Sprint 4.3：Admin 後台上傳活動照片（Supabase Storage） |
| 🟢 P2 | 旅客/導遊 Auth（Google/LINE 登入） | Phase 5 |
| 🟢 P2 | 導遊自主後台、結算系統 | Phase 5 |

---

## Sprint 4 開發計劃（當前階段）

> 核心目標：讓 Admin 可在後台管理行程，前台從 DB 讀取真實資料，Andy Lee 的行程可由 Admin 在後台填入並發佈。

| Sprint | 任務 | 狀態 |
|--------|------|------|
| 4.0 | Supabase 正式接線（前台 fixture → DB） | ✅ 完成 |
| 4.1 | Admin 行程管理（列表 + 新增 + 編輯 + 發佈/下架） | ✅ 完成 |
| 4.1+ | 旅客評價系統（activity_reviews table + 實時同步） | ✅ 完成 |
| 4.1+ | E2E Playwright 測試（7 項測試）| ✅ 完成 |
| 4.1+ | DatePlanSection + KKday layout 恢復 | ✅ 完成 |
| 4.2 | Admin 場次管理（新增/編輯/刪除 + CONFLICT guard）| ✅ 完成 |
| 4.2+ | Haiku 功能測試（6/6 通過，Sprint 4.0–4.2 全面驗收）| ✅ 完成 |
| 4.3 | 圖片上傳（Supabase Storage / Cloudinary） | 🔜 下一步 |
| 4.4 | 上線準備（Production env + 最終驗收） | 🔜 進行中 |

詳細開發計劃見：[`docs/04-tech/03-dev-timeline/README.md`](./docs/04-tech/03-dev-timeline/README.md)

### Sprint 4 Go/No-Go 條件
- [x] Admin 可在後台新增行程並發佈
- [x] 前台從 DB 讀取行程（不再用 fixture）
- [x] 旅客評價從 DB 讀取、實時同步
- [x] Admin 可管理場次（新增/修改容量/開關/刪除）
- [x] E2E 測試涵蓋行程/價格/評價/admin 全流程
- [x] Haiku 功能測試：6/6 全通過（Sprint 4.0–4.2）
- [ ] 預訂流程 end-to-end 可完成（待 Vercel 部署最終驗收）
- [x] 本地測試通過，API + 前台正常運作

---

## 導遊資料狀態

### Andy Lee（李衍錫）— 第一位上線導遊

| 資料項 | 狀態 |
|--------|------|
| 個人資料（姓名、聯絡、身份、語言） | ✅ 完成 |
| Tour 1：柴山探洞體驗（費用、時長、地點、注意事項、取消政策） | ✅ 完成 |
| Tour 2：壽山奇幻旅程（費用、時長、路線、全年可運作兩版本） | ✅ 完成 |
| 保險責任描述 | ⚠️ 待確認 |
| 個人照片 + 活動現場照 | ⚠️ 待 Andy 提供 |

詳細資料：
- 主檔：[Emily workspace `andy-lee-master.md`]
- Tour 1 素材包：[`docs/01-strategy/01-project-plan/16-andy-lee-content-pack.md`](./docs/01-strategy/01-project-plan/16-andy-lee-content-pack.md)
- 上線清單：[`docs/01-strategy/01-project-plan/15-andy-lee-mvp-launch-checklist.md`](./docs/01-strategy/01-project-plan/15-andy-lee-mvp-launch-checklist.md)

---

## 已拍板策略

| 決策 | 內容 |
|------|------|
| Beachhead Market | 高雄柴山探洞 / 戶外特色導覽 |
| 第一位導遊 | Andy Lee（李衍錫）— 先跑順單一導遊模型 |
| 第一批旅客 | Andy Lee 既有旅客需求導入 |
| 平台抽成 | 15% |
| 定價模式 | per person |
| 場次規則 | 導遊開放日期 → 旅客付款占位 → 滿額停售 |
| 法規原則 | 聚焦在地導覽/體驗、不碰住宿交通打包、保險由導遊負責 |

---

## Repo 結構

```text
tour-platform/
├── apps/web/                    Next.js MVP Web（前台、API、Admin 後台）
├── packages/ui/                 共用 UI 元件
├── packages/config/             共用設定
├── supabase/                    migrations / seed
├── scripts/                     smoke / preflight 工具腳本
│
├── docs/
│   ├── 01-strategy/
│   │   ├── 01-project-plan/     ⭐ 專案計劃、CEO pack、MVP 文件、導遊內容包
│   │   └── 10-research/         競品分析、市場研究
│   ├── 02-product/
│   │   └── 09-product-spec/     ⭐ 產品規格、Admin 後台需求、UI/UX
│   ├── 03-design/
│   │   └── 11-frontend-spec/    前端元件規格
│   ├── 04-tech/
│   │   ├── 03-dev-timeline/     ⭐ 開發時程、Sprint log、技術債、部署清單
│   │   └── 04-tech-architecture/ 技術架構、API spec、DB schema
│   ├── 05-business/
│   │   ├── 02-investor-deck/    募資與財務簡報
│   │   ├── 05-marketing-plan/   行銷策略
│   │   ├── 06-payment-plan/     金流與退款規劃
│   │   └── 07-operations-plan/  營運 SOP
│   ├── 06-legal/
│   │   └── 08-legal-compliance/ 法規、條款、法律風險
│   └── implementation/          部署與執行文件
```

---

## 🔑 重要文件索引

### 開發者必讀
| 文件 | 用途 |
|------|------|
| [`docs/04-tech/03-dev-timeline/README.md`](./docs/04-tech/03-dev-timeline/README.md) | **開發時程總覽 + Sprint 4 計劃** |
| [`docs/04-tech/03-dev-timeline/01-sprint-log.md`](./docs/04-tech/03-dev-timeline/01-sprint-log.md) | Sprint 歷史 + 當前狀態標記 |
| [`docs/04-tech/03-dev-timeline/02-tech-debt-log.md`](./docs/04-tech/03-dev-timeline/02-tech-debt-log.md) | 技術債清單 |
| [`docs/04-tech/03-dev-timeline/03-deployment-checklist.md`](./docs/04-tech/03-dev-timeline/03-deployment-checklist.md) | 部署檢查清單 |
| [`docs/04-tech/03-dev-timeline/06-page-api-db-mapping.md`](./docs/04-tech/03-dev-timeline/06-page-api-db-mapping.md) | 頁面→API→DB 對照表 |
| [`docs/04-tech/04-tech-architecture/02-database-schema.md`](./docs/04-tech/04-tech-architecture/02-database-schema.md) | DB schema |
| [`docs/04-tech/04-tech-architecture/03-api-spec.md`](./docs/04-tech/04-tech-architecture/03-api-spec.md) | API 規格 |
| [`docs/02-product/09-product-spec/05-admin-panel-spec.md`](./docs/02-product/09-product-spec/05-admin-panel-spec.md) | **Admin 後台規格（含行程 CRUD spec）** |
| [`docs/02-product/09-product-spec/09-tracy-product-spec.md`](./docs/02-product/09-product-spec/09-tracy-product-spec.md) | Tracy 產品規格總覽 |

### CEO / 方向判斷
| 文件 | 用途 |
|------|------|
| [`docs/01-strategy/01-project-plan/02-milestone-tracker.md`](./docs/01-strategy/01-project-plan/02-milestone-tracker.md) | **里程碑追蹤表** |
| [`docs/01-strategy/01-project-plan/13-ceo-decision-pack-one-page.md`](./docs/01-strategy/01-project-plan/13-ceo-decision-pack-one-page.md) | CEO 決策單頁 |
| [`docs/01-strategy/01-project-plan/11-mvp-unit-economics.md`](./docs/01-strategy/01-project-plan/11-mvp-unit-economics.md) | 單位經濟分析 |

### Andy Lee 上線
| 文件 | 用途 |
|------|------|
| [`docs/01-strategy/01-project-plan/15-andy-lee-mvp-launch-checklist.md`](./docs/01-strategy/01-project-plan/15-andy-lee-mvp-launch-checklist.md) | 上線清單 |
| [`docs/01-strategy/01-project-plan/16-andy-lee-content-pack.md`](./docs/01-strategy/01-project-plan/16-andy-lee-content-pack.md) | Tour 1 內容素材包 |

---

## MVP 成功定義

MVP 的成功，不是頁面做完，而是：
- Andy Lee 可以成功上架活動（在 Admin 後台操作）
- 旅客可以看到可預約日期並完成付款
- 付款後名額即時更新
- Admin 可在後台處理退款與營運追蹤
- 團隊能用真實訂單數據回頭修正營運與抽成模型

---

## 📋 git push 後需更新的文件

> 每次 push 新功能或重大變更後，請同步更新以下文件：

| 文件 | 更新內容 |
|------|---------|
| **`README.md`**（本文件） | 更新「目前專案狀態」進度條、已完成/未完成清單 |
| **`docs/01-strategy/01-project-plan/02-milestone-tracker.md`** | 更新 Phase 里程碑狀態、Go/No-Go 條件勾選 |
| **`docs/04-tech/03-dev-timeline/01-sprint-log.md`** | 新增 Sprint 完成記錄、更新「當前狀態標記」區塊 |
| **`docs/04-tech/03-dev-timeline/02-tech-debt-log.md`** | 若還了技術債 → 標記已完成；若新增技術債 → 加入 |
| **`docs/04-tech/03-dev-timeline/03-deployment-checklist.md`** | Production 部署後勾選檢查項目 |
| **`docs/01-strategy/01-project-plan/15-andy-lee-mvp-launch-checklist.md`** | 若完成 Andy Lee 相關功能 → 勾選對應項目 |

## 🚀 Sprint 4 驗收完成清單

### 功能驗收 ✅
| 功能 | 驗收項 | 狀態 |
|-----|------|------|
| **前台 /activities 列表** | 從 DB 讀取 3 筆行程，價格正常顯示 (NT$xxx) | ✅ |
| **前台行程詳情頁** | DatePlanSection (半日/全日)、價格計算、旅客評價、導遊卡片、FAQ 全部顯示 | ✅ |
| **Admin 行程 API** | GET (列表) / POST (新增) / PATCH (發佈) 全通 | ✅ |
| **Admin 新增行程** | POST draft → PATCH publish → 前台即時出現 | ✅ |
| **旅客評價同步** | 8 筆 seed 評價 + 新評價實時出現在前台 | ✅ |
| **Admin 場次 CRUD** | 新增/修改/刪除場次，有訂單刪除 → CONFLICT 409 | ✅ |
| **Haiku 功能測試** | 6 項自動化測試，Sprint 4.0+4.1+4.2 全部通過 | ✅ |
| **E2E Playwright** | 7 項測試全通，涵蓋行程/價格/評價/admin | ✅ |

### 技術驗收 ✅
| 項目 | 驗收結果 | 說明 |
|------|---------|------|
| **DB Migration** | `003_activity_reviews.sql` 成功執行 | Supabase SQL Editor 驗證 |
| **API 連線** | Node.js 直接測試全通 | listSchedules / create / update / delete 全部 pass |
| **Frontend Build** | `npm run build` 成功，無 TS error | 最後 commit `f1805dd` 全部通過 |
| **環境配置** | .env.local 完整，Supabase env + Admin token 正確 | 本機驗證完成 |

---

## 下一步行動

1. ✅ **Sprint 4.0+4.1 完成**：Supabase + Admin 行程 CRUD + 旅客評價 + E2E 測試
2. ✅ **Sprint 4.2 完成**：Admin 場次管理（CRUD + Modal UI + CONFLICT guard）
3. ✅ **Haiku 功能測試**：6/6 全通過（Sprint 4.0–4.2 全面驗收）
4. 🔜 **Vercel Production 最終驗收**：環境變數確認、自動部署驗證
5. 🔜 **Sprint 4.3**：圖片上傳（Supabase Storage）
6. 🔜 Andy Lee 在後台填入 Tour 1 + Tour 2 → 正式上線

---

## 備註

- 專案名稱目前仍為暫名 `Tour Platform`
- 正式品牌名、品牌語氣與 landing page 主視覺仍待最終決策
- Vercel 預覽版：https://tour-platform-web.vercel.app
- **Sprint 4 技術決策**：
  - DB：Supabase PostgreSQL（RLS + partial indexes applied）
  - 旅客評價：activity_reviews table (id, activity_slug, author, city, rating, review_text, review_date, is_verified)
  - 遷移工具：Supabase SQL Editor（CLI auth 不可用）
  - Seed data：3 guides + 3 activities + 8 schedules + **9 reviews**
  - Admin UI component pattern：`AdminShell` wrapper + status tabs
  - Frontend migration：fixture → DB + `hasSupabaseEnv()` fallback
  - Schedule API：`/api/admin/activities/[id]/schedules`（GET/POST）、`/api/admin/schedules/[id]`（PUT/DELETE）
  - Delete guard：`deleteScheduleDb()` bookedCount > 0 → CONFLICT error
  - E2E 框架：Playwright（7 項測試，覆蓋行程列表、詳情、價格、評價、Admin CRUD）
  - Haiku 功能測試：6 項 Node.js 測試（Sprint 4.0+4.1+4.2 全部通過，2026-03-31）
  - 測試命令：`npx playwright test` (requires server on port 3333)
