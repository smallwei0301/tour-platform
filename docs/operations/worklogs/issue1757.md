# issue1757 — Requests projections and atomic decisions
> 最後更新：2026-07-28 10:11 CST｜負責 session：Canary／2026-07-28

## 目標
在#1766 Foundation＋Shell之上交付首頁、旅客需求列表／詳情、booking/inquiry ref分流，以及request booking原子批准／婉拒；#1766未merge期間維持stacked branch。

## AC 清單
- [ ] `requestRef` parser與formatter只接受`booking_<uuid>`／`inquiry_<uuid>`，非法prefix／UUID deterministic fail，不猜`orderId`。
- [ ] `new/needs_reply/replied/completed` bucket mapping保留取消／成功secondary state。
- [ ] Requests read gateway明列`bookingId`／`orderId`，booking branch具in-memory＋Supabase shape contract且不回`admin_note`。
- [ ] List/detail resolvers只接受gateway projection並輸出UI DTO／allowedActions。
- [ ] Requests V2 APIs具401、legacy mode、ownership 404、cursor、invalid ref 422及`admin_note` absent contracts。
- [ ] Home resolver/API合併pending booking requests、messages、profile；失敗不得回假零值。
- [ ] Home＋Requests UI／Playwright覆蓋loading、error、empty、tabs、deep-link、PII masking與mobile layout。
- [ ] `midao_decide_booking_request`以orders → bookings → activity_schedules鎖序，在單一transaction更新booking/order/log/outbox並回projection。
- [ ] Approval gateway/API覆蓋approve、reject、double decision、ownership、concurrency與idempotency。
- [ ] 批准／婉拒UI不optimistic宣稱成功；409顯示ConflictRecoverySheet，reject要求confirm＋note。
- [ ] Package gate focused tests、E2E、typecheck與fresh review blocking=0。

## 已完成（附證據）
- 2026-07-28 使用者決定不等#1766 merge；建立`feat/midao-requests-1757`與獨立worktree，exact stacked base／HEAD=`551fbbaccafd1accf11dfe52192bc8f54bdbab5f`，worktree clean。
- 2026-07-28 #1757 GitHub label由`status:blocked`改為`status:in-progress`；未merge、未deploy、未執行任何production mutation。
- 2026-07-28 Task 12 RED：`NODE22=$(npm exec --offline --yes --package=node@22.23.1 -- node -p 'process.execPath'); "$NODE22" --test apps/web/tests/unit/midao-request-ref.test.mjs`因`request-ref.mjs`不存在而`ERR_MODULE_NOT_FOUND`／exit1；不是假RED。
- 2026-07-28 Task 12 minimal GREEN：同一Node22 focused command在新增prefix白名單、完整UUID邊界、canonical lowercase及`INVALID_REQUEST_REF`安全錯誤後為`5/5 PASS`／exit0。首次`.claude/hooks/run-checks.sh apps/web/tests/unit/midao-request-ref.test.mjs`誤用ambient Node24，實際5/5但harness只解析Node22 `# tests`而正確exit1拒絕證據；以`PATH="$(dirname "$NODE22"):/usr/local/bin:/usr/bin:/bin" .claude/hooks/run-checks.sh apps/web/tests/unit/midao-request-ref.test.mjs`重跑，`5/5 PASS`／exit0並寫入30分鐘commit evidence。

