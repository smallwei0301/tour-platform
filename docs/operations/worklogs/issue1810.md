# issue1810 — 修復訂單建立至付款的唯一可付款金額一致性
> 最後更新：2026-08-10 12:26（Asia/Taipei）｜負責 session：Codex／2026-08-10

## 目標
依序完成 #1811–#1815，讓 `orders.total_twd` 成為建立訂單、Checkout、通知與付款共用的唯一可付款金額，並以可重跑的 transaction、fault-injection、concurrency 與 E2E 證據收尾本 Epic。

## AC 清單
- [x] AC1 五張 bounded 子票已建立，parent 均為 #1810，blocked-by 鏈為 #1811 → #1812 → #1813 → #1814 → #1815。
- [ ] AC2 基本建立、加購、點數三條成功路徑的 API、Order item 與持久化 `orders.total_twd` 一致。
- [ ] AC3 輸入錯誤與每個必要寫入失敗均不留下半完成資料、付款入口或成功通知。
- [ ] AC4 client total 無權威；相同 Idempotency Key 的順序重送與併發只產生一組副作用。
- [ ] AC5 只有完成 materialization 的 Order 可付款，通知與付款 test double 使用 commit 後 read-back 的 `orders.total_twd`。
- [ ] AC6 #1811–#1815 各自具備 RED → minimal GREEN、focused／full suite、獨立 review 與 CI／E2E 證據。

## 已完成（附證據）
- 2026-08-10 live GitHub 查核確認 #1810 為 open／`status:in-progress`，#1811–#1815 已建立且依序 blocked；PR #1809 已合併至 main commit `a598ff06`。
- 2026-08-10 使用者明確補充本輪範圍包含 #1810；決定以 #1810 作 tracking Epic、不另做空泛實作，先施工唯一無子票前置相依的 #1811。
- 2026-08-10 operator 明確回覆「授權推薦方案」：核准把 #1811 既有本地分支發布為 Draft PR 以取得 hosted Node 22／PG17 證據，並核准 RPC／必要環境缺失時 fail closed、不提供非原子 in-memory writer fallback 的安全例外。授權不含 production migration apply、正式資料修改、部署、合併、真實付款或通知。

## 下一步
- 發布 #1811 Draft PR，完成 hosted PG17 runtime 與 expected-terminal artifacts promotion／重跑驗證；在所有本票證據完成前維持 in-progress。
- #1811 驗收與 PR 合併後才解鎖 #1812；不得跳過 blocked-by 鏈。

## 絕不重做（Do-NOT-redo）
- 不把 tracking Epic #1810 當成可單獨關閉的空殼工作；必須等 #1811–#1815 的實際證據完成。
- 不提前把加購、點數、Idempotency／併發或 release E2E 混入 #1811；各責任由下游 bounded package 承接。
- 不部署、不套用 production migration、不修改正式資料、不呼叫真實付款／通知／LINE。

## P0-OVERRIDE 使用紀錄（如有）
- 無。
