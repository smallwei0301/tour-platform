# 用戶痛點研究報告

> 資料來源：Trustpilot（KKday 評分 1.8/5）、Reddit (r/taiwan, r/JapanTravelTips, r/Taipei)、GetYourGuide 用戶評論、PeekPro 行業研究
> 調查日期：2026-03-25

---

## 📊 總結：痛點嚴重度矩陣

| 痛點 | 頻率 | 嚴重度 | 我們的解法優先序 |
|------|------|--------|----------------|
| 退款遲遲不到帳 | 🔴 極高 | 🔴 極高 | P0 |
| 票券/活動臨時取消 | 🔴 極高 | 🔴 極高 | P0 |
| 客服沒有回應 | 🔴 極高 | 🔴 高 | P0 |
| 導遊信任感不足 | 🔴 高 | 🔴 高 | P0 |
| 活動描述與實際不符 | 🟠 高 | 🟠 高 | P1 |
| 退款政策不透明 | 🟠 高 | 🟠 高 | P1 |
| 超賣/名額衝突 | 🟠 中 | 🔴 高 | P1 |
| 找不到在地特色行程 | 🟡 中 | 🟠 中 | P2 |
| 付款方式不夠本地化 | 🟡 中 | 🟡 低 | P2 |
| 行程前提醒不足 | 🟡 低 | 🟡 低 | P3 |

---

## 🔴 P0 級痛點（必須在 MVP 就解決）

### 痛點 1：退款拖延或拒絕退款

**真實用戶聲音：**
> *"It's been almost an entire YEAR since I booked... I assume they're just going to keep my money."*
> — Trustpilot, KKday, Jan 2026

> *"It's been over a month since my Japan trip, and Klook still hasn't refunded me."*
> — Reddit r/JapanTravelTips, May 2025

> *"Borderline scam. They'll cancel your booking then tell you to wait 14 days for refund — then nothing."*
> — Trustpilot, KKday, Dec 2025

**根本原因：**
- 平台與供應商（導遊/廠商）之間金流拆帳複雜，退款需等廠商同意
- 客服處理流程缺乏時限承諾
- 用戶無法追蹤退款進度

**我們的對策：**
- ✅ 平台持有付款資金（不直接轉給導遊），遊客申請退款時平台直接處理
- ✅ 退款 SLA 承諾：申請後 3 個工作天入帳（非 14 天）
- ✅ 退款進度追蹤頁面（訂單頁即時顯示狀態）

---

### 痛點 2：活動/票券臨時取消，卻沒有補救方案

**真實用戶聲音：**
> *"KKday confirmed my Ghibli Museum tickets, then 12 days later said they don't actually have the tickets."*
> — Reddit r/JapanTravelTips, 2024

> *"Booked Shinkansen, told ticket not available — 14 days wait for refund, still hasn't arrived."*
> — Trustpilot, Dec 2025

> *"Tours can be cancelled due to low attendance."*
> — Reddit r/Taipei, 2024

**根本原因：**
- 第三方平台先收錢後才向供應商確認，導致「超賣」或「根本買不到」
- 人數不足取消，但事先沒有清楚告知最低開團人數
- 取消後只退款，不協助換其他選項

**我們的對策：**
- ✅ 導遊確認接單後才完成收費（先確認後扣款，或預授權模式）
- ✅ 每個活動清楚標示「最低開團人數」和「確認截止時間」
- ✅ 導遊取消 → 平台主動推薦 3 個同類替代活動
- ✅ 導遊爽約 → 全額退款 + 補貼 NT$100 道歉金

---

### 痛點 3：客服完全沒有回應或回應極慢

**真實用戶聲音：**
> *"Klook has zero customer service."*
> — Reddit r/taiwan, 2024

> *"The vender refused to honor the certificate and KKday asked me to work with the vender by myself."*
> — TripAdvisor, 2026

> *"I've been chatting with their customer support almost every day... no resolution."*
> — Reddit, May 2025

**根本原因：**
- 大型平台客服外包，無法處理與供應商的糾紛
- 平台把責任推回給導遊/廠商，用戶夾在中間無助
- 沒有緊急處理通道（活動當天出問題卻找不到人）

**我們的對策：**
- ✅ 活動當天緊急熱線（LINE / 電話），30 分鐘內回應
- ✅ 平台介入原則：糾紛時平台站在消費者這邊調查，而非把問題踢回導遊
- ✅ 客服首次回應 SLA：上班時間 5 分鐘內，非上班時間 2 小時內
- ✅ 所有客服對話留存，防止「說了沒算數」

---

### 痛點 4：導遊身份可信度無法驗證

