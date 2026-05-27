# GH-841 與 PR #840 關係說明（回應 Rita Blocker #5）

- 日期（local）：2026-05-27
- 相關來源：
  - Issue #841
  - PR #840
  - Issue #838（背景）

## 結論
- GH-841（正式 plan contract 完整修正）**取代** PR #840 目前的 `priceMultiplier` 猜測式做法（`price_multiplier` / 類比演算法推論）。
- PR #840 **不得** 以現況直接併入主線（`merge as-is`）使用，應視為過時方案的初始草案。
- 只有在 GH-841 的修正完成並被 reviewer 核准後，PR #840 才可繼續以下任一處理：
  1) 依 GH-841 的正式 plan contract 完整重作，或
  2) 明確標記為 superseded 並關閉。

## 為何要這樣處理
- GH-841 的正式 plan contract 規範了「正式票券、乘客/導覽欄位與價格運算」的邏輯邊界；
- PR #840 屬於較早版本的猜測性草案，若直接合併，會與正式需求不一致；
- 為了避免 reviewer 方向不一致，應將關係寫入 repo artifact，由 Rita 及後續人員可直接稽核。

## 指令建議（交付後續）
- GH-841 完成並 review 後，若 PR #840 作者要續作，需先完成與此關係的一致性確認。
- 若 PR #840 無法在短期對齊，請優先關閉 PR #840，並在關閉訊息中引用本文件。
