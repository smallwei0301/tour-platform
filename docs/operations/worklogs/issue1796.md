# issue1796 — 修復未付款逾期原子取消 RPC 的 42702
> 最後更新：2026-09-14 15:28 CST｜負責 session：Ava / gpt-5.6-terra

## 目標
以 append-only migration 修正 `fn_expire_unpaid_order_atomic(uuid,timestamptz)` 的 `booking_id` 欄位歧義，保留既有 RPC 契約與原子狀態轉移。

## AC 清單
- [ ] 已記錄 RED：過期 `pending_payment` 訂單取消 booking 時，修正前會出現 PostgreSQL `42702`。
- [ ] append-only migration 僅限定 qualification 修正，保留 signature、output、鎖序、狀態轉移與 security/grants。
- [ ] hosted 整合回歸驗證 booking/order 終態、唯一 `payment_deadline_expired` log 與 repeat noop。
- [x] source-contract、ledger gate、Node syntax 與 diff hygiene 有 exact-HEAD 證據。

## 已完成（附證據）
- 2026-09-12 已在綁定非 primary worktree 確認 branch=`builder/issue-1761-stage5b-expiry-42702-348bea78`、HEAD=`348bea78bba627f16fe4e6cb0e9d2a1ee3912dfc`；接續 run 再驗證 Planner repair binding #1714 所列的兩個 dirty path SHA-256 完全相符。
- 2026-09-14 已把 `apps/web/tests/api/midao-inquiry-convert-rpc.test.mjs` 還原為 immutable base 的既有 42702 observation，符合 repair binding 要求；該檔目前無 diff。
- 2026-09-14 已以 test-first 建立唯一 `apps/web/tests/integration/midao-issue1796-expire-unpaid-postgres.test.mjs`：僅允許 `DATABASE_URL` 指向 `postgresql://127.0.0.1:54322/postgres` 的 local shape、重用 `midao-task38-seed.sql`，並期待 booking/order cancellation、唯一 `payment_deadline_expired` log 與 repeat noop。尚未產生 migration。
- 2026-09-14 直接 runner 首次到達 `MIDAO_STAGE=ready`，但 `npm config get omit` 為 `dev`，使其 readiness `import('pg')` 失敗（`ERR_MODULE_NOT_FOUND`）；runner 顯示 cleanup 並在當次檢查無 project containers/networks/volumes。已以 `npm install --include=dev --ignore-scripts --no-audit --no-fund` 安裝忽略的開發依賴，並以 `git restore --source=HEAD -- package-lock.json yarn.lock` 丟棄 lockfile churn。
- 2026-09-14 第二次 direct local runner 到達 `MIDAO_STAGE=on-ready`，但 host 持續出現 swap-in 與 I/O wait 32–34%，為保護低記憶體主機而中止 exact worker。runner 輸出進入 cleanup；但後續 read-back 仍殘留 `supabase_network_builder-1761-stage5b-expiry-42702` network 與 `supabase_db_builder-1761-stage5b-expiry-42702` volume，未取得 child PostgreSQL `42702` RED evidence。
- 2026-09-14 Ava 的 `CAPABILITY_BLOCK_CLEARED` receipt 已完成 task-scoped Docker residue cleanup 並授權一次 bounded retry；本 run 的 launch preflight 沒有啟動 runner。09:16 CST fresh sample 的 `MemAvailable=1238448 kB`、`SwapFree=2981536 kB` 雖仍高於最低門檻，但 `vmstat 2 6` 最後兩個 interval 的 `wa=23`、`wa=32`，同時有 swap-in（`si=12`、`si=8`），符合 persisted abort rule 的「`wa>=20%` twice」。無 OOM log、該瞬間無 D-state；仍不得進行第三次 local PostgreSQL attempt。
- 2026-09-14 run 1191 再讀回 authoritative Planner `t_4faa8699`：仍為 `blocked`，其 body 缺 completion guard 所需 `EXISTING_BUILDER_REPAIR: true`、`EXISTING_BUILDER_TASK_ID: t_ed00530b`、`FAILED_RUN: 1184`；因此尚無 completed repair、default-branch workflow amendment SHA 或 exact #1796 hosted RED/GREEN receipt。直接以 Node 22 執行 integration test 僅如預期因未由 local runner 注入 `DATABASE_URL` 而失敗，非 PostgreSQL RED 證據，未啟動 Docker 或第三次 local runner。
- 2026-09-14 run 1192 重新讀回 live Planner `t_4faa8699`：仍為 `blocked`，body 依然缺上述三個 exact binding tokens；尚無 completed existing-Builder repair、default-branch workflow amendment SHA 或 exact hosted #1796 RED/GREEN receipt。當前 task-scoped Docker container/network/volume readback 為空；候選檔案仍僅兩個且 integration test SHA-256 未漂移。資源抽樣亦出現 swap I/O，故未啟動禁止的第三次 local PostgreSQL runner。
- 2026-09-14 11:27 CST live readback：Builder `t_ed00530b` 已被啟動為 run `1199`，但其 worktree 仍只有同一批兩個已盤點 untracked paths（integration test SHA-256=`7da7a212052ace0e17fcdf285f06ff6302695b9a9aa9bd33dce5917e83b34a7b`、worklog SHA-256=`78c74ab359e4d39bc2e7c611c053002fd5c457f084eeb69a70610501c6b4456c`），HEAD 仍為 immutable base `348bea78bba627f16fe4e6cb0e9d2a1ee3912dfc`。同時 authoritative Planner `t_4faa8699` 仍為 `blocked`：其 completion guard 缺 `EXISTING_BUILDER_REPAIR: true`、`EXISTING_BUILDER_TASK_ID: t_ed00530b`、`FAILED_RUN: 1184` 三個 exact tokens，尚未能完成 existing-Builder repair，也未產生 #1796 exact hosted RED/GREEN receipt。fresh host sample 仍有 swap-in；不執行第三次 local PostgreSQL runner。
- 2026-09-14 13:06 CST diagnostic PR #1875 的 GitHub Actions run `34808437649`／job `103864812942` 在 fixture/on-ready 成功後，於 #1796 runtime step 真實得到 PostgreSQL `42702`：`column reference "booking_id" is ambiguous`；Planner repair binding 已排除較早的 fixture `23505` 偽 RED。這是實作前的有效 RED。
- 2026-09-14 13:27 CST 已將 diagnostic seed-trigger wrapper 帶回 integration test；目前 SHA-256=`f8a5dff6320a8dee01c08e87fc6bb85de1c206cc62615d939ac6f9c7e912d3cb`，與有效 hosted RED diagnostic 一致。wrapper 只在 fully explicit disposable seed 載入時設 `session_replication_role='replica'`，並在 RPC 前復原 `origin`。
- 2026-09-14 13:27 CST 已由 pinned Supabase CLI `2.87.2` 產生 append-only migration `supabase/migrations/20260914052608_issue1796_expire_unpaid_order_ambiguous_column_fix.sql`；僅把既有 de-dup predicate 改為 `booking_status_logs.booking_id = v_booking.id`，保留 RPC signature、七個 output fields、鎖序及狀態轉移。
- 2026-09-14 13:27 CST `NODE22_BIN=/root/.hermes/toolchains/node/22.23.1/bin/node node --test apps/web/tests/api/issue1493-expire-unpaid-contract.test.mjs`：7/7 PASS。`run-checks.sh` 同時帶入 integration test 在未由 hosted runner 注入 `DATABASE_URL` 時如預期 exit 1；這不是 PostgreSQL verdict，且第三次本機 Supabase runner 已禁止。

