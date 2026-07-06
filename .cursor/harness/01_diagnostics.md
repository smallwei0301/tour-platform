# 01 — Harness 漏水診斷書

> 撰寫：Claude（Fable 5）工作流架構審查 session，2026-07-02（Asia/Taipei）。
> 本檔是整套 harness 的根據地：所有防線（hooks、權限、rubrics）都回指本檔的痛點編號。
> 治理等級：🔒 鎖定檔（修改需使用者同意，見 `05_maintenance.md`）。

## 0. 審查時的環境現況（as-is 快照）

| 層 | 現況 | 評語 |
|---|---|---|
| CLAUDE.md | 內容豐厚但為 200 行敘事散文 | 知識在，執法不在 |
| `.claude/settings.json`（專案） | 僅 1 條 curl allow，**無 deny、無 hooks、無 skill、無 agent** | harness 層近乎空白 |
| 全域 hooks（launcher） | SessionStart git-identity、Stop git-check（擋未 commit/未 push） | 只防「忘記 commit」這一種假性完成 |
| MCP | Supabase＋Vercel＋GitHub 共 100+ 工具，**直連正式生產專案** | 含 `apply_migration`、`execute_sql`（可寫）、`deploy_to_vercel`、`merge_pull_request`、`push_files` |
| 測試資產 | 369 個 API 測試檔、143 個 e2e spec、21 條 GitHub Actions | 驗證能量充足，但無機制強迫弱模型使用 |
| 業務狀態 | 冷啟動：生產已連線、**尚未收正式訂單** | 建制度的唯一窗口期 |

## 1. 三大物理痛點（按「Token 浪費 × 失焦 × 工具錯誤」加權排序）

### 痛點 1：生產寫入面全開，且與唯讀面混在同一批工具裡
**對應失敗場景：工具調用崩潰點。**

- 弱模型在 context 膨脹後最典型的退化是「參數亂帶＋錯了就換一個工具再試」。本環境裡「換一個再試」的候選池包含 `mcp__Supabase__apply_migration`（直改生產 schema）、`execute_sql`（可 UPDATE/DELETE 正式 orders/users/PII——#1563 才剛修完 RLS P0 外洩）、`mcp__Vercel__deploy_to_vercel`、`mcp__github__push_files`（繞過本地 git 直寫遠端）。
- Token 面：100+ 工具 schema 的試錯循環（帶錯 `project_id` → 報錯 → 重試 → 再報錯）是長 session 最大的無效消耗之一，且每次重試都把錯誤訊息灌回 context，加速失焦。

**阻斷方案（已落地）：**
1. `.claude/settings.json` → `permissions.deny` 下架**已盤點到的**生產寫入工具（migration／deploy／branch 操作／GitHub 直寫檔案／workflow 觸發）。被 deny 的工具**連試錯的機會都沒有**，錯誤循環從源頭切斷。注意：MCP server 的工具面會隨版本變動，deny 清單需在每月健檢（`05_maintenance.md` §5）對照 live 工具列表重新盤點——**deny 是補丁，資料庫/平台端的唯讀憑證與 branch protection 才是牆**（`06_manifesto.md`）。
2. `execute_sql`／`apply_migration` 由 PreToolUse hook `.claude/hooks/sql-guard.sh` 守門：**預設只放行唯讀查詢**，任何 DML/DDL 一律 exit 2 並回吐正確路徑；寫入需走 **SQL-OVERRIDE 協議**（§4b，2026-07-06 owner 拍板新增）——使用者當輪明確授權、30 分鐘效期、逐句審計、災難級語句（drop database/schema、alter system）連授權都不放。
3. schema 變更合法路徑：migration 檔（時間戳命名）→ PR → CI 綠燈 → 套用（使用者親自套，或經 SQL-OVERRIDE 授權由 agent 套）→ 補 ledger（`docs/operations/migration-apply-ledger-sop.md`）。

### 痛點 2：所有紅線只存在於散文，記憶解體時無任何攔截
**對應失敗場景：語意迷航點。**

