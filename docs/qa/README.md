# QA 文件索引

> `qa/` 保存 QA policy、測試入口、E2E／script 導航與 dated checklist／evidence。`docs/qa/**` 多數檔案只證明特定 SHA、環境與時間點，不是永久測試真值。
>
> QA 驗收首要規則在 [`.cursor/harness/07_testing_playbook.md`](../../.cursor/harness/07_testing_playbook.md)；本檔只提供穩定路由與 command map。

## QA 文件分類

- `QA`：testing playbook、package scripts、focused tests、Playwright／E2E 與可重用 QA script。
- `CURRENT EXECUTION`：live issue AC、current head SHA、CI／preview／live 實跑 output。
- `ARCHIVE`／dated evidence：過往 checklist、manual report、sign-off；只作當時證據，不代表現在仍通過。

## 先讀入口

- [`.cursor/harness/07_testing_playbook.md`](../../.cursor/harness/07_testing_playbook.md) — QA 驗收標準、TDD、Playwright、evidence redaction。
- [`../../apps/web/e2e/README.md`](../../apps/web/e2e/README.md) — Admin E2E 安裝、環境與執行方式。
- [`../../scripts/qa/README.md`](../../scripts/qa/README.md) — deterministic evidence sweep 與 QA data script 邊界。
- [`../operations/qa-reports/`](../operations/qa-reports/) — operations side 的 dated QA reports；讀取時要核對 SHA／URL／時間。
- [`../security/evidence-artifact-governance.md`](../security/evidence-artifact-governance.md) — Public／Restricted／Sensitive artifact 分級與 redaction。

## Command map

Root scripts 由 [`../../package.json`](../../package.json) 宣告，實際 app scripts 由 [`../../apps/web/package.json`](../../apps/web/package.json) 宣告：

```bash
# root／workspace checks
npm run lint
npm run typecheck
npm test
npm run build
npm run qa:admin-evidence-sweep

# readiness 狀態（不是 QA pass 本身）
npm run readiness:check
npm run readiness:snapshot

# apps/web tests
npm run test:e2e -w @tour/web
npm run test:e2e:smoke -w @tour/web
npm run test:smoke:booking-core -w @tour/web
```

選擇 focused test 時，以 issue AC 與變更範圍為準；Node 版本遵循 `.nvmrc`／package `engines`。Backend／API 優先 `node --test` focused suite；使用者可見流程要依 playbook 做真實 Playwright／preview smoke，不能只以 source-contract test 代替。

## 驗收真值

| 驗收問題 | 必須綁定 |
|---|---|
| 是否符合 issue 目標 | live issue／PR 的 AC 與 reviewer scope |
| 測試是否真的跑過 | command、exit code、pass output、current head SHA |
| UI／互動是否可用 | Playwright／preview／live browser evidence；不能只讀 source |
| CI 是否通過 | GitHub check conclusion／URL 或明確的 unavailable blocker |
| Evidence 是否可公開 | redacted artifact；不得含 secrets、cookie、token、付款 payload、未遮蔽 PII |
| Ready／complete 是否合理 | test result + scope inventory + direct issue-goal verification |

QA report 應以繁體中文記錄環境 URL、deploy／commit SHA、Asia/Taipei 時間、逐條 AC 與 PASS／HOLD／FAIL。需要 operator-only secret、production payment、真實寄信或其他高風險 side effect 時，標示 `NOT_VERIFIED-live`／`NOT_PROD_EXECUTED` 並寫明替代證據與 unblock 條件，不得假裝 pass。

## Dated evidence 使用規則

- [`booking-v2-rollout-manual-checklist.md`](booking-v2-rollout-manual-checklist.md) 與其他 dated checklist 是流程／歷史證據入口；目前狀態要回到 live issue、current SHA、CI、preview 或 fresh report。
- `docs/operations/qa-reports/` 的檔名與內容若有日期、issue number 或 deployment reference，只能描述該次執行，不可直接推論現在的 readiness。
- `docs/qa/` 不保存 secrets／PII；artifact storage 與 session state 依 security governance 走受控路徑。

## 任務路由

- API／DB：先讀 [`../04-tech/README.md`](../04-tech/README.md)，再按 playbook 跑 focused regression；若有 UI↔API 互動，再補 Playwright／preview evidence。
- UI／互動：先讀 [`../../BRAND_BOOK.md`](../../BRAND_BOOK.md) 與 playbook，重用 `apps/web/e2e/helpers.ts`，新增 spec 需保留可重跑路徑。
- Ops／release：先讀 [`../operations/README.md`](../operations/README.md) 與對應 runbook，再確認 owner approval、runtime evidence 與 rollback path。
- Security／incident：先讀 [`../security/README.md`](../security/README.md)，所有公開 evidence 先完成 redaction。
