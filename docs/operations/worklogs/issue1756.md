# issue1756 — Midao runtime foundation and responsive shell
> 最後更新：2026-07-23 12:49 CST｜負責 session：Canary／2026-07-23

## 目標
依reviewed executable micro-plan建立Midao runtime foundation與第一個responsive shell，所有backend/data變更採strict TDD、staged evidence與local Postgres／Playwright真實驗證。

## 執行錨點
- Issue：https://github.com/smallwei0301/tour-platform/issues/1756
- Branch：`feat/midao-foundation-1756`
- Worktree：`/root/.hermes/worktrees/tour-platform/midao-foundation-1756`
- Base：`origin/main af3963cb48afdf246035bbf746694c7de18cc2ed`
- Reviewed plan anchor：`bcb81b119228dc81fecff7a212fff4017c4a1584`
- Plan：`docs/plans/2026-07-22-midao-package-01-foundation-shell.md`

## AC 清單
- [ ] 五個additive foundation migrations以RED → minimal GREEN完成，clean local Postgres apply/runtime PASS。
- [ ] Durable idempotency、atomic mode switch、audit/outbox與exact RPC ACL/RLS contracts通過。
- [ ] Canonical guide guard、signed impersonation actor、login/logout cookie cleanup與safe redirect contracts通過。
- [ ] `/midao`五route responsive shell與Brand Book tokens完成。
- [ ] Midao＋legacy Playwright真browser gates、focused/full suite、lint、typecheck、build全部有fresh evidence。
- [x] Fresh executable-plan spec與quality/security reviews雙PASS（anchor `bcb81b11`）。

