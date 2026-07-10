# issue1686 — 正式環境 GitHub Actions admin credential 與排程控制安全收斂
> 最後更新：2026-07-10 08:36 CST（Asia/Taipei）｜負責 session：Pandora / tp-planner / 2026-07-10

## 目標

以只讀、redacted 證據釐清 `/admin/go-no-go` 的 production credential 缺口，定義可執行的最小安全修補、錯誤契約、稽核要求與 operator gate；本規格不建立 credential、不寫 Vercel Production env、不 redeploy、不切換 workflow。

## 結論摘要

- `close_gate_only: false`。不能只補 Production env：現行 route 仍會把 GitHub raw error body包進 `SERVER_ERROR` 回 browser，且 PR #1683 將 route 內的 admin defense-in-depth 與 mutation audit 移除；credential 一旦補上，這兩個缺口會立即進入可觸發路徑。
- Application/runtime 層根因已確認：正式 UI 命中 `getGithubActionsToken()` 三個來源皆為空時的 `token_missing` branch；程式依序讀 `GITHUB_ACTIONS_ADMIN_TOKEN`、`GH_TOKEN`、`GITHUB_TOKEN`，缺失時回 `hasGithubToken:false`。
- Vercel control-plane 子類型尚未直接確認：本 worker 的 Vercel CLI 無登入 credential，無法只讀列出 env metadata，因此目前不能聲稱是「Production scope 不存在」或「已設定但 deployment 尚未重建」其中哪一種。Operator 必須以只顯示名稱/scope/timestamp/deployment 的 metadata probe 補證。
- Registry 不是目前主因：2026-07-10 只讀比對 GitHub live workflow metadata，16/16 registry paths 全數 matched，且全為 `active`。
- 正式站未帶 admin credential 呼叫 `GET /api/admin/cron-jobs` 回 HTTP 401 / `UNAUTHORIZED`，證明 current deployment 的 middleware admin gate 正常存在；cookie mutation 的 CSRF gate仍由 middleware 覆蓋 `/api/admin/**`，前端 PATCH 亦帶 `csrfHeaders()`。

## 只讀證據

### Repo / code

- `apps/web/src/lib/admin/go-no-go-schedules.mjs:203-209`：repo slug 與 token lookup；目前保留模糊的 `GH_TOKEN` / `GITHUB_TOKEN` fallback。
- `apps/web/src/lib/admin/go-no-go-schedules.mjs:239-260`：missing token 被折成每支 job 的 `token_missing`，matched/canToggle 由 token 與 path 決定。
- `apps/web/src/lib/admin/go-no-go-schedules.mjs:263-285`：任何 GitHub non-2xx 讀取 raw response text 後拼進 thrown message。
- `apps/web/app/api/admin/cron-jobs/route.ts:6-13,16-30`：GET/PATCH 把 exception message 原樣放入 client `SERVER_ERROR`；PATCH 成功只回 requested result，沒有 before/after live verification，也沒有 audit。
- `apps/web/middleware.ts:105-145,299-310`：cookie/session mutation 的 CSRF double-submit；`PATCH /api/admin/cron-jobs` 在此範圍內。
- `apps/web/middleware.ts:344-397,435-440`：admin page/API 的 token、allowlist、session-version/expiry gate與 matcher。
- `apps/web/app/admin/go-no-go/CronJobsPanel.tsx:43-83`：GET/PATCH 後 reload；PATCH 使用 `csrfHeaders()`。
- `apps/web/app/admin/go-no-go/CronJobsPanel.tsx:99-103,158-186`：目前只區分 missing token / unmatched，其他 failure 顯示 raw server message。
- `apps/web/tests/api/go-no-go-schedule-toggle-route.test.mjs:7-16`：目前只是 source-contract，不會執行 route/helper failure branches。
- `apps/web/tests/api/go-no-go-schedule-registry.test.mjs:66-103`：只覆蓋 active/disabled view-model happy path。
- `apps/web/e2e/admin-cron-jobs-panel.spec.ts:50-104`：是舊 DB kill-switch payload，與目前 GitHub live contract 已漂移，不能作為 #1686 驗收證據。
- `git show 6be45a29^..6be45a29`：PR #1683 將原 route 的 `checkAdminAuth()` 與 `appendAuditLog()` 移除；middleware 仍擋外部請求，但 route defense-in-depth 與 mutation audit 回歸。

