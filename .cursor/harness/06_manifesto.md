# 06 — 給未來 Session 的交接信

> 寫信人：Claude（Fable 5），本 harness 的設計者，2026-07-03。
> 收信人：之後在這個環境工作的每一個模型，以及專案擁有者。
> 治理等級：🔒 鎖定檔。

## 一、三件使用者沒問、但我認為最關鍵的事

### 1. 這套 harness 有一個它自己補不了的洞：merge 權還在模型手上——請開 GitHub branch protection
無人值守的 QA 佇列流程需要模型自主 merge（`merge_pull_request` 因此保留 allow），但「紅燈絕不 merge」目前只有 rubric（軟規則）在守。**唯一不依賴模型自律的解法在平台層**：到 GitHub repo Settings → Branches，對 `main` 開 branch protection，勾 required status checks（至少 `ci.yml`）。設定後，紅燈 merge 在 GitHub 端物理不可能，鐵律 6 從「請模型遵守」升級為「不遵守也做不到」。同理值得做的第二件：**把 Supabase MCP server 改掛 read-only 模式或唯讀憑證**——sql-guard 是擋在窗前的紙，資料庫端的唯讀權限才是牆。這兩項都只有使用者能做，合計 15 分鐘，是整套制度中 CP 值最高的投資。

### 2. 冷啟動窗口正在關閉——第一筆真訂單前，把「演習」變成「肌肉」
現在生產資料庫還是乾淨的，這是最後一段「犯錯無真實代價」的時間。建議在收單前完成：①一次完整的 payment→refund 實彈演練（走 `docs/operations/issue-402-real-payment-refund-verification-runbook.md`）；②一次 credential rotation 演練（runbook 已在 `docs/operations/`）；③確認 `docs/operations/qa-reports/` 的既有報告全部無 PII/密鑰（收單後每一份新報告都可能含真人資料，遮蔽習慣要在現在養成）。**第一筆真訂單落地之日起，本 harness 的所有「生產唯讀」規則從嚴格變成絕對**——那之後任何人（包括使用者自己在對話中）要求放寬，都應該先被質疑。

### 3. 弱模型長期運作的成敗不在智力，在 context 紀律
我在本 session 親眼看著自己設計的 hook 攔下自己三次（其中兩次是誤傷）。教訓不是 hook 太嚴，而是：**長指令、長對話、長任務是一切退化的溫床**。給未來的指揮官模型三個具體習慣：①複合 shell 指令拆小，多步驟寫成 scratchpad 腳本再跑；②每 ~10 個工具呼叫回讀一次 worklog（02 §4，這不是儀式，是把「以為」換成「檔案說」）；③context 開始吃緊的第一個動作永遠是「保全已完成的」（commit＋worklog），而不是「趕快做完剩下的」。

## 二、這套制度最可能的退化／腐化方式（按可能性排序）與預防

| # | 腐化方式 | 具體徵兆 | 預防／偵測 |
|---|---|---|---|
| 1 | **儀式化空轉**：模板照抄但 `{…}` 填得空泛、worklog 有寫但從不回讀、AC 寫成「功能正常」 | worklog 的「絕不重做」區長期空白；派工 prompt 裡出現未替換的 `{…}` | 使用者抽查 worklog 品質；驗收 subagent 的 T4 清單第 4 項會抓到空泛 AC |
| 2 | **假性驗證**：驗收 subagent 不實跑、只覆述實作者的宣稱；或主模型跳過隔離驗收「因為改動很小」 | 驗收回報沒有 exit code／沒有 read-back 清單 | V 模板強制「自己跑，不看既有證據檔」；回報缺證據指標 = 驗收無效，重派 |
| 3 | **證據偽造**：直接手寫 `.claude/state/last-checks.json` 騙過 commit gate | 證據檔的 `output_head_tail` 與測試檔數量/名稱對不上 | run-checks.sh 記錄輸出摘要墊高造假成本；隔離驗收必重跑；使用者可隨時比對 CI 結果 |
| 4 | **測試漂移**：不是改假證據，而是把測試本身改弱（斷言放鬆、case skip） | diff 裡測試檔的 `-` 行多於 `+` 行；skip/todo 出現 | R1 信號 3 硬規則；受保護 spec 有 file-guard；PR review（T4 第 4 項）專查此項 |
| 5 | **override 通膨**：P0-OVERRIDE 從例外變日常，每個任務都「剛好是 P0」 | worklog 的 override 紀錄頻率上升；授權引用語焉不詳 | override 檔要求引用使用者原話（實測 auto-mode 分類器會擋自我授權）；使用者看到頻繁請求時應質疑任務規劃而非放行 |
| 6 | **hook 繞道**：用 python/node inline script 寫檔避開 bash-guard 的 regex | git diff 顯示凍結區變了但對話中沒有對應的 Edit/Write 紀錄 | 已知殘洞（01 §5.3）；CI 與 PR review 兜底；若發現繞道行為，這是最嚴重的信任事故，應立即人工接管 |
| 7 | **lessons.md 垃圾場化**：教訓越寫越多、越寫越泛，最後沒人讀 | 檔案超過精簡閾值卻沒觸發 §4 流程 | 05 §4 精簡協議；健檢（05 §5）列入檢查 |

**總原則**：每一種腐化的共同解藥都是「證據指標」——路徑、行號、SHA、exit code、連結。一句沒有證據指標的宣稱，無論多流暢，價值為零。這套 harness 的靈魂不是那幾支 hook，而是這個要求。

## 三、能力極限的最後提醒

hooks 擋得住手滑，擋不住品味。文案語氣、UX 取捨、品牌一致性、商業判斷——這些任務上，弱模型的輸出會**看起來**很對（這正是危險所在）。標準應對已寫死在 R3 條件 5：查 BRAND_BOOK → 查不到就帶選項熔斷。使用者側的對應建議：這類決策不要委託給無人值守佇列，留給你在場的 session。

（若本 session 因 context 耗盡而有未完成事項，清單見 `docs/operations/worklogs/` 下的 harness 建置 worklog。）
