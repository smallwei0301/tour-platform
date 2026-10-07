# issue1893 — 初次付款 order-wide admission

> 更新：2026-10-07 10:07 Asia/Taipei｜狀態：source kernel 待發布 Draft；actual routes／DB runtime／完整驗收 HOLD

## 目標

追蹤 [#1893](https://github.com/smallwei0301/tour-platform/issues/1893)：[#1890](https://github.com/smallwei0301/tour-platform/pull/1890) 隔離 real-auth 第 8 案並行 V2 ECPay create 回兩個 HTTP 200，MerchantTradeNo 卻不同。先交付 orders row-lock admission SQL、RPC-only gateway 與契約測試；kernel 尚未接 actual routes，原 race 尚未修復。該次 legacy reuse、row count 與 broken aggregate assertions 未到達，不能推論有兩筆 payment row。

## AC 清單

- [x] SQL source：先鎖 Order，鎖內重讀期限、Booking 與完整 items 總額；payment 與 required initiated event 同 transaction；保留 rollback source
- [x] Gateway／明列 simulated fallback：同 provider 重用既有 identity；cross-provider、unknown、本地 failed/cancelled、矛盾 paid/captured、多 row 均 HOLD，RPC 失敗不直接 insert 或 fallback create
- [x] Manual settlement 未接完整交易前 HOLD；existing transfer 明列同 row reconciliation 後續接點，未改 #1776 pending_confirmation 語意
- [x] Source R2 與 ledger snapshot 獨立補審 PASS-in-scope、未解 finding 0；Node22 targeted／普通 full／type／lint 有實跑證據
- [x] 兩支新測試按真 Issue 號完成正式 P0 git mv，內容不變；原先僅檔案層 rename 的流程缺口已補正式 guard 核可與執行證據
- [ ] Rename／本 worklog 獨立 delta review、工作分支、Draft PR 與 exact-head 自然 CI 終局
- [ ] SQL 真 DB serialization、transaction fault、apply/rollback、ACL 與 deterministic expected-terminal publishing：NOT_VERIFIED-live，尚未 apply 新 SQL
- [ ] V2／legacy／manual／callback 所有初次 writer 接線、舊 identity 相容、provider verified-terminal retry／late callback、原第 8 案及後續 assertions：HOLD，kernel 尚未接線

## 已完成（附證據）

- Base main `d12b9a9c7004319d6c4b3e53d161532cbeb4049a`。原七檔 patch SHA256 `b615a25b447057263472550d0266b98bce5972c6055ce34956aee3d431e7f016`；只 rename 後七檔 patch SHA256 `0a498804e0e33717c9d6c8ee6046f08f9b12d09514daecf2b174a72c9b991039`，七檔內容逐一與原 commit 比對一致
- 原正常 local commit `811f75f4d27b260567c4db5a3d4c95fa280b6d56` 與 GitHub commit object `8a4dce2a955950be0368cacdd8f2decfa993a2be` 具有同 tree `c0b8f1ca04aa5ad824496e375e89f2f8fc9a3ce5`、七 blob 真 read-back；metadata 不同，兩者不是同 commit SHA。此時尚無遠端工作 branch／Draft
- Source R2：原六 findings 與 ASCII 邊界修正後，正反 controls 13/13、source targeted 28/28、付款回歸 54/54；requested Sol、actual unknown，僅 source 契約通過，沒有冒稱 DB runtime 驗證
- 首次普通 full：5917 total／5912 PASS／2 FAIL／3 既有 SKIP，type NOT_RUN。兩 FAIL 為 #1293 ledger snapshot 須精確增列新未 apply SQL；原九支加新一支仍 HOLD，verified ledger／baseline 未改。補審 PASS-in-scope 0 後，普通 full 5917／5914／0 FAIL／3 SKIP、type PASS，lint 0 error／1 既有 RootDocument warning
- 2026-10-07 07:42 Asia/Taipei rename 後正式 `run-checks.sh`：targeted 三檔 44/44 exit 0；發布前 `--all` 5917 total／5914 PASS／0 FAIL／3 既有 SKIP exit 0。D3 不包含 app build；必要 true app build 交由原自然 CI
- 本地 app build 的外連阻擋與批准後執行服務取消保留 exit UNKNOWN，不當產品 FAIL／PASS。既有 Google fonts 兩 domains 唯讀批准有效，未 mock、skip prebuild、換 host 或改網路設定
- #1893 已於 2026-10-06 23:41:17Z 實際建立並回讀。寫入前 fresh main／治理核對一致，15 open PR 全部 changedpaths 對七檔、rename paths 與本 worklog overlap 0；file guard 放行。依既有授權等效流程檢查，未宣稱 Claude 原生 hook wiring 已驗證

## 下一步

- 完成本輪 rename／worklog 獨立 delta review 後正常開 Draft，追 exact-head 自然 CI、真 app build 與原隔離 baseline。Owner 已明准該自然 workflow 的 Production 唯讀 anon RLS probe 及原 Telegram／Email 狀態與連結 alerts；不另 dispatch probe
- 取得真 PR／CI 連結與結論後更新本 worklog，並在 #1893 留公開里程碑完成 D7。發布與 CI 尚待，沒有預填成功
- 保持 Draft；完整 runtime、DB 與 merge gates 未過。後續接線須沿既有 transfer reconciliation、持久 provider terminal evidence 與 late callback guard，不以 source 綠燈稱 race 已消失

## 絕不重做（Do-NOT-redo）

- 保留 #1776 transfer 同 row reconciliation 與 pending_confirmation；#1819／#1890 只擔 CI routing。closed #1815／#1814 不重開，不借舊 legacy override
- 不修改既有 migrations、#59、frozen baseline／catalog／pinned runner、workflow、受保護 E2E、安全／startup guards、RootDocument／字型／locks；不加 fixture unique index 或 skip 來放行
- Unknown、本地 failed/cancelled、取消／退款／逾期 Order 不因 retry 重開；provider terminal evidence 與 late callback 未完成前 retry HOLD
- 自有隔離 dependencies；npmci 產生的 yarn.lock 副作用有保全 diff，再精確復原原 HEAD bytes，shared dependencies 未動。不得 DB apply、真付款、正式部署、新增憑證或權限

## P0-OVERRIDE 使用紀錄

- 2026-10-06 13:33 UTC，新 `supabase/migrations/20261006121148_initial_payment_admission.sql` 約 12 行三 findings 修正，Owner 在完整單檔 source 範圍問題後原文回覆「批准」。同 file/action 正常 guard 重試 exit 0，實際 7 增／2 刪後消耗 override；沒有第二支 migration 或 DB apply。SQL SHA256 `bcdf10cfdf5758e407dedadbe325c5fef006f5e7e5ed16d66b6acfa8e6eb1e5b`

## 2026-10-07 正式 P0 修正

- Owner 2026-10-07 01:19:56 UTC 原文「批准同類問題」，回覆已明列 `.claude/hooks/bash-guard.sh` 25 增／1 刪最小修法及兩個測試改名的範圍；不擴為任意 guard 放寬或 DB／部署批准
- 02:07 UTC 在保留舊成果的獨立工作副本，file-guard exit 0 後套入既經獨立 R2 審查的 exact patch `b5a56897b29b33b894a4c6d18f7eeae4480de0b59ad39b6c6d9fb474fad772f3`；正式 guard bytes SHA256 `80a8ba126e29915537ed8377b4c1a968a7a9fabb5f87e23f61ac1cbcef371313`
- 正式執行 `git mv --` 將 `apps/web/tests/api/payment-admission-gateway-contract.test.mjs` 改為同目錄 `issue1893-payment-admission-gateway-contract.test.mjs`，unit 下 `payment-admission-migration-contract.test.mjs` 改為 `issue1893-payment-admission-migration-contract.test.mjs`；兩次 bash-guard exit 0、git mv exit 0，內容 hashes 分別仍 `0e4c2750c55c881d9c7799e2f84c2e2b614ce17eb9072b3bb8aff0f0f5709af1`／`9cfc63fca8b4fa596234ff747e2b06a13d820cdd9d16aba4522febb9f8324cee`
- 授權記錄保留真實 Owner 原話及範圍，path marker 明列為已批准範圍的轉錄，未冒稱 Owner 逐字輸入 marker；mtime 保留 01:19:56，沒有延長 60 分鐘。編輯／改名完成後立即消耗 override
- 原錯誤 rename 流程及獨立審查 finding 保留，不以新證據倒填舊流程為正確。當前 main `d12b9a9`，15 個 open PR 對本次 guard／payment-admission／issue1893 路徑 overlap 0
- 待：當前正式 source 的 targeted／full checks、獨立 read-back 與重跑、commit／Draft PR；先前 scratch 分類通過不代替這些 gate。原付款 race、真 DB 與完整驗收仍 HOLD

## 2026-10-07 正式修正後測試

- 02:08 UTC 正式 Node22 targeted 三檔 44/44 PASS，exit 0；初次工具鏈預設位置不存在的 preflight exit 1 保留，改用既有 `TP_NODE22_ROOT` 恢復，沒有安裝或修改工具鏈
- 第一次 `--all` 實際 5917 total／5910 PASS／4 FAIL／3 SKIP；四個失敗皆為既有 #507 子程序 stdout/stderr 合併後，環境 `UNDICI-EHPA` warning 接在 JSON 後造成解析失敗。未改 source／測試，僅以 Node 支援的 `--disable-warning=UNDICI-EHPA` 精準過濾這一 warning 碼，#507 獨立重跑 7/7 PASS，再原完整 `run-checks.sh --all` 於 02:10 UTC exit 0：5917 total／5914 PASS／0 FAIL／3 既有 SKIP
- 七個付款 source 檔逐 bytes 回比原 local commit `811f75f` 完全相同；獨立工作副本只增加上述 guard 修正、兩檔同內容改名與本 worklog。舊副本與 staged patch 原封保留
- 本次沒有重跑 type／lint／app build；付款 source 未變，既有 type／lint 證據另列。真 app build／遠端 exact-head CI、付款 route 接線、DB runtime 仍待，不將 focused 或 source checks 稱完整驗收

## 2026-10-07 expected-terminal 限定重建第一階段

- Owner 03:42:59 UTC 原文「批准」，核准此支付款SQL對應的post-cutoff inventory、四個精確consumer測試及既有CI兩次PG17生成四份expected-terminal artifact；immutable cutoff/capture、舊migration、pins、shared TEST／Production不變
- 已公開Draft #1894，head `6f3d0ab0bca418499f7241e3ffc18005875c4222`。主CI `37561262597` SUCCESS；baseline `37561262631` 187案186 PASS／1FAIL：published expected-terminal仍38支，缺本次新SQL。兩次builder雖SUCCESS但只重建舊38支，沒有驗到新付款SQL
- 第一階段僅將新SQL精確hash `bcdf10cfdf5758e407dedadbe325c5fef006f5e7e5ed16d66b6acfa8e6eb1e5b` 加入materializer與verifier兩份清單，同步builder／existing兩個精確consumer；suffix38→39，fresh history39→40，existing130+39=169。原38項及immutable capture不變
- 全部原scope source targeted初跑31案30PASS／1預期FAIL已保留：materializer consumer要讀真published新manifest，產物尚未生成所以正確FAIL。該consumer的精確增量保存在第二階段，不以手填manifest或放寬assertion變綠；final-gate兩digest亦等真產物後更新
- 本commit只為觸發既有自然PR CI的兩次隔離PG17 builder，不代表總gate PASS。第一階段所有staged tests仍須原evidence verifier、canonical bash-guard與獨立審查通過；第二階段取得真四artifact，驗hash／transaction／history／cleanup，再提交其餘精確consumer並跑完整CI
- 明列未完成：current published artifact freshness RED、完整新headCI、真新SQL replay、付款route接線及全部runtime／merge gates。不得把phase1 focused PASS稱完整驗收

## 2026-10-07 staged evidence 格式相容修正

- 04:06:18 UTC Owner 原文「批准，不要再問」，具體核准 verifier 三種普通指令格式對齊現行 Node22 wrapper／tap，並補正反測試；未授權放寬版本、30分鐘、exit、exact tree或完整coverage
- main d12b9a9 的原 producer 已輸出 wrapper／tap，consumer 仍預期裸指令，第一階段20/20真測試後因此被拒；保留原拒絕，不改歷史證據
- 本次僅兩行字串與單測精確 fixtures、拒舊裸命令／缺tap／錯wrapper反例。仍需修後正式 verifier實跑、exact staged tree獨立審查與原CI，不能以scratch38案通過代替

## 2026-10-07 真 expected-terminal 產物接續

- 第一階段正常 local commit `6e78c51`、遠端head `8af541d30d87a67c90b999e8a2ee2788dc74788f`，完整tree同為 `25ddbb50b466a7e9acf972e30ffd9150ec344c5b`；canonical staged verifier61/61、獨立61/61及52/52正反控，未解source finding0
- 自然 baseline [37570133402](https://github.com/smallwei0301/tour-platform/actions/runs/37570133402) 的 pinned PG17 builder及artifact upload實際SUCCESS。artifact `11460700872`、archive SHA256 `40bb4b69207cfdc020f46b2b0d252cd95d6df517699aeee61f507b0b970576de`；四檔來自真runner，沒有手寫catalog
- 原transaction verifier實跑PASS：fresh history40，terminal `20261006121148`，transaction `cbfd10a348af8b1992a1a6168187709cc86a73f525d5189fa4d370c2b33fc333`，manifest `a788f76a0f7dfd2f98aa7e36737af865c3bac3a05222fcdd040375608ac86235`；canonical capture transaction仍 `c90dfe6ce32f77010354615795df95c085f16f53f8a830ac8553196b5d178e13`
- 第二階段只套四個真artifact，同步materializer精確suffix及final-gate兩個expected digest；immutable capture constants、舊SQL與pins未變。focused17/17與原migration sourcegate實跑PASS，完整full、獨立審查及新headCI續核，不稱完整驗收
- 第一階段一般CI `37570133340`／migration drift `37570133346` 均因舊published manifest的exact history檢查失敗，後续build或Production步驟SKIP；保留預期失敗。baseline原runtime與cleanup終局尚待確認，確認後才推第二階段；不重跑舊CI
- 新SQL僅在此已批准隔離假DB replay；未套shared TEST／Production，付款kernel仍未接actual checkout，原競態與全部付款驗收仍HOLD

- 04:16 UTC 接續查證：原baseline在04:15:50於「generated artifacts未commit」diff gate預期FAIL，builder真log `runs=2/published=true` 綁上述transaction；六個既有隔離runtime步驟全部SUCCESS，各自cleanup-identity及cleanup日志齊，後續browser仍SKIP。這是runner cleanup契約成功，不是另行host資源盤點
- 第二階段原完整 `run-checks.sh --all` 真exit0：5917 total／5914 PASS／0 FAIL／3既有SKIP；staged verifier recorded `abfd2aefd48ff4b6d812e8df50817dd742daec4a`。此後僅補本段真實結果，code/generated bytes不變；新staged tree重新核targeted證據與獨立審查，遠端新CI仍待

## 2026-10-07 actual ECPay create 接線

- 第二階段遠端head `ac92c893801d7bcb672bf3c8aa3747a9c7734c2b`，完整tree `65494779178faa025d504259b84e446eefa27aed` 與正常local commit `b96ce8c` 相同。新CI `37572194897` SUCCESS；baseline `37572194870` 不是舊history缺口，而在checkout real-auth第8案重現原double-click兩MerchantTradeNo；前7案PASS、cleanup日志齊，後續browser未跑
- 該run再次真builder2run產物 `11461591362` 四檔逐bytes等於published產物，source gate已過，沒有重跑舊CI。新付款SQL僅進隔離fake PG17，不是Production apply
- 原第8案實際入口為 `/api/v2/payments/ecpay/create`，隨後要求legacy `/api/payments/ecpay/create` 重用同identity；两者共用 `src/lib/payment/db-payment-attempt.mjs`。舊adapter SELECT/INSERT只靠23505補查，無可依賴orderwide serialization
- 最小修正只把該非凍結adapter真DB分支接既有order-locked admission RPC；回應維持既有identity/reused shape，hold／RPC error／locked amount不同於HTTP前讀均fail closed，不fallback direct insert。兩route bytes／auth／tenant／payment policy／SQL未改，no-DB simulation既有契約不冒稱真DB保障
- 15個其他openPR對adapter／652測試無overlap；原fileguard放行。新9案修前1PASS／8FAIL、修後9PASS；連同既有652／614與admission契約四檔共46/46 PASS。652保留create／reuse／concurrency行為斷言，只把mock邊界從錯誤依賴unique-constraint切至原RPC
- 待：新exact tree full/type、獨立審查、自然CI原第8案與後續assertions；獨立bookingId checkout、transfer/manual/callback全writer接線及最終驗收仍HOLD，不因這批source測試通過就merge

## 2026-10-07 收斂隔離 admission runtime 驗收

- 已發布head `c4ba99c4f88260422318cc7c804b4b3e97277ec8` 的 [baseline 37573545502](https://github.com/smallwei0301/tour-platform/actions/runs/37573545502) 於05:07:45 UTC SUCCESS；原checkout real-auth整檔8/8，包括double-click、legacy identity、row count與brokenaggregate實際PASS；[一般CI37573545595](https://github.com/smallwei0301/tour-platform/actions/runs/37573545595) 亦SUCCESS。公開審查／限制已記[PR留言6031427231](https://github.com/smallwei0301/tour-platform/pull/1894#issuecomment-6031427231)，仍維持Draft
- 下一個有界段只在既有非凍結integration檔新增三項真PG測試：兩獨立連線order-lock屏障的cross-provider競爭、限定case order的required-event fault整筆rollback、實際role EXECUTE拒絕與role恢復；重用既有loopback PG／fake Auth fixture，不改migration、workflow、runner、既有8案斷言或其他writer
- 所有16個openPR changedpaths對該integration檔無overlap；#1776 manual-payment owner與pending_confirmation不動。嚴格DB URL限定既有wrapper的127.0.0.1:54322/postgres，並保留finally清理與錯誤回報
- 目前三case只有syntax檢查PASS，真DB NOT_RUN；本地無Docker，需原隔離CI才可驗。ordinary --all不含integration，不能把其成功誤稱這三case實測通過；發布前仍需合法CI-first檢驗接點與獨立審查，不修改檢查器來繞過
- bookingId checkout接線先保留：RPC已原子寫initiated，但caller payment_events另有correlationId/sourceChannel/auditSignal契約，不能直接重複寫initiated或丟audit欄位。待等價事件契約明確再施工，尚未覆蓋全writer/late callback

## 2026-10-07 15:23 Asia/Taipei ACL 診斷修正，real-PG gate 仍 HOLD

- 三案首輪發布 head `0b8274fbad0efb42553cce2bef31b51d35607e8c`，實際 CI merge candidate `a214dadbf0b4df51cad8e7521dde40cfac66031a` 合入 main `8841776809e576fabf88bdc2046c70003c5a25dc`。[baseline 37585279302](https://github.com/smallwei0301/tour-platform/actions/runs/37585279302/job/112673867826) FAILURE；[一般 CI 37585279208](https://github.com/smallwei0301/tour-platform/actions/runs/37585279208) SUCCESS，不能取代隔離 runtime。
- baseline 完整 job log 明列原八案、cross-provider order-lock、required-event rollback/retry PASS；ACL 案 FAIL，finally 的 `ROLLBACK` 回 `Client has encountered a connection error and is not queryable`，共用 client 的 after hook 隨後同樣失敗，另有 `Connection terminated unexpectedly` 非同步錯誤。原 ACL 錯誤遭 finally 覆蓋，log 無 role／probe phase 與原始 SQLSTATE，故底層 PostgreSQL 斷線根因仍 UNKNOWN，不能寫成已修復。
- 本次只修 ACL 案的診斷與連線生命週期：每個固定 allowlist role 使用獨立 disposable client；共用 fixture client 不執行 role probe。保留 `has_function_privilege`、真 `SET LOCAL ROLE`、`current_user`、精確 `42501` permission denial／`22023` invalid-request 拒絕與 rollback 後 role 恢復要求，不放寬、不 skip、不 retry。
- socket error event、原 query rejection、assertion、rollback、role restoration 與 close 錯誤全部保留為 FAIL，訊息帶 role／phase／SQLSTATE 並保留原 cause；finally 仍嘗試 rollback、role 驗證與 close，不用清理錯誤取代 primary。原前十案（含兩個新增 runtime 已 PASS 案）的 source bytes 未改；SQL／adapter／workflow／runner／auth／URL 安全 guard 未改。
- 官方 canonical Node `22.23.1` 的外部 source-seam fault controls 真實 RED→GREEN：原版 `4 PASS / 7 FAIL`、exit 1；診斷修正版 `11/11 PASS`、exit 0。覆蓋有／無 error event 的斷線、錯誤 grant／SQLSTATE、未拒絕執行、role leak、rollback／close／connect failure。這些是 deterministic mock controls，僅證明錯誤保存、隔離與 fail-closed，沒有本機 PG／HTTP 實測，不代替 real-PG 驗收。
- wrapper 的 `cleanup-identity`／`cleanup` marker 存在，但最後 `[REDACTED_ERROR]` 不足以辨認 cleanup 自身是否成功，故 resource cleanup 仍 NOT_VERIFIED；後續 browser gate SKIPPED。未原樣 rerun 紅燈 CI。下一步：新 exact diff 獨立審查與原發布 gates 後，沿已批准 CI-first 路徑在既有隔離 CI 實跑診斷修正版，確認三案、fixture 清理與後續 browser；新 CI 終局前維持 Draft／HOLD，不 merge、不動 shared TEST／Production。
- 首輪 fresh source 審查另以19項邊界 controls 得到18 PASS／1 FAIL：close後仍掛著的收集 listener 會靜默接收 callback 結束後的晚到 error。保留該 finding；最小修正是在 close 完成後移除該 collector，讓後續未處理 error 顯式失敗，不假稱這是 PostgreSQL 原始斷線根因。

## 2026-10-07 16:00 Asia/Taipei owned-PG 有界診斷，runtime 根因仍 UNKNOWN

- 診斷修正版遠端 head `60eccffdca05efaaabaa7ea616414f9d3bb22b03` 的 [baseline 37588456201](https://github.com/smallwei0301/tour-platform/actions/runs/37588456201/job/112683979421) 再次在 anon／execute phase 回 `Connection terminated unexpectedly`、無 SQLSTATE；前十案 PASS，獨立 fixture client 也斷線。兩次真 CI 已重現，沒有原樣 rerun 或推測性 ACL／SQL 修改。
- 本段經 Commander／主對話接受有界診斷計畫後，才擴至非凍結 runner／其 unit／本 worklog 三檔；先前「runner 不改」保留為當時階段邊界。核對 runner／unit 與 main `8841776` blobs 一致，其他十五個 open PR 無路徑重疊，三路徑 file-guard PASS。Builder requested `gpt-6.1-sol`、actual `unknown`，before PASS 時序另保留；不冒稱模型身分已驗證。
- 只在 child failure、fresh cleanup-identity 對既有 captured IDs／names／labels 與全部已採納 resource classes 比對成功後、原 owned-resource stop 前讀恰一個 DB immutable 64-hex ID。DB 缺失／重複／identity drift 或 probe error 不讀；cleanup ownership gates／cleanup 順序不變，diagnostic failure 不取代 primary 或阻止 cleanup。
- Docker logs 固定最近 10 分鐘／tail 100、5 秒 hard timeout、stdout＋stderr 合計最多保留 32 KiB raw bytes；timeout 即終止讀取、釋放 pipe 並回固定 unavailable marker，不等待 close event 才准 cleanup。既有 commandRunner 的新 bounds 為 opt-in，原其他指令維持無 timeout／無 output cap。
- 輸出只含固定 crash signal／exit／recovery event 名與 1–100 計數、output-truncated／no-events／unavailable marker。先沿既有 redaction，再完整錨定 event allowlist；raw logs、SQL／STATEMENT／DETAIL／CONTEXT、user／database／host／PID／timestamp 值、env／credentials／connection URL 不寫出。未知格式、窗口外或被截斷的事件仍可能漏識別；no-events 不代表無 crash，也不證明 ACL 的因果根因。
- 只讀官方同 pin tag 原始碼核實 prefix：supabase/postgres `17.6.1.104` [postgresql.conf.j2](https://github.com/supabase/postgres/blob/17.6.1.104/ansible/files/postgresql_config/postgresql.conf.j2#L509) blob `948135ef1e7668b72a2c5ee7bcdd88fa81c59727` 定義 `%h %m [%p] %q%u@%d `／UTC；[Dockerfile-17](https://github.com/supabase/postgres/blob/17.6.1.104/Dockerfile-17#L129) 複製該 config 與 collector-off stdout config。CLI `v2.87.2` 的 db/start 使用 `postgres -D /etc/postgresql`。以 mock 覆蓋 default、空 host、IPv4／IPv6／local／host＋user@db prefixes，全部 prefix 值不輸出；未 rebuild image 或驗 runtime overrides。
- 新 controls 首輪真 RED `2 PASS／6 FAIL`→GREEN `8/8`；核實 pinned prefix 後新增一案真 RED `0 PASS／1 FAIL`，修後 canonical Node `22.23.1`／原 `run-checks.sh` 完整 runner unit `70/70 PASS`、exit 0。包含 bounds 的 mock process controls（timeout 不靠 close event）、固定輸出／leak negatives、drift／missing／ambiguous 拒絕、primary／cleanup 保留及 reporter failure；既有 unit 純 loopback mock cases 也實跑，沒有 Docker／DB／外網連線測試。
- 三個 ACL／其他 integration source 與原前十案 bytes 完全未改；workflow／migration／app runtime／pins／credentials／權限／DB 不改。尚待 exact diff fresh independent review、原完整發布 gates、自然隔離 real-PG CI 與 cleanup／browser 終局；本段沒有 commit／push／Work／merge／部署，不把 source unit PASS 稱完整驗收。

## 2026-10-07 17:42 Asia/Taipei 固定隔離 PG runtime override，real-PG gate 仍 HOLD

- Owner 09:07:31 UTC 原文「批准」，核准只調整隔離 PostgreSQL 修正版及必要啟動／清理設定。原 [baseline 37593597093/job112700716708](https://github.com/smallwei0301/tour-platform/actions/runs/37593597093/job/112700716708) sanitized log 實證 `backend_signal_11=1`、`terminating_backends=1`、`reinitializing=1`；前十案 PASS，anon 真 EXECUTE probe 導致斷線，ACL／fixture after FAIL、後續 browser SKIPPED。保留原失敗，不更改 ACL、SQL 或既有 integration bytes。
- 官方 ECR registry metadata 真回讀且按 bytes 核 SHA256：候選 `17.6.1.143`，index `sha256:80d7b27c3e8d77cfa7226eee9508671796da214781ff15a35b3670d7ad5ee453`，linux/amd64 manifest `sha256:b021e96054128399f84f24e39d29c21ee7c7169515e5d9e4e99ff15d5043d1d8`，config image ID `sha256:2d3ac69ad5c95d81458cc93a6cc6c31a98dfa00cd28f88a0a9358d315e1c357a`。僅讀 metadata，未下載 layer、執行 image 或本地 DB。官方 [CLI v2.87.2 config.go](https://github.com/supabase/cli/blob/v2.87.2/pkg/config/config.go#L645-L648) 已支援 `supabase/.temp/postgres-version`，不需升 CLI；官方 [supautils 修復確認](https://github.com/supabase/supautils/issues/196#issuecomment-4570661807) 提供修復來源，但候選 runtime 仍未驗，不據此宣稱 crash 已修好。
- 九檔有界修改：新增唯一 `issue1894-pg-supautils-3.2.2` profile，綁原 toolchain lock SHA256 `f9c9daabfb47d48d074d79d6d0ef7c8749c262fc1c1d500d75682ef4dc24f094` 與上述完整 image tuple；未知 profile、額外欄位、tag／digest／ID／arch／repository／role／lock drift 全拒絕。原 lock、CLI 2.87.2、供應 request、package locks、capture／cutoff／ledger／expected artifacts、migrations 與 ACL integration 283 項 immutable hashes 逐檔回比全不變。
- 只有明示 profile＋原 exact `--api-real-auth apps/web/tests/integration/midao-issue1814-checkout-idempotency-real-auth.test.mjs` 可選候選；其他 modes、檔案、重複 test 與任意 profile 拒絕。materializer 建立 owned 0700 `.temp`／0600 `postgres-version`，內容精確 `17.6.1.143` 無換行；每次 CLI invocation 前檢查 bytes／inode／owner／mode／inventory，symlink、外來 metadata 與替換路徑 fail closed，cleanup 只刪相符 owned identity。
- 候選 digest 及 CLI tag 在兩次 DB 啟動前均核 linux/amd64／image ID／RepoDigests；兩次實際 DB container 核 immutable ID、name、labels、image ID、Config.Image 與 running state，通過才跑 bootstrap SQL。重用原 ownership capture／cleanup，不以新 image 檢查阻斷對已核 owned 資源的清理；既有 crash 診斷與 raw-log redaction 完整保留。
- 固定 candidate lane 在原 exact replay 後、seed／fixtures 前重用既有純讀 `extractLocalTerminalAndHistory`，與已驗 trusted expected manifest 比對 normalized catalog digest 與完整 history；任一差異或讀取失敗回 `RUNTIME_DB_CATALOG_HOLD`，不更新 expected／capture，不忽略 extension／ACL 差異。default lanes 不新增 catalog read；dynamic import 保留既有 builder → runner 依賴方向。
- workflow 只改既有 provisioning 與原 #1814 命令兩個 steps，原 builder 及其他 runtime lanes 仍使用舊 pin。#1890 09:31 UTC 真核仍 Draft head `a07432f7dcb77b61509688d4942934f9a24ccac2`，其 actual workflow patch只有頂端 confirmation path；本 diff 的 trigger／permissions／concurrency prefix 原 bytes 不變，`git apply --check` 真 exit 0 證實 #1890 patch仍可套入，未吸收、代收尾或 merge 該 PR。
- canonical Node `22.23.1`：首六組新 mock controls 真 RED `0 PASS／6 FAIL` → GREEN `6/6`；workflow 與 catalog 各另有真 RED `0/1`；加上自動 cleanup 回歸共九組 `9/9 PASS`。原三 unit 完整 `112 total／109 PASS／3 FAIL／0 SKIP`，三個 FAIL 與原 `103 total／100 PASS／3 FAIL` 基準相同：固定 CLI 缺檔、`/usr/bin/docker` 缺檔、Perl identity mismatch。未安裝、改身份、skip 或放寬 lock 來洗綠。
- 可執行原 canonical `run-checks.sh` 的 materializer／runner／workflow units `94/94 PASS`；既有 portable infrastructure `210/210 PASS`、無 skip。這些是 source／mock 契約，不是 host-bound、真 PostgreSQL、HTTP 或 browser 驗收；ordinary `--all` 本來不含本批 infrastructure，也不能替代。未啟 full npm／typecheck／lint／app build，本機 heavy slot 由 controller 另案保留。
- 本 Builder requested `gpt-6.1-sol`、fresh `fork_turns=none`、actual `unknown`；原派送容量失敗保留，由 controller 真 before PASS 後 fresh retry接手，沒有把派送預期當成功或模型身分證據。尚待 final exact diff 全新獨立審查、原完整發布 gates、自然隔離 CI 的候選全部十一案／catalog／fixture cleanup／後續 browser 終局。本段沒有 commit／push／Work／merge／部署、shared TEST／Production、憑證／權限／網路或付費資源變更；候選未驗前維持 Draft／HOLD。
- Rollback 使用正常 revert 移除明示 runtime profile；原 default／capture bytes 維持不變，只清 identity 相符的 owned 資源，不觸碰 shared TEST／Production。


## 2026-10-07 18:03 Asia/Taipei 候選 Docker executable／daemon binding 修正，real-PG gate 仍 HOLD

- Fresh independent source review 保留一項 P1：固定 `/usr/bin/docker`／Unix socket preflight 通過後，候選 adapter 仍承接相對 `docker`、ambient PATH／DOCKER_HOST／DOCKER_CONTEXT，CLI 與 cleanup 也可能轉向別的 executable／daemon。原無網路 counterexample 1/1 真重現，未將 witness PASS 當產品驗收。依同一 Owner 已批准隔離 runtime override 範圍修正，不擴至其他 lanes。
- 本段只增修 runner／其 unit／本 worklog；candidate adapter 唯一 invocation boundary 使用原供應契約的 `FIXED_DOCKER`，每次 child env 固定 `PATH=/usr/bin:/bin`、`DOCKER_HOST=unix:///var/run/docker.sock`、`DOCKER_API_VERSION=1.43`，移除其餘全部 ambient `DOCKER_*` selectors（含 context、TLS／cert、config、custom headers）。固定 CLI 內部查找 Docker 也使用此 PATH／endpoint；status、兩次 startup、image／container／resource identity、health、bootstrap、bounded diagnostics 與 owned container／network／volume cleanup 全走同一 boundary。cleanup 不承接 capture 後改變的 ambient selectors；原 signal／diagnostic bounds／ownership 斷言保留。
- 原 exact API real-auth lane 的實際 API server／integration child env 也使用同一有限 sanitizer；不修改 parent `process.env` 或任何持久系統／網路設定。未選 profile 時回傳原 environment 且保持原 command／options，既有 default adapter 全部契約真回歸 PASS；profile 常數／image tuple／materializer／workflow bytes 沒有本段增改。
- canonical Node22 `22.23.1` 的兩組新 runner mock regression 真 RED `0/2` → GREEN `2/2`；外部實際 harmless child／PATH trap 另證修前錯誤 executable 被接受並抵達刻意攔住的 CLI boundary（RED `0/1`），修後因固定 Docker 本機缺檔安全拒絕、沒有執行 PATH trap（GREEN `1/1`）。加上真正無網路 child env 傳遞為 `2/2 PASS`；首輪外部 before-source fixture 漏一個常數的 harness error 另保留，不當產品 RED。沒有執行 Docker、CLI、SQL、DB 或 image pull。
- 原 canonical `run-checks.sh` materializer／runner／workflow targeted `96/96 PASS`；原 portable infrastructure `212/212 PASS`、既有 independent negative controls `20/20 PASS`，均無 skip。完整三 units `114 total／111 PASS／3 FAIL／0 SKIP`：固定 CLI 缺檔、`/usr/bin/docker` 缺檔、Perl identity mismatch 與原三項 host-bound failures 相同，沒有新增 FAIL，也沒有 skip／修改身份洗綠。
- 再逐檔回比 immutable manifest 的 `283` files，drift `0`；另獨立比較全部 `24` tracked integration files 對 HEAD bytes，drift `0`。283 manifest 本身不包含這 24 個 integration，兩份證據分開記錄。原 lock／capture／SQL／ACL EXECUTE 與 role restoration 不變。#1890 已核 actual workflow patch 對目前候選 `git apply --check` exit `0`；本段沒有修改 workflow、套 patch 或吸收其 ownership。
- Binding Builder requested `gpt-6.1-sol`／actual `unknown`，真 before PASS `09:54:02.661Z` 在 fresh dispatch 前；不把本機 receipt 當 runtime 身分證據。本段尚待新的 exact diff fresh independent review、controller 排定 full／lint／typecheck／true app build／原 staged 發布 gates，以及自然隔離 CI exact head 的候選 image／十一案／catalog／fixture-resource cleanup／後續 HTTP-browser 終局。source／portable／harmless child PASS 不替代這些 gate；仍 Draft／HOLD。本段未 commit／push／Work／merge／部署、shared TEST／Production、憑證／權限／網路或付費變更。

## 2026-10-07 18:38 Asia/Taipei 候選 catalog HOLD 的有限安全診斷，real-PG gate 仍 HOLD

- Controller 本輪真核 remote head `1b3971ab7f38d6c899a19bb5c4a3740618c28df3` 與 clean local `e6fd278cdac730196b554f980ab17f09d22e50f7` tree 同為 `1c0dd62de4d05cf83612e6093fb38eb7d53420ac`。自然 [baseline 37606628688/job112743581091](https://github.com/smallwei0301/tour-platform/actions/runs/37606628688/job/112743581091) 在 candidate 啟動後、`on-ready` 的 catalog gate 回 `RUNTIME_DB_CATALOG_HOLD`，尚未 seed／fixtures／十一案；一般 [CI 37606628780](https://github.com/smallwei0301/tour-platform/actions/runs/37606628780) SUCCESS 不替代 real-PG 驗收。Controller 已查完整 job log 與 run artifacts：只有原 expected-terminal builder artifact `11475142673`，沒有 candidate catalog artifact 或 extractor 細節；目前不能判定是真 catalog／history drift、extractor 拒絕或其他讀取失敗，不能宣稱 ACL／crash 已修復。
- 本段只改 runner、其 unit 與本 worklog，三路徑寫前 file-guard 全部 exit `0`。重用既有 `reportStage`，candidate 每次 check 最多一行固定 `runtime-db-catalog` metadata：phase 限 `expected-contract`／`local-connection`／`extract-terminal`／`compare-terminal`／`compatible`，extraction success 表示 extractor 是否正常回傳；SHA256 只保留已驗字串／Buffer 實算 digest，history 只保留 equality 與 finite integer count，缺資訊固定 `unavailable`。
- extractor reason 只以六個既知完整固定 error 訊息映射 `psql-child-failed`／`psql-stderr`／`output-limit`／`catalog-framing`／`extractor-history`；未知或附帶文字一律 `unavailable`。不輸出 raw catalog／SQL／row／canonical names、connection URL、env、stack 或原始 error。原 expected contract、catalog digest 與完整 ordered history 的 HOLD 比對不變，沒有更新 expected／capture 或忽略 extension／ACL；比較後 Buffer 原樣清零。
- 可選 history metadata 比較限定最多 `10,000` entries、每個字串最多 `64` 字元，拒絕 nonfinite／非數值 count 與 serialization hook；超出只缺 metadata，原 gate 不放寬。所有 metadata／同步或非同步 reporter 拒絕均隔離，不能取代原 HOLD、把 PASS 變 HOLD 或阻止 identity-bound owned cleanup。default invocation 不新增 catalog read 或 diagnostic line，沒有新 extractor／shell／通用 framework。
- canonical Node `22.23.1`：八組新 controls 真 RED `0/8` → GREEN `8/8`；補 finite-count／bounded metadata 兩組真 RED `0/2`，最終新 controls `10/10 PASS`。原 `run-checks.sh` runner 全檔 `88/88 PASS`，materializer／runner／workflow targeted `106/106 PASS`，均 exit `0`、沒有 skip。涵蓋 valid pass、各 fail phase、known／unknown extractor errors、wrong catalog digest、同數量但不同順序／值的 history、malformed／no-secret negatives、main reporter wiring、Buffer wiping，以及同步／非同步 reporter throw 後仍保留 HOLD 與 owned cleanup；純 mock／既有 loopback，不是實際 PostgreSQL 或 browser 驗收。
- 再逐檔實比 `283` immutable hashes，drift `0`；另全部 `24` tracked integration files 對 HEAD bytes，drift `0`；workflow bytes 對 HEAD 不變。原 image/profile/lock、ACL／grant、capture／ledger／history 與 default lanes 不改。本 Builder requested `gpt-6.1-sol`、fresh `fork_turns=none`、actual `unknown`，dispatch 前 PASS `10:29:57.273Z`。本段沒有 DB／Docker／image pull、Work、commit／push／merge／部署或新增權限／憑證／網路／付費資源；尚待 final exact diff 的 fresh independent review、controller 原完整發布 gates，以及帶本診斷的自然隔離 CI exact head 終局，不做無變更 rerun。

## 2026-10-07 18:50 Asia/Taipei catalog diagnostic 三項 source-contract 修正

- 前版三檔 exact diff `e4a86ad2e145b1de69f2c0b702d152548cb4059c720e20f171e67abc57a25448` 的 fresh independent review 為 `FIX_REQUIRED`：19 controls／15 PASS／4 FAIL，四個 FAIL 對應三項 finding。保留此前測試與審查，不以正常 JSON／同步 reporter 的通過掩蓋 helper 契約反例；這些是構造 caller inputs，尚無證據顯示自然 CI 的 main 收到 accessor manifest 或 async reporter。實際 main 的 expected manifest 來自既有 JSON verifier，reporter 是同步 stderr 寫入。
- 本次僅沿原 runner／runner unit／本 worklog 三路徑修正，寫前 file-guard 全 exit `0`。expected metadata 捕捉原 contract guard 已讀的 digest／history／length，comparison 讀 expected history 時保留該 operand；不在 verdict 前增加 expected getter reads，也不新增一般 object validator。兩個舊版 HOLD witness 修後仍 HOLD，digest getter 維持原 `2` 次、history getter維持原 `3` 次；原 regex、Buffer digest、JSON ordered history 的 guard 與 short-circuit 次序不放寬。
- diagnostic reporter 改為同步呼叫後立即附 rejected-promise handler，不 await 返還值；同步 throw 與非同步 rejection 仍隔離。never-settling Promise control 在 reporter 尚未 release 時，原 HOLD、Buffer 清零與 identity-bound owned cleanup 已終局，不加 timer 或 logging framework 到 runner。
- optional history metadata 用原有限 count 逐 index 確認 own entry 與 bounded string；sparse holes 的 equality 固定 `unavailable`，保留 finite count。此項只修 metadata，原 JSON comparison 對相同 sparse arrays 的既有 verdict 不變，也不改 real JSON 行為。
- canonical Node `22.23.1` 四個回歸真 RED `0/4`、exit `1` → GREEN `4/4`、exit `0`，全部 skip `0`。原 `run-checks.sh` runner／materializer／workflow 三檔 `110/110 PASS`、exit `0`、skip `0`，其中 runner `92/92`；只用既有窄 `UNDICI-EHPA` warning filter、mock 與 loopback。再核 `283` immutable／drift `0`、`24` tracked integration／drift `0`，只有原三路徑 diff。
- 修正 Builder requested `gpt-6.1-sol`／fresh `fork_turns=none`／actual `unknown`，真 before PASS `10:45:10.642Z`；本次未執行 full npm／type／lint／app build、DB／Docker／image pull、Work 或發布動作。修後 exact diff 仍待 fresh independent review 與 controller 原完整發布 gates。自然 CI `37606628688` 的 `RUNTIME_DB_CATALOG_HOLD` 根因仍 `UNKNOWN`，十一案／fixture-resource cleanup／後續 HTTP-browser 終局未驗，維持 Draft／runtime HOLD。

## 2026-10-07 19:21 Asia/Taipei extractor 全契約固定 reason mapping，real-PG gate 仍 HOLD

- 新遠端 head `b4cf9695373197b00e8df2bdb13cd30b0e6350c8` 的自然 [baseline 37610744935/job112757116933](https://github.com/smallwei0301/tour-platform/actions/runs/37610744935/job/112757116933) 於 `11:01:28 UTC` 回 `phase=extract-terminal`、`extraction_success=0`、`reason=unavailable`；expected digest 有值、actual catalog／history 未回傳。Controller 核對完整 log／artifacts，只有舊設定的 expected-terminal builder artifact，沒有 candidate 原始 diagnostic。原 cleanup-identity／owned cleanup 已返回，只留下原 HOLD，無 aggregate cleanup error；這不替代 host 資源盤點。十一案全部 `NOT_RUN`，候選 PG 修復、catalog 相容與後續 browser 仍未驗。
- 此段只增修 runner／其 unit／本 worklog，三路徑寫前 file-guard exit `0`。11:10 UTC main 仍 `8841776809e576fabf88bdc2046c70003c5a25dc`，11:12 UTC 其他十五個 open PR 的 actual changed filenames 對三路徑 overlap `0`；#1890 head／ownership 不變。Builder requested `gpt-6.1-sol`、fresh `fork_turns=none`、actual `unknown`；真 before PASS `11:10:47.566Z`。
- 完整逐讀原 `extractLocalTerminalAndHistory` → fixed extractor → raw validator／normalizer／normalized validator → migration history client 的錯誤路徑。原六訊息未包含 timeout、UTF-8、options／connection contract、raw keys／state／sections／duplicate JSON 或 canonical keys、routine definition、normalized／terminal contract，以及底層 spawn／temporary HOME filesystem／PG client-query-close failure；以上任何一條都可能先前回 `unavailable`。現有 CI 無原始 error 或 candidate catalog，無法判定是哪條，根因保持 `UNKNOWN`，未擴改 extractor 或推測性修正 SQL／ACL。
- 新 helper 限錯誤 message 為 string 且最多 `4096` 字元；固定訊息精確比對，動態部分只用對應已知 source grammar 的完整錨定 patterns，含空／多行／NUL key，固定 section／missing-key slot 另限原 enum。底層 exception 只認有限已知 Node code＋syscall 或 SQLSTATE，輸出永遠為固定 reason enum；不輸出 dynamic suffix、原 code、private path、catalog／canonical names、SQL／connection／server message、stack 或 cause。未知訊息、未知碼、超長 dynamic message、hostile metadata getter 均保留 `unavailable`；不新增遞迴 cause 展開或通用框架。
- 僅替換 `extract-terminal` catch 內的 diagnostic classification；原 expected getter reads／guard／hash／ordered history comparison／short-circuit 次序、`RUNTIME_DB_CATALOG_HOLD` 原 cause identity、Buffer 清零、同步／非同步 reporter 隔離與 identity-bound owned cleanup 不變。reason 不參與 verdict，不更新 expected／capture，也沒有重試未知 extractor failure。
- canonical Node `22.23.1` 八組新 controls 修前實跑 `1 PASS／7 FAIL`、exit `1` → 最終 `8/8 PASS`、exit `0`、skip `0`；構造 fixture／cleanup call 標記的首版錯誤另留證據，修正後才記上述正式 RED。source 邊界補核保留 `6 PASS／2 FAIL` 再 GREEN `8/8`，包含空 key 與依現存 PG package source 修正 SASL mechanism 順序。原 `run-checks.sh` runner 全檔 `100/100 PASS`；runner／materializer／workflow／extractor／normalizer／expected-terminal builder／catalog comparator 七檔 `148/148 PASS`，均 exit `0`、skip `0`。首次 targeted path 名稱錯誤被 hook 拒絕，未產生測試證據；更正為既有檔名後才實跑。測試只用 mock、既有 temporary files 與 loopback，沒有實際 DB／Docker／HTTP-browser 驗收。
- 全部 `283` immutable hashes 逐檔回比 drift `0`，全部 `24` tracked integration files 對 HEAD bytes drift `0`；全部 `3143` tracked files 對開工 snapshot 亦只有原三路徑改動。extractor／builder／SQL／default profiles／expected／capture／原十一案／workflow 全 bytes 不變。此段沒有 full npm／type／lint／app build、DB／Docker／image pull、外網、Work、commit／push／merge／部署、憑證／權限／網路或付費資源變更；尚待修後 exact diff fresh independent review、controller 原完整發布 gates，以及新自然隔離 CI 的候選 catalog／十一案／fixture-resource cleanup／後續 browser 終局，不做無變更 rerun。

## 2026-10-07 19:55 Asia/Taipei 同次 extraction 的安全 catalog metadata，real-PG gate 仍 HOLD

- 最新候選 remote head `377160ef462da349616cce29deafa78eea56fac1` 與 clean local `dbed591b3ee33254e5db3b7e9b544f0f0f0696cd` tree 同為 `48ff1197c8adfc231c933c1ecc0d30fca7333d27`。自然 [baseline 37615065620/job112771309378](https://github.com/smallwei0301/tour-platform/actions/runs/37615065620/job/112771309378) 於 `11:40:15 UTC` 回 `phase=extract-terminal`、`extraction_success=0`、`reason=terminal-catalog`；actual digest／history 未回傳，十一案 `NOT_RUN`。原 helper 的 `parseJson` 固定 4MiB 拒絕可由純 mock size witness 重現，但 candidate 真 bytes 尚未量得，不能將 size 假說寫成已確認根因。owned cleanup 已返回且只有原 HOLD，仍無 post-delete host 資源盤點。
- 本段只改 runner／原 runner unit／本 worklog，三路徑寫前 file-guard exit `0`；11:12 UTC 已核其他十五個 open PR 對三路徑 overlap `0`。Builder requested `gpt-6.1-sol`、fresh `fork_turns=none`、actual `unknown`，dispatch 前真 PASS `11:47:41 UTC`。source 新增使用原 builder 的 `extractCatalogAdapter` seam，將 helper 產生的同一 connection options 原樣交給原 `extractCatalog`，只捕捉 raw reference 並原樣回傳；原 SQL extractor 執行一次、原 ordered history SQL 次數不增，沒有另一個 extractor／catalog 邏輯或新 expected read。
- 原 helper 的 normalization／validation／verdict／cause 完成後，才用同一 frozen `normalizeCatalog` 做非 throw metadata pass，避免在原錯誤前增加 raw getter reads。actual default helper 最多另發一行固定 `runtime-db-catalog-observation`：normalized byte count／SHA256 與全部十九個固定 section 的 count／SHA256；section digest 精確為 `SHA256(JSON.stringify(normalizedSectionArray))`。不輸出 raw catalog／SQL／canonical keys／row data／error text／connection credentials，unknown／malformed input 固定 `unavailable`。normalized hashing／JSON parse 限 32MiB，section serialization／hash 同限；輸出固定 forty fields、少於 2500 字元。這個限制只約束診斷，原 4MiB verdict guard bytes 不變。
- observation／reporter 的同步 throw、非同步 rejection 都隔離，never-settling reporter 不 await，原 HOLD cause identity／Buffer wiping／owned cleanup／reason taxonomy／expected compare 均維持。undefined runtime profile 不新增 extraction 或任何 diagnostic；注入 `extractTerminal` 的原 helper 契約及既有 diagnostic line 保持不變。
- canonical Node `22.23.1` 五組新 source/mock controls 真 RED `0/5`、exit `1` → GREEN `5/5`、exit `0`、skip `0`。保留 real frozen helper／normalizer，以 mock extractor 與 fake PG client 證明小型 valid raw 的 extraction args／raw identity、每 section count／hash、normalized >4MiB 在 history client 建構前回原 terminal-catalog HOLD、malformed／unknown raw／throwing accessor 的原 cause、observation throw、oversize metadata bounds／no-leak，以及 reporter throw／reject／pending 後仍 owned cleanup。這些是純 mock／既有 loopback 控制，不是 candidate DB／HTTP／browser 驗收。
- 原 canonical `run-checks.sh` runner 全檔 `105/105 PASS`；runner／materializer／workflow／extractor／normalizer／expected-terminal builder／catalog comparator 七檔 `153/153 PASS`，均真 exit `0`、skip `0`。首次 targeted materializer path 誤名被 hook 拒絕、未執行測試，其拒絕證據保留；更正既有路徑後才取得上述測試證據。全部 `283` immutable hashes drift `0`、全部 `24` tracked integration bytes drift `0`；原已存在 unit assertions 逐 bytes 保留。builder／extractor／normalizer／4MiB guard／image profile／expected／capture／SQL／workflow／原十一案不變。
- 本段未執行 full npm／type／lint／app build、DB／Docker／image pull、外網、Work、commit／push／merge／部署或憑證／權限／網路／付費資源變更。修後 final exact diff 尚待 fresh independent review、controller 原完整發布 gates，以及自然隔離 CI 量得 candidate normalized bytes／sections 的單次完整 evidence；候選 catalog／十一案／fixture-resource cleanup／後續 HTTP-browser 終局仍 HOLD，不做無變更 rerun。

## 2026-10-07 20:39 Asia/Taipei DB-only catalog 比較階段 R1，候選 runtime 仍 HOLD

- 自然 [baseline 37619691489/job112786526708](https://github.com/smallwei0301/tour-platform/actions/runs/37619691489/job/112786526708)、exact head `678308f5e4df64b4e04e03521cc765d96a5a0a09` 量得 normalized `4487334` bytes／SHA256 `ecdbaf9a2cc9f52153904d3ec1005ce715c7f381ccb7a646e22415e080879b84`，expected `3543578`／`fae55eb02ee2dd6201952ea7002e863f1fbd56b392751404e553bd3afc42695f`；十九 sections 中十三項不同，managedSchemaInventory `225→1118`。原 4MiB guard 在 history 前 HOLD，十一案 `NOT_RUN`。source 已證原 builder 在 DB-only replay 後 extract，候選此前在 GoTrue／Kong／PostgREST 啟動後 replay 才比較；image compatibility 尚未證實，不放寬大小、hash／history 或更新 expected。
- 本段只改 runner／原 runner unit／本 worklog；寫前 file-guard exit `0`。既有 invocation／lock 下新增 private Symbol 限定的原候選 profile catalog preflight：使用不同 owned parent、同 canonical project basename、原 `db start`→原 frozen replay→原完整 catalog guard→原 owned cleanup→原 readonly residue probe→replay restore／metadata／workdir cleanup。全部終局成功才重新 materialize 原 fullServices real-auth lifecycle；不在 Auth 啟動轉換途中 replay、不在 Auth-started catalog 重比 DB-only expected。任一第一段或 cleanup failure 都阻止第二個 workdir；primary／cleanup AggregateError 保留。
- 原候選 image digest／imageId、fixed Docker executable／socket／environment、metadata、actual-container 與三類 ownership 防線兩段沿用；default lane 不新增 preflight／catalog reads。原 fullServices start／handoff、seed→十一案→cleanup body、原 catalog helper／4MiB guard、expected／capture、SQL、profiles／pins／workflow bytes 不變。既有非同步 PG error-event／process termination 的清理證據限制保留，未聲稱此 R1 修復該限制。
- canonical Node `22.23.1` 八組新 controls 真 RED `0/8`、exit `1`→最終 GREEN `8/8`、exit `0`、skip `0`；補強三類 fixture 時曾 `1/8`，原因是 mock 多比被原 ownership normalizer 移除的 volume driver／scope，只修 fixture 後恢復綠燈。該次 raw log 被 final GREEN 覆寫，中途失敗仍如實記錄；沒有重建假 raw log。
- 原 `run-checks.sh` runner 全檔 `113/113 PASS`；runner／materializer／workflow／extractor／normalizer／expected-terminal builder／catalog comparator 七檔 `161/161 PASS`，兩次真 exit `0`、skip `0`。controls 執行原 main／runWith lifecycle source 搭配 mock 外部 I/O，另以真 temporary filesystem 核 distinct owned parent 及完整移除；不是候選 DB／HTTP／browser 驗收。
- 全 `283` immutable hashes drift `0`、全 `24` tracked integration bytes drift `0`；既有 unit assertions prefix 逐 bytes 未變。未執行 full／type／lint／build、DB／Docker／image pull、外網、Work、commit／push／merge／部署或憑證／權限／網路／付費變更。修後 exact diff 仍待 fresh independent review、controller 原完整發布 gates 與新自然 CI 第一段 compatibility＋十一案＋owned cleanup 終局；目前 runtime 保持 HOLD。