- 2026-09-14 hosted exact-head `393fd70be84e53a1b70f76d5247f5c44d523e1cb` run `34815505811` / job `103885216237` completed fixture and all preceding database setup successfully, then failed only in `Run #1796 unpaid-expiry PostgreSQL runtime contract` with PostgreSQL `42702` at integration line 85. The prior migration had qualified the de-dup predicate but the function still exposes `RETURNS TABLE booking_id`, so this forward-only replacement compiles the function with `#variable_conflict use_column` and aliases the log read as `booking_log`; no existing migration is changed.
- 2026-09-14 15:28 CST 修復既有 test consumers：#1293 closed expected migration list 加入 `20260914073000_issue1796_expire_unpaid_order_variable_conflict_fix.sql`；#1796 disposable loopback integration client 連線後明確讀取並執行該 migration，保留 `127.0.0.1:54322/postgres` assertions。#1493 source-contract 鎖定 migration path 與「connect 後、RPC 前」套用順序，避免 published foundation baseline 造成舊函式假 GREEN。
- 2026-09-14 15:28 CST Node 22 focused tests：`issue1493-expire-unpaid-contract.test.mjs` 9/9 PASS、`issue1293-migration-ledger-gate.test.mjs` 14/14 PASS；三個變更 `.mjs` 均 `node --check` exit 0，`git diff --check` exit 0。未啟動 local Supabase/PostgreSQL，未觸及 Production。

## 下一步
- commit 並 push consumer wiring，確認 PR #1876 的 hosted #1796 PostgreSQL runtime contract 使用新 migration；不得執行 local PostgreSQL/Supabase attempt。

## 絕不重做（Do-NOT-redo）
- 不修改既有 migration、`db.mjs`、payment/API 凍結區、runner 或 fixture；均不在本卡 allowed mutations。
- 不以 source-contract 取代 PostgreSQL atomic regression；本卡 AC 要求 local PostgreSQL acceptance seam。
- 不手動處理 runner 擁有的 DB/network/volume；repair binding 明定無法證明 cleanup 時保留 candidate 並以 capability block 回報。

## P0-OVERRIDE 使用紀錄（如有）
- 無。
