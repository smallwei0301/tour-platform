# Security／Incident 文件索引

> `security/` 保存 incident closure、credential／secret rotation、evidence governance 與安全決策背景。歷史 closure 或 dated evidence 不等於目前安全狀態。
>
> 高風險任務先讀 [`../../CLAUDE.md`](../../CLAUDE.md) 與 live issue scope；索引文件不自行授權 action：DML 走 `sql-guard` audit 與影響回報，schema apply 走 `SQL-OVERRIDE`／migration SOP，credential、付款、restore、incident 則走各自 runbook 與 operator／owner approval。

## 文件狀態與真值

| 狀態 | 可提供 | 目前真值 |
|---|---|---|
| `CURRENT EXECUTION` | live security issue、當前 guards／config、核准中的 remediation scope | live issue／PR、現行 code／config／CI guard、redacted runtime evidence |
| `TECHNICAL CONTRACT` | security boundary、evidence schema、runbook 前置條件 | current guards、tests、deployment／provider controls；與文件衝突時以實作為準 |
| `QA` | 脫敏後 test／scan／incident evidence | current head SHA、CI／runtime output、reviewer／owner sign-off |
| `ARCHIVE` | incident closure、歷史 rotation／rewrite、dated evidence | 只作稽核背景，不推論目前已安全或已完成 |

## 先讀入口

- [`../../CLAUDE.md`](../../CLAUDE.md) — 凍結區、secret／env、auth、SQL、production side-effect 與 migration 規則。
- [`../../.cursor/harness/01_diagnostics.md`](../../.cursor/harness/01_diagnostics.md) — 防線、能力限制與 P0 override 邊界。
- [`../../.cursor/harness/07_testing_playbook.md`](../../.cursor/harness/07_testing_playbook.md) — 安全／QA evidence 的實跑與 redaction 要求。
- [`evidence-artifact-governance.md`](evidence-artifact-governance.md) — Public／Restricted／Sensitive artifact 分級、保存與升級。
- [`../operations/security/rls-grants-preflight-runbook.md`](../operations/security/rls-grants-preflight-runbook.md) — RLS／grant preflight。
- [`../operations/migration-apply-ledger-sop.md`](../operations/migration-apply-ledger-sop.md) — migration apply 的核准、verify、ledger 與 rollback boundary。

## Incident／credential 文件

- [`issue-119-incident-closure-plan.md`](issue-119-incident-closure-plan.md) — incident closure 的 rotation、environment cutover、history rewrite 三條軌；每一步都要回到 owner／provider evidence。
- [`issue-119-history-rewrite-runbook.md`](issue-119-history-rewrite-runbook.md) — git history rewrite 與 team reset 參考；不得在未核准時執行 force-push 或歷史破壞操作。
- [`issue-119-evidence-log-template.md`](issue-119-evidence-log-template.md) — redacted closure evidence 欄位。
- [`issue-56-secret-rotation-checklist.md`](issue-56-secret-rotation-checklist.md) — secret rotation／revocation checklist。
- [`issue-56-blocker-followup-status.md`](issue-56-blocker-followup-status.md) — 歷史 blocker follow-up；使用前重新核對 live issue／provider state。
- [`issue-119-evidence-2026-04-20.md`](issue-119-evidence-2026-04-20.md) — dated incident evidence，只作當時稽核資料。

## 安全任務路由

1. 先確認 live issue／PR、risk domain、owner、允許的檔案與 side effect；不要把歷史 closure 當成目前批准。
2. 讀 current guards／config 與對應 tests；runtime／provider 狀態需要 fresh evidence，不能只引用 dated report。
3. 所有公開 issue／PR／README／QA report 只放 redacted 摘要；禁止寫入 token、cookie、service-role key、完整付款 payload、credential 值或未遮蔽 PII。
4. 若操作涉及 credential rotate、production DB、RLS、migration、付款、auth 或 incident containment，先依 action domain 走對應 gate：DML 做 `sql-guard` audit 並立即回報影響；schema apply 取得 `SQL-OVERRIDE` 並依 migration SOP；credential、付款、restore、incident containment 依各自 runbook 取得必要的 owner／operator approval；技術 review 不是執行授權。
5. 完成後把 test／CI／runtime evidence 綁定 current head SHA 與時間，交給獨立 reviewer；不要由執行者自行宣稱 security pass。

## Evidence 邊界

- [`evidence-artifact-governance.md`](evidence-artifact-governance.md) 是 artifact 分級與 redaction 的主要入口。
- Public repo 只保存遮蔽後摘要；Restricted session、cookie、screenshot、log 依受控 workspace／storage 規則保存，不得混入 git。
- Incident closure 的「已完成」只表示該次 closure evidence 完整；目前安全狀態仍須查 current guards、live issue、provider console 與 fresh scan／runtime evidence。
