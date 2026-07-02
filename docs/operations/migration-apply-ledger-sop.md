# Production migration apply ledger SOP（#1293）

> Owner 已拍板 **選項 B**：`docs/operations/migration-ledger.json`（repo 內 artifact，更新走 PR）為 apply 狀態的 **source of truth**，既有 live 探測（`scripts/verify-migrations-applied.mjs`、`scripts/production-schema-drift-preflight.mjs`）作為機器佐證交叉驗證。
> 失效方向 fail-safe：忘了補 ledger entry → release gate 直接亮 HOLD，而不是像 #1286 那樣 fail-silent。

## Gate 如何運作

- `scripts/check-migration-ledger.mjs` 純靜態比對 `supabase/migrations/*.sql`（排除 `.rollback.sql`）vs ledger records，**不需任何 secrets、不對任何 DB 寫入**。
- 每支 migration 檔必須有 `status: "verified"` 的 record，或被 `baseline` record 涵蓋（baseline 涵蓋「檔名排序 <= baseline filename」的全部歷史檔案；2026-07-02 的首筆 baseline 依據 #1560 drift 大清查與補套結果回填）。
- 接線位置：
  - `scripts/preflight-check.sh`（release preflight，CI `ci.yml` 最後一步會跑）
  - `.github/workflows/migration-drift-detect.yml` 的 static job（PR/push/每日 cron）
- 手動執行：`node scripts/check-migration-ledger.mjs`（`--json` 出機器可讀報告）。exit 1 = HOLD。

## 套用一支新 migration 的四步驟（缺一不可）

每次對 production 套用 schema migration，**不論用什麼管道**（Supabase Dashboard SQL Editor、Supabase CLI、**Supabase MCP `apply_migration`** — MCP 套用者一樣要補 ledger entry），都必須完成：

### 1. 備份（backup）

- 於 Supabase Dashboard 確認有可用的 PITR / 每日備份點，或對受影響資料表先行匯出快照。
- 記下備份參考（例如「PITR 可回復至 2026-07-02 20:00 (UTC+8)」），寫進 record 的 `note` — **不得含 connection string、密碼、token**。

### 2. 套用（apply）

- 依檔名時序套用 `supabase/migrations/` 內的目標檔案（migration SQL 應冪等：`IF NOT EXISTS` 等）。
- 確認同名 `.rollback.sql` 存在且可用（新 migration 依 `supabase/migrations/README.md` 規範應附 rollback）。

### 3. 驗證（verify）

- 跑 `node scripts/verify-migrations-applied.mjs`（需 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`）確認 0 missing；必要時加跑 `node scripts/production-schema-drift-preflight.mjs`。
- 注意限制：PostgREST 探測只看得到 table/column，function/index/RLS 需以功能 smoke 或 SQL 查詢另行驗證，並在 `note` 註明驗證方式。
- 驗證輸出（遮蔽後）留存於 issue 留言或 `docs/operations/qa-reports/`。

### 4. 更新 ledger（record）

在 `docs/operations/migration-ledger.json` 的 `records` 追加一筆並開 PR（owner merge 即 sign-off）：

```json
{
  "filename": "20260815000000_example_feature.sql",
  "environment": "production",
  "operator": "owner (smallwei0301) + Claude Code agent",
  "applied_at": "2026-08-15T14:30:00+08:00",
  "status": "verified",
  "note": "經 Supabase MCP apply_migration 套用；backup: PITR 可回復至 2026-08-15 14:00；rollback: 同名 .rollback.sql；驗證: verify-migrations-applied.mjs 0 missing（refs #NNNN）。"
}
```

欄位規範：

| 欄位 | 說明 |
|---|---|
| `filename` | migration 檔名（不含路徑），須與 `supabase/migrations/` 內一致 |
| `environment` | 目標環境，目前僅 `production` |
| `operator` | 誰執行／誰核可（GitHub handle 即可，不放 email 以外個資） |
| `applied_at` | ISO 8601 含時區（Asia/Taipei `+08:00`） |
| `status` | `verified`（已套用且驗證）／`pending`（已套用、驗證未完成 — **gate 仍 HOLD**）／`baseline`（僅歷史回填用，之後不再擴大） |
| `note` | 備份參考、rollback 參考、驗證指令與結果、相關 issue/PR — **全部 redacted** |

## Rollback 時

1. 執行對應 `.rollback.sql`（先備份）。
2. 將該筆 record 的 `status` 改回 `pending` 並在 `note` 註明 rollback 時間與原因（或追加一筆說明），開 PR 留審計軌跡。

## 安全邊界

- ledger 與所有 evidence **不得**保存 DB password、service role key、connection string、cookie、token、完整付款 payload、未遮蔽 PII。
- 本機制不對 production DB 做任何自動寫入；所有 apply 均需 operator 明確執行與核可。

## Refs

- #1293（本 SOP 與 gate）、#1286（drift 事件根因）、#1287（偵測層）、#1560（2026-07-02 drift 大清查＋baseline 依據）
- 測試：`apps/web/tests/api/issue1293-migration-ledger-gate.test.mjs`
