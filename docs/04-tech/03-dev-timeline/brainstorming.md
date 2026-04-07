# Phase 11：Andy Lee Go-Live 任務清單與驗收條件

> **目標：** 4 月底前 Andy Lee 行程正式可收真錢
> **前置條件：** Phase 10（正式金流 + 安全加固）已完成 ✅

---

## 任務清單

### 1. Andy Lee 真實照片上傳

**優先級：** P0

**任務描述：**
- 上傳 Andy Lee 個人頭像（高解析度）
- 上傳行程封面圖片
- 上傳 Gallery 照片至少 5 張（柴山探洞實景）

**驗收條件（AC）：**
- [ ] 導遊個人頁（`/guides/andy-lee`）顯示真實頭像，非 placeholder
- [ ] 行程詳情頁封面圖片為真實照片，解析度 ≥ 1200×800
- [ ] Gallery 至少 5 張真實照片，可正常 swipe/grid 瀏覽
- [ ] 所有圖片已壓縮為 WebP 格式，單張 < 500KB
- [ ] 圖片已上傳至 Supabase Storage `activity-images` bucket

---

### 2. Andy Lee Checklist 全勾

**優先級：** P0

**任務描述：**
- 確保 Andy Lee 行程資料完整
- 場次已開放可預訂日期
- 交易流程可正常運作
- 營運追蹤資料正確

**驗收條件（AC）：**
- [ ] 行程基本資料完整填寫（標題/描述/tagline/地區/分類）
- [ ] 至少有 1 個方案（Plan）已設定完整（價格/時長/人數上限/行程內容）
- [ ] 至少開放未來 14 天內的 3 個以上可預訂場次
- [ ] 場次顯示正確剩餘名額（capacity - booked_count）
- [ ] Admin 後台營運追蹤可顯示 Andy Lee 相關數據
- [ ] 導遊後台（Guide Dashboard）可正常登入並查看場次/訂單

---

### 3. 退款政策細則

**優先級：** P0

**任務描述：**
- 制定各情境退款比例
- 明確爭議處理流程
- 填寫 `docs/05-business/06-payment-plan/04-refund-policy-detail.md`

**驗收條件（AC）：**
- [ ] 文件 `04-refund-policy-detail.md` 不再是空殼
- [ ] 明確定義以下退款情境與比例：
  - 出發前 7 天以上取消
  - 出發前 3-7 天取消
  - 出發前 72 小時內取消
  - 出發當天取消 / No-show
  - 因天候/不可抗力取消
  - 導遊取消行程
- [ ] 爭議處理流程明確（誰仲裁、時限、聯繫方式）
- [ ] 退款政策已同步至前台法律頁（`/refund-policy`）

---

### 4. 結算規則文件

**優先級：** P0

**任務描述：**
- 制定 T+7 結算規則
- 明確抽成算法
- 說明導遊提款流程
- 填寫 `docs/05-business/06-payment-plan/03-settlement-rules.md`

**驗收條件（AC）：**
- [ ] 文件 `03-settlement-rules.md` 不再是空殼
- [ ] 明確結算週期（T+7 或其他）
- [ ] 抽成算法公式明確（平台 15%，導遊 85%）
- [ ] 說明金流路徑：旅客付款 → ECPay → 平台 → 導遊
- [ ] 導遊提款流程說明（申請方式、最低金額、處理時間）
- [ ] 特殊情境處理（退款扣款、爭議凍結）

---

### 5. 客服 SOP

**優先級：** P1

**任務描述：**
- 建立分層處理機制
- 制定標準話術
- 填寫 `docs/05-business/07-operations-plan/02-customer-service-sop.md`

**驗收條件（AC）：**
- [ ] 文件 `02-customer-service-sop.md` 不再是空殼
- [ ] 定義客服分層（L1 自助 / L2 客服 / L3 升級處理）
- [ ] 常見問題標準話術（訂單查詢/退款/改期/投訴）
- [ ] 客服聯繫管道明確（Email/電話/LINE）
- [ ] 回覆時效承諾（24 小時內首次回覆）
- [ ] 緊急情況處理流程（行程當天問題）

---

### 6. Full E2E 真實場景走一次

**優先級：** P0

**任務描述：**
- 完整模擬真實用戶流程
- 使用真實信用卡（ECPay 正式環境）
- 驗證從下單到退款的完整閉環

**驗收條件（AC）：**
- [ ] **下單流程：** 旅客可選擇 Andy Lee 行程 → 選日期/方案 → 填寫資料 → 進入付款
- [ ] **真實刷卡：** ECPay 正式環境信用卡付款成功
- [ ] **付款確認：**
  - 訂單狀態變更為 `paid`
  - 席位正確扣減（booked_count +1）
  - Email 通知寄出
- [ ] **導遊收到通知：** 導遊後台可看到新訂單
- [ ] **取消流程：** 旅客可自助取消（`pending_payment` 狀態）
  - 席位正確釋放
  - Email 通知寄出
- [ ] **退款流程：** 旅客申請退款 → Admin 審核通過 → 退款成功
  - Email 通知寄出
- [ ] **營運追蹤：** Admin 後台可查看該筆訂單的營運數據

---

### 7. SEO Meta 優化

**優先級：** P1

**任務描述：**
- 設定 Open Graph 圖片
- 加入 LocalBusiness structured data
- 優化各頁面 meta 標籤

**驗收條件（AC）：**
- [ ] 行程詳情頁有正確的 `og:image`（使用封面圖）
- [ ] 行程詳情頁有正確的 `og:title` 和 `og:description`
- [ ] 首頁有 `LocalBusiness` JSON-LD structured data
- [ ] 分享到 Facebook/LINE 時預覽圖片正確顯示
- [ ] Google Search Console 無結構化資料錯誤

---

## 風險與對策

| 風險 | 對策 |
|------|------|
| Andy Lee 照片遲遲不到 | 設 4/15 deadline，備案 AI 示意圖 |
| ECPay 商家帳號審核慢 | 立刻申請，先用沙箱 |
| 法規風險（旅行業執照） | 已有 legal-decision-memo：不碰住宿交通 |

---

## 驗收總覽

| # | 任務 | 優先 | 狀態 |
|---|------|------|------|
| 1 | Andy Lee 真實照片上傳 | P0 | ⬜ |
| 2 | Andy Lee checklist 全勾 | P0 | ⬜ |
| 3 | 退款政策細則 | P0 | ⬜ |
| 4 | 結算規則文件 | P0 | ⬜ |
| 5 | 客服 SOP | P1 | ⬜ |
| 6 | Full E2E 真實場景走一次 | P0 | ⬜ |
| 7 | SEO meta 優化 | P1 | ⬜ |

**Phase 11 完成標準：** 所有 P0 任務驗收通過，Andy Lee 行程可正式收款。

---

> 文件建立日期：2026-04-07
> 參考來源：README.md Phase 11、docs/04-tech/03-dev-timeline/01-sprint-log.md