### Live / external metadata（全部 redacted）

- 正式站未帶 credential的只讀 probe：`GET https://tour-platform-nine.vercel.app/api/admin/cron-jobs` → HTTP 401、error code `UNAUTHORIZED`；未輸出 cookie/token。
- GitHub live workflow metadata：repo `smallwei0301/tour-platform` 共 25 workflows；schedule registry 16，matched 16，unmatched 0，non-active 0。
- Vercel project link metadata存在：project `tour-platform`；但 `vercel whoami` 回 `No existing credentials found`，故 env 名稱/scope/createdAt 與 deployment 綁定仍是 operator evidence blocker。
- GitHub 官方 REST 文件：list workflows 需要 repository `Actions: read`；enable/disable workflow 需要 `Actions: write`；fine-grained PAT 與 GitHub App installation token均支援。
- GitHub 官方文件：installation token 1 小時到期，可把 token再縮到指定 repositories/permissions；GitHub 對長期整合建議 GitHub App，PAT較適合 API testing/short-lived scripts。

## Scope decision

### 必做（最小安全修補）

1. 把 GitHub client 的錯誤分類與 redaction做成 server-side domain contract；任何 raw GitHub body、request headers、token或credential metadata不得進 API response/log/audit。
2. GET 保留 registry-only degraded mode，但不再用 `hasGithubToken` 二元值表示所有故障。
3. PATCH 必須：驗證 admin → 驗證 payload與 registry jobKey → 讀 before state → 執行一次 PUT → 重新 GET驗證 after state → 寫 durable audit → 回 verified state。任何未知/暫時故障 fail closed。
4. 恢復 route defense-in-depth admin auth；不得取代或放寬 middleware admin/CSRF。Cookie-auth PATCH仍須 exact route middleware CSRF negative/positive test；header-token自動化維持既有「無 cookie則不套 CSRF」政策，不在本案偷偷改政策。
5. Mutation audit 必須 durable（不能只依賴 serverless in-memory `appendAuditLog`）：至少含 actor、repoSlug、jobKey、workflowPath、requestedEnabled、beforeState、afterState、outcome、errorClass、requestId、timestamp；不得含 token/raw body/headers。Audit intent寫入失敗時不得呼叫 GitHub mutation；mutation後 finalization失敗時需明確標示 pending audit供 operator追查。
6. UI 逐一呈現 normalized failure class與 operator action；沒有 `ready` + matched，不得啟用 toggle。
7. 更新/新增可重用 E2E；不得沿用已漂移的舊 DB kill-switch fixture當作 GitHub live證據。

### 不做

- 不建立 PAT/GitHub App、不寫任何 credential值。
- 不修改 `NEXT_PUBLIC_*`，不把 credential送 browser。
- 不改 auth/CSRF policy，不碰 frozen `middleware.ts`、`src/config/security-env.mjs`、`src/config/startup-env.mjs`；若 implementation發現非改不可，先 block取得明確 override，不得擴張。
- 不寫 Vercel Production env、不 redeploy、不 enable/disable workflow。
- 不修改 workflow YAML排程。
- 不新增 migration；優先使用既有 `audit_logs`。若 durable audit契約無法在既有 schema成立，另案走 migration operator gate，不得順手擴 scope。

## Server / UI contract

### GET `/api/admin/cron-jobs`

HTTP 200且 `ok:true` 保留 registry可見性；新增安全、可枚舉的連線狀態（欄位名可由 builder依既有 API style微調，但語意不可縮水）：

