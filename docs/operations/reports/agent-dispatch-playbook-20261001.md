# Tour local 派工防漏流程（2026-10-01）

Owner 授權範圍：本機治理文件、CLI、targeted tests；無 commit/push、DB 或 Library 寫入。
根因是路由映射僅有文字與 JSON，dispatch 前無執行檢查，且 harness 曾允許
省略 model 繼承 session。先前 review 的 `fork_turns=all` 有歷史 context，
不是 fresh review；本次更正語意，不回填舊回執或歷史模型證據。

## 指揮官操作

每次新派工由指揮官準備完整 JSON，先跑
`node scripts/agents/dispatch-preflight.mjs /tmp/dispatch-input.json`（亦支援 `-` stdin）。
exit 0 才按相同 role/model/fork_turns 呼叫 collaboration；exit 1 修正或記 blocker。
before input 必填 runId 與 beforeRecordPath；CLI 通過後以 wx 保存唯一 before 紀錄，
記 status=PASS、generatedAt 與綁定派工欄位，不覆寫已存在檔案。只有 before 成功
才能呼叫工具；工具回來後更新 phase 為 receipt、填真實 agentId/output/actual、
原始工具 dispatchedAt（UTC ISO）與 dispatchEvidenceRef，再跑同一 CLI。
receipt 僅讀取同檔，核對 runId 與 dispatch 欄位、before.generatedAt < dispatchedAt <= now；
缺 before、beforePreflight 明示非 PASS（含 MISSED 說明文字）、事後補跑、不同 run／綁定、未來時間都拒絕。
工具 timestamp 未提供時使用下述 tool-order 證據；兩種證據均缺時 SEQUENCE_NOT_VERIFIED，
不猜 mtime 或本機時間。
需要 discovery 時，scoutReceipt 也必須提供完整 Scout receipt（task、runId、
beforeRecordPath、dispatchedAt、dispatchEvidenceRef 與原始工具 output），CLI 回讀
Scout 的 before 紀錄並以 receipt 規則驗證；只有 inline identity 不足以通過。
Scout receipt 的 taskId 綁目前工作 taskId；原始 tool task_name 可放 agentId，
原始子任務識別另留在報告，不把 requested 假充 actual。

必要欄位：phase=before|receipt、scope=tour-platform|other、role=scout|build|audit、
provider=openai|claude、model（正式映射或允許的 Builder 選擇）、fork_turns=none、taskId、task.kind。
OpenAI build 另必填 buildSelection={complexity,reason}：simple 建議 Luna，complex 建議 Sol，Commander 可依實際理由選任一允許型號；
reason 不可空白。Owner 指定時填 ownerModel，優先於 complexity，但只允許 Sol／Luna
且須等於 model。role=build 與 role=scout 即使同用 Luna 仍是不同職責；audit 不允 Luna。
task.kind=scan|plan|multi-step 觸發 Tour 的獨立派工；scan/plan 需 Scout 前置盤點。
multi-step 必明填 requiresDiscovery 布林，只有 true 才需 Scout；false 直接派
獨立 builder，不增一個 Scout 成本。本輪自足 CLI 約定各角色 fork_turns=none。
small-edit 要 fileCount 整數 1–2 與 reason；single-fact 要 reason。
scope=other 要 reason，可無 Scout；仍是 dispatch 時必須明填 model。
MODEL_GOVERNANCE 是工作主題，不是繞過實際工作種類的例外，也不要求當前 session 換模型。

```json
{
  "phase": "before", "scope": "tour-platform", "role": "build",
  "runId": "bounded-example-run", "beforeRecordPath": "/tmp/bounded-example-before.json",
  "provider": "openai", "model": "gpt-6.1-sol", "fork_turns": "none",
  "buildSelection": { "complexity": "complex", "reason": "既知跨文件修復，不需重新盤點" },
  "taskId": "bounded-example", "task": { "kind": "multi-step", "requiresDiscovery": false }
}
```

