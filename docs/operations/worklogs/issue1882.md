# issue1882 — 活動詳情未來場次與日期補證
> 最後更新：2026-10-02 09:27 Asia/Taipei｜歷史施工 requested=gpt-6.1-sol，actual=unknown；整體進行中／HOLD

## 目標
在既有 Draft #1883 補持久 QA、backend-mocked 真 Chromium 證據及 Owner 新授權的 F3 civil-date 修復。歷史基準 `c9b83112f8205aab22a082fe5551e55ed822fdf0`；目前產品 source `ef491d299d1b428ef9360a2f2d9d1ca87bd0975e`。不把 local 或窄 Preview PASS 當 Production sign-off。

## AC 清單
- [x] helper 8/8＋真 DatePicker SSR 7/7，正式 targeted 15/15＋typecheck。
- [x] local mocked SSR/sidebar/CTA 過期排除、empty fallback、nonempty capacity/query；原三 E2E cases正式通過。
- [x] local CalendarModal CTA identity/raw href、正常 Tab/Shift+Tab、April完整33格／aria／選取摘要；mobile bottom CTA 同步。
- [x] local LA/TPE Oct1四／Oct5一、today enabled、Monday grid／非sun/sat、summary與 exact plan/date/scheduleId；午夜兩側 fresh documents。
- [x] client availability／ISR 邊界唯讀核對；強 API/cache 時限保證不在已驗範圍。
- [x] exact source CI／secret／舊 smoke 與獨立 local E2E；Preview Oct5 F3 窄驗 PASS。
- [ ] main autoflow／Production exact-head QA、其他必要 gates與正式 sign-off；issue尚不關閉。

