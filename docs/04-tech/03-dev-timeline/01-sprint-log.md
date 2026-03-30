# Sprint 執行日誌

> 最後更新：2026-03-30 | PM：Amy | 前端：Tracy

---

## Sprint 概覽

| Sprint | 期間 | 目標 | 狀態 | Velocity |
|--------|------|------|------|----------|
| Sprint 1 | 2026-03-16 ~ 2026-03-30 | Phase 1 Admin Core 完整交付 | ✅ 完成 | 56 pts |
| Sprint 2 | 2026-03-31 ~ 2026-04-11 | Phase 2 首頁 + 搜尋頁 | 🔜 計劃中 | — |

---

## Sprint 1：Phase 1 Admin Core 完整交付

**期間：** 2026-03-16 ~ 2026-03-30（2 週）  
**執行人：** Tracy（前端）  
**Sprint 目標：** 完成 Admin 全模組開發，E2E 全綠，產出 Admin Guide

---

### 完成項目 ✅

| 故事點 | 項目 | 說明 |
|--------|------|------|
| 8 pts | Admin Dashboard | 數據卡片、圖表、快速連結 |
| 10 pts | Orders 訂單管理 | 列表、篩選、狀態變更、詳情頁 |
| 8 pts | Refunds 退款流程 | 申請列表、審核操作、退款紀錄 |
| 8 pts | Guides 導遊管理 | 新增/編輯/停用導遊、照片上傳 |
| 8 pts | Ops Tracking | 日程追蹤、任務狀態、標記完成 |
| 6 pts | Security Settings | 修改密碼、二階段驗證設定 |
| 5 pts | E2E 測試補全 | 56 個測試案例全數通過 |
| 3 pts | Admin Guide 文件 | 操作手冊、截圖、常見問題 |

**總計：56 story points ✅**

---

### 本週（2026-03-24 ~ 2026-03-30）Tracy 執行成果

> Tracy 本週衝刺完成 Phase 1 最後收尾工作：

**已完成：**
- ✅ Security Settings 頁面完整實作（修改密碼、2FA 開關）
- ✅ E2E 測試從 48/56 補齊至 56/56（補了 8 個測試案例）
- ✅ Admin Guide 文件撰寫（含截圖說明）
- ✅ Ops Tracking 小 bug 修復（日期篩選邏輯錯誤）
- ✅ Code Review 回饋處理完畢，PR merged to main
- ✅ Staging 環境驗收通過

**未完成（移至 Sprint 2）：**
- 無（Phase 1 全數交付）

---

### Sprint 1 回顧

**做得好的：**
- E2E 測試覆蓋率達 100%，品質很紮實
- Admin Guide 寫得清楚，後續 onboarding 有依據

**可以改善的：**
- Ops Tracking 的需求一開始不夠清楚，浪費 0.5 天來回確認
- 下個 Sprint 要在開工前先釘清楚 UI mockup

---

## Sprint 2：Phase 2 Consumer Web 啟動（計劃中）

**期間：** 2026-03-31 ~ 2026-04-11  
**目標：** 首頁（Hero + 精選商品）+ 搜尋功能（關鍵字 + 篩選）

### 計劃項目

| 優先 | 項目 | 故事點 | 備註 |
|------|------|--------|------|
| P0 | 首頁 Hero Banner | 5 pts | 需設計稿確認 |
| P0 | 精選商品列表 | 5 pts | API 待確認欄位 |
| P0 | 搜尋輸入頁 | 5 pts | Algolia 或後端搜尋 TBD |
| P1 | 搜尋結果頁 | 8 pts | 篩選：地區/日期/人數/類型 |
| P1 | SEO Meta 設定 | 3 pts | Next.js Head 設定 |

**Sprint 2 目標 Velocity：** 26 pts

---

_下一次更新：Sprint 2 結束後（2026-04-11）_
