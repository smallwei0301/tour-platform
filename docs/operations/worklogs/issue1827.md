# issue1827 — /midao/me 原生能力中心視覺外殼（C-only）
> 最後更新：2026-08-12 23:22 CST｜負責 session：tp-builder-ui/2026-08-12

## 目標
- 為 canonical `/midao/me` 建立 C-only、無互動的原生靜態能力中心視覺外殼。

## AC 清單
- [x] 僅異動核准的五個檔案。
- [x] 靜態外殼含「我的祕島」、「我的頁面」、「能力中心」與最多三張資訊卡；每卡皆可見「即將推出」。
- [x] 資訊卡沒有可操作控制項，且頁面與外殼沒有核准禁止的來源字串。
- [x] 指定 GREEN、run-checks 與 diff-check 均已通過；獨立 Rita review 為下一步。

## 已完成（附證據）
- 2026-08-12 RED：`NODE_ENV=test node --test --test-concurrency=1 tests/ui/midao-layout-wiring.test.mjs` exit 1；新增 source contract 因 `MidaoMeShell.tsx` 尚不存在而失敗，符合先測後做的預期。
- 2026-08-12 GREEN：`NODE_ENV=test node --test --test-concurrency=1 tests/ui/midao-layout-wiring.test.mjs tests/ui/midao-shell-composition.test.mjs tests/ui/midao-bottom-nav-contract.test.mjs tests/ui/midao-desktop-navigation-contract.test.mjs` exit 0（11/11）。
- 2026-08-12 run-checks：`./.claude/hooks/run-checks.sh` 搭配同一組四個指定測試檔 exit 0（11/11）。
- 2026-08-12 `git diff --check` exit 0；限定五檔本機提交與 Issue milestone readback 均已完成。

## 下一步
- 交由新的 Rita review 檢視本次限定五檔提交。

## 絕不重做（Do-NOT-redo）
- 舊 `t_523ecaa5` 因 allowlist 與必要 worklog 規則矛盾而停止，禁止重試或沿用。
- PR #1763 僅為視覺參考，不得作為實作來源或基底。

## P0-OVERRIDE 使用紀錄（如有）
- 無
