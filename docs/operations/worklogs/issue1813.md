# issue1813 — 點數折抵與建單原子化
> 最後更新：2026-08-12（Asia/Taipei）｜負責 session：Codex

## 目標
將旅客點數折抵驗證、append-only ledger、訂單項目與唯一付款金額納入同一個 source-only PostgreSQL 建單 transaction。

## AC 清單
- [ ] NOT_VERIFIED-local：點數參數由伺服器驗證；不足、過期或超過折抵上限時不建立任何訂單資料。（隔離 runtime 測試已新增，待 CI PG17/PostgREST 實跑）
- [ ] NOT_VERIFIED-local：成功折抵時，booking、order、add-on snapshot、order item、points ledger 與 `orders.total_twd` 同一 transaction 完成。（source migration + gateway 對帳，待 CI 實跑）
- [ ] NOT_VERIFIED-local：ledger 或付款總額寫入失敗時，整個 public draft aggregate 回滾；RPC 僅可由 service role 呼叫。（隔離 runtime 故障注入測試已新增，待 CI 實跑）

## 已完成（附證據）
- 2026-08-12 使用者授權新增 source-only migration 擴充原子 RPC；不套用正式資料庫。
- 2026-08-12 確定 TDD seam：`POST /api/v2/bookings/draft` 與隔離 PG17/PostgREST runtime。
- 2026-08-12 新增 `fn_create_booking_draft_with_addons_and_points_atomic`：外層 transaction 先委派 #1812，再驗證帳本餘額／30% 折抵上限，寫入 `redeem_order` ledger、負數 discount item，最後更新唯一付款真相 `orders.total_twd`。
- 2026-08-12 移除 commit 後 fail-soft `order-extras`；公開 API 僅傳遞非負整數 `redeemPoints`，不接受任一前端金額。登入者身分由伺服器 Supabase auth 衍生，client 夾帶的 `travelerId` 無法改寫 ledger 擁有人。
- 2026-08-12 新增 owner-gated rollback companion；只撤銷／刪除本 RPC，不刪除任何資料。
- 2026-08-12 `npm run typecheck` PASS；#1811/#1812/#1813 focused Node 測試 9/9 PASS；既有 route contract 19/19 PASS；先前 focused source 組合 36/36 PASS。
- 2026-08-12 review 修正：route 限制 `redeemPoints` 為 PostgreSQL `integer` 範圍；隔離 runtime 擴充「超過 30% 上限」與「偽造 travelerId、他人帳本有點數」兩個零 materialization 負向案例。補跑 source focused Node 測試 9/9 PASS、`npm run typecheck` PASS；完整 `npm test` 結果不變（無 #1813 回歸，仍為未發布 artifact gate 與既存 Node 24 HMAC／availability 失敗）。
- 2026-08-12 `npm test`：無 #1813 行為回歸；剩餘 fail-closed baseline gate 是刻意未發布的 expected-terminal artifact，另有既存 Node 24 的 guide-session HMAC（3）與 availability parity（2）失敗。
- 2026-08-12 `.claude/hooks/run-checks.sh --all` 未能開始測試：環境缺少固定的 `/root/.hermes/toolchains/node/22.23.1`。隔離 PG17/PostgREST runner 亦因 Docker／Supabase toolchain 不可用而無法本機啟動；兩個 runtime integration 測試保持 `NOT_VERIFIED-local`，交由 CI 的隔離 runtime lane 驗證。
- 2026-08-12 不手改已發布 baseline／catalog／expected-terminal artifacts；CI 會先產生並驗證新 artifact。是否將產物併入 PR，另待 owner 明確授權。

## 下一步
- 人工 code review 後提交 source-only 變更並開 draft PR；以 CI PG17/PostgREST runtime 驗證原子成功、錯誤與故障注入 rollback。

## 絕不重做（Do-NOT-redo）
- 不修改 #1811/#1812 既有 migrations：migration 只增不改。
- 不呼叫正式資料庫 migration apply、付款或部署。

## P0-OVERRIDE 使用紀錄（如有）
- 無。file-guard hooks 未載入，使用者於 2026-08-12 授權：「授權使用等效人工安全流程執行 #1813」；另於本輪授權：「授權 #1813 新增 source-only migration 擴充原子 RPC，不套用正式資料庫」。
