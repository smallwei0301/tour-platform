# issue1808 — 修正 Midao expected-terminal baseline 漂移
> 最後更新：2026-08-10 09:43（Asia/Taipei）｜負責 session：Codex／2026-08-10

## 目標
讓 baseline-backed fresh／existing Postgres lanes 精確重放 cutoff 後的 23 支 forward migrations，並讓 expected-terminal catalog 包含 `public.activities.inquiry_enabled` 與其後所有已驗證 schema 變更。

## AC 清單
- [x] AC1 `manifest.json` 與 verifier 精確列出 synthetic marker + 23 支 post-cutoff forward migrations，terminal version 為 `20260806120000`。
- [x] AC2 expected-terminal catalog 已由乾淨 PG17 fresh runner 重建，`public.activities.inquiry_enabled` 為 `boolean NOT NULL DEFAULT false`，四個 artifact 的 digest／transaction binding 一致。
- [x] AC3 cutoff baseline、capture artifacts、frozen migration manifest 與 128 支 frozen migrations 保持 immutable。
- [x] AC4 加入 source inventory ↔ published manifest 的 exact freshness regression，並讓 baseline workflow 監看 `supabase/migrations/**`。
- [ ] AC5 在包含新四個 artifact 的公開 PR 上完成 fresh、existing、PostgREST、booking browser 與 final-gate CI。

## 已完成（附證據）
- 2026-08-10 鎖定根因：repo 有 23 支 cutoff 後 forward migrations，但 published manifest 只釘住前 9 支；source gate 將後 14 支視為 future migrations 而錯誤放行。
- 2026-08-10 先建立 freshness regression；舊 artifact 的 focused RED 為 1 failure／3 pass，差異精確列出缺少的 14 支 migration。
- 2026-08-10 擴充 post-cutoff inventory、runner contracts、fresh／existing history expectations 與 CI path filter（local commit `bf3d63f2`）。
- 2026-08-10 GitHub Actions run [31346576026](https://github.com/smallwei0301/tour-platform/actions/runs/31346576026) 使用 Node 22.23.1、Supabase CLI 2.87.2、PG17 連續兩次產出相同 artifact；run 僅在預期的「generated files 尚未 committed」diff gate 失敗。
- 2026-08-10 驗證並套用該 run 的四個 canonical artifacts；catalog SHA-256 `53f339d7cae37bc70ccb23ce2dd1885d2d155a53cbc5aba9e4a39fe0ce699be7`，transaction id `0d9a262bf8c8dc5f2641365999a920ef020896560b3555d26ed9e83ddba56d7a`（local commit `71bc1dcc`）。
- 2026-08-10 repository `run-checks.sh` targeted gate 101/101 tests 通過（exit 0）；source gate 回報 frozen=128、post-cutoff=23，transaction verifier 回報 history=24。
- 2026-08-10 本機 Node 24 typecheck 在未異動的 `apps/web/instrumentation-client.ts:31` 因 Sentry `replayIntegration` 型別失敗；ordinary full suite 5,507 tests 為 5,499 pass／5 fail／3 skip，五個失敗皆位於未異動的 guide-session crypto 與 GH-927 availability tests。這兩項不是 #1808 綠燈證據，保留給 Node 22 CI 判定。
- 2026-08-10 fresh standards review 找到 acceptance test 先讀未驗證 payload 的 P1；已改為先驗 capture／expected transactions、只讀 verified capability，並在 `finally` dispose。修後單檔 4/4、完整 targeted gate 101/101，隔離 reviewer ACCEPT。
- 2026-08-10 已開 draft PR [#1809](https://github.com/smallwei0301/tour-platform/pull/1809)；遠端目前只有 source checkpoint，尚未包含約 3.3 MB generated catalog。

## 下一步
- HOLD：取得使用者明確授權後，才把只含 schema／ACL／routine／ownership metadata（無 business rows、PII、secrets）的 generated expected-terminal catalog 發佈到公開 PR #1809。
- 發佈後等待並驗收 full baseline CI；若全綠，完成 fresh-context review、將 PR 轉 ready 並更新 issue #1808。

## 絕不重做（Do-NOT-redo）
- 不 recapture 或修改 `baseline.sql`、`managed-overlays.sql`、cutoff catalog、capture manifest、baseline ledger、frozen migration manifest；它們是 immutable cutoff truth。
- 不把 rollback companion migrations 放進 fresh history；fresh history 僅含 synthetic marker + 23 支 forward migrations。
- 不手工拼 catalog；四個 expected-terminal artifacts 必須由 pinned hosted runner 重建並以 digest／transaction 驗證。
- 不把 source gate 改成禁止 future migrations；由 exact artifact freshness regression 負責偵測未 refresh 的新 migration。

## P0-OVERRIDE 使用紀錄（如有）
- 無。