- 2026-07-28 Task 12 first review確認parser／tests PASS；唯一finding是review讀到更新前的stale worklog。補齊exact evidence後，fresh re-review以Node `22.23.1`重跑`5/5 PASS`／額外round-trip與deterministic rejection probe PASS；verdict **PASS、blocking=0**，code/tests三檔hash在review前後無漂移。
- 2026-07-28 Task 12 checkpoint commit `8fc3ec380a30e0a22e75aa6afeced1e5913b6309`／tree `ee22e74617ef215b8a08bc024e4fe53a7ef45590`已push；GitHub issue雙寫：`https://github.com/smallwei0301/tour-platform/issues/1757#issuecomment-5097921235`。
- 2026-07-28 建立stacked Draft PR #1769；base=`feat/midao-foundation-1756`／exact `551fbbaccafd1accf11dfe52192bc8f54bdbab5f`，head=`8fc3ec380a30e0a22e75aa6afeced1e5913b6309`，draft/open/mergeable。Repo public＋standard `ubuntu-latest` compute免費；billing API 403使artifact/cache quota未知，owner已明確授權本次standard CI並接受storage超額風險；不含Larger runner、merge、deploy或production。
- 2026-07-28 Task 13 RED：正式Node `22.23.1`執行`midao-request-buckets.test.mjs`，因`request-buckets.mjs`不存在而`ERR_MODULE_NOT_FOUND`／exit1。Design review要求booking/inquiry discriminated input、禁generic `status`、跨表矛盾fail closed、terminal優先且保留secondary state。
- 2026-07-28 Task 13 minimal GREEN：建立closed bucket／secondary vocabularies與pure resolver；首輪`6/7 PASS`因測試對generic `{status}`期待`kind`、實作更嚴格回`status`，修正測試expectation後同一矩陣`7/7 PASS`／exit0；未改鬆狀態或接受額外input。
- 2026-07-28 第一個fresh Task 13 reviewer在600秒timeout且無summary／verdict，不算PASS或FAIL。受控re-review實跑Node22 combined `12/12 PASS`但發現**blocking=1**：booking會忽略`inquiryStatus`、inquiry會忽略booking lifecycle欄位。新增四個cross-domain污染case後focused RED為`6/7 PASS`／exit1；最小修正依kind拒絕另一domain lifecycle fields後`7/7 PASS`／exit0。
- 2026-07-28 remediation combined Node22 `run-checks.sh`為`12/12 PASS`／exit0。Final bounded re-review確認cross-domain fields在分類前fail closed、四個regression cases具辨識力，其他bucket／secondary／precedence／determinism無回歸；verdict **PASS、blocking=0**。
- 2026-07-28 Task 13 checkpoint commit `dd346515f9471e69fb73ea09b5d861f53fa3b465`／tree `a92ecb7560de4328009fbef31b78fd788e5b8653`已push至Draft PR #1769；issue milestone：`https://github.com/smallwei0301/tour-platform/issues/1757#issuecomment-5098122824`；PR body read-back PASS。
- 2026-07-28 Task 14 RED：正式Node `22.23.1`執行`midao-requests-gateway.test.mjs`，因`db-midao-requests.mjs`不存在而`ERR_MODULE_NOT_FOUND`／exit1。
- 2026-07-28 Task 14 initial GREEN：新增獨立Midao requests domain gateway、guide ownership、bookingId/orderId identity、list PII masking/detail contact snapshot、recursive admin/internal note exclusion、bucket filtering、三種deterministic sort與opaque cursor；focused初版為`5/5 PASS`／exit0。Package2 inquiry branch固定`INQUIRY_NOT_FOUND`。
- 2026-07-28 Task 14 fresh reviews均為**FAIL**，不可checkpoint。Security/Quality：blocking=2（relation cardinality/identity與未知sender role未fail closed；無簽章cursor可偽造）。Spec/Parity/Scalability：blocking=5（不存在的`orders!fk_bookings_order_id` relation hint；完整owner projection後local pagination；sort與design不一致；detail query error誤報404；schema-faithful/tie-break/error/null tests缺口）。Reviewers以Node `22.23.1`重跑舊矩陣`17/17 PASS`，但mutation probes證明上述測試缺口；綠燈未被冒充驗收PASS。
- 2026-07-28 Task 14 remediation RED/GREEN：新增priority/updated/service sort、same-timestamp跨頁、HMAC cursor tamper/context/extra-key、relation cardinality/identity、unknown sender、RPC owner/shape/lifecycle/order、list/detail backend error與successful-null 404 cases；原實作focused RED為`3/6 PASS`／exit1。最小修正後cursor以`GUIDE_SESSION_SECRET` HMAC-SHA256簽章並綁guide/bucket/sort/full tuple，direct detail使用真實`orders!fk_orders_booking_id`且驗證`order.booking_id === booking.id`，backend error與404分流。
- 2026-07-28 為消除全量transfer/scalability blocker，新增**source-only、未套production** migration `20260723004000_midao_request_read_projection.sql`：service-role-only、`SECURITY INVOKER` read RPC在DB端完成closed lifecycle validation、latest-message lateral、owner/bucket filtering、priority/updated/service keyset與`limit+1`，list只回masked email；local baseline runner以SHA-256 `e4631d40e7ce18e0d10eab5347a1499ded345cf9eae3fd68b12a834b45db87bc`綁定並納入materialized history。Gateway＋migration contracts為`11/11 PASS`；runner unit為`40/40 PASS`，Node `22.23.1`。
- 2026-07-28 同步修復前一checkpoint雲端CI兩個infra問題：`issue1411-message-rate-limit.test.mjs`不再把transpile scratch寫入被並行掃描的`src/lib`，與guard兩檔競態壓測20輪全PASS（60 executions）；Browser功能原先12/12 PASS但cleanup只印外層AggregateError，runner改為只展開closed safe cleanup codes、自由文字/URI/token/全大寫秘密均`[REDACTED_ERROR]`，runner unit包含對抗case且40/40 PASS。此診斷改善不等同Browser exact-head CI已PASS。

