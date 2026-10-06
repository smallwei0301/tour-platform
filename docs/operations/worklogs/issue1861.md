# Issue #1861 worklog

## 2026-08-24 P2-C Builder — in progress

- Worktree: `/root/.hermes/worktrees/tour-platform/issue-1861-p2c-claim-schema-rls-acl`
- Branch: `builder/issue-1861-p2c-claim-schema-rls-acl`
- Base: `d8f4edf5ccbfb97ba7a92c695dd28b19e9a11039`; inherited reviewed P1 head: `c77cc58f3b20aa9ee6609f175210fec09e32ec63`.
- Migration collision scans before authoring and immediately before local-harness attempt found no Issue #1861/claim/mapping filename or ledger collision. The live open-PR scan returned one migration-touching PR (#1372), limited to `20260611_issue1365_payout_items_order_unique.sql`.
- Selected additive migration prefix: `20260824135300` (Asia/Taipei local time at scan: `20260824135214`).
- Implemented candidate scope: dedicated exact-32-byte base64url pepper validation; isolated HMAC claim token handling; production env admission; request+claim issuance RPC; bridge RPC with forced RLS, service-role-only grants, idempotency, mapping uniqueness, and generic unavailable result; public issuer and authenticated bridge route.
- RED evidence: claim helper export test failed with `createMidaoRequestClaimToken` absent; environment admission test failed because invalid peppers were accepted; migration contract test failed because migration was absent.
- GREEN evidence: Node 22 focused test command passed 17/17 for claim helper/env/migration/P1 adapter; `git diff --check` passed.
- Disposable local Supabase harness attempt: `timeout 600s node scripts/testing/with-midao-local-supabase.mjs apps/web/tests/integration/midao-foundation-schema-postgres.test.mjs` reached `MIDAO_STAGE=ready`, then exited 1 with `[REDACTED_ERROR]`; cleanup stages executed. No Production, GitHub, deployment, or credential mutation occurred.

## Blocked follow-up

The current harness redacts the actionable failure. Do not claim DB/RLS/concurrency acceptance or commit/review until a local, non-Production diagnostic path identifies and resolves this failure, then a purpose-built `midao-request-claim*` integration test proves the required races, role ACLs, and rollback behavior.

## 2026-08-24 P2-C rollback regression — blocked

- Disposable DB RED: a revoked claim returned `{ status: 'unavailable' }` but left one `midao_idempotency_records` row in `processing` state (`1 !== 0`).
- Candidate migration now deletes its own just-created processing idempotency row on all subsequent unavailable branches (revoked/expired, foreign claimant, foreign mapping, and missing canonical traveler), leaving pre-existing replay records untouched.
- Required expected-terminal transaction was regenerated under the approved Node `v22.23.1`: transaction `712213b71bde2909be20bf9ae115f5650c62ac8358afbf39fa961ed4c02df7ad`, exit `0`.
- The immediately following exact disposable harness command returned exit `1` with only `[REDACTED_ERROR]` and no stages. Per the active failure rule, it was not retried; no commit/review was requested.
- Production/GitHub/credential mutations remain `0`.

## 2026-08-24 P2-C disposable evidence recovered

- Canary-local diagnostic identified a stale expected-terminal migration digest in `scripts/database-baseline/verify-manifest.mjs`; the authorized Issue #1861 entry now matches the candidate migration SHA-256 `dc7d8b4c55dbd944864b7067ba4b2ec2902c381be4c77674cfac9579268d63e1`.
- Repository-owned expected-terminal generation under Node `v22.23.1` completed with transaction `712213b71bde2909be20bf9ae115f5650c62ac8358afbf39fa961ed4c02df7ad` (`runs=2`, atomic publication successful).
- One authorized disposable loopback harness run completed with cleanup: `apps/web/tests/integration/midao-request-claim-postgres.test.mjs` passed 4/4 (same-user replay, concurrent one winner, revoked claim rollback, forced-RLS ACL probe).
- Focused Node 22 unit/API suite passed 28/28; `.claude/hooks/run-checks.sh` recorded fresh green evidence for the same six focused test files. Docker query found no task-labelled containers, networks, or volumes after cleanup.
- No Production SQL/data/metadata, GitHub, deployment, payment/LINE, or credential-value mutation occurred.

