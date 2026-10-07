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

`npm` 與 `npx` 採完整命令 shape 的 fail-closed allowlist：允許 `npm --version`、`npm test`、`npm run typecheck`、限定 `npm run lint`／`npm run build` 與 `npx --version`，且不得追加其他參數。其餘 `npm`／`npx` 呼叫一律在 `exec` 前拒絕；這包括 `npx -y node@22 ...`、`npx --yes node@22 ...`、`npm exec --package=node@22 node ...` 與以分離 `--package node@22` 表示的等價形式。此限制防止 registry 套件下載或執行替代的 Node runtime。

請勿直接以 host `node`、`npm` 或 `npx` 產生正式證據。`.claude/settings.json` 只允許這個固定入口與 `run-checks.sh` 作為 Agent 的正式測試通道。

## Runtime contract 分區

`apps/web/tests/unit/tp-node22-evidence-runner-runtime-contract.test.mjs` 會實際執行 canonical host toolchain，僅能在具備 canonical root 的本機／agent formal-evidence lane 執行：

```bash
.claude/hooks/run-checks.sh apps/web/tests/unit/tp-node22-evidence-runner-runtime-contract.test.mjs
```

它屬於 host-bound infrastructure test；ordinary CI 與 portable infrastructure lane 均不執行它。不得為 GitHub Actions 加入 fallback 或模擬 `/root/.hermes/toolchains/node/22.23.1`；ordinary CI 保留可攜的 source/settings contracts。

## Rollback 與授權界線

Repo rollback 僅 revert 本工具鏈卡片的六個受管檔案。外部 artifact 僅在 provision self-check 失敗時，由 provision script 還原 timestamped backup。不得以 system Node、CI workflow 或 `/tmp` fallback 維持綠燈；任何這類替代方案、或重新 provision，均需要 Ava/Amy 的明確決定。

## #1882 canonical E2E shapes（固定兩個 spec）

Owner 已批准下列精確七 argv；不得追加參數、換 workspace/spec 或以 node npm-cli 代替：

```bash
scripts/toolchain/tp-node22.sh -- npm run test:e2e -w @tour/web -- e2e/issue1882-upcoming-schedules.spec.ts
scripts/toolchain/tp-node22.sh --preflight-e2e -- npm run test:e2e -w @tour/web -- e2e/issue1882-upcoming-schedules.spec.ts
```

第二行只讀預檢共用第一行全部官方 artifact、runtime 與 E2E 驗證，會執行原 canonical Node/npm/npx 版本與 execPath 自檢，並以實際 E2E child env 做唯讀 npm --version/config startup；不執行 requested E2E、Playwright 或 browser。
執行須位於 canonical repo root；spec/config/package 不准 symlink，e2e 目錄必須 canonical。
spec SHA-256 固定 `fe504f49691b742148c541bd840de4bd3ae7b591ed5c39680d8a7ee8c1ff71d7`；
config 固定 `5ed491b3fb5575672a98ac4e20d9cc235a8883e9f1c11cc33bc03157b3e9eba5`。
reviewed config 的 testDir 是 e2e、唯一 Chromium project，PLAYWRIGHT_NO_WEBSERVER 停用 webServer；
reviewed spec 自管 localhost:3108 server、GET/HEAD/network/mock/mutation guard，不執行 Production。
任何 bytes 更新都必須重新 review，不接受 caller digest override 或自動刷新 expected。

