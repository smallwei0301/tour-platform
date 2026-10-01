# Tour local 派工防漏流程（2026-10-01）

Owner 授權範圍：本機治理文件、CLI、targeted tests；無 commit/push、DB 或 Library 寫入。
根因是路由映射僅有文字與 JSON，dispatch 前無執行檢查，且 harness 曾允許
省略 model 繼承 session。先前 review 的 `fork_turns=all` 有歷史 context，
不是 fresh review；本次更正語意，不回填舊回執或歷史模型證據。

## 指揮官操作

每次新派工由指揮官準備完整 JSON，先跑
`node scripts/agents/dispatch-preflight.mjs /tmp/dispatch-input.json`（亦支援 `-` stdin）。
exit 0 才按相同 role/model/fork_turns 呼叫 collaboration；exit 1 修正或記 blocker。
工具回來後更新 phase 為 receipt、填真實 agentId/output/actual，再跑同一 CLI。
Scout receipt 的 taskId 綁目前工作 taskId；原始 tool task_name 可放 agentId，
原始子任務識別另留在報告，不把 requested 假充 actual。

必要欄位：phase=before|receipt、scope=tour-platform|other、role=scout|build|audit、
provider=openai|claude、model（正式映射）、fork_turns=none、taskId、task.kind。
task.kind=scan|plan|multi-step 觸發 Tour 的獨立派工；scan/plan 需 Scout 前置盤點。
multi-step 必明填 requiresDiscovery 布林，只有 true 才需 Scout；false 直接派
獨立 builder，不增一個 Scout 成本。本輪自足 CLI 約定各角色 fork_turns=none。
small-edit 要 fileCount 整數 1–2 與 reason；single-fact 要 reason。
scope=other 要 reason，可無 Scout；仍是 dispatch 時必須明填 model。
MODEL_GOVERNANCE 是工作主題，不是繞過實際工作種類的例外，也不要求當前 session 換模型。

```json
{
  "phase": "before", "scope": "tour-platform", "role": "build",
  "provider": "openai", "model": "gpt-6.1-sol", "fork_turns": "none",
  "taskId": "dispatch-prevention-20261001", "task": { "kind": "multi-step", "requiresDiscovery": true },
  "scoutReceipt": {
    "role": "scout", "provider": "openai", "model": "gpt-6-luna",
    "fork_turns": "none", "taskId": "dispatch-prevention-20261001",
    "agentId": "/root/scout_dispatch_prevention",
    "output": "docs/operations/reports/agent-dispatch-playbook-20261001.md#scout-output",
    "actual": "unknown"
  }
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

Builder／正常 Reviewer=gpt-6.1-sol，Scout=gpt-6-luna；高風險 Reviewer 才可
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