## 2026-08-24 Phase 3 Builder — canonical inquiry conversion adapter

- Worktree: `/root/.hermes/worktrees/tour-platform/issue-1861-phase3-midao2-guide-conversion`; branch: `builder/issue-1861-phase3-midao2-guide-conversion`.
- Candidate commit `4b1e6338ee07808c96b57251cd8994dbc25b3cb9` adds the read-only mapped canonical-inquiry projection, session-derived route envelope, `/midao2` reuse of the sole convert command, unit/API contracts, disposable PostgreSQL bridge evidence, and browser spec.
- Fresh verification: focused Node suite passed 41/41; disposable local PostgreSQL convergence passed 1/1; `git diff --check` passed before the final type narrowing fix.
- `run-checks.sh --typecheck` initially exposed `TS2339` on the Phase 3 catch value. The builder narrowed it with `error instanceof Error`; the same hook runner then passed focused 41/41 plus `tsc --noEmit`.
- Browser verification used only `scripts/testing/with-midao-local-supabase.mjs --playwright` and `/usr/bin/chromium`. It reached the real `/midao2/requests/[id]` compilation, but Next dev repeatedly timed out its local requests and Playwright reported a detached frame at `page.goto`; mark `NOT_AUTOMATABLE_LOCAL_WATCHERS` for the browser evidence. No plain dev server, production resource, credential, GitHub, payment, or LINE mutation was performed.

## 2026-08-24 Phase 3 Builder rework — canonical 409 reload

- Rita 發現 canonical convert route 回 `INQUIRY_ALREADY_CONVERTED`／409 時，`InquiryConversionSheet` 的「重新載入詳情」只呼叫 `router.refresh()`，不會重新執行 client-side request GET／`setCanonicalInquiry`，無法讀回 canonical `convertedBookingId`。
- 先新增 Playwright 409 → reload → 第二次 GET 的回歸情境，再將 request GET/state 更新抽為穩定、可 await 的 `load` callback；初始 effect、error retry 與 sheet `onReload` 共用它。第二次 canonical projection 回傳 converted booking 後，UI 顯示 `midao2-canonical-converted` 並移除轉單 action；spec 同時鎖定沒有 CRM `closed_won` 或直接 booking/order write。
- Fresh evidence: pinned Node `v22.23.1` focused suite 41/41 PASS; `npm run typecheck -w @tour/web` PASS; `.claude/hooks/run-checks.sh --typecheck` refreshed green 41/41; disposable local Supabase convergence passed 5/5 with `ready → complete → cleanup`; `git diff --check` PASS.
- Browser runner was not rerun because the card explicitly prohibits retrying the known local watcher/Chromium failure. Keep `NOT_AUTOMATABLE_LOCAL_WATCHERS` as residual risk; no production, GitHub, credential, payment, LINE, deployment, or other external mutation occurred.

## 2026-08-24 Phase 3 Builder rework — GitHub E2E smoke inclusion

- Rita identified that the existing `test:e2e:smoke` GitHub-hosted Chromium lane did not select `e2e/midao2-request-conversion.spec.ts`; local Chromium/watcher evidence remains unavailable by policy.
- RED evidence: pinned Node v22.23.1 parsed `apps/web/package.json` and failed because the exact Phase 3 spec was absent from `test:e2e:smoke`.
- Added only `e2e/midao2-request-conversion.spec.ts` to that smoke command; its four existing specs remain in their original order and no product writer/RPC/migration behavior changed.
- A remote execution still requires explicit Owner authorization for push/PR/workflow dispatch. Until then this browser AC is `HOLD_AWAITING_REMOTE_CI_AUTHORIZATION`; no GitHub, production, credential, deployment, payment, or LINE mutation was performed.

## 2026-08-24 Phase 3 Builder rework — E2E summary auth probe

