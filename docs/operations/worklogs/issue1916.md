# Issue #1916 worklog：mark-replied idempotency（Run `2026-10-24-midao2-r09`）

## 設計決策紀錄（Sol TRIAGE，供日後查閱）
- **mark-replied 採「自然冪等」，不寫 `midao_idempotency_records`。**
  - 同一位導遊對已是 `replied` 的 inquiry 重送時，回 200 加目前狀態（`replayed:true`），不做任何寫入。
  - CAS race 的輸家重讀後若看到 `replied`，也回 replayed。
  - 其他狀態維持 409 `INVALID_INQUIRY_STATE`。
- **採用理由：**
  1. route 的 body 契約是嚴格空物件，scope 固定為單一 inquiry，所以不會出現「同一把 key、不同 payload」。
  2. 狀態機（`inquiry-state-machine.mjs`）沒有任何轉移能回到 `new`，而 `replied` 只能從 `new` 進入，因此「重複 replied」只可能是重送。
  3. 若在 app 層寫 idempotency 紀錄，claim 與 CAS 是兩段分開的寫入，不具原子性，風險高於收益。
  4. canonical 規格 `docs/superpowers/specs/2026-07-22-midao-backend-design.md` 的 §8.4／§9 只要求 convert 寫 durable record。
- **刻意的契約變更：** 「重複 replied」原本回 409，改為回 200 replayed。既有測試已同步更新，並在註解標明。
- **附帶發現：** mark-replied route 註解引用的 `2026-08-07-issue1759-task39-conversion-gateway-plan.md §4.6` 在 repo 與 git 歷史中都找不到。本紀錄可作為 mark-replied 冪等語意的依據。

## 盤點（haiku scout）
- 三個呼叫端：
  - `RequestProgressActions`：decide
  - `TravelerContactActions`：mark-replied
  - `InquiryConversionSheet`：convert
- 三者每次呼叫都會產生新的 key；`TravelerContactActions` 沒有連點防護。
- 既有測試 `midao-inquiries-gateway.test.mjs:241` 斷言「重複 replied 回 409」。

## 施工（sonnet）
- `9c4473b7`（server）
  - 記憶體分支與 Supabase 分支都已實作自然冪等，並處理 race 輸家的 replay。
  - route 回應只新增 `replayed` 欄位。
- `9b403e1d`（client）
  - 新增 `idempotency-key.ts`，提供 `getOrCreateKey`、`resetKey`、`getKeyForPayload`。
  - 三個呼叫端在同一次操作內重用 key；payload 改變時換 key（decide 也比照，因為婉拒原因在失敗後可以修改）。
  - `TravelerContactActions` 補上 `pendingRef` 與 try/finally。
- `d36f1d6e`（rework）
  - 補上兩個測試缺口：他人 inquiry 在 race 情境下回 404；decide 與 conversion 的 fingerprint 抽成純函式並加上行為測試。
  - 補上 `INVALID_INQUIRY_STATE` 的文案。
- 驗證：run-checks 加 `--typecheck` 共 116 項全過；unit 全量的失敗數在 base 範圍內；突變 11/11 被擋下（施工 8 項、rework 3 項）。

## Final Risk（opus，fresh context，對抗式審查）
- **審查模型說明：** premium（fable）沒有派出。原因是 tour-platform 的 `model-routing.json` 規定 Claude provider 的 audit 只能用 opus，premium 只定義給 OpenAI 的 astra。依 Owner #552 降級為 opus 對抗式審查。
- **結論：** PASS，blocking 0，設計判定確認正確。
  - 他人 inquiry 回 404，不會洩漏存在性。
  - 記憶體與 Supabase 兩個分支行為一致；replay 時不寫入。
  - 只新增 `replayed` 一個欄位。
  - decide／convert 的 RPC 在 RAISE 時會連同 claim 一起 rollback，同一把 key 重試會重新執行，不會卡住。
- **突變：** 16 項擋下 13 項。M3、M12 已在 `d36f1d6e` 補上；M5（忽略 trim）方向安全，只會多換一把 key。
- **後續（non-blocking）：**
  - `InquiryConversionSheet` 沒有 `pendingRef`（既有問題）。
  - decide 遇到 `IN_PROGRESS` 409 時的文案略有誤導。
  - 三個元件只有原始碼斷言，沒有渲染測試（專案沒有 DOM 測試環境）。