JSON package contract 要求 tour-platform、apps/* workspace、@tour/web 與精確 playwright test script；
root/app pre/posttest:e2e（含裸 pre/post）lifecycle 及 root/apps/app .npmrc 一律拒絕。
child 經 env -i，只保留 canonical Node:/usr/bin:/bin PATH、固定本機 /usr/bin/chromium、
停用 webServer/download/telemetry、npm offline/noaudit/nofund/no提示/ignore-scripts、
owned 暫存目錄內兩個不同的空白 user/global .npmrc、固定 /bin/sh 與 owned npm cache；
預檢與正式執行共用相同配置與唯讀 npm startup 檢查，結束後清理整個 owned 暫存目錄。
不使用同一 /dev/null 作兩種 config（npm 會拒絕雙載入），不寫 HOME、系統或本機帳戶設定。
caller CI、NODE_OPTIONS、npm_config、自訂 shell、DB/Supabase/MIDAO credentials 均不傳入。
Chromium 必須現存、可執行且 realpath 等於 /usr/bin/chromium，不下載安裝。
父 session 的環境不變。舊 node/npm/npx shapes 與 host-bound/ordinary 分區維持原規則。

正式入口的 shebang 固定為 `/bin/bash -p`：kernel 直接選可信的絕對 interpreter，
不由 caller PATH 尋找 bash。Bash 的 `-p` 在第一個 script command 前忽略 BASH_ENV/ENV、
輸入的 shell functions、SHELLOPTS/BASHOPTS/CDPATH/GLOBIGNORE；不是事後 unset。
此選項不提高 uid/gid 或授予額外 filesystem/network 權限；仍受原執行身分與 sandbox 限制。
此邊界適用文件中的直接執行入口；caller 另行用自訂 interpreter 解讀 script 不能當正式證據。
owned/tmp marker runtime regression 實際注入 BASH_ENV 與 PATH 假 bash，要求預檢成功且兩 marker 都未建立。
child 的 env-i、官方 artifact gates 與 exact argv/SHA 檢查仍維持不變。

## 2026-10-04 已批准限定驗證增量

Owner批准只擴充本canonical入口，不修改 `run-midao-ci-command.mjs` 的 clean-tree gate；不能以此替代正式CI／merge／release evidence。

```bash
scripts/toolchain/tp-node22.sh --preflight-ci -- npm run lint
scripts/toolchain/tp-node22.sh --preflight-ci -- npm run build
scripts/toolchain/tp-node22.sh -- npm run lint
scripts/toolchain/tp-node22.sh -- npm run build
scripts/toolchain/tp-node22.sh --preflight-e2e -- npm run test:e2e -w @tour/web -- e2e/issue1882-policy-display.spec.ts
scripts/toolchain/tp-node22.sh -- npm run test:e2e -w @tour/web -- e2e/issue1882-policy-display.spec.ts
```

lint/build只准三argv，repo root cwd、canonical package/guard檔、精確root/app scripts、所有相關pre/post lifecycle拒絕、三層npmrc拒絕；不能加workspace、flags、替代shell或runtime。自檢先env-i，child只有fixed PATH、owned HOME/TMPDIR/cache/config、offline npm與pinned preload；cleanup失敗為FAIL。原ordinary/typecheck shapes不變。

`offline-node-guard.cjs` deny TCP/TLS/fetch/DNS/UDP，Node spawn/exec/fork及Worker保留preload，即使child提供env={}或Worker execArgv=[]。這是已審本機Node tooling safeguard，不是OS/native網路隔離證明，也不授權外連、憑證或DB。原執行環境限制仍適用；npm offline不是整個build的網路隔離。guard與lint版本guard SHA固定於runner，不能caller override。產品fonts與startup guard不修改；真build失敗保留，不mock字型或注入憑證強制綠燈。

新policy spec測三AC，使用owned temp真app副本，只在既有in-memory fixture data加入A0/B7/null（exactslug與plan數/IDs drift assertions），所有產品component/handler來自source原件。原source與舊spec/config bytes不改，copy略過.env、node_modules、.next與測試產物。GET booking僅route.fulfill安全文件；真booking mutation或DB永遠不執行。對真產品CTA href做document navigation並browserBack，復原或重設identity均驗confirmation一致。精確公開GET APIs/analytics/image mocks不continue外連；unknown API/nonlocal/mutation仍abort且blocked必為空。server原loopback preload、child exit/close observer與owned cleanup保留。

新spec與既有 `scripts/testing/fixture-child-diagnostics.mjs` 均pinned；舊spec/config既有digest不變。pin只綁定列出的reviewed檔，不能宣稱所有transitive產品dependency被hash封印。新specdigest：99fba043ec8c1eeed0177e2019157517cb76a0b416bb52874b93dd834b8ec806；helperdigest：e586c4349c72703fbc15df9455012fcd75677f07ffc42d252a29972dbce89b52。

本次browser執行仍FAIL：兩輪3/3均在finally blocked=[]失敗；第二輪只剩dev POST `/__nextjs_original-stack-frames`（被guard abort），不是booking mutation成功。第二輪AC段沒有primary-AC-error附件，但整體三AC不能標PASS；停止第三次重試，留待fresh獨立review提出有證據的窄修。NativeClaudeEdit hook wiring仍NOT_VERIFIED，手動guard不能替代。

Fresh reviewer R1窄修（2026-10-04）：兩輪原FAIL全保留；新 `policy-fixture-network.mjs` 僅分類精確loopback、無query/hash的POST original-stack-frames為expected aborted devdiagnostic。依舊abort所有POST，booking／unknown／remote同path／queryvariant不豁免；console僅同一已abort diagnostic失敗資源可分類，pageErrors仍必為空。新classifier為pinned spec dependency，byte/symlink tamper拒絕，behavior negatives驗證狹窄邊界。不是盲目第三retry；必先由原fresh reviewer回讀修正exactdiff，才能再執行browser。

## 2026-10-07 #1887：current-main 字型 prebuild 契約對齊

以 `main=d12b9a9c7004319d6c4b3e53d161532cbeb4049a` 的既有 build script 為唯一允許值：
`node ../../scripts/build/prepare-next-google-font-compat.mjs && next build`。
舊 `next build`、換 helper、`;`／`||` fallback、額外 command／flags、env prefix 與空白變體均拒絕；
root workspace proxy、lint script、lifecycle、npmrc、精確 argv、官方 Node artifact 與 offline guard 檢查維持不變。

lint/build 共用 preflight 另外要求 `scripts/build/prepare-next-google-font-compat.mjs` 是 repo 內 canonical 實體檔，
SHA-256 固定 `866f34c9f210e88e15003db71fa0753eff7c0939dee800d734a3cfe8c78d6812`。
helper 缺失、bytes drift、檔案或父目錄 symlink 均 fail closed；不提供 caller digest override。
本次不修改 helper、產品字型、Next vendor source、startup/security guard 或 E2E spec/config pins。

host-bound runtime fixture 複製真 helper，並從已安裝的 Next 複製 `package.json`、真 fontkit 與真 Google-font loader
到 owned temp package。只在該副本執行真 helper，先核對原 loader digest，再驗證首次 patched、第二次 already-patched；
來源 vendor bytes 必須前後一致。原 next executable probe 保留 network、secret、empty-env child、empty-execArgv worker 與 cleanup assertions，
且明確檢查真 helper 已先完成 patch 與 next 收到唯一 `build` argv。
另以缺 package/fontkit/loader、version drift、parser/loader digest drift 驗證 helper 失敗時 next probe 不會執行。

fixture 的真 helper＋instrumented next probe 只驗證 runner sequencing 與 safeguard，不能當實際 Next build、browser、DB 或 merge 驗收。
只讀 preflight 不執行 vendor helper，也不驗 vendor 安裝狀態；正式 build 才執行其原 version/digest gates。
歷史 local build／browser FAIL、未驗證的 mounted race／unmount／StrictMode／mobile，以及原 CI／ownership／release gates 仍保留。
