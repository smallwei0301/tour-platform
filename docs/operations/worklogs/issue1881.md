# PR #1881 — 模型路由與派工前置證據治理紀錄

> 本紀錄只補持久證據，不重啟產品施工。PR #1881 本身為正確 issue anchor；D7 留言未發送，整體仍 HOLD。文件 exact commit／remote proof 由 executor 外部結果交接，避免自指 SHA 迴圈。

## 目標

保存 [PR #1881](https://github.com/smallwei0301/tour-platform/pull/1881) 六檔治理差異、獨立審查、既有 CI 原始證據與合併候選等價性。規則核對以 current main `ea75b40fa6e2db145b79a7ecc5f3eb01fdd598db` 的 CLAUDE／harness 為準；本 PR 的 `docs/AGENT-EXECUTION.md` 尚未合併，不冒稱它已是 main 規則。

## AC 清單

- [x] 六檔 exact scope、原始 CI checkout／counts 與 blob／mode 等價性已核對。
- [x] 六檔獨立 source review 的本輪正式 verdict：PASS、0個未解 finding。
- [ ] 文件正常 commit／push 與遠端 exact proof。
- [ ] D7：本 worklog＋本 PR 的實際頂層 issue comment；本 executor 不發送。
- [ ] ready／merge／正式部署的必要授權與其餘 gates，不由本紀錄放行。

## 已完成（附證據）

### Exact source 與 ownership

- 原 base：`69c78c3a725fb6037c0c8a7703abdc8f34f73c67`；治理 source：`0ee6cd9596f269de4a11d8797906008841033d10`。
- 現行 base branch `codex/tour-cloud-node22` tip：`957679312f1288af8f4a05d43d1e470d942be4a5`；工作分支 `codex/tour-model-routing-dispatch-prevention`。
- 原六檔：`.cursor/harness/02_orchestration.md`、`docs/AGENT-EXECUTION.md`、`scripts/agents/model-routing.json`、`scripts/agents/dispatch-preflight.mjs`、`apps/web/tests/unit/tour-model-routing.test.mjs`、`docs/operations/reports/agent-dispatch-playbook-20261001.md`；+919/-2。
- 原六檔 patch SHA256：`143ba0e9a3ecda8abdb675a31b6b16d32cfe55bcac6ee8af211cfa20f0f1aadd`。
- 本輪 root 為文件唯一施工者，source reviewer 獨立、只讀；只在同 executor 的獨立本機 snapshot 準備文件，沒有 checkout/reset 原 worktrees。保全 rework `3e9718f17f78ba56562f29846f8442715d831c20`、recovery `da9f1fbd5cc2b373609d0956404a1c91d61a864c` 及既有 refs／receipts。

### 歷史審查與本輪收據

PR body 有既有正式整合25/25、typecheck、fresh Sol review16/16 PASS摘要；Playbook亦保留各輪測試與 before proof 缺口。其指向的 `/tmp/tour-tool-order-evidence/`、`/tmp/tour-before-proof-evidence/`、`/tmp/tour-builder-choice-evidence/` 本 executor 未找到，摘要不能充作原六檔獨立 receipt，也不重建過去時間或把舊缺口回填PASS。

本輪因此安排有限 fresh Sol 六檔 source review，actor `/root/upstream1881_source_review`、`fork_turns=none`；requested `gpt-6.1-sol`、actual UNKNOWN，與文件實作者分離，正式 verdict **PASS、0個未解 finding**。完整六檔逐blob讀回，patch hash相符。原始收據位於同 executor `/workspace/tour-rework-20261003/upstream1881/source-review.md`／`source-review.json`，為本機 artifact，不冒稱 GitHub 可下載附件；這是本輪新審查，不回填歷史receipt，亦不以CI成功代替独立審查。

### 原始 CI 與等價性

[CI run 36811671554](https://github.com/smallwei0301/tour-platform/actions/runs/36811671554)／[job 110207861702](https://github.com/smallwei0301/tour-platform/actions/runs/36811671554/job/110207861702) 官方讀回 success。原始log確認checkout為 `50f0cf7fdac102936a98ef665d09c663e972ec09`，即 source 合入原base；不是宣稱現在merge ref已重新跑CI。

原始成功命令：

```sh
node scripts/check-migration-source-gate.mjs --mode source
npm run lint -w @tour/web
npm run typecheck -w @tour/web
npm run test -w @tour/web
npm run build -w @tour/web
bash scripts/isr-smoke.sh
bash scripts/preflight-check.sh
```

TAP原始數量：**5836 tests／5833 PASS／0 FAIL／3 SKIP**；preflight再次出現相同數量。5833是pass數，不是total。本輪沒有重跑產品測試或CI。

目前合併候選 `79c665a6b3433be38ce64ba5cfbf40649be772be` 與舊CI checkout逐項比較：**原3128 entries之blob及mode完全一致**，只多 `docs/operations/worklogs/issue1880.md`（blob `bf4816c92423b00340fb4170da01c2ecb1c11ba5`、mode100644）。以此承接適用的既有CI；不新增docs-only必須重跑的規定，也不把等價證明冒稱新CI實跑。若後續source改變或有新失敗，須另判適用範圍。

## 下一步

- 文件 checks／獨立審查通過、fresh remote source未變後，僅正常push本工作分支；不可force／rewrite／推main。文件push若產生新CI，另記實際狀態，不manual rerun。
- 父任務2026-10-03 10:17 PDT（17:17 UTC）在[現行Vercel UI](https://vercel.com/smallwei0301s-projects/tour-platform/settings/environments)唯讀核對Production tracks main、Preview All unassigned git branches、Custom environments=0。另由本executor讀回既有deployment `dpl_5rBWrT1WXd9cZmT4JQfoiZGvjGFx`：source=git、branch=`codex/tour-model-routing-dispatch-prevention`、SHA=`0ee6cd9…`、target=null、Preview alias；正常工作分支push為Preview，不授權直接deploy或Production。
- D6：歷史CI link與當前source等價證據如上；本文件持久化不是ready／merge授權。D7：PR #1881正確anchor，草稿可準備但本輪禁止發送，留言前不能PASS。#1880公開里程碑曾被拒、#1882留言取消，均不重試、不換PR轉貼。
- 本分支亦為下游stack依賴；上游文件tip改變後，下游base/diff/merge candidate需据實核對，不rewrite或宣稱繼承未核對的CI。

## 絕不重做（Do-NOT-redo）

- 保留Playbook原before MISSED／無runtime identity／歷史原始receipt缺失的限制；requested不等於actual，工具順序引用不是平台身分驗證。
- 不重啟產品施工、不改原六檔或guard；不為文件重跑未變source全套、不以空commit觸發CI。
- 不發GitHub留言或改PR body、不ready／merge／retarget／force push／manual CI rerun／直接部署；不操作DB／共享TEST／Production、credentials或安全設定，不存取曾被拒的/root路徑。