**行業研究數據：**
- 旅遊平台最高不信任原因：不知道導遊真實身份（55%）
- 假評論 / 刷好評問題普遍

**台灣特有問題：**
- 大平台導遊資訊只有照片 + 制式簡介，無法了解真實背景
- 無照導遊在台灣法律上屬違法，但平台不做實質審核

**我們的對策：**
- ✅ 雙重驗證：身分證 + 導遊執照（可選）
- ✅ 「已驗證」徽章（有做 KYC 的導遊顯示特別標章）
- ✅ 評價必須是真實完成訂單的遊客才能留（防刷評）
- ✅ 導遊自我介紹影片（30 秒）讓遊客提前「認識」導遊

---

## 🟠 P1 級痛點（Beta 前解決）

### 痛點 5：活動描述與實際體驗落差大

**真實用戶聲音：**
> *"The published information was inaccurate... I lost money due to FX loss from their refund."*
> — Trustpilot, KKday

**根本原因：**
- 平台對活動描述沒有標準審核
- 使用 Stock 照片代替真實現場照片
- 「包含項目」描述模糊

**我們的對策：**
- ✅ 活動照片必須是真實現場照（審核時抽查）
- ✅ 「包含 / 不包含」以條列清單格式強制填寫
- ✅ 集合地點必須附 Google Maps 連結
- ✅ 若描述與實際不符 → 用戶可申請退款（平台直接受理）

---

### 痛點 6：退款政策埋藏在細則，不透明

**真實用戶聲音：**
> *"The non-refundable terms were not clearly disclosed at the confirmation page."*
> — Trustpilot, KKday, Jan 2026

> *"Changed currency from SGD to USD, charged +35% of real price."*
> — Trustpilot, KKday

**我們的對策：**
- ✅ 訂購頁顯著標示退款政策（字體放大、顏色醒目）
- ✅ 付款前彈出確認框：「此活動退款政策為 X，您確認了解？」
- ✅ 台幣計價，不做幣別轉換騙局

---

### 痛點 7：名額超賣 / 系統沒有即時更新

**真實用戶聲音：**
> *"The inventory doesn't update on the website when purchasing through KKday."*
> — Reddit, 2025

**我們的對策：**
- ✅ Supabase 即時庫存更新（有人訂單確認即時扣名額）
- ✅ 名額剩餘 3 個時顯示「快滿了」警示
- ✅ 同一時段名額歸零後自動關閉訂購按鈕

---

## 🟡 P2 級痛點（成長期解決）

### 痛點 8：找不到真正在地、客製化的行程

**背景：**
- KKday / Klook 主推標準化商品，在地小眾行程曝光度極低
- 自由行遊客想要「有人味」的旅遊，但找不到可信任的管道

**這正是我們的核心差異化。**

---

### 痛點 9：溝通管道不夠直覺（無法直接聯繫導遊）

**問題：**
- 大平台不讓遊客直接聯繫導遊（防止跳過平台交易）
- 但行程出發前有很多問題需要確認（集合地點、穿著建議等）

**我們的對策：**
- ✅ 訂單確認後開放平台內訊息系統（遊客↔導遊）
- ✅ 導遊可主動傳行前提醒給遊客
- ⚠️ 但要防止導遊引導遊客私下付款跳過平台

---

## 📌 導遊端的痛點（供給側）

以上都是遊客的問題。導遊端的痛點同樣重要：

| 痛點 | 描述 |
|------|------|
| 接案管道分散 | 靠 Line 群 + 口耳相傳，沒有統一入口 |
| 金流麻煩 | 要自己處理收款、記帳、開發票 |
| 平台抽成過高 | KKday 抽 25~30%，導遊實拿少 |
| 沒有排班工具 | 行程撞期、忘記確認訂單 |
| 評價沒有累積 | 每次換平台就要重新建立信任 |
| 爭議時沒有保障 | 遊客惡意退款，平台通常站消費者 |

**我們的差異化：**
- 抽 15%（比競品便宜一半）
- 提供完整後台工具（排班 + 訂單 + 收益）
- 導遊也有申訴機制（防惡意退款保護）

---

## 🎯 設計原則（從痛點推導）

1. **退款快過競品 5 倍** — 3 個工作天 vs 業界 14 天
2. **透明優先** — 退款政策、定價、導遊資訊全部在訂購前顯示清楚
3. **平台是仲裁者，不是踢皮球的** — 糾紛時主動介入
4. **信任可驗證** — KYC 徽章、真實評價、影片介紹
5. **即時庫存** — 絕不出現超賣問題
6. **緊急管道** — 活動當天有人接電話

---

*最後更新：2026-03-25*
*下一步：將這些痛點轉化為 09-product-spec/02-user-stories-backlog.md 的驗收條件*
