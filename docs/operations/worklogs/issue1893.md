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
