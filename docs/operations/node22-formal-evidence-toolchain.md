# Node 22.23.1 正式測試證據工具鏈

## 目的

Tour Platform 的正式測試證據固定經由 `scripts/toolchain/tp-node22.sh` 執行，並使用 `/root/.hermes/toolchains/node/22.23.1/bin/node`、`npm`、`npx` 的實體檔案。此入口不是 Node binary wrapper；它只在 shell 中完成 fail-closed preflight，然後以該工具鏈在 `PATH` 最前方的環境 `exec` 真正的 `node`、`npm` 或 `npx`。

禁止使用 `npx -y node@22`、`exec -a`、`/tmp` PATH shim 或任何會改寫 `process.execPath` 的方式。`process.execPath` 必須是 `/root/.hermes/toolchains/node/22.23.1/bin/node`。

## Operator provision

僅 Ava/Amy 已明確授權時，operator 可執行：

```bash
scripts/toolchain/provision-node22.23.1.sh --operator-approved
```

腳本只從 Node 官方 HTTPS tarball 下載 `node-v22.23.1-linux-x64.tar.xz`，以內建 SHA-256 驗證，於 `/root/.hermes/toolchains/node` 同一 filesystem 的暫存目錄解壓，驗證 `bin/node`、`bin/npm`、`bin/npx` 與 npm payload 後才原子切換。舊 artifact 會保留為 timestamped sibling backup。若新 artifact 的自檢失敗，腳本會原子還原 backup，並保留 failed artifact 供診斷。

此流程不變更 `/usr/local/bin/node`、登入 PATH、nvm 或 CI workflow。

## Builder 與 reviewer 日常指令

正式 focused evidence 必須使用：

```bash
.claude/hooks/run-checks.sh apps/web/tests/api/<focused>.test.mjs
```

`run-checks.sh` 會先呼叫 `scripts/toolchain/tp-node22.sh --check`，targeted test 固定使用 `--test-reporter=tap`，並把完整命令與結果寫至 `.claude/state/last-checks.json`。

允許直接做只讀 preflight：

```bash
scripts/toolchain/tp-node22.sh --check
scripts/toolchain/tp-node22.sh -- node --version
scripts/toolchain/tp-node22.sh -- node -p 'process.execPath'
scripts/toolchain/tp-node22.sh -- npm --version
scripts/toolchain/tp-node22.sh -- npx --version
```

`npm` 與 `npx` 採完整命令 shape 的 fail-closed allowlist：僅允許 `npm --version`、`npm test`、`npm run typecheck` 與 `npx --version`，且不得追加其他參數。其餘 `npm`／`npx` 呼叫一律在 `exec` 前拒絕；這包括 `npx -y node@22 ...`、`npx --yes node@22 ...`、`npm exec --package=node@22 node ...` 與以分離 `--package node@22` 表示的等價形式。此限制防止 registry 套件下載或執行替代的 Node runtime。

請勿直接以 host `node`、`npm` 或 `npx` 產生正式證據。`.claude/settings.json` 只允許這個固定入口與 `run-checks.sh` 作為 Agent 的正式測試通道。

## Rollback 與授權界線

Repo rollback 僅 revert 本工具鏈卡片的六個受管檔案。外部 artifact 僅在 provision self-check 失敗時，由 provision script 還原 timestamped backup。不得以 system Node、CI workflow 或 `/tmp` fallback 維持綠燈；任何這類替代方案、或重新 provision，均需要 Ava/Amy 的明確決定。
