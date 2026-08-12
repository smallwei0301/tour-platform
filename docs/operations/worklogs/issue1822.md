# Issue 1822 Worklog — tp-node22 runtime contract host-bound 分區

## 範圍

- 工作樹：`/root/.openclaw/workspace/worktrees/tour-platform/pr1822-rebase-20260812`
- 分支：`fix/tp-node22-toolchain-standardization-integration-20260812`
- 單一目標：將實際執行 canonical host toolchain 的兩個 runtime contracts 拆為 host-bound infrastructure test；ordinary CI 保留 portable source/settings contracts。
- 允許檔案：依 Kanban `t_22ff58cd` 指定的六個路徑。
- 禁止範圍：不修改 toolchain/provision、`.claude/hooks/run-checks.sh`、GitHub workflow、package manifests/lockfile、production code、migrations、secrets；不 push、merge 或進行 GitHub 公開操作。

## 基線與 RED

- 基線 commit：`e41009f729d3910e45ec719448b2b90ef62c40dc`
- 實作前 HEAD：`496c0413781e477abc163b148d01678233a4af69`
- RED command：
  ```bash
  node --input-type=module -e "import('./scripts/testing/run-ordinary-web-tests.mjs').then((r) => { const p='tests/unit/tp-node22-evidence-runner-contract.test.mjs'; if (!r.listOrdinaryTests().includes(p) || r.HOST_BOUND_INFRASTRUCTURE_TESTS.includes(p)) process.exit(0); console.error('RED: runtime contract is still ordinary'); process.exit(1); })"
  ```
- RED result：exit 1，輸出 `RED: runtime contract is still ordinary`。

## GREEN 與交接

- focused portable command：`node --test apps/web/tests/unit/midao-ordinary-suite-boundary.test.mjs apps/web/tests/unit/tp-node22-evidence-runner-contract.test.mjs` → exit 0，7 pass / 0 fail。
- formal runtime command：`.claude/hooks/run-checks.sh apps/web/tests/unit/tp-node22-evidence-runner-runtime-contract.test.mjs` → exit 0，2 pass / 0 fail；fresh evidence 已寫入 `.claude/state/last-checks.json`。
- partition probe：確認 runtime file 不在 ordinary / portable infrastructure、同時在 `INFRASTRUCTURE_TESTS` 與 `HOST_BOUND_INFRASTRUCTURE_TESTS`，且 full infrastructure 恰含一次 → `HOST_BOUND_PARTITION_OK`。
- `git diff --check`：exit 0。
- commit：最終 SHA 記錄於本卡的 post-commit Kanban handoff（commit object 建立後才可確定）。
- GitHub Actions Web tests：待後續受權 push 產生新 head 後驗證；本卡不以本機 host toolchain 結果取代 hosted CI。
- Rita gate：本地 commit 與 clean worktree 後，建立 immutable `git-commits` fresh review；Rita 獨立驗證分區、assertions、manifest 與證據。
