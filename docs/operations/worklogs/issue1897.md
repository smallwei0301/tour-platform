# #1897 — expected-terminal 安全錯誤原因診斷
> 2026-10-08 UTC｜Source 已交付；整體 merge／release HOLD，依賴 #1887

## 目標
在既有 #1887 runner／tests／docs ownership 下，保留 CLI 的 AggregateError.errors／cause 安全分類。底層 materializer 舊失敗原因仍未確認；舊 patch／session32697 保持 UNKNOWN。
本檔記錄已測 source head `ead04e41c21ab78203098aa203b065205617a64d`／tree `5d7ee4156e78aa3da171cf5c1664a1de51739f7e`；base `da679334862a54a5d4d20dd5858b1a74728c0e62`。後續 docs-only head／CI 另依實際回執，不倒填為本 source 的已測 SHA。

## AC 清單
- [x] 真 published handler／validator／parser 的 RED→GREEN；固定分類、敏感尾文省略、depth4／node16、cycle及非零 exit 保留
- [x] 三個 code blobs／229+/1− 經 fresh 獨立 exact-diff review PASS-in-scope、source findings0；10/10 回歸，actual model unknown
- [x] 官方 pinned Node22.23.1 archive／file／symlink digest驗證；正式 full5909 total／5906 PASS／0 FAIL／3既有SKIP＋typecheck、builder module-import12/12、literal staged8/8／check-only、lint0errors／1既有warning，全為真exit0
- [ ] Parent #1887／產品、merge、release、Production gates：依原流程保持HOLD

## 已完成
[Draft #1897](https://github.com/smallwei0301/tour-platform/pull/1897)只含三檔診斷 source，明確 stacked 依賴 #1887，原 #1887 branch未改。Patch SHA256：`93066161be6f9c9a6713b5630d054a126bc5cfa42dbca9cd574b1d60ea963c16`。
新自然 CI actual checkout皆綁 merge candidate `ccced657f5d12952efa83d71702ba4a02003c4cd`／上述相同tree，以下四workflow均SUCCESS，未手動rerun：
- [Source 37721437901](https://github.com/smallwei0301/tour-platform/actions/runs/37721437901)：5909／5906 PASS／0 FAIL／3 SKIP，lint／typecheck、build234/234、ISR／preflight SUCCESS；preflight重跑不重複加總
- [Baseline 37721437874](https://github.com/smallwei0301/tour-platform/actions/runs/37721437874)：infra190/190；browser52 passed＋1 flaky，midao-services.spec.ts:117初輪page.goto 180s timeout，workflow retry#1於7.5sPASS；manualLINE2/2、legacylogin3/3，Phase4／Package4 stepSUCCESS，redacted數字不猜
- [Secret 37721437907](https://github.com/smallwei0301/tour-platform/actions/runs/37721437907)與[migration drift 37721437891](https://github.com/smallwei0301/tour-platform/actions/runs/37721437891) SUCCESS
Baseline可見complete／cleanup-identity／cleanup及post-job SUCCESS，未見cleanup failure；不據此宣稱所有外部資源已獨立盤點。新expected-terminal build PASS不改寫舊materializer FAIL或歸因其原因。

## 下一步
本文件是D7 repo側錨點；PR側以本次新milestone Conversation回執追溯。Docs-only新head的自然CI另核；維持Draft，不具備獨立main merge條件，parent及release gates保持原狀。
## 絕不重做
保留published-source RED、v1 review兩項反例FAIL、current-main舊consumer格式拒絕、錯誤CLI flag／未stage測試拒絕等歷史。三個code blobs不因本文件修改；不重啟32697、不改pin／guard／舊測試、不碰DB／共享TEST／Production／Work／憑證或權限。