## 已完成（附證據）
- 本次環境恢復回讀：兩檔未提交文件的原 diff SHA256 為 `7ed1fcbcc7501085c90f5e4d930690ebafa2aeff24f6ac558ea012ad069f9e0b`，與上輪交付一致。以下 `/tmp` 路徑是歷史證據指標；本次實查均不在目前 executor，不能宣稱原 logs／receipts／artifacts 現仍可讀。保留歷史結果及原工具回報，不重建或重跑測試補作過去證據。
- 本次官方回讀：main 仍 `edc0a40c993a02291e0120bc8a3d412c91407c97`，與共同 base 的差異僅 readiness snapshot；#1880／#1881／#1883／#1886 均 open、Draft、未 merge。下列 EF/c3 CI run 官方回讀仍 completed/success。當前可讀交付證據另存 workspace，與歷史 `/tmp` 資料分開記錄。
- 歷史 c9 CI source36849273583／secret36849273463：5844 total／5841 pass／0 fail／3 skip，見 `/tmp/tour-1882-loop-supplement-delivery-report.md`；不是新 F3 證據。
- 原 npm E2E wrapper拒絕；Builder曾換node npm-cli，Controller停止前2 pass／1 fail（expected「四月」對catalog「4月」）。log `/tmp/tour-1882-loop-closure-e2e-{1,2}.log`、失敗 artifact 與 `/tmp/tour-1882-e2e-command-stop-incident-20261001.md` 保留，不回填歷史PASS。R1/R2後補 response HTML sidebar/CTA與April完整33格斷言。
- quota中斷／Owner補quota續作見 `/tmp/tour-1882-canonical-e2e-build-quota-resume-1.input.json`；後續startup finding及修復、npm startup失敗歷史見 `/tmp/tour-1882-canonical-e2e-audit-startup-fix-1.receipt.json`、`/tmp/tour-1882-canonical-e2e-npmfix-publish-browser-result.json`。這些舊事件不因後續綠燈而消失。
- Owner本輪新授權 F3 三檔修復：DatePicker＋真SSR unit＋既有E2E，165行，source commit `ef491d299d1b428ef9360a2f2d9d1ca87bd0975e`。正式 red 7案4 fail；green 15/15＋typecheck，見 `/tmp/tour-1882-f3-civil-date-build-{red,green-final}.log`。exact delta SHA256 `b656bf63828bcb9022ece1cf79465fedff5205041b09df1541db1ca2987935a1`。
- 獨立 code review PASS0；root reviewed spec pin後工具鏈正常整合 HEAD `c3d46a24670e422935d6b737916b2a032fafffe6`，source三blob完全一致，spec SHA256 `9177569bea8512a72df3e4c627dd564e974d2a73823eb57b68180b7380fcc435`；見 `/tmp/tour-1882-reviewed-f3-pin-publish-result.json`。
- Fresh actor `/root/audit_1882_f3_civil_date` 於c3正式guarded Chromium僅一次7/7 PASS、exit0、known/unresolved findings0；涵蓋原3案＋LA/TPE October＋LA/TPE午夜fresh documents，1.3m。上輪原始log指標 `/tmp/tour-1882-f3-browser-audit-1.log`、report/result、artifacts/hash manifest本次不在目前 executor；7/7 是既有工具回報，並非本次重跑。只判local frontend scope，未核准whole loop。
- EF source CI [36864957980/job110378065660](https://github.com/smallwei0301/tour-platform/actions/runs/36864957980/job/110378065660)、[secret36864957946](https://github.com/smallwei0301/tour-platform/actions/runs/36864957946) completed/success：5851／5848／0／3。舊allowlist [smoke36864958167/job110378066373](https://github.com/smallwei0301/tour-platform/actions/runs/36864958167/job/110378066373) 11 pass／48.8s，前五spec不含new1882；見 `/tmp/tour-1882-f3-ef-terminal-ci-preview.json`。
- c3工具鏈 [source36866305391/job110382547871](https://github.com/smallwei0301/tour-platform/actions/runs/36866305391/job/110382547871)＋[secret36866305378](https://github.com/smallwei0301/tour-platform/actions/runs/36866305378) completed/success；5851／5848／0／3、build234/234、ISR smoke／preflight成功，由root terminal readback提供；ISR smoke不是cache即時到期證據。
- EF官方Preview `dpl_4THDeqGtJMk7quKpuTigMAEEjfcV` metadata READY/git/target=null，github SHA=EF，[immutable URL](https://tour-platform-btrkhu472-smallwei0301s-projects.vercel.app)。Parent Ava窄Oct5 PASS：pill週一、Monday cell非sun、摘要（一）、query2026-10-05；calendar closed，cleanup原訊息仍in progress，不宣稱cleanup完成。見 `/tmp/tour-1882-ava-f3-fixed-ef491-readback.json`。不是mobile／全月年PASS，PreviewTZ unknown。
- 上輪曾收到 Owner 完整loop／merge-autoflow授權回報，歷史指標 `/tmp/tour-stack-owner-merge-autoflow-approval-20261001.md` 本次不存在。其後平台自動審核拒絕將 #1880 標記 ready：認定現行授權僅涵蓋 Draft 發布，排除 ready。本次官方回讀仍 Draft；ready 動作未成功，沒有 merge／Production autoflow。停止該路徑且不重試或換工具繞過，交由 Owner／父層釐清授權衝突。

## 下一步
- 完成本兩檔證據核對與已授權 Draft 發布；最新文件 head 的自動 CI 獨立跟進。ready／merge 受上述平台拒絕阻塞，main autoflow exact SHA／CI／Production QA及sign-off均待驗。任何unresolved finding均HOLD。
- 保留local範圍限制：UTC modal未browser、午夜fresh documents不是persistent mount rollover；list reporter未持久body JSON，午夜afterEach截圖為已關fresh page後的空白parent，不作日期畫面證據。
- client/ISR來源邊界見QA及 `/tmp/tour-1882-client-isr-boundary-readback.md`；若要求instant到期或非空legacy同日時限，另審有界server/client/cache契約與真API證據，不私自新增Issue／修改legacy。

## 絕不重做（Do-NOT-redo）
- 新授權F3已完成三檔施工；不再修改已reviewed產品bytes、spec或pin，不重跑已通過7E2E／15targeted，不跑ordinary全套；toolchain／harness／lock不碰。
- 不重做舊calendar roundtrip／plan idempotency；Library仍blocked，原parity/multi-plan artifacts未restore、不retry/rebuild，不碰Library patch/#1851、DB/TEST/paid Tinyfish/credentials。
- Navbar exact-main hydration baseline未改；窄console分類不等於整頁無hydration問題。requested不是actual；所有actor actual unknown，NativeClaudeEdit hooks wire NOT_VERIFIED。