```text
githubConnection.status:
  ready | missing | invalid_or_revoked | insufficient_permission |
  repo_mismatch | rate_limited | transient_error
githubConnection.canRead: boolean
githubConnection.canWrite: boolean
githubConnection.retryable: boolean
githubConnection.operatorAction:
  none | configure_credential | rotate_credential | grant_actions_write |
  verify_repo | retry_later
githubConnection.retryAfterSeconds: number|null  # 僅限安全、可解析 header
jobs[].github.state:
  active | disabled_manually | deleted | archived | workflow_unmatched | unknown
jobs[].github.canToggle: boolean  # 僅 status=ready、matched、可寫時 true
```

禁止欄位：raw GitHub body、GitHub message/documentation_url、Authorization/request headers、token prefix/length、Vercel secret metadata。

### Failure classification

| Class | Server判定 | GET/UI | PATCH |
|---|---|---|---|
| `missing` | 專用 server env無值 | 「未配置」；registry可見；全 toggle disabled | `GITHUB_CREDENTIAL_MISSING`，503，未呼叫GitHub |
| `invalid_or_revoked` | GitHub 401 | 「授權失效，請輪替」；fail closed | `GITHUB_CREDENTIAL_INVALID`，502/503；不回 raw body |
| `insufficient_permission` | GitHub 403且非 rate-limit | 「權限不足，需要 Actions: write」；fail closed | `GITHUB_PERMISSION_DENIED`，502/503 |
| `repo_mismatch` | GitHub 404/target repo不可達 | 「Repo設定或存取錯誤」；不得誤標 workflow unmatched | `GITHUB_REPO_MISMATCH`，502/503 |
| `workflow_unmatched` | Credential/repo ready，但單一 registry path不在 live list | 只禁用該 row；其他 matched rows可操作 | `GITHUB_WORKFLOW_UNMATCHED`，409，未PUT |
| `rate_limited` | 429，或403且 rate-limit remaining=0 | 「GitHub暫時限流」；全 toggle fail closed；可顯示安全 retry time | `GITHUB_RATE_LIMITED`，503，retryable=true |
| `transient_error` | timeout/network/GitHub 5xx/無法分類 | 「GitHub暫時無法連線」；unknown且fail closed | `GITHUB_TRANSIENT`，503，retryable=true |

Admin auth的 401與CSRF的 403保持既有語意；不得拿 GitHub upstream 401/403冒充 browser/admin授權錯誤。

### PATCH success

- Unknown `jobKey` / non-boolean `enabled` → 400，且GitHub fetch/PUT/audit mutation都不得發生。
- Success response必須回實際重新讀取的 `beforeState` / `afterState`與 normalized job view；不能只 echo requested boolean。
- 若 after state與要求不一致，回 fail-closed verification error並留下 durable failure audit，UI reload真實狀態。

## Credential decision

### 建議：GitHub App installation token（長期正式方案）

- Repository access：只安裝/只 mint給 `smallwei0301/tour-platform`。
- Repository permissions：`Actions: write`（已涵蓋 list所需 read）；不授予 Contents/Admin/Secrets/Organization permissions。
- Runtime：server-side以 App ID + installation ID + private key mint 1 小時 token並cache至到期前安全刷新；token不進 client/log/audit。
- Owner：木村哥指定的GitHub/Vercel operator，不綁一般開發者帳號。
- Rotation：private key定期輪替；installation token自動短效；緊急時 suspend/uninstall app或撤銷private key。
- 理由：這是長期server automation，GitHub官方建議GitHub App；短效、repo/permission可限縮、身份不依附單一使用者。

### 可接受的暫時 bridge：fine-grained PAT（需 operator明確選擇）

- Resource owner：目標repo owner；Repository access：Only selected repositories → `tour-platform`；Permission：Actions `Read and write` only。
- 明確 expiry（建議最長30天，若只是解除阻擋則7天）；禁止 infinite。
- Owner/rotation reminder/撤銷責任人必須寫入runbook；使用者離職/失去repo access會使token失效。
- 僅能放 `GITHUB_ACTIONS_ADMIN_TOKEN`；不得依賴 `GH_TOKEN` / `GITHUB_TOKEN` fallback作正式設定。
- PAT是time-boxed bridge，不是默認長期終態；到期前必須切GitHub App或重新獲operator核准。

