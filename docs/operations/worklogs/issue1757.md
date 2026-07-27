# issue1757 — Requests projections and atomic decisions
> 最後更新：2026-07-28 07:46 CST｜負責 session：Canary／2026-07-28

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

## 下一步
- Commit/push/double-write Task 13 checkpoint，更新Draft PR #1769；接著開始Task 14 requests read gateway RED，先完成booking branch的in-memory／Supabase projection shape contract且明列bookingId/orderId、不回admin_note。


## 絕不重做（Do-NOT-redo）
- 不重做#1766 Foundation＋Shell已通過的auth、impersonation、runner、F9/F10與baseline gates；#1757只在stacked delta新增Requests功能。
- 不把`orderId`猜成`bookingId`，不改frozen orders/payments routes、既有migrations、middleware或protected E2E。
- #1766未merge前，#1757 PR base必須指向`feat/midao-foundation-1756`；不得以`main`造成兩包diff混雜。

## P0-OVERRIDE 使用紀錄（如有）
- 無。