- 專案有多條「絕對紅線」：legacy booking 凍結只修 P0（#1386）、既有 migration 只增不改、受保護 e2e spec 不得刪改、`middleware.ts`／security-env 是安全前門、`yarn.lock` 不 commit。這些全寫在 CLAUDE.md 敘事段落裡——正是弱模型 context 壓力下**最先被擠掉**的內容。
- 迷航的典型形態不是「做錯新事」，而是「重做／誤傷已完成的事」：順手重構 legacy checkout、把「跟新契約衝突」的舊 spec 刪掉、回頭改已套用的 migration。每一種目前都是零攔截。

**阻斷方案（已落地）：**
1. PreToolUse hook `.claude/hooks/file-guard.sh`（掛 Edit|Write）：凍結路徑硬擋（exit 2），錯誤訊息內含正確替代路徑，讓模型被擋時同時被導航。凍結清單見本檔 §3。
2. PreToolUse hook `.claude/hooks/bash-guard.sh`（掛 Bash）：擋 shell 側旁路——`rm` 受保護目錄、`sed -i`/redirect/`tee` 寫入凍結路徑、force-push。
3. P0 例外走 **P0-OVERRIDE 協議**（§4）：預設全擋，解鎖需使用者在對話中明確授權，並留審計痕跡。
4. CLAUDE.md 改版：紅線提煉成置頂「十條鐵律」，長敘事抽離到 `07`/`08`，降低被 context 擠掉的機率（規則位置越前、越短、越像命令，弱模型存活率越高）。
5. 記憶錨點協議（`02_orchestration.md` §4）：任務狀態雙寫 GitHub issue ＋ `docs/operations/worklogs/`，模型被要求「以 worklog 為準，不信任自己的上下文記憶」。

### 痛點 3：完成宣稱沒有證據鏈，唯一的守門員只看 git 乾不乾淨
**對應失敗場景：假性完成點。**

- 全域 Stop hook 只擋「有變更沒 commit/push」。它擋不住兩種更毒的假性完成：
  - (a) 宣稱「已建立測試並通過」但檔案根本沒寫出來——git 乾淨，hook 放行；
  - (b) 宣稱「測試綠燈」但從未執行，或跑的是無關檔案——hook 完全不知情。
- CLAUDE.md QA 標準第 1 條「不得只靠推測當作通過」目前沒有任何機器背書，全靠模型自律——這對弱模型等於沒有。

**阻斷方案（已落地）：**
1. 證據鏈工具 `.claude/hooks/run-checks.sh`：跑 targeted `node --test`（可加 `--typecheck`／`--all`），把「指令、exit code、時間戳、輸出摘要」寫進 `.claude/state/last-checks.json`。
2. `bash-guard.sh` 的 **commit gate**：`git commit` 觸碰程式碼時，若無 30 分鐘內的綠燈證據檔即擋下（docs-only commit 豁免）。「先跑測試才准 commit」從此不是叮嚀，是物理限制。
3. 隔離驗證（`02_orchestration.md` §5）：實作者不得自我驗收；驗收由 fresh-context subagent read-back 檔案＋重跑測試。
4. merge 防線：`merge_pull_request` 保留可用（無人值守 QA 佇列需要它），但 rubric 硬性要求 CI `conclusion=success` 證據入 worklog。**平台層的最終解是 GitHub branch protection（required status checks）——見 `06_manifesto.md` 第 1 件事，強烈建議使用者立即設定。**

## 2. 防線落地對照表

| 防線 | 檔案 | 攔截點 | 對應痛點 |
|---|---|---|---|
| 生產寫入工具下架 | `.claude/settings.json` → `permissions.deny` | 工具呼叫前（權限層） | 1 |
| SQL 預設唯讀哨兵＋SQL-OVERRIDE 閘門 | `.claude/hooks/sql-guard.sh` | PreToolUse: `mcp__Supabase__execute_sql`｜`apply_migration` | 1 |
| 凍結路徑守衛 | `.claude/hooks/file-guard.sh` | PreToolUse: Edit\|Write | 2 |
| Shell 旁路守衛＋commit gate | `.claude/hooks/bash-guard.sh` | PreToolUse: Bash | 2、3 |
| 測試證據鏈 | `.claude/hooks/run-checks.sh` → `.claude/state/last-checks.json` | commit 前主動執行 | 3 |
| 未 commit/未 push 守門 | 全域 `stop-hook-git-check.sh`（既有，勿動） | Stop | 3 |
| 記憶錨點雙寫 | issue 留言＋`docs/operations/worklogs/` | 流程協議 | 2 |
| 隔離驗收 | `02_orchestration.md` §5 | 流程協議 | 3 |

