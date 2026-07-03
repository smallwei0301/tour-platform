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
- [ ] 對抗審查（fresh-context subagent）＋修正
- [ ] read-back 唯讀驗證
- [ ] commit＋push 至 `claude/code-workflow-architecture-mmm4ba`

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