- Remote GitHub `e2e-smoke` evidence for `e2f0ec2fe71b398dc22c2779812710952ca65b6c` found the canonical 409 reload test timed out on its first attempt and passed only on retry. The stable root cause was the unmocked `Midao2Layout` GET `/api/v2/guide/midao/summary`: its 401 branch redirects the page to `/guide/login?next=/midao2` before the request-detail test can interact with its mocked canonical routes.
- Updated only `apps/web/e2e/midao2-request-conversion.spec.ts`: a reusable `mockMidaoGuideSummary(page)` installs a successful safe-envelope route before `page.goto` in both tests. It avoids timeout/retry expansion and leaves the canonical conversion/CRM-write assertions unchanged.
- RED evidence is the authoritative remote first-attempt timeout plus a pre-change source check that found no summary route mock in this spec. GREEN local evidence: `NODE_ENV=test npx --no-install playwright test --list e2e/midao2-request-conversion.spec.ts` listed exactly two Chromium tests; `.claude/hooks/run-checks.sh --typecheck` passed 41/41 and `tsc --noEmit` under pinned Node 22.
- Browser execution was intentionally not repeated locally: the card prohibits rerunning the known unavailable Chromium/local watcher lane. A new GitHub-hosted E2E smoke run still needs explicit Owner authorization for the next exact commit; no push, PR, workflow dispatch, production, credential, deployment, payment, or LINE mutation occurred.

## 2026-08-24 PR #1865 CI baseline contract repair

- Dedicated non-primary worktree `/root/.hermes/worktrees/tour-platform/issue-1861-pr-ci-convergence` began clean at `7642f981fab108e43aa21cc928e62f81df63e219` on `builder/issue-1861-phase3-midao2-guide-conversion`.
- RED evidence: Node `v22.23.1` ran the two failing baseline contracts and produced the expected four failures: the verified release-gate missing list omitted `20260824135300_issue1861_midao_request_claims_bridge.sql`; the baseline materializer's exact manifest and copied source inventory omitted the same filename/digest.
- Minimal repair updates only those two tests: the release-gate remains `hold` and now explicitly lists the #1861 migration as missing; the materializer contract now pins its actual SHA-256 `dc7d8b4c55dbd944864b7067ba4b2ec2902c381be4c77674cfac9579268d63e1`. No migration, generated baseline/ledger, application, or Production state changed.
- GREEN evidence: `.claude/hooks/run-checks.sh --typecheck` passed 30/30 focused test cases across the two repaired baseline contracts plus Phase 3 API/projection/integration contracts, followed by `tsc --noEmit`; the local PostgreSQL convergence suite remained an explicit `# SKIP` because no disposable DB harness was invoked. `git diff --check` passed.
- The CI browser/e2e smoke receipt remains unchanged: GitHub-hosted Midao2 smoke is 11/11 PASS, retry=0/flaky=0. No GitHub, Production, credential, deployment, payment, or LINE mutation has occurred in this repair phase.

## 2026-08-25 PR #1865 CI convergence repair

- Dedicated non-primary worktree `/root/.hermes/worktrees/tour-platform/issue-1861-pr-ci-convergence`; starting HEAD `f64ec296e445d7af8acf5c0ece83ec0c9c8dfd31`.
- RED evidence: CI Web lane had nine stale Midao2/env/response-architecture assertions; baseline lane had six exact-history failures because `20260824135300_issue1861_midao_request_claims_bridge.sql` was absent from the test-side expected history. A focused baseline replay exposed the final stale `164` history count after adding the 35th suffix entry.
- Repair: moved the claim-pepper environment reader to `src/config/security-env.mjs`; both claim routes consume it. The authenticated bridge now uses `jsonOk`/`jsonError` and `handleRouteError`; public request behaviour is unchanged. Contract fixtures now pin the current two-state UI, claim issuance, production pepper, 35-migration suffix, and published expected-terminal transaction/manifest.
- GREEN evidence: full Web suite under Node `v22.23.1` passed `5,800/5,800` (0 failures); baseline targeted suite passed `22/22`; `.claude/hooks/run-checks.sh --typecheck` passed `57/57` plus `tsc --noEmit`, with fresh commit-gate evidence at `2026-08-25 00:23:10 CST`; `git diff --check` passed.
- Local Node-22 lint is `NOT_VERIFIED`: direct `npm run lint` ran host Node 24 and correctly failed its Node-version guard; the formal Node wrapper intentionally allowlists only test/typecheck, and a direct canonical npm invocation was blocked by the gateway command safety policy. This is a tooling capability constraint, not a source lint result.
- No Production SQL/data/metadata, GitHub, deployment, payment/LINE, or credential-value mutation occurred.