## 3. 凍結清單（file-guard 執法範圍，Q2 定案）

需 P0-OVERRIDE 才可改：

| 路徑 | 理由 |
|---|---|
| `apps/web/app/api/orders/**`、`apps/web/app/api/payments/**` | legacy booking 凍結（#1386），只修 P0；ECPay callback 必須冪等 |
| `apps/web/app/api/activities/*/availability/**` | legacy availability 路徑（#1386） |
| 既有 `supabase/migrations/**` | migration 只增不改；新檔強制時間戳命名 |
| `apps/web/e2e/` 受保護 spec：`t0-*`…`t7-t8-*`、`funnel-*`、`deeplink-*`、`booking-flow-*` | CLAUDE.md 測試政策：不得刪改 |
| `apps/web/middleware.ts` | 三 auth realms 的唯一前門＋CSRF＋kill-switch |
| `apps/web/src/config/security-env.mjs`、`startup-env.mjs` | 秘密守衛，CI secret-scan 的搭檔 |
| `CLAUDE.md`、`.claude/**`、`.cursor/harness/0*.md` | harness 治理檔（`05_maintenance.md`） |

無條件擋（連 override 都不放）：`yarn.lock`（環境副作用檔，改動即棄）。

可自由寫：`.cursor/harness/lessons.md`（append-only 踩坑紀錄）、`docs/operations/worklogs/**`、`docs/operations/qa-reports/**`。

## 4. P0-OVERRIDE 協議

1. 模型撞到 file-guard 攔截時，**不得自行解鎖**。先在對話（或 issue）中向使用者說明：要改哪個凍結檔、為什麼是 P0、diff 預估多大。
2. 使用者在對話中回覆一句含 `P0-OVERRIDE: <路徑>` 的明確授權。
3. 模型把該路徑與**使用者原話、授權時間**寫入 `.claude/state/p0-override`（一行一路徑；60 分鐘內有效，過期重批）。
4. **消耗式授權**：一張授權只服務「當次對話中使用者批准的那一件事」。該編輯完成後**立刻刪除 override 檔**，不留著給下一個任務用；換任務＝重新請示。
5. 完成後在 worklog 記錄 override 使用紀錄（路徑＋授權原文＋起訖時間），供使用者抽查。

## 4b. SQL-OVERRIDE 協議（生產 SQL 寫入授權；2026-07-06 owner 拍板新增）

適用：`mcp__Supabase__execute_sql` 的寫入/DDL、`mcp__Supabase__apply_migration`。目的：owner 可以在對話中直接命令 agent 執行 SQL（免手動複製貼上 SQL Editor），同時保證 agent **永遠無法自行發起**生產寫入。

1. agent 需要寫入時，**先在對話中列出**：將執行的完整 SQL、目標表、預期影響（筆數或 schema 變化）、是否可逆。不得先斬後奏。
2. 使用者在對話中回覆一句含 `SQL-OVERRIDE` 的明確授權（使用者主動下令「幫我跑這句/套這支 migration」再確認一次亦可）。
3. agent 把**授權原話＋時間＋目的**寫入 `.claude/state/sql-override`（**30 分鐘**內有效，過期重批）。
4. sql-guard 在授權窗內放行寫入，但：災難級語句（`drop database`／`drop schema`／`alter system`）**連授權都不放**（請使用者親自在 Dashboard 執行）；每句放行的 SQL 自動追加到 `.claude/state/sql-audit.log`（時間戳＋工具＋語句前 400 字）。
5. **消耗式**：該批 SQL 執行完畢立刻刪除 override 檔；執行結果（實際筆數/錯誤）與審計摘要記入 worklog。
6. **migration 紀律不變**：schema 變更仍必須先落時間戳 migration 檔、過 PR＋CI，SQL-OVERRIDE 只是把「套用」這一步從『使用者複製貼上』換成『agent 代跑』；套完照 `migration-apply-ledger-sop.md` 補 ledger（SOP 本就涵蓋 MCP 套用情境）。臨時資料修正（DML）可不落 migration 檔，但必須在 worklog 留完整語句與影響筆數。
7. **平台層前提**：本協議只管 harness 側。若 Supabase MCP server 端設了唯讀（或工具面未曝露 `apply_migration`），寫入仍會在 server/DB 層失敗——該開關由使用者管理；開著唯讀時，agent 應回報「平台層唯讀擋下」而不是重試。

