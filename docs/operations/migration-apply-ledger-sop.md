# Production migration apply ledger SOP（#1293）

> Owner 已拍板 **選項 B**：`docs/operations/migration-ledger.json`（repo 內 artifact，更新走 PR）為 apply 狀態的 **source of truth**，既有 live 探測（`scripts/verify-migrations-applied.mjs`、`scripts/production-schema-drift-preflight.mjs`）作為機器佐證交叉驗證。
> 失效方向 fail-safe：忘了補 ledger entry → release gate 直接亮 HOLD，而不是像 #1286 那樣 fail-silent。

## Gate 如何運作

- **Source gate（PR／local）：** `node scripts/check-migration-source-gate.mjs --mode source`。先驗證capture＋expected-terminal transactions及其交叉綁定，才讀frozen manifest／migration source；固定128支pre-cutoff bytes不可變，已pin post-cutoff不可變，允許排序正確的新post-cutoff source尚未套production。
- **Verified gate（release／post-apply／schedule／manual）：** `node scripts/check-migration-ledger.mjs --mode verified`。同樣先驗兩個publication transactions，才靜態比對 `supabase/migrations/*.sql`（排除 `.rollback.sql`）vs production apply ledger；**不需任何 secrets、不對任何 DB 寫入**。
- 每支migration在verified mode必須有 `status: "verified"` 的record，或被歷史 `baseline` record涵蓋。`supabase/baselines/v1` publication ledger不得冒充production apply ledger。
- 接線位置：
  - `scripts/preflight-check.sh`與`.github/workflows/ci.yml`：explicit source mode。
  - `.github/workflows/migration-drift-detect.yml`：PR source mode；push/main、每日schedule與manual dispatch另跑verified mode。
- Exit 1 = HOLD。新migration PR可source PASS但verified HOLD；只有完成下列備份→套用→驗證→更新production ledger後，verified才可PASS。

## 套用一支新 migration 的四步驟（缺一不可）

每次對 production 套用 schema migration，**不論用什麼管道**（Supabase Dashboard SQL Editor、Supabase CLI、**Supabase MCP `apply_migration`** — MCP 套用者一樣要補 ledger entry），都必須完成：

### 1. 備份（backup）

備份證據**依專案方案是否支援 PITR 分成兩條路徑**，擇一完成即視為滿足本步驟。

#### 1-A. 若專案方案支援 PITR / 每日備份

- 於 Supabase Dashboard 確認有可用的 PITR / 每日備份點，或對受影響資料表先行匯出快照。
- 記下備份參考（例如「PITR 可回復至 2026-07-02 20:00 (UTC+8)」），寫進 record 的 `note` — **不得含 connection string、密碼、token**。

#### 1-B. 若專案方案不支援 PITR（本專案 Supabase Free plan 現況）

本專案 Supabase 專案永久維持 Free plan，**不支援 PITR / daily backup**，1-A 在現實中不可能達成。此時改採下列「人工可還原快照」作為補償控制，且四項證據**必須在套用前、同一連線、同一時點取得**：

1. 受影響物件（函式／view／policy 等）的**完整定義全文**存檔，例如函式用 `pg_get_functiondef(oid)`。
2. 受影響物件的**身分與權限屬性快照**：`oid`、`prosecdef`、`proconfig`、`proacl`、`proowner`、`oid::regprocedure::text`（非函式物件取對應等價欄位）。
3. 上述存檔內容的 **SHA-256** 記入 Ops 卡 comment 與 ledger `note`；**全文本身不入 repo**，以 kanban 附件或工作區保存。
4. `note` 內明確記載「本專案無 PITR，回復路徑＝對應 rollback SQL 逐字還原 ＋ roll-forward 優先」。

> **適用範圍限制**：此替代路徑僅適用於**不含 DML、不含結構性 DDL** 的變更（例如純 `CREATE OR REPLACE FUNCTION`）。若變更含資料異動或結構性 DDL，且專案無 PITR，**必須先取得 Owner 對殘餘風險的個案書面同意**，不得逕行套用本替代路徑。

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

### 歷史證據例外（僅限回填）

若既有 production migration 的精確歷史套用時間已無法復原，`applied_at` 可記錄**第一個可稽核、可持久保存的確認時間戳**，而非宣稱它是實際套用時間。該 record 的 `note` 必須明確說明「此為 first durable confirmation timestamp，actual exact historical apply time is unavailable」並列出來源（例如 issue/comment URL）及目前 catalog 驗證方式。

