# 🧭 Tour Platform - 台灣在地導遊交易平台

> **Vision:** 連結旅人與最真實的台灣，為在地導遊創造價值，為旅客打造難忘回憶。

## 📁 專案架構指南

本專案採用 **Turborepo** 管理，將網站主體與開發文檔分開：

### 🏗️ 網站主體 (`/apps` & `/packages`)
- **`apps/web`**: Next.js 14 網站主體（含消費者端與 Admin 後台）。
- **`packages/ui`**: 共用 UI 組件庫。
- **`supabase/`**: 資料庫 Schema 與 Migrations。

### 📚 開發與營運文檔 (`/docs`)
我們將所有非程式碼的專案文檔整合在 `/docs` 資料夾下：

- **`docs/01-strategy/`**: 專案願景、里程碑追蹤、市場研究。
- **`docs/02-product/`**: 產品規格書 (PRD)、User Stories。
- **`docs/03-design/`**: 前端規格、UI/UX 設計稿連結與註解。
- **`docs/04-tech/`**: 開發日誌 (Sprint Log)、系統架構圖、API 規格。
- **`docs/05-business/`**: 投資簡報、行銷計畫、金流對接計畫、營運 SOP。
- **`docs/06-legal/`**: 法律合規、服務條款、隱私政策草案。

---

## 🚀 快速啟動

### 1. 環境設定
```bash
# 安裝依賴
npm install

# 啟動開發伺服器
npm run dev
```

### 2. 資料庫
專案使用 Supabase。執行 `supabase start` 啟動本地開發環境。

### 3. 測試
```bash
# 執行 E2E 測試
npm run test:e2e
```

## 📈 目前進度
- **Phase 1: Admin Core** ✅ 100% 完成
- **Phase 2: Consumer Web** 🔄 啟動中 (Milestone 1.5)

---
*Created by Amy & Tracy for 木村哥.*