## 5. ⚖️ 誠實條款：這套 harness 的能力極限

**擋得住的**：工具層的誤觸（Edit/Write/Bash/MCP 走正門的呼叫）、無證據 commit、生產寫入、force-push。

**擋不住的（已知殘洞，按風險排序）：**
1. **P0-OVERRIDE／SQL-OVERRIDE 的最後一哩是 honor system——但實測有第二道防線**：hook 讀不到對話內容，只能驗證 override 檔存在與新鮮度。不過本 harness 建置時實測：模型在「未取得使用者明確授權」的情況下嘗試寫 override 檔，被 Claude Code 的 auto-mode 安全分類器直接攔下（辨識為 self-authorization），直到使用者在對話中明確授權後才放行。緩解疊加：分類器＋檔案格式要求引用使用者授權原文＋worklog 審計＋使用者抽查（見 `06_manifesto.md` 腐化清單）。
1b. **SQL-OVERRIDE 授權窗開啟的 30 分鐘內是全寫入放行**（僅擋災難級語句）——授權「跑這支 migration」的窗內，技術上也能跑別的 UPDATE。緩解：消耗式用畢即刪＋sql-audit.log 逐句留痕＋worklog 對帳；使用者抽查審計檔與實際下令範圍是否一致。
2. **證據檔可被偽造**——模型可以直接手寫 `last-checks.json`。緩解：`run-checks.sh` 會寫入輸出摘要（偽造需編造測試輸出，成本高）；隔離驗收 subagent 必須**重跑**測試而非只讀證據檔；file-guard 不擋 `.claude/state/`（它是 runtime 區），這是刻意取捨。
2b. **經 SELECT 呼叫的 volatile function 攔不全**——sql-guard 已黑名單 `setval`/`pg_terminate_backend` 等已知危險函式並強制查詢型前綴，但任意自訂函式（如 `select some_admin_rpc()`）regex 無法窮舉。**真正的牆是 Supabase MCP 掛唯讀憑證**（`06_manifesto.md` 第 1 件事）。
3. **非常規寫檔路徑**——`python -c 'open(...).write(...)'`、node inline script 等可繞過 bash-guard 的 regex。緩解：bash-guard 已涵蓋最常見的 `sed -i`/redirect/`tee`/`rm`；殘洞靠 CI（受保護 spec 刪改會讓 e2e-smoke／ci.yml 變紅）與 PR review 兜底。
4. **`merge_pull_request` 是 allow 的**——無人值守佇列需要它，紅燈亂 merge 只有 rubric 擋。**唯一不依賴模型自律的解法是 GitHub branch protection，需使用者到 repo settings 設定**（本 harness 無權代設）。
5. **hooks 對長指令有誤傷率**——實測 hooks 寫入 settings.json 後即時生效（含當前 session）。bash-guard 以「整條指令字串」做 regex 掃描，一條複合指令若同時含 `rm` 與受保護路徑字樣（即使兩者無關）會被誤擋。這是刻意的 fail-closed 取捨：被誤擋時把指令拆小、或把多步驟寫成 scratchpad 腳本再執行。
6. **品味與商業美感判斷**——文案語氣、UX 取捨、定價呈現、品牌一致性，弱模型注定不可靠。標準應對（`03_rubrics.md` R4）：先查 `BRAND_BOOK.md`，查得到就照抄；查不到→**熔斷**，帶 2–3 個選項＋各自 trade-off 停下來問使用者，**絕不自由發揮**。不確定的事就查，查不到就標註 `NOT_VERIFIED`，不編造。
