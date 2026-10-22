# Agent Run 埋點與 Scorecard（移植自 VibeAI）

本目錄放 Agent Run 的原始帳本：`docs/metrics/agent-runs/<RUN_ID>.json`（raw events，唯一真相）與同名 `.md`（由腳本重算的報告）。

工具移植自 `smallwei0301/vibeaico-admin-rebuild@ddd158733bc133094da43df1c140b9b3fb0633f5` 的 `scripts/agents/`，語意以該版本為準。本 repo 是否強制每輪埋點、評分是否作為 gate，仍由 `docs/AGENT-EXECUTION.md` 與 Owner 決策決定；移植工具本身不改變任何治理規則。

## 指令

```bash
# 建立新 Run（schema v2／deliveryTruthVersion 4）
node scripts/agents/run-ledger-v2.mjs init --run-id 2026-10-22-midao2-r01 --closeout-owner PRODUCT_MAIN_SESSION

# 事件發生後立即寫入 raw fact，再檢查 capture 健康度（--strict-live 不健康時 exit 2）
node scripts/agents/scorecard-readiness.mjs docs/metrics/agent-runs/<RUN_ID>.json --strict-live

# 驗證帳本
node scripts/agents/run-ledger-v2.mjs validate docs/metrics/agent-runs/<RUN_ID>.json

# 依 current profile（OBSERVED_V1／LEGACY_V2）重算分數與 Markdown
node scripts/agents/score-run-current.mjs docs/metrics/agent-runs/<RUN_ID>.json --output docs/metrics/agent-runs/<RUN_ID>.md

# 關帳：產出新的 terminal 候選檔；會先跑 grading preflight，會永久 NOT_GRADED 時 fail closed
node scripts/agents/run-ledger-v2.mjs closeout docs/metrics/agent-runs/<RUN_ID>.json \
  --status COMPLETE --ended-at <ISO UTC> --main-end-sha <40 碼 sha> \
  --open-issues-end <n> --open-prs-end <n> --evidence-ref github:issue#<n> --output <new-file>
```

規則重點（完整語意見 VibeAI `docs/AGENT-EXECUTION.md` §10）：

- raw facts 在事件發生當下寫入，不在 closeout 時倒推；沒量到的值維持 `null`，不補 0。
- readiness 只檢查 raw-event capture 健康度，不產生分數；active Run 的 terminal 欄位列為 `terminalOnlyPending`，不算失敗。
- `score-run-current.mjs` 依 `startedAt` 決定 profile：`2026-09-15T00:00:00Z` 起為 `OBSERVED_V1`，之前為 `LEGACY_V2` replay。
- Completion Truth 的 Issue 證據只承認本 repo（`GITHUB_REPOSITORY`，未設定時為 `smallwei0301/tour-platform`）。

## 檔案

| 檔案 | 用途 |
|---|---|
| `scripts/agents/run-ledger-v2.mjs` | v4 Run 建立、驗證、closeout（含 grading preflight） |
| `scripts/agents/scorecard-readiness.mjs` | active Run 的 live capture 健康度檢查 |
| `scripts/agents/score-run-current.mjs` | current Product Scorecard dispatcher（OBSERVED_V1） |
| `scripts/agents/score-run-v2.mjs` | Delivery Outcome v2／LEGACY_V2 計分與 Completion Truth 判定 |
| `scripts/agents/run-ledger.mjs`、`score-run.mjs` | schema v1 帳本與加權用量（v2 依賴） |
| `scripts/agents/agent-wip-policy.mjs` | 只含 `MAX_ACTIVE_CANDIDATES = 3`（計分用上限） |

## 與來源的差異

1. 每個移植檔在 shebang 後加上來源 SHA 標頭。
2. `score-run-v2.mjs`：`CURRENT_REPOSITORY` 預設值改為 `smallwei0301/tour-platform`。
3. `agent-wip-policy.mjs` 只移植 `MAX_ACTIVE_CANDIDATES`；VibeAI 的 PR lane metadata 驗證未移植。這個數字只用於計分，不是 tour-platform 的派工配額。
4. 未移植：`review-runs.mjs`（跨 Run 復盤比較）、`scorecard-required-gate.mjs`（PR 綁定 gate）、`completion-truth.mjs`、相關 GitHub workflows。
5. 測試：VibeAI 的 7 個 Vitest suite 轉成 `node:test`（`apps/web/tests/unit/agent-metrics-*.test.mjs`，斷言不變），透過 `apps/web/tests/helpers/vitest-expect.mjs` 相容層執行。fixture 的 Issue 網址改為本 repo；依賴 `review-runs.mjs` 的 1 個案例未移植（不是 `test.skip`，所以 runner 顯示 skipped 0）。另有 `agent-metrics-tour-port.test.mjs` 鎖住上述差異。

日後同步來源時：更新標頭 SHA 與本檔 SHA，重新套用上述差異，跑 `agent-metrics-*` 測試。
