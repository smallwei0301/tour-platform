# harness 建置 — Claude Code 工作流防錯制度（Fable 5 session）
> 最後更新：2026-07-03（Asia/Taipei）｜負責 session：Claude Fable 5（唯一一次）

## 目標
把高階模型的判斷力外化為防錯 harness：診斷書、執法 hooks、調度守則、判斷矩陣、模板、維護協議、交接信；CLAUDE.md 改版為「鐵律＋路由」。

## AC 清單
- [x] A `01_diagnostics.md`（三痛點＋阻斷方案＋誠實條款）
- [x] 執法層：`.claude/settings.json`（deny＋hooks）、file-guard／bash-guard／sql-guard／run-checks 四支 script，含模擬輸入單元測試全綠（file-guard 17、bash-guard 14＋commit gate 4＋FROZEN_RE 9、sql-guard 7）
- [x] B `CLAUDE.md` 改版（備份 `CLAUDE.md.bak`）＋抽離檔 `07_testing_playbook.md`、`08_branch_hygiene.md`
- [x] C `02_orchestration.md`
- [x] D `03_rubrics.md`
- [x] E `04_templates.md`
- [x] F `05_maintenance.md`
- [x] G `06_manifesto.md`
- [x] `00_INDEX.md`、`lessons.md`（3 則種子教訓）、worklogs README
- [x] 對抗審查（fresh-context subagent）：REQUEST_CHANGES，1×P0＋5×P1＋4×P2，全數修復並回歸測試（34 case 全綠）
- [x] read-back 唯讀驗證（20 檔完整、語法/編碼合格）
- [x] commit＋push 至 `claude/code-workflow-architecture-mmm4ba`（738fcac＋審查修正 commit）

## 對抗審查 findings 與修復（2026-07-03）
- P0 run-checks.sh 零匹配 glob 產假綠燈 → 零匹配/零測試一律 exit 1
- P1 bash-guard：`git -C`/`+refspec` 繞過 force-push 與 commit gate → regex 改 `\bgit\b[^|;&]*\b(push|commit)\b`＋refspec 偵測
- P1 受保護 e2e spec 可被 shell 側 sed/redirect/mv 改弱 → FROZEN_RE 補 e2e 保護 pattern＋rm 規則擴及 mv
- P1 `.claude/settings.local.json` 未凍結 → file-guard＋FROZEN_RE 補上
- P1 deny 清單與 live 工具面脫節 → 補 deny `actions_run_trigger`；健檢（05 §5）新增 deny 對照項
- P1 override 整包解鎖無撤銷 → 協議改消耗式（用畢即刪，見 01 §4 第 4 點）
- P2 sql-guard：SELECT 包裝危險函式／EXPLAIN ANALYZE 誤傷 → 重寫（前綴白名單＋語境正規化＋危險函式黑名單）；自訂 volatile function 為已知極限（01 §5.2b）
- P2 file-guard root 空值 fail-open → 改 fail-closed
- P2 commit gate json 豁免過寬 → 移除泛用 `*.json` 豁免

## 已完成（附證據）
- 2026-07-03 hooks 實測即時生效：bash-guard 曾攔下含敏感字樣之測試指令；file-guard 曾攔下未授權之 harness 檔寫入；auto-mode 分類器攔下模型自建 override（詳 lessons.md 三則）
- 2026-07-03 使用者以 AskUserQuestion 回覆「P0-OVERRIDE：授權施工清單（推薦）」授權本次施工，override 檔引用之

## 下一步
- 使用者側（見 06_manifesto.md 第一節）：①開 GitHub branch protection（required checks）②Supabase MCP 改唯讀憑證 ③冷啟動演練清單

## 絕不重做（Do-NOT-redo）
- 三支 guard hooks 已通過完整模擬測試，勿因單次誤攔就弱化 regex（誤攔的標準解法在 lessons.md 第一則）
- CLAUDE.md 舊版全文在 `CLAUDE.md.bak`，不需要從 git 歷史挖

## P0-OVERRIDE 使用紀錄
- 2026-07-03 施工清單（CLAUDE.md、.cursor/harness/00–08、.claude/hooks/*、.claude/settings.json）｜使用者授權：AskUserQuestion 選項「P0-OVERRIDE：授權施工清單（推薦）」