## 2026-08-25 PR #1865 CI build pepper follow-up

- Starting commit: `4d8218dc73a95277503915ee900eca77b0ed7985`; dedicated non-primary worktree: `/root/.hermes/worktrees/tour-platform/issue-1861-pr-ci-convergence`.
- RED evidence was the exact GitHub CI run `32752943304`: the production Next build rejected a missing `MIDAO_REQUEST_CLAIM_PEPPER`. The follow-up adds one public deterministic, canonical unpadded 32-byte base64url CI-only fixture to the primary CI environment and the isolated build wrapper; application startup/security guards remain unchanged.
- Focused GREEN evidence on the candidate: `.claude/hooks/run-checks.sh --typecheck apps/web/tests/api/midao-requests-read-migration.test.mjs apps/web/tests/unit/midao-ci-command-runner.test.mjs` passed `31/31` and `tsc --noEmit` under pinned Node `v22.23.1`; pinned Node 22 lint exited `0` with the pre-existing `RootDocument.tsx` warning only; `git diff --check` passed.
- Local production build is `PARTIAL_PASS`: Canary's bounded CI-equivalent Node 22 build passed startup validation and optimized compilation, then timed out during Next lint/typecheck on the constrained host. It emitted no pepper/startup/compile/lint error. Exact-head GitHub `ci` must pass before any merge decision.
- No Production SQL/data/metadata, GitHub, deployment, payment/LINE, or credential-value mutation occurred in this follow-up.

## 2026-10-06 單筆歷史 ledger 回填例外 — 候選修正，release HOLD

> 時間：Asia/Taipei 2026-10-06 13:13；分支 `fix/issue1861-historical-ledger-exception`；base `5037db04dbb5e326d6b30149ca422c2430c3b854`。尚未 commit／push／開 PR，不宣稱本次四檔獨立審查或完整 repo 驗收 PASS。

### 目標

僅為 `20260824135300_issue1861_midao_request_claims_bridge.sql` 補一筆誠實的歷史 production apply record，將 Owner 現在接受的歷史缺證風險明記為個案例外。其他九支缺少紀錄的 migration 與整體 release 繼續 HOLD，不由靜態 missing 倒推是否曾實際套用。

### AC 清單

- [x] 僅改 migration ledger、SOP 本個案例外、既有 #1293 gate 測試及本 worklog 四檔；ledger 只追加一筆六欄 record，不改 schema／verifier／harness／migrations／CI／baseline。
- [x] `applied_at=2026-08-25T00:11:45Z` 只表示 first durable confirmation timestamp；actual exact historical apply time is unavailable。歷史操作者 unknown，Owner 只核可本次例外，不冒稱原操作者或當時授權。
- [x] 明記 canonical source／current catalog SHA-256、有限 13 項查核、歷史 backup／schema/data recovery 缺證、runtime／真雙 backend 競態／bypass／依賴權限及額外 service_role ACL 限制。
- [x] canonical Node 22 `run-checks.sh` focused tests 16/16 綠燈，verified CLI 精確 missing9/HOLD、source gate PASS；實跑證據如下。
- [ ] 本次四檔 exact-diff fresh 獨立 read-back／重跑驗證、全套回歸或可用 CI 綠燈及公開里程碑錨點；交 Commander 接續。

### 已完成（附證據）