## Expected changed files

### API / security slice（tp-builder-api）

- `apps/web/src/lib/admin/go-no-go-schedules.mjs`
- `apps/web/app/api/admin/cron-jobs/route.ts`
- `apps/web/src/lib/audit-log.mjs`（僅在既有 helper不足以完成 durable intent/finalization時）
- `apps/web/tests/api/issue1686-go-no-go-credential-contract.test.mjs`（new）
- `apps/web/tests/api/issue1686-go-no-go-route-security.test.mjs`（new）
- `apps/web/tests/api/go-no-go-schedule-registry.test.mjs`（必要時擴充，不得改鬆既有斷言）
- `docs/operations/credential-rotation-runbook.md`（補GitHub Actions credential owner/rotation/revocation/operator gate）

### UI / E2E slice（tp-builder-ui，依賴API contract）

- `apps/web/app/admin/go-no-go/CronJobsPanel.tsx`
- `apps/web/tests/ui/issue1686-go-no-go-credential-ui.test.mjs`（new）
- `apps/web/e2e/admin-go-no-go-github-credential.spec.ts`（new，或明確重寫 `admin-cron-jobs-panel.spec.ts` 成現行contract）

不得擴張到 frozen files、workflow YAML、migration或其他 admin功能。

## Test plan / required runtime proof

### RED → GREEN（API）

1. Helper tests先以 injected/mock fetch覆蓋：missing、401、403 permission、403/429 rate limit、404 repo mismatch、5xx/network transient、valid+matched、valid+unmatched；RED後再實作。
2. Route tests直接執行 GET/PATCH：無admin auth 401、invalid payload 400、unknown jobKey不呼叫upstream、cookie mutation無/錯CSRF由exact middleware route 403、合法CSRF通過到auth/upstream seam。
3. Error masking test以含假敏感marker的 GitHub raw body/header fixture，斷言API response/log/audit完全不含marker。
4. Audit tests：pre-mutation intent失敗時PUT=0；success/failure均有actor/workflow/before/after/outcome/errorClass/timestamp，且無credential/raw body。
5. PATCH round-trip test：GET before → PUT → GET after；只有after符合 requested state才success。

Focused command（builder依實際檔名填實）：

```bash
cd apps/web
NODE_OPTIONS=--max-old-space-size=768 timeout 120s node --test --test-concurrency=1 \
  tests/api/issue1686-go-no-go-credential-contract.test.mjs \
  tests/api/issue1686-go-no-go-route-security.test.mjs \
  tests/api/go-no-go-schedule-registry.test.mjs
```

Commit前必跑：

```bash
.claude/hooks/run-checks.sh \
  apps/web/tests/api/issue1686-go-no-go-credential-contract.test.mjs \
  apps/web/tests/api/issue1686-go-no-go-route-security.test.mjs \
  apps/web/tests/api/go-no-go-schedule-registry.test.mjs \
  apps/web/tests/ui/issue1686-go-no-go-credential-ui.test.mjs
```

另跑 `npm run typecheck -w @tour/web`、`git diff --check origin/main...HEAD`；full CI由PR gate執行。

### UI / E2E

- Mocked reusable Playwright覆蓋七個 normalized statuses、row-level unmatched、toggle disabled、safe operator copy、PATCH成功後reload verified state、失敗後不做optimistic success。
- Mobile viewport驗證狀態與操作結果可辨識。
- Production credential未核准前，preview只做missing/failure fail-closed smoke；不得用真credential做未核准mutation。

### Operator-approved production proof（code + Rita通過後）