receipt 額外必填 agentId/output/actual（未知填 unknown）。已知 actual 需
identityEvidence 引用；CLI 只能記 EVIDENCE_RECORDED_NOT_RUNTIME_VERIFIED。
任何 verified=true 都拒絕。audit 前必填預定 agentId、implementerAgentId 與
exactDiff（例如 exact git diff 的 SHA-256）；回執後以實際 agentId 重驗，
實作者與 auditor 相同或 fork_turns=all 一律拒絕。
CLI 不攔截 collaboration、不證明 agent 曾實跑、不驗證 runtime 或外部引用；
機械 PASS 只是輸入符合規則，仍需真實工具回執與獨立驗收證據。

## 高風險成本預約與降級（Owner 本輪補充）

Builder 依上述 complexity／Owner 選擇 Sol 或 Luna，正常 Reviewer=gpt-6.1-sol，
Scout=gpt-6-luna；高風險 Reviewer 才可
requested=gpt-6-astra。同 executor 的主 Agent 保持 ownership，按 model selector
派給不同 actor；所有 reviewer 都 fresh none。Astra/Fable 同 lineage 合計一次，
一般兩輪重試不覆蓋此上限；新 head、session、PR 不 reset，未知預算直接降級。

Astra input 在上述 audit 欄位外必填 risk=high、costReason、reviewLineage、
requestedAt（UTC ISO）、executionRef、attempt=1 與 ledgerPath。指揮官先核對
原始歷史，再持久保存 caller-owned ledger；不得把下面 fixture 當真實派工證據：

```json
{
  "reviewLineage": "issue-1", "budgetKnown": true, "premiumUsed": 1,
  "reservations": [{
    "taskId": "task-1", "reviewLineage": "issue-1", "requestedAt": "2026-10-01T10:00:00Z",
    "executionRef": "exec-1", "requestedModel": "gpt-6-astra", "risk": "high",
    "exactDiff": "sha256:fixture", "costReason": "Auth boundary adversarial review",
    "attempt": 1, "state": "RESERVED"
  }]
}
```

CLI 回讀 ledger，驗證唯一已占用預約，before 通過後以 wx 建立
`<ledgerPath>.claim`。同 reservation 重跑 before 拒絕；檔不可讀、未知預算、
attempt=2、額外預約或綁定不同均拒絕。用 caller 的 /tmp 或持久位置，不自動
篡改 repo。同 lineage 重用同一路徑，保留 claim；跨 session 要自行保存／恢復
原 ledger 與 claim，不能把暫存檔消失當成沒用過。CLI 不驗外部歷史或檔案真偽。

fallback audit 使用 Sol、當前 exactDiff、不同 actor、reviewLineage，另附
fallback={reason,evidenceRef,reviewLineage}；reason 支援 FIRST_FAILURE、START_TIMEOUT、
PREMIUM_USED、UNKNOWN_BUDGET、FINDINGS_REPAIRED。最後一項必填 priorFindingsReviewed
與 repairEvidence 引用。安全拒絕不是模型故障；不可以 false failure 忽略 finding。
timeout 額外附 requestedAt、executionRef、runtimeEvidence 陣列，event 格式
`{event,at,executionRef,sourceRef}`。CLI 以當前 UTC 檢 300 秒，QUEUED 不算開始；
同 exec 在期限內 RUNNING／TOKEN_GENERATED／TOOL_EXECUTED 時不允 START_TIMEOUT。
主 Agent 回讀原始 runtime receipt；支援時取消／隔離 timeout 任務並保留結果。
audit receipt 必填 verdict=PASS|FIX_REQUIRED|FAILED 與 unresolvedFindingCount，
未知不可填零，有未解 finding 不允 PASS。actual=unknown 如實保留且不可 verified。

本輪補充 Scout：`collaboration:/root/scout_astra_policy/final`，requested=gpt-6-luna，
actual=unknown；Builder=`/root/build_astra_policy`，requested=gpt-6.1-sol，actual=unknown。
Builder preflight 由主 Agent PASS（taskId=tour-astra-policy-20261001）；實作測試
以隔離 Node 22.23.1 跑 targeted 11/11 PASS，涵蓋合法 Sol/Luna、一般風險 Astra
拒絕、missing ledger、attempt2、unknown budget、並行 wx claim、299/300 秒、
不同 exec／未來證據、finding repair／未知 finding／未解 finding 阻塞 PASS。
此為 local 測試，不是真實 Astra 派工、fresh review 或 formal gate。formal gate
仍受獨立 toolchain checkout 邊界限制，本輪未混入 toolchain/harness/DB 變更。