- 2026-07-28 正式Node `22.23.1` commit evidence以7個精確測試檔執行：第一次`65/66`因fresh worktree缺`typescript`依賴而正確exit1；使用已驗證主checkout依賴的暫時symlink後又發現test cwd假設，改由`import.meta.url`定位`apps/web`，root cwd focused `2/2 PASS`；最終正式gate為`67/67 PASS`／exit0，symlink已移除且無residue。
- 2026-07-28 Task 14 final fresh雙review均為**FAIL／不可checkpoint**，unique blocking=4：① detail PostgREST hint寫成不存在的`fk_orders_booking_id`，authoritative baseline constraint是`orders_booking_id_fkey`，fake反而固定錯誤名稱；② runner傳`repoRoot/entries`給public `materializeFreshWorkdir()`，但API只接受`outputParent/postCutoffManifest/projectId`，獨立probe重現`materializer public options contain forbidden path override`；③ RPC對`p_bucket/p_sort/p_limit=NULL`受PostgreSQL三值邏輯影響而未fail closed，`LIMIT NULL`可取消上限；④ timestamp validator要求字串完全等於`.toISOString()`，會拒絕合法PostgREST `+00:00`／無毫秒格式。Security review亦確認HMAC cursor、PII split、closed lifecycle、error/404分流與safe Aggregate diagnostics無新增blocker，但不抵銷上述四項。
- 2026-07-28 Task 14 final-review remediation逐項取得mutation-sensitive RED：authoritative FK test `0/1`、合法PostgREST timestamp variants `0/1`、SQL NULL source contract `0/1`、真default adapter `0/1`（重現forbidden override）。最小修正後四項focused均GREEN；gateway全檔`10/10 PASS`、migration contracts／workflow guards全檔`7/7 PASS`，Node `22.23.1`。
- 2026-07-28 relation hint改由baseline exact constraint `orders_booking_id_fkey`互證；wire timestamp僅接受嚴格RFC3339/PostgREST形狀並canonicalize UTC，invalid calendar／junk／non-string仍fail closed；RPC對owner/bucket/sort/limit及cursor tuple明確NULL rejection。此四blocker修正階段migration SHA-256為`f1f9478f17e865a05864974cafafe52b8d5101f8e829ed5519e19ea151835352`，後續已由微秒pagination修正supersede。
- 2026-07-28 runner移除public API禁止的`repoRoot/entries`，改傳已驗證expected-terminal manifest；materializer重新驗證並clone manifest、保留path allowlist。兩輪fresh builder一致後發布7支post-cutoff expected-terminal transaction `ea98c25015ec52a76b12b4838cb6a813f338406b19b853f2bcacf343d690da1c`；default adapter、materializer、artifact verifier、existing rehearsal contracts均PASS，forward inventory為128＋7＝135。
- 2026-07-28 真PostgreSQL/PostgREST第二輪實際通過NULL fail-closed，以及RPC shape／ACL client denial／正確與錯誤FK hint／ownership／same-timestamp keyset／list PII redaction；另兩項僅因integration harness的ACL owner expectation與錯誤cursor env而FAIL，已修test未改鬆production。後續兩輪本機在assertion前因低RAM/high-swap令DB startup超過Supabase CLI約150秒窗口而`SUPABASE_START_FAILED`；Docker events顯示容器在CLI kill邊界才healthy，故本機完整4/4為**INCONCLUSIVE**，交public standard runner，不冒充PASS。
- 2026-07-28 PR CI lanes固定Node `22.23.1`；baseline workflow精確觸發gateway/API並執行真PostgREST contract；migration PR只跑source-contract，live production drift及Telegram/Email通知保留main/schedule/manual，避免未授權production read／外訊。正式hook為`111/111 PASS`／exit0；lock要求TypeScript `6.0.2`，借用依賴的TS `5.9.3`被拒，隔離TS6本機於512MB heap OOM，故local typecheck **INCONCLUSIVE**、待CI exact lock驗證。31個changed/untracked檔secret-pattern scan為0 hits，symlink／Docker／temp residue均0。
- 2026-07-28 額外自我review發現合法六位微秒被gateway canonicalize為毫秒、但DB keyset仍用微秒比較時可能跨頁漏列；source contract先RED／exit1。最小修正將RPC投影的`updated_at`與service sort `start_at`在DB端`date_trunc('milliseconds', ...)`，再由UUID決勝；真integration fixture加入`.123456/.123456/.123123` mutation，舊SQL會漏第三列。source GREEN／exit0，migration current SHA-256為`36edefe11432f36088ddbb52e461c8d7b5bf6a7b3edfea6bf48cd51d42a21917`。
- 2026-07-28 本機兩輪expected-terminal builder實際進入PostgreSQL初始化，但仍在CLI約150秒health窗口前`unhealthy`退出；cleanup後無container/symlink residue，未發布半套產物。public standard workflow新增兩輪builder及1天retention的四個非機密artifact上傳；需先bootstrap checkpoint觸發雲端，下載後核hash並建立artifact follow-up checkpoint，這段期間Task14仍HOLD。
- 2026-07-28 CI-bootstrap commit `30d87c6830f23559f8fd98d5b82a287d323d15b7`／tree `9d7daf4d814c6a2de1e98db4d00c53e351de1106`已push。public run `30330696475`的兩輪builder與artifact upload均SUCCESS；artifact ID `8677262404`（PR merge-ref name）恰含四個regular files，migration digest=`36edef...21917`、transaction=`10fb2d4954396a509fea295aefad90a7203d0e512b7f56e606db0d9aaad4f55d`、manifest/ledger/catalog digests全自洽。
- 2026-07-28 artifact首次promote驗證精確抓到兩個test fixtures仍期待前一digest並自動還原；更新fixtures後第二次逐檔`cmp`與artifact/materializer/builder/existing/default-adapter矩陣`76/76 PASS`。其後正式Node `22.23.1` 10-file gate為`120/120 PASS`／exit0。bootstrap exact-head CI／baseline infra紅燈只代表commit刻意未含新artifact與fixtures，後續follow-up exact-head必須重跑；該舊紅燈不算Task14 verdict，typecheck及真PostgREST尚未執行。