## 已完成（附證據）
- 2026-07-23 建立isolated implementation worktree；branch/base/plan anchor驗證且初始worktree clean。
- 2026-07-23 A1首次tracked `npm install --ignore-scripts`完成368 packages，但npm 11.9.0刪除一筆nested optional-peer lock entry，lock SHA drift gate正確FAIL；未沿用成PASS、未執行`npm audit fix`。
- 2026-07-23 owner原文「用推薦方案」核准改採deterministic `npm ci --ignore-scripts`；已restore original `package-lock.json`。
- 2026-07-23 第一輪focused correction review雙FAIL/HOLD：executable block漏SHA/TypeScript、過期umbrella next-action、npm exec Supabase postinstall seam、hostile npm/PATH/npmrc與舊node_modules/dirty-state隔離不足。
- 2026-07-23 從既有verified 2.87.2 cache供應固定standalone Supabase artifact：`/root/.hermes/toolchains/supabase/2.87.2/supabase`；read-back version `2.87.2`、SHA-256 `e325dd50b274e88fd1416f93b9e063902827ae326d356ab7f9dc604c3eba5c59`、mode `0755` regular root-owned、96,334,008 bytes。未下載floating CLI。
- 2026-07-23 第二輪focused correction review雙FAIL/HOLD：A1分開blocks且缺fail-fast，前置/install/postflight失敗可能被最後成功命令掩蓋；npm 11.9.0拒絕user/global config同指向`/dev/null`。已合併為單一`set -euo pipefail` block，temp HOME內建立兩個不同0600空npmrc，final clean-state為最後一項gate。
- 2026-07-23 第三輪local-only focused SPEC與QUALITY/SECURITY/EXECUTABILITY reviewers雙PASS，blocking 0（anchor `43975818`）；`bash -n`、fail injection/trap、npm 11 distinct config、linked-worktree cache、SHA/sentinel/TypeScript/fixed Supabase gates皆重驗通過。
- 2026-07-23 第一次exact A1 `npm ci` runtime完成661 packages後仍exit 1：package/package-lock未變、sentinel absent、TypeScript與Supabase PASS，唯一drift為npm 11 Arborist重寫`yarn.lock` 205 additions/12 deletions（diff SHA-256 `4e12b9d08811e8a1308ad025ac795650d95b52e0ff45749472f2170dcdcf23d1`）。npm source證實會load/save既有Yarn lock；已restore original SHA `b05a422f35e6d76e4e8b8a6f24ca712373bd513c43317482a607c1bf9039814e`，worktree clean，A1仍未PASS。
- 2026-07-23 v4 focused review雙FAIL/HOLD：`test A && test B`受Bash errexit例外可讓unexpected Yarn regular file被覆寫後假綠；cleanup restore失敗仍刪temp HOME會遺失唯一backup。v5拆分simple tests，使用`mv -fT`，且backup仍存在時保留temp HOME並非0退出。Scratch probes：normal failure、unexpected regular皆rc1且original restored；unexpected directory rc1且backup preserved。
- 2026-07-23 v5 focused SPEC PASS、QUALITY/SECURITY/EXECUTABILITY FAIL/HOLD：另有executable/mode/npmrc `&&` lists可受errexit例外假綠，且`test -z "$(git status ...)"`可吞git command failure。v6將A1所有`&&`清零，各gate獨立simple command；git status先以assignment capture（保留command exit）再驗空。
- 2026-07-23 v6 fresh focused SPEC與QUALITY/SECURITY/EXECUTABILITY reviewers雙PASS，blocking 0（anchor `ff3cec9b`）。Adversarial injections涵蓋executable/npmrc symlink、writable mode、git status fail/dirty、npm exit 42、Yarn regular/symlink/directory及restore failure，全部nonzero且無資料遺失；`bash -n`／diff check／clean PASS。
- 2026-07-23 exact reviewed A1 runtime在tracked process `proc_61f1911da71b` exit 0：Node `22.23.1`、npm `11.9.0`、`npm ci`完成661 packages；package-lock SHA `dccba04bc6aacc67936f437c79f2b18a30b285b2cc898acffcf15566a4142cbf`、Yarn SHA `b05a422f35e6d76e4e8b8a6f24ca712373bd513c43317482a607c1bf9039814e`、Supabase `2.87.2`，final status clean。A1 PASS。
- 2026-07-23 A2 exact Node22 auth/flag/impersonation baseline四檔exit 0：`# tests 38`、pass 38、fail 0、skipped 0、duration 1612.64ms。
- 2026-07-23 A3 staged evidence verifier完成strict TDD與多輪adversarial remediation；final HEAD `14901eac133c2a0c0d76f5f4e3c6b6d31b9b0f5e`。Final Node22 focused suite `36/36 PASS`、frozen targeted child＋`tsc --noEmit` exit 0、`--check-only` PASS；evidence tree `8409b5c735b4adefa73e91f9f833bb4725878f97`、linked-worktree manifest mode `0600`、secret read-back PASS。
- A3 final contracts涵蓋exact ordinary targeted/`--typecheck`/`--all` semantics、truthful npm-test coverage、三個bounded heavy prefixes、tree/path/status/blob與docs metadata snapshots、exact schema、0600、Node22、spawn error/signal、no child-output replay、credential/ambient-secret rejection。`npm test` coverage只承認shell實際選取的非hidden `apps/web/tests/<一層>/*.test.mjs`；root/deep/E2E/hidden tests需targeted或heavy entry補齊union。
- A3 final fresh SPEC/AC與QUALITY/SECURITY/EXECUTABILITY reviewers皆PASS，綁定同一HEAD `14901eac`，blocking 0；frozen `.claude/hooks/run-checks.sh`未修改。

## 下一步
- 執行A4 strict TDD：建立三模式secret-safe CI command evidence runner；先取得runner missing／contract RED，再minimal GREEN、exact staged evidence與commit。
- A4完成後同樣依序fresh SPEC與QUALITY/SECURITY review；雙PASS前不進Phase B migrations。

## 絕不重做（Do-NOT-redo）
- 不重跑或重審完整plan：`bcb81b11`已取得fresh spec＋quality/security雙PASS；本次只聚焦A1 install command correction。
- 不沿用首次`npm install`後再restore lock假裝deterministic；必須由`npm ci`重新建立。
- 不執行`npm audit fix`，避免未review dependency/lock drift。
- 不修改frozen middleware、legacy orders/payments、既有migrations、protected E2E、`CLAUDE.md`或`.claude/**`。
- 未經對應gate不做production SQL/migration apply、deploy、guide mode switch、真付款或LINE通知。

## P0-OVERRIDE 使用紀錄（如有）
- 無。
