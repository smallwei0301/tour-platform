# Phase 11 — Andy Lee Go-Live DevStart

## 目標
4 月底前 Andy Lee 行程正式可收真錢

## 啟動日期
2026-04-07

---

## 📋 優先任務清單（12 項）

### #1 - Andy Lee 真實照片取得與上傳
**描述**：取得 avatar、hero 封面、Gallery 5+ 張真實活動照，上傳至 Supabase Storage 替換 placeholder。
**Owner**: marketing + ops  
**估時**: 2d  
**驗收準則**:
- ① avatar 顯示於導遊頁
- ② hero 顯示於行程詳情頁
- ③ Gallery 至少 5 張且 Carousel 正常 swipe

---

### #2 - MOCK 數據確認與替換
**描述**：與 Andy 確認價格、時長、人數上限、集合地點、費用包含/不包含等所有 [MOCK] 欄位並更新至 DB。  
**Owner**: pm + ops  
**估時**: 1d  
**驗收準則**:
- ① 價格、時長、人數皆為確認數字
- ② 行程頁無任何 [MOCK] 文字顯示
- ③ JSON 欄位 is_mock 全部移除或設為 false

---

### #3 - 退款政策細則撰寫
**描述**：完成 `04-refund-policy-detail.md`：各情境退款比例、爭議處理流程、特殊天候處理規則。  
**Owner**: pm  
**估時**: 1d  
**驗收準則**:
- ① 文件位於 `docs/05-business/06-payment-plan/04-refund-policy-detail.md`
- ② 包含 4 種取消時間點對應退款比例
- ③ 爭議處理流程有明確 SLA

---

### #4 - 結算規則文件撰寫
**描述**：完成 `03-settlement-rules.md`：T+7 撥款、15% 抽成計算、提款流程、稅務說明。  
**Owner**: pm + backend  
**估時**: 0.5d  
**驗收準則**:
- ① 文件路徑正確
- ② 包含抽成計算公式與範例
- ③ 提款流程步驟清晰

---

### #5 - 客服 SOP 建立
**描述**：完成 `02-customer-service-sop.md`：分層處理流程、標準話術、緊急聯絡人、escalation 規則。  
**Owner**: ops  
**估時**: 1d  
**驗收準則**:
- ① 包含至少 3 層分級處理（L1/L2/L3）
- ② 有標準回覆話術模板
- ③ 緊急聯絡人名單完整

---

### #6 - ECPay 正式商家帳號上線
**描述**：確認 ECPay 商家審核通過，切換至正式環境 credentials，移除沙箱模式。  
**Owner**: backend + ops  
**估時**: 0.5d  
**驗收準則**:
- ① 環境變數切換至正式 MerchantID
- ② 測試小額交易成功
- ③ webhook 驗簽 CheckMacValue 正確

---

### #7 - Full E2E 真實場景驗證
**描述**：執行完整流程：下單 → 真實刷卡 → Email 確認 → 取消 → 退款，錄製截圖存檔。  
**Owner**: frontend + backend  
**估時**: 1d  
**驗收準則**:
- ① 完整流程截圖存檔
- ② Email 4 種通知皆收到
- ③ 退款後餘額正確返還

---

### #8 - Andy Lee 場次正式開放
**描述**：在 Admin 後台設定 4-5 月真實可預約場次（至少 4 場），確認場次容量與狀態正確。  
**Owner**: ops + pm  
**估時**: 0.5d  
**驗收準則**:
- ① Admin 後台顯示至少 4 場 status=open
- ② 前台 DatePlanSection 可選擇日期
- ③ 容量數字正確

---

### #9 - SEO meta + Structured Data
**描述**：加入 og:image、LocalBusiness JSON-LD、正確的 title/description，確保社群分享顯示正確。  
**Owner**: frontend  
**估時**: 0.5d  
**驗收準則**:
- ① og:image 社群分享預覽正確
- ② Google Rich Results Test 通過 LocalBusiness
- ③ Lighthouse SEO 分數 ≥ 90