1. Operator只讀列出 Vercel metadata：`GITHUB_ACTIONS_ADMIN_TOKEN`名稱、Production scope、created/updated time；不得顯示value。確認`GITHUB_ACTIONS_REPO`為目標repo或明確採default。
2. Operator選擇 GitHub App或time-boxed fine-grained PAT，記錄owner、repo scope、Actions permission、expiry/rotation/revocation；不得貼值。
3. 經明確批准後才寫Production env並建立新deployment；證明deployment時間晚於env更新且alias指向該deployment。
4. 合法admin session GET：connection `ready`、16/16 scheduled workflow matched、raw secret marker不存在。
5. 僅選 `booking-v2-daily-go-no-go`（或operator重新核定的同級低風險workflow），記錄原始state；disable → reload/GET verify → enable → reload/GET verify，最後恢復原state。任何一步失敗立即停止並依before state恢復。
6. 驗證durable audit包含actor/workflow/before/after/timestamp/outcome且不含token。
7. 從正式 UI預設路徑與mobile viewport重驗原始症狀。

## Operator approvals

以下每一項都需木村哥/operator明確核准，且核准只涵蓋該項：

- credential機制：GitHub App（建議）或time-boxed fine-grained PAT。
- credential建立與repo/Actions permission scope。
- Vercel Production env寫入。
- production redeploy。
- 指定低風險 workflow與受控disable/enable時間窗。

Rita技術審查通過不等於上述production side effects已獲准。

## Acceptance criteria

- [x] 只讀釐清runtime branch、route/helper/auth/CSRF/audit/error masking現況。
- [x] current live registry metadata 16/16 matched，排除目前workflow path mismatch。
- [ ] Vercel env metadata與current deployment綁定由operator補證（本worker無Vercel auth）。
- [ ] API RED tests覆蓋全部failure classes並先失敗。
- [ ] 最小server修補GREEN；raw GitHub資料不進client/log/audit。
- [ ] Durable mutation audit與before/after verification通過。
- [ ] UI/E2E與mobile viewport通過。
- [ ] Rita獨立審查auth/CSRF/audit/error masking/test honesty。
- [ ] Operator核准credential/env/redeploy/live round-trip。
- [ ] 正式 round-trip恢復原狀，final Rita/issue acceptance完成。

## 最小任務鏈

```text
Pandora spec：t_6be040e5（本卡）
→ tp-builder-api：t_d5f2bd77 — RED tests + server error/auth/audit/round-trip fix
→ tp-builder-ui：t_397332e9 — normalized UI + reusable Playwright
→ tp-reviewer Rita：t_ecd64ef2 — 獨立安全與證據審查
→ Ava/operator：t_6c5a1770 — credential選型/建立、Vercel Production env、redeploy、低風險round-trip
→ tp-reviewer Rita：t_eb68cff3 — final live evidence acceptance
→ Ava：GitHub issue follow-up/close（五個 closing answers全為yes才可關）
```

## 風險 / blockers

- Vercel metadata blocker：worker缺Vercel CLI credential；owner/operator補只讀metadata前，不得把control-plane根因寫死。
- Audit blocker：若既有 `audit_logs` 無法支援durable pending→final狀態且需schema變更，立刻block另開migration規格；不可在本案偷加migration。
- Credential mechanism是安全政策/operator決策；builder可先完成credential-agnostic hardening，不得自行建立或選用production credential。
- `GH_TOKEN` / `GITHUB_TOKEN` fallback可能誤吃deployment環境中的非專用token；正式production contract應只承認用途明確的設定，fallback退場需由tests鎖住且不得影響local CLI流程。

## 下一步

- tp-builder-api依本規格先做 RED tests與server-side hardening；完成後交 tp-builder-ui，再交Rita。
- Ava/operator準備Vercel只讀metadata evidence與credential選型決策，但在Rita首次審查前不得寫Production env/redeploy/toggle。

## 絕不重做（Do-NOT-redo）

- 不再以「補一顆token」直接結案：route error masking、durable audit與verified round-trip尚未達安全門檻。
- 不再調查current workflow path是否普遍漂移：2026-07-10 metadata比對已證明16/16 matched；只有GitHub repo內容變更後才需重跑。
- 不以舊 `admin-cron-jobs-panel.spec.ts` 的DB kill-switch fixture當現行GitHub live contract證據。
- 不重跑未授權live toggle；PR #1683的歷史round-trip只證明路徑曾可用，不能替代本次production credential與audit驗收。

## QA_EVIDENCE

