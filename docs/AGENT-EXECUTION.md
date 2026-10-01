# Tour Agent 執行與模型路由

Owner 2026-10-01 決策：OpenAI Terra 施工角色改用 `gpt-6.1-sol`。
本文件是 Tour 模型路由的正式入口；機器可讀映射由
`scripts/agents/model-routing.json` 維護。開工順序、安全限制、重試上限與
驗收仍依 `CLAUDE.md`、`.cursor/harness/00_INDEX.md` 與
`.cursor/harness/02_orchestration.md`。Owner 本輪另授權 local 派工防漏檢查，
操作與證據見 `docs/operations/reports/agent-dispatch-playbook-20261001.md`。

## 角色與 provider

先確認 runtime 的 provider 與可選模型，再按角色選擇。沿用 VibeAI 的
provider-first、requested/actual 如實記錄與獨立 review 協議；此 repo 的
映射與容量獨立，不依賴另一個 repo 的 checkout 或正在執行的 Agent。

| 角色 | OpenAI | Claude |
|---|---|---|
| scout／窄盤點 | `gpt-6-luna` | 沿用 harness 的 `haiku` |
| build／Terra 施工 | `gpt-6.1-sol` | 沿用 harness 的 `sonnet` |
| audit／驗收 | `gpt-6.1-sol` | 沿用 harness 的 `opus` |

正常 Reviewer 使用 Sol；只有明確高風險分類、有成本理由且通過下列單次成本
gate 的 OpenAI audit 才能要求 `gpt-6-astra`。本輪不實際派送 Astra。

`Terra`／`TERRA_BUILD` 是施工角色名稱，不是實際模型身分證據。
build 與 audit 即使用同一型號，也必須使用不同、`fork_turns=none` 的 Agent；
實作者不得自我驗收。Claude 的選擇與既有升降級路徑不變。
模型不可用時記錄實際 blocker，不把 requested 當成 actual；無可靠 runtime
證據時 `actual=unknown`。歷史 worklog、模型回執與測試證據維持原值。
角色在同一 executor 內透過可用 subagent／multiagent 的 model selector 派工，
主 Agent 保持 ownership，收回產出、驗證後繼續。不同型號或同為 Sol 的 reviewer
都必須是不同 actor、fresh `fork_turns=none`；不得把派工解讀為轉交外人而停工。

## Dispatch 前後檢查

指揮官在每次新 dispatch 前明填 role/provider/model/fork_turns，執行
`node scripts/agents/dispatch-preflight.mjs <input.json>`；只有 exit 0 才呼叫
派工工具。Tour repo 掃描、規劃先取得 Scout 窄盤點產出，再派 build/audit；
多步驟實作要獨立 builder，但只有包含掃描／規劃（requiresDiscovery=true）
才需 Scout 前置產出；requiresDiscovery=false 可直接派 builder。
Scout 自身派工不要求先有 Scout。本輪 CLI 自足派工約定所有角色 fork_turns=none。
這是 §1 工作觸發的本輪前置檢查，不把所有 general-purpose 施工改派 Luna，
也不把 Vibe Product Scout 前提套到所有 MODEL_GOVERNANCE 或非 repo 工作。
單一事實查證、≤2 檔小修改可以不派 Scout，但必填例外 reason；治理工作
仍按實際 scan/plan/multi-step 分類，不能用 governance 名稱繞過觸發。
當前治理 session 不是新 dispatch，不強制切 model。

工具回執後由指揮官以 `phase=receipt` 重跑，記 agentId、output、actual 與
身分證據；audit 必綁 implementerAgentId、exactDiff 並用不同 Agent。
CLI 僅驗輸入：不能截攔 collaboration、證明 agent 實跑、驗證 runtime 身分
或證明引用內容真實；actual unknown 永遠 NOT_VERIFIED，禁止填 verified=true。
inline Scout receipt 僅是輸入，不能稱為可驗執行證據。主 Agent 必須回讀原始工具
回執核對 task、actor、requested／actual 與 output，不以 CLI PASS 代替這項責任。

## 高風險 Reviewer 的單次成本約束

Owner 採用 VibeAI `2026-09-17-owner-final-risk-cost-downgrade.md` 與
`AGENT-EXECUTION.md` §7.2 的成本約束，沒有移植其 Product 前提或容量。
同一 reviewLineage 的 Astra／Fable 合計最多一次；新 head、digest、session、
rebase 或替代 PR 都不能重置。unknown 歷史預算不得視為零。Tour 一般兩輪重試
不放寬 premium 上限；第一次派送失敗、無回應或不支援切模型就直接降級 Sol。

Astra dispatch 前，指揮官先核對持久歷史，再在 caller 管理的本機 JSON ledger
保存唯一預約，回讀確認已占用一次預算。CLI 必須透過 ledgerPath 讀檔，綁定
taskId、reviewLineage、requestedAt、executionRef、requestedModel、risk=high、
exactDiff、costReason、attempt=1；budgetKnown=true、premiumUsed=1 且只能有一筆
RESERVED reservation。inline ledger 不授予派送權。CLI 通過後以 `wx` 原子建立
同一路徑 `.claim` sidecar；已存在或無法保存 claim 均拒絕，失敗後也不刪 claim。
caller 必須在同一 lineage 重用同一 ledger 路徑，保留歷史與 sidecar，不以換檔
逃過預算；CLI 無法驗外部歷史、偽造本機檔或 runtime，主 Agent 負責原始證據回讀。

300 秒從 runtime 收到請求的 UTC requestedAt 起算。期限內沒有同一 executionRef
的 RUNNING／TOKEN_GENERATED／TOOL_EXECUTED（附 UTC 時間與 sourceRef）才 START_TIMEOUT；
QUEUED／ACCEPTED 不算执行。未來、錯 executionRef、缺時間／引用不能延長等待。
期限內已開始的唯一一輪可繼續完成，300 秒不是總審查時間上限。降級前在 runtime
支援時取消或隔離原任務，保留原 receipt、timeout 與 fallback 證據。

Sol fallback 仍須不同 actor、fresh context、當前 exactDiff 與真實對抗驗證。
premium finding 必須回 source 修復並逐項核對，再由 Sol 重審；finding 不是環境
故障，安全拒絕也不得以改派繞過。audit receipt 必填 verdict 與已知非負整數
unresolvedFindingCount；未知不能當 0，大於 0 不允 PASS。runtime 無 selector 時
記實際執行模式與 unknown 型號，不冒稱獨立指定 Sol；CLI 沒有為此新增豁免。

## 容量與風險 gate

Tour 容量由本 repo harness 管理，不與 VibeAI 共用模型 slot 或計數器，
也不匯入 VibeAI 的 BUILD、Reserve、local Supabase 或 shared TEST 上限。
現有 Tour harness 沒有數字型 BUILD 配額，本次不新增或推定配額。
既有一般兩輪重試、隔離驗收與設計評審 2–3 個樣本等數字維持不變；
premium 適用上述更嚴格單次上限。

凍結檔案、migration 授權、Production gate、targeted checks、CI 綠燈與
禁止 force-push 等規則照舊。模型替換不授權資料庫、部署、發布、修改
安全 gate 或擴大工作範圍。VibeAI 的 Product Final Risk 前提與容量不移植，
Tour 採用的單次 premium 成本規則與既有風險／驗收 gate 共同生效。
