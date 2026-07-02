# 可用性訊息跨介面文案一致性決策（#1321 / #1212 follow-up）

> 狀態：**已定案（owner 拍板 2026-07-02）— 選項 C：接受語意一致、字面不同。**
> 背景 issue：#1321（AC#2 vs AC#4 tension）／#1212（canonical reason copy）／#1250／#1320。

## 1. 決策

Traveler、Admin、Guide 三個介面在「時段不可預約」時顯示的 zh-TW 文案，
**採語意一致（semantically aligned）但不要求字元級相同（not character-identical）**：

- **Admin／Guide preview**：一律走 `getCanonicalReasonCopy(state).bodyZh`
  （`src/lib/availability-v2/canonical-reason-copy.ts`）—— 制式、單一真實來源。
- **Traveler booking／activity 頁**：維持 `booking-availability-evaluator.ts` 產出的
  **動態文案**（含「剩餘 N 人」容量提示、季節範圍等 runtime context），
  以 UX 價值優先；fallback path 已於 #1320 接上 canonical bodyZh。

理由：
- 嚴格套 canonical（選項 A）會讓 Traveler 失去「剩餘 1 人」等動態提示，UX 降級。
- 雙欄位（選項 B）使 API 變胖、每個 consumer 需協調欄位選用，複雜度不划算。
- Traveler 的動態 evaluator 文案是**旅客可用性 UX 的 system-of-record**；
  canonical helper 定位為「跨介面語意基準 + Admin/Guide preview 用」。

## 2. AC#2 vs AC#4 的正式立場

- #1212 **AC#2**「wire canonical into Admin+Guide+Traveler」：對 Traveler 判定為
  **語意層達成**（同一 CanonicalAvailabilityState 對應語意等價文案），
  不要求字面替換；Admin/Guide 為字面達成。
- #1212 **AC#4**「no copy weakening — Traveler messageZh shape」：完整保留。

兩者不再視為衝突：Traveler 動態文案與 canonical **語意對齊、字面各自最佳化**。

## 3. QA matrix（#1212 AC#1 交付）

8+1 個 `CanonicalAvailabilityState` × 3 介面的實際 zh-TW 字串矩陣，
已於 #1321 comment 交付（從 source 逐字抽出，非理論字串）：
<https://github.com/smallwei0301/tour-platform/issues/1321#issuecomment-4861380399>

該矩陣即本決策的佐證資料：Admin＝Guide 100% 一致；Traveler 與 canonical 語意
對齊、字面差異集中在「有 UX 價值的動態內容」（`full` 的剩餘名額、`outside_rule`
的成團人數）與少數純靜態州。

## 4. 後續（無強制 code 變更）

- 本決策**不需進一步 code 變更**（選項 C）。
- 可選的零風險 polish（非本 issue 範圍、不阻擋收斂）：未來若要進一步收斂，
  可把 Traveler 端**純靜態、無動態內容**的少數 reason 文案改讀 canonical bodyZh
  （零 UX 損失）；但 evaluator 的 reasonCode 與 CanonicalAvailabilityState 非 1:1，
  需逐句語意核對，另開執行 issue 處理。
- 稽核立場：未來稽核見「Traveler 未字面套 canonical」時，**以本文件為準**，
  視為 by-design，不再 re-flag。