- Owner 於 `2026-10-06T05:06:23Z`（Asia/Taipei `13:06:23`）在說明 #1861 現有結構一致，但找不到當年備份與回復驗證證據、詢問是否接受歷史缺證風險並允許註明例外補登後回覆「接受」。本輪決策不等於歷史核可曾存在，亦不授權新增 DB／TEST／憑證／權限／部署操作。
- [歷史收據](https://github.com/smallwei0301/tour-platform/issues/1861#issuecomment-5403187032) 於 `2026-08-25T00:11:45Z` 報告 exact canonical SQL 在一個 Production transaction 套用。此次重新計算現有 migration bytes 的 source SHA-256=`dc7d8b4c55dbd944864b7067ba4b2ec2902c381be4c77674cfac9579268d63e1`，與收據相同；沒有把今天日期倒填為 apply time。
- 已有唯讀查核在 `2026-10-06T04:56:04.124139Z` 取得 Tour Production PostgreSQL 17.6 catalog metadata；catalog SHA-256=`41046574c88768728b0a13e2701cf0607302b52113e544bb928e2ca18557f003`，本次重算原始檔 bytes 一致。13 項離線比對涵蓋兩表 13 欄、13 constraints（2 PK／2 UNIQUE／5 RESTRICT FK／4 CHECK）、4 valid/ready unique indexes、RLS/FORCE RLS、無 policies/column ACL、三角色 schema USAGE、clients CRUD/EXECUTE denied、service_role CRUD/EXECUTE 及兩函式 signature/result/language/DEFINER/search_path；兩份 `prosrc` 與 canonical body 逐 byte 相同。未把此 metadata 結果稱為 runtime／backup／restore 驗證。
- `2026-10-06T05:01Z` 的 fresh 獨立唯讀 recovery-scope 審查重算 source/catalog hashes、獨立抽取並逐字比較兩函式 body，判定 `OWNER_DECISION_READY`，**不是 SOP_COMPLETE 或 RELEASE_PASS**。此審查只涵蓋決策證據，不替代本次四檔候選的獨立 code review。
- Ownership 由 Commander 對 14 個 live open PR 的完整 files 集合逐檔核對，四個目標檔案 overlap=0；#1844 的其他六筆 ledger 議題不屬本次 #1861 範圍。
- RED 已實跑：`TP_NODE22_ROOT=/workspace/shared/tour-r1-tooling/toolchains/node/22.23.1 bash .claude/hooks/run-checks.sh apps/web/tests/api/issue1293-migration-ledger-gate.test.mjs`，16 tests／13 PASS／3 FAIL、exit 1。失敗分別證明尚缺 #1861 record、現況仍 missing10，以及移除單筆例外的預期還未成立。新增 tests 鎖定六欄／證據語義／狹義 SOP，並檢查刪除這一筆只讓 missing9→10，baseline 涵蓋數不變。
- 最終 test／ledger／SOP 候選（含無同名 rollback companion 的真實限制）於 Asia/Taipei `13:12:48` 以相同 canonical `run-checks.sh` 指令實跑 GREEN：16/16 PASS、0 FAIL／SKIP、exit 0；工具產生的證據在 `.claude/state/last-checks.json`／完整 TAP log，未手寫測試回執。`git diff --check` PASS。
- 以相同 Node 22 canonical wrapper 分別實跑 `node scripts/check-migration-source-gate.mjs --mode source --json`（exit 0，`status=verified`，frozenCount=130／postCutoffCount=38）與 `node scripts/check-migration-ledger.mjs --mode verified --json`（預期 exit 1，`status=hold`，total=168／verifiedCount=42／coveredByBaseline=117／missing=9／unverified=0／errors=0／warnings=0）。#1861 單筆回填已在本候選使 missing10→9，整體 release 仍 HOLD。
- 本次 Builder dispatch 的 before CLI 已於真實派工前保存 PASS；requested model=`gpt-6.1-sol`，actual model 身分仍待可信 runtime receipt 核對，不把 requested 當 actual。receipt 與下一 fresh Reviewer 由 Commander 管理。

### 尚未驗證的限制／gate

- 歷史 pre-apply backup、完整 schema/data recovery／成功還原、原操作者／實際精確套用時間與當時結構性 DDL 風險核可仍不可恢復；此支無同名 rollback companion。Owner 現在接受缺證，不能因此改成歷史 PASS。
- 沒有新 runtime／業務 RPC／DB／TEST。既有 race case 的兩個 bridge 共用同一 `pg.Client`，不能當真雙 backend 重疊競態證據；完整重送／失敗／rollback 矩陣、definer owner bypass 與完整依賴 ACL 仍未驗。這些不是本次單筆歷史例外新增的 runtime gate，也不被本次回填視為通過。
- service_role 表 ACL 額外 `TRUNCATE/REFERENCES/TRIGGER/MAINTAIN` 的來源 unknown。canonical 只撤 PUBLIC／anon／authenticated，沒有撤 service_role 既有/default grants；額外權限不是已證實的 migration 執行不一致，不宣稱完整 least-privilege PASS，不自行撤權。
- `.cursor/harness/00_INDEX.md` §0 要求用 Claude Code 原生 Edit 探針取得 `HARNESS BLOCK [file-guard]`，此 native OpenAI 工具鏈沒有該 Edit／PreToolUse hook 介面，故 `HARNESS_WIRING_NOT_VERIFIED`。腳本存在或手跑不能證明 wiring，未偽造探針成功、未改治理檔；本次依 Owner 明確四檔授權作有界候選修正，不把此工具 gate 列為 PASS。
- 全套 `run-checks.sh --all`／lint／typecheck／build、exact-head CI、本次 fresh 獨立審查與 issue/PR 錨點尚未完成。其他 #754 重工作正在執行，本輪只跑小 focused tests，由 Commander 待資源 slot 接續適用完整回歸；不以本次 focused 綠燈代替完整驗收。

### 下一步

- 保存最終四檔 digest／完整 diff，另派 fresh Reviewer read-back 與重跑 focused tests，逐條核對例外不超過 Owner 批准範圍。
- Commander 取得適用全套回歸／CI 與獨立審查證據後，依最新 repo 流程決定 commit／工作分支 push／Draft PR 與雙寫錨點；保留 unresolved tool gate，不繞過保護或宣稱完整 PASS。

### 絕不重做（Do-NOT-redo）

- 不為此歷史回填重套 SQL、重跑 Production／TEST 業務 RPC、建立假 seed／新角色／ACL／憑證，或觸發部署。
- 不修改 frozen migration、baseline、verifier、harness 或 CI 來迫使 gate 綠燈；不擴大 baseline 或替其他九支補無證紀錄。
- 保留以上舊 worklog 原樣及當時 4/4 收據，只在本節補充其 race/runtime 真實 scope；不把舊同-client 測試改稱真雙 session 證據。
- 不編造歷史 operator／備份／rollback 成功，也不把當前 Owner 缺證核可倒填為當時授權。

### 2026-10-06 13:25 Asia/Taipei — Commander 獨立審查與完整回歸補證

- 四檔 candidate patch SHA-256 `47e1aaea72c4ced421c616d68b710e37874c23dbb52293d1858858ac07140dd4` 已由不同 actor、fresh context 的 Sol reviewer 獨立審查 PASS，blocking/unresolved findings=0；requested=`gpt-6.1-sol`、actual=`unknown`。Reviewer 重跑 canonical focused 16/16 PASS、source gate exit 0、verified gate預期 exit 1／missing9／errors0，並獨立核對原始 catalog、source hashes、兩函式 body bytes 與歷史收據。本段是審查後文件補證，另需文件 delta review，不宣稱原 review 已涵蓋尚未存在的文字。
- 新獨立 worktree 複製既有相同 lockfile 的依賴，workspace `@tour/web` 解析至本 worktree，沒有指向其他 actor 的產品原始碼，未下載或新增 package。
- 首次 canonical `run-checks.sh --all` 於 UTC `05:21:01–05:21:19` exit 1：5838 tests／5831 PASS／4 FAIL／3 SKIP。四個失敗均為既有 issue507 test 對 `stdout + stderr` 做 JSON.parse；獨立 no-DB diagnostic 證實 stdout 為合法 JSON，唯一 stderr 是 `UNDICI-EHPA` 環境警告，串接後才在 character 12009 失敗。此失敗保留，不改測試或吞其他 stderr。
- 保留既有 `NODE_OPTIONS`，僅追加 `--disable-warning=UNDICI-EHPA` 後，canonical issue507 focused 7/7 PASS；再於 UTC `05:24:55–05:25:12` 實跑同一 `run-checks.sh --all`，exit 0：**5838 tests／5835 PASS／0 FAIL／3 既有 SKIP／0 cancelled**。這只過濾已確認的單一環境 warning，其他 warnings/errors 與所有 assertions 保留。
- 適用完整 ordinary 回歸與本次四檔獨立審查已完成；lint／typecheck／build、exact-head hosted CI、公開 issue/PR 錨點與上述 HARNESS wiring 限制仍不冒稱通過。歷史 backup/recovery/runtime 缺口和整體 release HOLD 均不變；未做任何 DB／TEST／權限／部署操作。