---

### #10 - 保險與安全聲明確認
**描述**：與 Andy 確認保險安排（導遊投保 or 旅客自理），更新 safety_notice 文案，移除 [MOCK]。  
**Owner**: pm + ops  
**估時**: 0.5d  
**驗收準則**:
- ① safety_notice 無 [MOCK]
- ② 責任歸屬明確
- ③ 前台顯示完整安全須知

---

### #11 - 導遊訂單通知功能
**描述**：新訂單時發送 Email 通知給 Andy，確保導遊即時知曉預訂。  
**Owner**: backend  
**估時**: 0.5d  
**驗收準則**:
- ① 新訂單建立時 Andy 收到 Email
- ② Email 內含訂單編號、旅客人數、日期

---

### #12 - Go-Live Checklist 全勾驗收
**描述**：確認：照片到位、價格正確、場次開放、金流正式、文件完備、E2E PASS。  
**Owner**: pm  
**估時**: 0.5d  
**驗收準則**:
- ① 12 項任務全部完成
- ② PM 簽核確認
- ③ README Phase 11 進度更新為 100%

---

## 🏁 短期里程碑（3 個）

### M1：內容就緒
**目標日期**: 2026-04-14（Week 1）  
**內容**: Andy 照片全部到位、MOCK 數據替換完成、場次開放設定  
**負責人**: Emily (PM)

---

### M2：文件與金流就緒
**目標日期**: 2026-04-21（Week 2）  
**內容**: 退款政策/結算規則/客服 SOP 完成、ECPay 正式上線、導遊通知功能上線  
**負責人**: Tracy (Backend)

---

### M3：Go-Live 驗收
**目標日期**: 2026-04-28（Week 3）  
**內容**: Full E2E 驗證通過、SEO 優化完成、Checklist 全勾、正式宣布可收款  
**負責人**: Emily (PM)

---

## 📸 缺失資產清單（Media）

根據 `07-andy-lee-mvp-content.json` 中 `"all_media_are_placeholders": true`，以下資產需優先取得：

| 優先順序 | 資產類型 | 規格需求 | 來源 | 狀態 |
|---------|---------|---------|------|------|
| **P0** | Avatar 頭像 | 正方形 400×400px+、專業形象照 | Andy 本人提供 | ❌ 缺失 |
| **P0** | Hero 封面圖 | 1920×1080px、洞穴/探險場景 | Andy 活動側拍 | ❌ 缺失 |
| **P1** | Gallery 照片 ×5 | 1200×800px+、展示活動實況 | Andy 歷次活動照 | ❌ 缺失 |
| **P1** | 行程時間軸圖 | 各站點代表照 | Andy 提供 or 現有素材 | ❌ 缺失 |
| **P2** | 社群分享用 og:image | 1200×630px（FB/LINE 預覽） | 設計製作 | ❌ 缺失 |

### 取得順序建議

1. **4/08–4/10**：聯繫 Andy 收集現有活動照片（優先 Hero + Avatar）
2. **4/11–4/12**：篩選 5 張 Gallery 照片，確認授權
3. **4/13–4/14**：若照片不足，安排一次實際活動拍攝或使用備案 AI 示意圖
4. **4/15**：照片到位 deadline（README 已標注風險對策）

---

## ⚠️ 風險提醒

| 風險 | 機率 | 對策 |
|------|------|------|
| Andy 照片遲交 | 中 | 4/15 硬 deadline，備案用 AI 示意圖標注「示意」 |
| ECPay 商家審核延遲 | 低 | 已申請中（Emily 負責追蹤） |
| 保險責任歸屬不清 | 中 | 4/10 前與 Andy 敲定，法律文件先行確認 |

---

**Phase 11 DevStart 完成。請各 Owner 依任務認領執行。**