## Scout output

本輪來源是 Scout 工具訊息，outputRef=`collaboration:/root/scout_dispatch_prevention/final`，
不是本機 runtime receipt。parent 提供原始 spawn 回執摘要：
`{task_name:'/root/scout_dispatch_prevention'}`；顯式參數 model=gpt-6-luna、
fork_turns=none；actual=unknown；preflight=BOOTSTRAP_NOT_AVAILABLE。
Scout 已確認 validator 方案：dispatch 前檢顯式模型／角色、任務觸發與有理由的
例外、需要時的 Scout 回執、隔離 audit 與 exact diff 綁定，並保留工具與身分證據限制。

## Build output

本輪 build 工具回執識別為 `/root/implement_dispatch_prevention`，requested=gpt-6.1-sol、
fork_turns=none；actual=unknown；preflight=BOOTSTRAP_NOT_AVAILABLE（派工時 CLI 尚不存在）。
產出：[CLI](../../../scripts/agents/dispatch-preflight.mjs)、
[targeted tests](../../../apps/web/tests/unit/tour-model-routing.test.mjs)、
[正式入口](../../AGENT-EXECUTION.md)。這些是本輪產出連結，不是 runtime 身分證明。
後續 audit 應先跑新 CLI 再實際派工，驗收回執另記；此處不預先宣稱 PASS。

Build targeted check：Node 22.23.1 執行
`node --test apps/web/tests/unit/tour-model-routing.test.mjs`，7 tests PASS；
涵蓋 stdin CLI exit code、模型映射、缺回執／缺 model、例外理由、隔離 audit、
未知 actual 與偽 verified。`git diff --check` PASS。這是實作者測試，非獨立驗收。


## 本輪 Builder 選擇增量（不回填歷史）

最新 Owner 決策在既有六檔治理產出上作小幅修改；models.build 預設仍為 Sol，
新增允許集合與選擇檢查。當輪 Scout=`/root/scout_builder_choices`，requested=Luna、
actual=unknown；本輪漏做 dispatch 前 CLI，標記 BEFORE_PREFLIGHT_MISSED，
不能回填成當時 PASS。Builder=`/root/build_builder_choices`，requested=Sol、actual=unknown；
其 before input=`/tmp/tour-builder-choice-before.json` 由當時 validator 實跑 PASS，
當時尚未要求 buildSelection，保留為舊版本證據。此輪選擇理由是跨文件、router 與
測試一致性，complexity=complex；receipt 應使用新增欄位，不能將 requested 當 actual。
本輪 before／after 六檔 SHA 與 delta 保存於 `/tmp/tour-builder-choice-evidence/`，
供另派 fresh reviewer 回讀；實作者 targeted tests 不是獨立驗收。

本輪實作者實跑 Node 22.23.1 targeted tests：12/12 PASS；`git diff --check` PASS。
涵蓋 Sol／Luna、必填理由／complexity、Owner 允許 override／衝突與非法型號、
Luna audit 拒絕、自審拒絕，既有 premium ledger／timeout／安全拒絕測試持續綠燈。


## 本輪 before proof 收尾增量

初次 Scout 的 scan 派工由主 Agent 先呼叫 spawn，尚未執行 before CLI；舊 receipt
只驗輸入欄位，beforePreflight=MISSED 也能 PASS。根因時間證據由主 Agent 保存於
`/tmp/tour-before-proof-root-cause-20261001.md`：03:07:15 是 Builder before，
03:10:30 是 Scout receipt MISSED，Scout dispatch 精確 UTC 未知；工具順序證明
spawn Scout 在 before CLI 之前，不能猜造 dispatch timestamp。歷史缺口保留，
不回填或自行生成過去 before proof。