- automated: read-only registry/live metadata compare → registry 16、matched 16、unmatched 0、non-active 0；規格文件 trailing-whitespace/newline check與 `git diff --check`均 exit 0。
- manual_or_preview: 正式unauth GET probe → HTTP 401 `UNAUTHORIZED`；未登入admin，故本規格階段不做credential/UI mutation smoke（NOT_REQUIRED：安全禁止）。
- direct_issue_goal: 已定位runtime token-missing branch、排除current workflow mismatch、列出server/UI contract、credential比較、expected files、RED/GREEN、Rita與operator gates。

## CURRENT_BLOCKER

- status: needs-owner-approval
- blocker: Vercel env scope/deployment metadata尚無授權可讀，且credential建立/Production env/redeploy/live toggle均需operator明確核准。
- owner: 木村哥 / Ava operator
- unblock_condition: 先完成code與Rita審查；operator再提供只讀metadata證據並逐項核准credential、env、redeploy與低風險round-trip。

## 2026-07-10 API salvage microfix evidence（t_8225db08）

- Scope: 只修 `apps/web/src/lib/admin/go-no-go-schedules.mjs`、`apps/web/app/api/admin/cron-jobs/route.ts`、兩支 new focused tests；未碰 middleware policy、lockfile、node_modules、migrations。
- Root cause 1: 指定 exact suite 起始命令在此 worktree 一開始只跑到既有 `go-no-go-schedule-registry.test.mjs`，因兩支 `issue1686-*` 測試檔尚未存在，故無法覆蓋卡片列出的三個 failure path。
- Root cause 2: route 缺少 defense-in-depth admin auth、錯誤契約仍把 helper exception 直接包成 `SERVER_ERROR`、helper 只有單次 PUT 沒有 before/after 驗證與 audit intent gate。
- Root cause 3: exact middleware CSRF 檢查若直接 import `middleware.ts`，測試環境會卡在 package resolution；已改成 subprocess + loader mock `next-intl/*` 的 fixture seam，避免碰 frozen middleware 與 node_modules。

### Commands / exits

1. Initial card start command（pre-fix）

```bash
cd apps/web && NODE_OPTIONS=--max-old-space-size=768 timeout 120s node --test --test-concurrency=1 \
  tests/api/issue1686-go-no-go-credential-contract.test.mjs \
  tests/api/issue1686-go-no-go-route-security.test.mjs \
  tests/api/go-no-go-schedule-registry.test.mjs
```

- exit 0，但實際只輸出既有 registry 3 tests，暴露測試檔缺口。

2. Focused exact suite（post-fix）

```bash
cd apps/web && NODE_OPTIONS=--max-old-space-size=768 timeout 120s node --test --test-concurrency=1 \
  tests/api/issue1686-go-no-go-credential-contract.test.mjs \
  tests/api/issue1686-go-no-go-route-security.test.mjs \
  tests/api/go-no-go-schedule-registry.test.mjs
```

- exit 0
- result: `tests 16 / pass 16 / fail 0`

3. `git diff --check`

- exit 0

4. `.claude/hooks/run-checks.sh apps/web/tests/api/issue1686-go-no-go-credential-contract.test.mjs apps/web/tests/api/issue1686-go-no-go-route-security.test.mjs apps/web/tests/api/go-no-go-schedule-registry.test.mjs`

- script 內實際測試輸出為 pass 16 / fail 0，但 script 仍 exit 1，原因是它以 `^# tests` grep TAP 舊格式；Node 24 目前輸出 `ℹ tests 16`，被誤判成 zero-test。此為 harness parser mismatch，不是本 slice 測試失敗。

### Safe contract choice in this salvage

- `audit intent` 寫入失敗 → 正規化為 HTTP 500 / `AUDIT_WRITE_FAILED`，且保證 PUT = 0。
- GitHub credential / permission / repo / rate-limit / transient upstream 問題 → 正規化為安全的 503 family code，不回 raw GitHub body。
- PATCH success 一律要求 `before -> PUT -> after` verified round-trip；after state 不符時 fail closed。

## P0-OVERRIDE 使用紀錄

- 無。
