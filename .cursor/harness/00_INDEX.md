# 00 — Harness 總覽與 Session 開機順序

> 治理等級：🔒 鎖定檔（`05_maintenance.md`）。

## Session 開機順序（每個新 session／context 恢復後照做）

1. 讀 `CLAUDE.md`（十條鐵律＋架構速覽＋路由表）。
2. 讀本檔，確認自己接下來的工作型態對應到哪個 harness 檔。
3. 找到或建立本任務的 worklog：`docs/operations/worklogs/issueNNNN.md`（模板：`04_templates.md` §W）。**有 worklog 先讀 worklog——它比你的記憶可信。**
4. fresh container：repo root 跑 `npm install`；確認 Node 22（`node -v`）。
5. 開始工作。撞到 hook 攔截時，**讀懂攔截訊息再行動**，訊息裡就是正確路徑。

## 檔案地圖

| 檔 | 內容 | 什麼時候翻 |
|---|---|---|
| `01_diagnostics.md` | 三大失敗場景、防線對照表、凍結清單、P0-OVERRIDE 協議、能力極限 | 被 hook 擋下時；想知道「為什麼有這條規則」時 |
| `02_orchestration.md` | 指揮官守則、派工三件套、升降級路徑、記憶錨點、隔離驗證 | 任務 >30 分鐘或需要 subagent 時 |
| `03_rubrics.md` | 換路徑信號（R1）、完成定義（R2）、熔斷條件（R3）、誠實條款（R4） | 卡關時（R1）、想說「完成」前（R2）、想問使用者前（R3） |
| `04_templates.md` | T1–T4 派工模板、V 驗收模板、W worklog、I issue 留言 | 每次派工/驗收/寫 worklog，直接複製填空 |
| `05_maintenance.md` | harness 自我維護權限分級、lessons 格式、提案流程、精簡協議 | 想改規則檔時（先看你有沒有權限）；踩坑後 |
| `06_manifesto.md` | 交接信：使用者該做的平台級設定、腐化模式與預防 | 新接手 session 讀一次；懷疑制度在退化時 |
| `07_testing_playbook.md` | QA 驗收標準全文、測試指令、TDD/Playwright/契約測試準則 | 任何要寫測試或做 QA 驗收的任務 |
| `08_branch_hygiene.md` | branch 對齊、squash 殘留回收（免 force-push）、push 規範 | 開工對齊 main 時；push 被拒時 |
| `lessons.md` | 踩坑教訓（唯一可自由追加的 harness 檔） | 踩坑後寫入；除錯前先 grep 它 |

## 執法層（不用讀，但要知道它存在）

- `.claude/settings.json`：生產寫入 MCP 工具 deny 清單＋hooks 掛載。
- `.claude/hooks/file-guard.sh`：凍結路徑守衛（Edit/Write）。
- `.claude/hooks/bash-guard.sh`：force-push／危險 rm／shell 旁路／commit 證據 gate。
- `.claude/hooks/sql-guard.sh`：生產 SQL 唯讀哨兵。
- `.claude/hooks/run-checks.sh`：測試證據產生器（commit 前必跑）。
- 全域（launcher）Stop hook：未 commit/未 push 會擋 session 收尾——這是環境內建，不在 repo 裡。