## 下一步／未完成
- [x] 修正上述四個Task14 blocking findings，逐項完成mutation-sensitive RED→GREEN並通過Node22正式test gate。
- [ ] 取得final fresh雙review `blocking=0`；任何逾時／無verdict仍算INCONCLUSIVE。
- [ ] 由GitHub public standard runner以exact lock完成TypeScript 6.0.2 typecheck及完整真PostgreSQL/PostgREST `4/4 PASS`；本機因資源窗口僅有部分真runtime證據，不宣稱完整PASS。
- [ ] checkpoint/push後驗證exact-head Test/Browser/Scan實際觸發集合；Browser cleanup需以新safe diagnostic收斂。
- [ ] Task 14 gates全綠後才更新AC／Issue／PR並進Task15 resolvers；Task15–21（resolvers、V2 APIs、Home、UI/E2E、atomic approval migration/API/UI與package final gate）全部未完成。
- [ ] PR #1766／#1769均保持open/draft，不merge；new read RPC migration未apply production，production release HOLD。


## 絕不重做（Do-NOT-redo）
- 不重做#1766 Foundation＋Shell已通過的auth、impersonation、runner、F9/F10與baseline gates；#1757只在stacked delta新增Requests功能。
- 不把`orderId`猜成`bookingId`，不改frozen orders/payments routes、既有migrations、middleware或protected E2E。
- #1766未merge前，#1757 PR base必須指向`feat/midao-foundation-1756`；不得以`main`造成兩包diff混雜。

## P0-OVERRIDE 使用紀錄（如有）
- 無。