本輪修復派工前 `/tmp/tour-before-proof-build-input.json` 由舊 CLI PASS，但舊版
尚未持久保存 beforeRecord，不是新版合法 proof。本輪新紀錄僅由成功 before
入口建立；receipt 入口不能建立或覆寫紀錄。before 路徑先 wx 開啟，再執行既有
premium wx claim，再保存 PASS；輸入不合法或 proof 路徑失敗不消耗 premium claim。
claim 一旦成功仍保留單次消耗，即使後续保存／工具派工失敗也不刪除或重置。

CLI 不能直接操作官方 collaboration，controller 仍須依序 before → 工具 → receipt。
CLI 成功紀錄本機時間與 caller 提供的工具時間引用，只檢查順序和綁定；不能證明
runtime 身分、工具真的執行或檔案／引用未偽造。caller 可偽造檔案及時間，必須
由主 Agent 回讀原始工具證據；工具沒有可信 timestamp 且無可回讀的 tool-order 證據時不能宣稱完整驗收。
本輪四檔 before／after SHA 與 delta 另存 `/tmp/tour-before-proof-evidence/`，
維持既有模型選擇、Scout 觸發、獨立 reviewer 與 premium 安全 gate。

本輪實作者以隔離 Node 22.23.1 targeted tests 實跑 15/15 PASS，涵蓋 before／receipt
CLI、wx 不覆寫、缺紀錄／receipt 不創紀錄、晚於 dispatch、run／派工欄位變更、
MISSED 說明文字、未知工具時間、nested Scout before 缺口、無 discovery 合法派工，
並保留 premium claim／成本／安全與模型選擇 regression。這不是獨立驗收。


## 無 UTC 工具回執的本機順序證據

UTC 模式維持原規則。工具回執沒有 dispatch UTC 時，receipt 可明填
`dispatchSequence={kind:'tool-order',beforeEvidenceRef,dispatchEvidenceRef,beforeRecordSHA256,relation:'before'}`，
不填猜測的 dispatchedAt。beforeEvidenceRef 指向真實 before CLI 成功的工具 response
chunk，dispatchEvidenceRef 指向後續原始 spawn task_name／工具 trace，並與頂層
同名欄位一致。CLI 回讀 beforeRecordPath 原始 bytes 計算 SHA-256，必須與
beforeRecordSHA256 相等；兩個引用必須非空、不同，relation 只能是 before。
runId、完整 dispatch 綁定、持久 before PASS 與所有其他 gate 照常檢查；
缺 before 或 MISSED 不能藉此通過，nested Scout receipt 同樣適用。

若提供 dispatchedAt，即使同時填 tool-order，也仍須通過 UTC 檢查，無效、
未來或不晚於 before 的時間不能 fallback。工具順序模式回傳
`sequenceStatus=TOOL_ORDER_EVIDENCE_RECORDED_NOT_PLATFORM_VERIFIED`；UTC 模式為
`UTC_EVIDENCE_RECORDED_NOT_PLATFORM_VERIFIED`，都不是 runtime 身分驗證。
CLI 不能驗外部引用真偽或平台全域順序；controller 必須回讀原始 tool trace，
確認引用的 before 成功輸出確實在 spawn 呼叫之前。這項原始工具核對仍由主 Agent
負責，caller 可偽造檔案／引用的限制不變，actual=unknown 如實保留。

本輪 tool-order 增量派工前，主 Agent 實跑新版 before CLI，保存
`/tmp/tour-before-proof-tool-order-build-1.before.json`；generatedAt=2026-10-01T03:25:16.741Z，
工具 response chunk=`8c38f6`，之後才送出 Builder followup。這是主 Agent 提供的
原始工具引用，receipt 仍需回讀核對；不以該本機 UTC 假充 runtime dispatch UTC。
本輪 targeted tests 以 Node 22.23.1 實跑 16/16 PASS，含合法 tool-order、缺引用、
digest mismatch、反向 relation、同引用與非法 UTC 不可 fallback，nested Scout 同模式通過。
四檔增量證據另存 `/tmp/tour-tool-order-evidence/`；這是實作者 regression，待獨立驗收。