此例外只用於既有歷史回填；**不得用於任何新的 migration**。新 migration 仍必須記錄實際套用完成的精確 ISO 8601 時間、operator、備份與 post-apply 驗證證據。

### #1861 單筆歷史缺證例外（Owner 2026-10-06 核可）

本節**僅適用**既有 `20260824135300_issue1861_midao_request_claims_bridge.sql` 的一次性 production ledger 回填。Owner 於 `2026-10-06T05:06:23Z`（Asia/Taipei `13:06:23`）在明示歷史備份／完整復原證據缺失及不修改正式資料庫的決策請求後回覆「接受」。這是**現在核可歷史缺證風險**，不證明原操作者、當時結構性 DDL 風險核可或備份／成功還原曾存在；**不得援引為其他 migration 或任何新 migration 的豁免**，上列新 migration 四步驟與 Free plan 結構性 DDL 限制照常適用。

- **既有套用來源**：[歷史收據](https://github.com/smallwei0301/tour-platform/issues/1861#issuecomment-5403187032) 於 `2026-08-25T00:11:45Z` 報告 exact canonical source 在一個 Production transaction 套用。`applied_at` 依上節記此 first durable confirmation timestamp；actual exact historical apply time is unavailable。`operator` 明記歷史操作者 unknown，Owner 僅為本次例外核可者，不能倒填為歷史操作者。
- **有限現時驗證**：`2026-10-06T04:56:04.124139Z` PostgreSQL 17.6 catalog-only metadata 與 canonical source 完成 13 項離線比對，涵蓋兩表、13 欄、13 constraints、4 unique indexes、RLS/FORCE RLS、無 policies/column ACL、所列角色 CRUD/EXECUTE 及兩函式 signature/result/language/DEFINER/search_path；兩份 `prosrc` 與 canonical body 逐 byte 相同。獨立唯讀審查確認此 scope。source SHA-256=`dc7d8b4c55dbd944864b7067ba4b2ec2902c381be4c77674cfac9579268d63e1`；catalog SHA-256=`41046574c88768728b0a13e2701cf0607302b52113e544bb928e2ca18557f003`。遮蔽後的證據摘要與限制記入 [#1861 worklog](worklogs/issue1861.md)，raw metadata 不入 repo。
- **未復原的歷史證據**：pre-apply backup、完整 schema/data recovery／成功還原及當時結構性 DDL 風險核可仍 `NOT_VERIFIED`，且此支無同名 rollback companion。現時查核或新備份無法補出歷史事實；`CREATE TABLE` 亦不符合 1-B 的純函式替代路徑。這一筆得以回填是 Owner 接受缺證的個案例外，不能稱四步驟全部完成。
- **驗證限制**：沒有新 runtime／業務 RPC 測試；真雙 backend 競態、完整 replay／rollback 矩陣、definer owner bypass／完整依賴 ACL 未驗。既有同一 `pg.Client` 的 `Promise.all` case 不證明真雙 backend 競態。service_role 額外 `TRUNCATE/REFERENCES/TRIGGER/MAINTAIN` 來源 unknown；canonical 未撤其既有/default grants，不據此推定 migration 執行不一致，也不宣稱完整 least-privilege PASS。
- **記錄與安全邊界**：只追加這一筆六欄 record，證據與例外寫入 `note`，不擴大 baseline、不改 verifier／schema／harness／migration／CI。不重套 migration、不操作 DB／TEST／憑證／權限／部署。此筆 `verified` 只表示在本個案例外下的既有套用與有限 catalog 核對，不代表 #1861 全功能或 recovery 驗收；其餘九支缺少 verified 紀錄及整體 release 仍 `HOLD`。

## Rollback 時

1. 執行對應 `.rollback.sql`（先備份）。
2. 將該筆 record 的 `status` 改回 `pending` 並在 `note` 註明 rollback 時間與原因（或追加一筆說明），開 PR 留審計軌跡。

## 安全邊界

- ledger 與所有 evidence **不得**保存 DB password、service role key、connection string、cookie、token、完整付款 payload、未遮蔽 PII。
- 本機制不對 production DB 做任何自動寫入；所有 apply 均需 operator 明確執行與核可。

## Refs

- #1293（本 SOP 與 gate）、#1286（drift 事件根因）、#1287（偵測層）、#1560（2026-07-02 drift 大清查＋baseline 依據）、#1855（Free plan 無 PITR 的替代 backup 分支）
- 測試：`apps/web/tests/api/issue1293-migration-ledger-gate.test.mjs`
