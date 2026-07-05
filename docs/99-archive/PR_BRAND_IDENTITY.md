# PR: Apply Midao Brand Identity to Tour Platform

## 🎯 目標

將 **Midao（祕島）** 品牌識別系統應用到 tour-platform，統一視覺與文案風格。第一階段：首頁 Hero Section。

---

## 📋 已完成的工作

### 1️⃣ 建立品牌書文檔
- **檔案**：`BRAND_BOOK.md`
- **內容**：
  - Section 01：三層命名系統（祕島 / MIDAO / Secret Isle）
  - Section 02：Logo 系統（6 個變體）
  - Section 03：八色配色系統（山墨、古紙、朝霞等）
  - Section 04：字體規範（Noto Serif TC + Fraunces）
  - Section 05：文案庫（主標語、Hero 文案、CTA、社群 Bio 等）
  - Section 06：Voice & Tone 守則（Do / Don't）

### 2️⃣ 更新 README 導航
- **檔案**：`README.md`
- **功能**：
  - 工作項目快速導航表
  - 品牌系統參考指南
  - 開發工作流程
  - 後續任務清單

### 3️⃣ 優化 Hero Section 文案（已 merge）
- **檔案**：`apps/web/src/components/home/HeroSection.tsx`
- **Commit**：`9e641f1`

**改寫詳情**：

| 欄位 | 舊版 | 新版 | 說明 |
|------|------|------|------|
| **Kicker** | 台灣在地導遊平台 | 祕島 MIDAO | 品牌識別 + 配色改為朝霞（#C2542E） |
| **H1** | 找到懂路的人，帶你走進台灣最有故事的地方 | 祕境不會自己出現，要有人帶你去 | Hero A 版本（故事感），符合 Voice & Tone |
| **副標題** | 不跟團、不趕路。預約在地導遊，用你的節奏認識這座島嶼。 | 每一條路線，都是有人真正走過的徑。與在地導遊同行，探進台灣山林的故事。 | 強調真實性 + 動詞導向 |
| **Primary CTA** | 先看本週精選路線 | 翻開這個月的祕境 | Brand Book Section 05-04 |
| **Secondary CTA** | 再挑適合你的導遊 | 遇見引路人 | Brand Book Section 05-04 |

**Voice & Tone 應用**：
- ✅ 動詞優先（「翻開」「遇見」）
- ✅ 具體勝過通用詞（「這個月的祕境」而非「精選路線」）
- ✅ 故事感而非推銷感
- ✅ 無療癒、絕美等禁用詞

---

## 🎨 配色應用

**改用 Brand Book 配色**：
- **Kicker 色**：`#C2542E`（朝霞 · Alpenglow）
  - 舊：`#E8834D`（較橙）
  - 新：`#C2542E`（更深沉、符合山林調性）

**保留說明**：
- Hero 背景採用官方攝影，已有漸層覆蓋
- 主視覺色比：山墨 80% + 古紙 15% + 朝霞 5%（本次 Hero 以白文字 + 朝霞點綴為主）

---

## 📝 文案來源

所有新文案均來自 **Brand Book Section 05 · Copywriting Library**：

| 文案 | 出處 | 邏輯 |
|------|------|------|
| 祕境不會自己出現，要有人帶你去 | Section 05-02 · Hero A | 故事感版本，最有敘事力 |
| 翻開這個月的祕境 | Section 05-04 · CTA 行程列表 | 動詞「翻開」，隱喻地圖/筆記 |
| 遇見引路人 | Section 05-04 · CTA 導遊頁 | 直接、邀請式、符合導遊身份 |

---

## ✅ 遵守的規則

### Voice & Tone（Section 06）

**✅ Do 的部分**：
- [x] 具體動詞（翻開、遇見、走進）
- [x] 像老編輯說話（溫暖但專業）
- [x] 留白（一句話一個畫面）
- [x] 承認主題性（山林秘境＝需要帶路人）

**❌ Don't 的部分**：
- [x] 沒有「療癒」「絕美」「夢幻」
- [x] 沒有「享受」「體驗」空話
- [x] 沒有 IG 打卡感
- [x] 驚嘆號控制在 1 個以內

---

## 🚀 後續任務

| 任務 | 優先級 | 負責 |
|------|--------|------|
| ValueTrustSection 品牌改寫 | P0 | ✅ Done (6e535a0) |
| Hero Section 品牌改寫 | P0 | ✅ Done (9e641f1) |
| 首頁其他區塊（Featured Tours、Story Proof、FAQ） | P1 | 待 |
| About 頁面完整重寫 | P1 | 待 |
| 導遊頁面（Guides）品牌化 | P1 | 待 |
| CTA 按鈕全域統一（Microcopy） | P2 | 待 |
| 配色系統 UI 應用（主色、次色、背景） | P2 | 待 |
| 字體系統驗證（標題 vs 內文） | P2 | 待 |
| Social Bio 設置（IG、FB、Threads） | P2 | 待 |
| Email Newsletter 主旨模板 | P2 | 待 |

---

## 📖 使用指南

### 給全隊開發者

1. **開始任何文案工作前**，先讀 **`BRAND_BOOK.md`** Section 06（Voice & Tone）
2. **寫首頁文案**？→ Section 05-02 / 05-03 / 05-04
3. **挑配色**？→ Section 03（複制 Hex 碼，不要自行調整）
4. **選字體**？→ Section 04（用 Noto Serif TC 或 Fraunces）
5. **有疑問**？→ 回到 `BRAND_BOOK.md`，不要靠記憶

### 給 Glory（行銷）

- 所有社群內容應參考 Section 05-08（Social Bio、Email Subject）
- Voice & Tone 守則（Section 06）是強制執行的
- 新增 CTA / 文案 → 先寫到 Brand Book，再用到網站

---

## 🔗 相關檔案

- 📄 **BRAND_BOOK.md** — 完整品牌系統
- 📄 **README.md** — 導航 & 工作流程
- 💻 **apps/web/src/components/home/HeroSection.tsx** — Hero 區塊
- 💻 **apps/web/src/components/home/ValueTrustSection.tsx** — 價值主張區塊（已改）

---

## 📊 預期成果

✅ **統一的品牌聲音**
- 從 Hero → CTA → About，文案語氣一致

✅ **可維護的文案系統**
- Brand Book 是唯一真實來源，團隊有清晰的參考

✅ **更強的轉化訊號**
- 「祕島 MIDAO」品牌認知 + 具體動詞 CTA = 更高的點擊率

✅ **設計 / 文案對齐**
- 配色 + 字體 + 文案 + Voice 四位一體

---

## 🎬 Commit & Merge

**Commits in this PR**:
- `6e535a0`: optimize ValueTrustSection copy
- `9e641f1`: apply Midao brand identity to Hero section

**Status**: 🟢 Ready to merge
- [x] 文案符合 Voice & Tone
- [x] 配色符合品牌色系
- [x] CTA 按鈕遵循 Brand Book
- [x] 無拼寫錯誤
- [x] 無禁用詞彙

---

**Created by**: Glory (行銷與社群經理)  
**Date**: 2026-04-27  
**Version**: v1.0
