# issue1674 — rls-grants-preflight helper RPC migration 與 HOLD 分類
> 最後更新：2026-07-09 10:56 CST｜負責 session：Anna / gpt-5.4（task 建議 B 類 gpt-5.3-codex，本次 runtime 非建議 lane）

## 目標
補上 versioned helper RPC migration/rollback，將 helper 缺失前置條件改為可稽核 HOLD，並以 focused tests 鎖住 PASS/FAIL/HOLD 行為與 migration 安全契約。

## AC 清單
- [x] RED：先證明目前 helper 缺失仍落入 unknown，未達 deterministic HOLD。
- [x] GREEN：最小變更後 focused tests 綠燈。
- [x] 新增 canonical migration + rollback，helper RPC 為 read-only SECURITY DEFINER、固定 search_path、EXECUTE 僅限 service_role。
- [x] artifact schema 明確暴露 pass / fail / hold，不留 helper-missing steady-state unknown。
- [x] docs/runbook 改指向 versioned migration；未對 live Supabase 執行 DDL。

## 已完成（附證據）
- 2026-07-09 10:10 CST 建立 worklog，確認 task/worktree：`t_db700dcd` / `kanban/issue-1674-rls-grants-preflight-helper-rpcs`。
- 2026-07-09 10:13 CST 依 `CLAUDE.md` 跑 `npm install --ignore-scripts` 補本 worktree 依賴；之後已 `git checkout -- package-lock.json yarn.lock` 清掉 install 噪音。
- 2026-07-09 10:20 CST RED：新增 `apps/web/tests/security/issue1674-rls-grants-preflight-hold.test.mjs` 後，`node --test apps/web/tests/security/issue1674-rls-grants-preflight-hold.test.mjs` 失敗 3/3，直接證明目前 script 尚未 export `classifyCheckFailure` / `summarizeResults`，也沒有 deterministic HOLD 分類。
- 2026-07-09 10:28 CST GREEN 實作：
  - `scripts/security/rls-grants-preflight.mjs` 新增 `classifyCheckFailure()` / `summarizeResults()`，把 helper-missing 與 scan RPC prerequisite 由 `unknown` 改成 `hold`，附 `reason_code` / `action_code` / `action`；真正 runtime shape 錯誤仍標 `fail`。
  - 新增 `supabase/migrations/20260709103000_rls_grants_preflight_helper_rpcs.sql` 與 rollback，定義兩支 read-only SECURITY DEFINER helper RPC，固定 `search_path`，輸入僅允許 public ordinary table，EXECUTE 只給 `service_role`。
  - `docs/operations/security/rls-grants-preflight-runbook.md` 將 UNKNOWN 改為 HOLD，並改指向 versioned migrations（`20260707081500` + `20260709103000`），移除 inline SQL 指引。
- 2026-07-09 10:33 CST Focused tests：
  - `node --test apps/web/tests/security/issue1674-rls-grants-preflight-hold.test.mjs apps/web/tests/security/rls-preflight-scan-all.test.mjs apps/web/tests/api/issue602-rls-grants-preflight-contract.test.mjs` → 25 pass / 0 fail。
- 2026-07-09 10:44 CST Node 22 證據鏈修正：初版 wrapper 以 `npx -y node@22` 轉接，會讓 `process.execPath` 指向 wrapper 本身，導致 `issue602` 內 `spawnSync(process.execPath, ...)` 遞迴卡住；改成固定指向實體 binary `/root/.hermes/profiles/tp-builder-api/home/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node` 後恢復正常。
- 2026-07-09 10:45 CST Commit evidence：`PATH=/tmp/tp-node22-wrapper:$PATH .claude/hooks/run-checks.sh apps/web/tests/security/issue1674-rls-grants-preflight-hold.test.mjs apps/web/tests/security/rls-preflight-scan-all.test.mjs apps/web/tests/api/issue602-rls-grants-preflight-contract.test.mjs` → `# tests 25`, `# pass 25`, `# fail 0`，且 `.claude/state/last-checks.json` 已更新。
- 2026-07-09 10:45 CST hygiene：`git diff --check` exit 0。
- 2026-07-09 10:56 CST finalize：僅 stage in-scope 六檔後建立 commit `0c8e628d`（`fix(security): finalize rls preflight helper rpc hold flow`），目前 branch `kanban/issue-1674-rls-grants-preflight-helper-rpcs` 已形成可 review boundary。
- 2026-07-09 11:03 CST review-fix RED：在 `apps/web/tests/security/issue1674-rls-grants-preflight-hold.test.mjs` 新增 workflow source-contract 後，`node --test apps/web/tests/security/issue1674-rls-grants-preflight-hold.test.mjs` 失敗 1/5；失敗訊息直接指出 `.github/workflows/rls-grants-preflight.yml` 仍用 `d.overall_status || d.status || 'unknown'`，未讀取 `d.summary?.overall_status`。
- 2026-07-09 11:04 CST review-fix GREEN：`.github/workflows/rls-grants-preflight.yml` 改為 `d.summary?.overall_status || d.overall_status || d.status || 'unknown'`，並保留 legacy fallback；同時計算樣本 `const d={summary:{overall_status:'hold'},results:[]}` 已輸出 `hold`，未把 HOLD 誤轉 PASS。
- 2026-07-09 11:05 CST review-fix checks：`PATH=/tmp/tp-node22-wrapper:$PATH .claude/hooks/run-checks.sh apps/web/tests/security/issue1674-rls-grants-preflight-hold.test.mjs apps/web/tests/security/rls-preflight-scan-all.test.mjs apps/web/tests/api/issue602-rls-grants-preflight-contract.test.mjs` → `# tests 26`, `# pass 26`, `# fail 0`；`git diff --check` exit 0。

## 下一步
- 交給 `tp-reviewer` 做獨立 code/security review，特別看 helper RPC SQL 權限、HOLD/FAIL 邊界、runbook 說明與 reviewer 是否接受保留 exit code 1 的 HOLD CLI 行為。

## 絕不重做（Do-NOT-redo）
- 不對 live Supabase 執行任何 DDL/RPC 建立；本卡只產出 repo 內 versioned migration/rollback 與測試。
- 不把 helper/prerequisite 缺失再落回 `unknown`；steady-state schema 只能是 `pass` / `fail` / `hold`。
- 不保留 install 產生的 `package-lock.json` / `yarn.lock` 噪音；已回復。

## P0-OVERRIDE 使用紀錄（如有）
- 無
