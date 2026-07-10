# GitHub Actions 排程管理憑證 Runbook

> 適用範圍：Issue #1686 的 `/admin/go-no-go` 與 `GET/PATCH /api/admin/cron-jobs`。
>
> **不在此文件、issue、PR、CI log、截圖或聊天中記錄 token、private key、cookie、Authorization header 或完整 env value。**

## 1. 目的與目前狀態

此 runbook 用來安全地讓正式環境的排程管理頁讀取、啟用與停用 `smallwei0301/tour-platform` 的 GitHub Actions workflow，同時維持：admin auth、CSRF、before/after verification、durable audit 與 fail-closed 行為。

截至 Issue #1686 的 Vercel Production metadata probe：

- `GITHUB_ACTIONS_ADMIN_TOKEN`：未配置於 Production。
- `GITHUB_ACTIONS_REPO`：未配置於 Production。程式解析 effective repository 的順序是 `GITHUB_ACTIONS_REPO` → `GITHUB_REPOSITORY` → 預設 `smallwei0301/tour-platform`；因此 metadata 只確認第一個 key 不足，operator 必須以部署後 API 回傳的 `repoSlug` 做人工核對。**目前該核對不是 server-side 強制 gate；在 mutation path 實作 allowlist 前，不得把它描述成技術性阻擋。**
- 現行 code 讀取順序是 `GITHUB_ACTIONS_ADMIN_TOKEN`、`GH_TOKEN`、`GITHUB_TOKEN`。
- 正式設定只能使用用途明確的 `GITHUB_ACTIONS_ADMIN_TOKEN`；`GH_TOKEN` / `GITHUB_TOKEN` 只能保留給 local/CI 相容性，**不得當正式 runtime credential 的證據或 fallback 設計**。

未配置時，正式 API 必須維持 registry-only / fail-closed：workflow 顯示 credential missing，toggle 不可操作；不得回傳 GitHub raw error body。

## 2. Credential 決策

### 現階段可執行 bridge：fine-grained PAT

在目前程式只接受 token 字串、**尚未具備 GitHub App token mint/refresh runtime** 的前提下，採用明確到期的 fine-grained PAT 作為暫時 bridge。

| 欄位 | 要求 |
|---|---|
| Resource owner | `smallwei0301` / 由木村哥指定的 GitHub operator |
| Repository access | Only selected repositories → `tour-platform` |
| Repository permission | Actions: Read and write；不授予 Contents、Administration、Secrets、Organization 權限 |
| Token name | 可辨識但不含敏感資料，例如 `tour-platform-go-no-go-YYYYMMDD` |
| Expiry | 建議 7 天；最長 30 天；不得無期限 |
| Runtime env key | `GITHUB_ACTIONS_ADMIN_TOKEN`，僅 Vercel Production scope |
| Owner | 木村哥指定的 GitHub/Vercel operator；不得綁定一般開發者帳號 |
| Rotation owner | 與 credential owner 相同，或在 evidence record 明確指定代理人 |

### 長期目標：GitHub App

GitHub App installation token 可限制 repository 與 permission、有效期短，較適合長期 server automation；但現有 runtime 不會自行用 App ID / installation ID / private key mint 或 refresh token。

因此：

- **不可**只建立 GitHub App 後便宣稱 #1686 已完成。
- 若要採用 GitHub App，必須另案實作 server-side token mint、cache、到期前 refresh、private key rotation 與失敗分類，再由 Rita 審查。
- 在該 runtime integration 合併前，僅能使用此 runbook 的 time-boxed fine-grained PAT bridge。

## 3. 建立前 Preflight（必做）

- [ ] Owner 已確認 operator、expiry、rotation/removal 責任人。
- [ ] GitHub credential 僅授予 `tour-platform` 的 Actions Read and write。
- [ ] 未授予 Contents、Administration、Secrets、Organization 或全帳號 repository access。
- [ ] 核准 target repository 為 `smallwei0301/tour-platform`；部署後由 read-only GET 人工核對 API `repoSlug` 完全相符。若不同，operator 必須停止操作並升級；此為人工 stop check，非現有 API 的 server-side allowlist。
- [ ] 低風險 round-trip candidate 已核定為 `booking-v2-daily-go-no-go`；其他付款、退款、通知、資安與營運 workflow 不得測試。
- [ ] 已確認 candidate 的 current state 與最近 scheduled run 正常，且 GitHub Actions 無 queued / in-progress run。
- [ ] 已避開該 workflow 的排程邊界（目前為 `01:30 UTC`）；預先定義最大 disable window 與超時 stop condition，確保不會略過預期排程。
- [ ] 已確認 production deployment / rollback operator 在場。
- [ ] 已準備本文件第 7 節的 redacted evidence record。

若任何一項未完成，停止；不得先把 token 寫入環境再補文件。

## 4. 設定 Vercel Production（operator only）

1. 在 GitHub 建立符合第 2 節限制的 fine-grained PAT。只在 GitHub UI 的一次性安全畫面複製值；不得貼入 issue、PR、Terminal command history、文件或聊天。
2. 在 Vercel project `tour-platform` → Settings → Environment Variables 新增：
   - Name：`GITHUB_ACTIONS_ADMIN_TOKEN`
   - Value：只在 Vercel secret input 欄輸入
   - Environments：**Production only**
3. `GITHUB_ACTIONS_REPO` 可不設定，前提是 operator 也要確認 `GITHUB_REPOSITORY` 沒有將 runtime 指到其他 repository；若兩者皆未設定，code 才使用預設 `smallwei0301/tour-platform`。無論設定與否，部署後都必須以 API 的 `repoSlug` 人工核對 effective target；不相符時停止並升級。現行 API 尚未在 mutation path 強制 allowlist，故此人工核對不能取代後續 code gate。若因未來 repo migration 必須設定，值只能是核准目標 repository，並須在 evidence record 註明原因；不得放 credential。
4. 截取或記錄 metadata evidence：env **名稱**、Production scope、updated time。不得記錄 value、length、prefix、hash 或 screenshot 中的 secret。
5. 用 Vercel UI 對 current main 做新的 Production deployment；記錄 deployment URL、commit SHA、started/completed time。

> 不要用 `NEXT_PUBLIC_*`。不要把 GitHub token 寫入 repo `.env`、測試 fixture、client bundle 或 workflow YAML。

## 5. 部署後 read-only 驗證

使用合法 production admin session 或受核准的 server-side QA header token，對：

```text
GET https://tour-platform-nine.vercel.app/api/admin/cron-jobs
```

只記錄下列安全欄位：

- HTTP status 與 `ok`
- `hasGithubToken`
- `githubConnection.status`、`canRead`、`canWrite`、`operatorAction`
- `repoSlug`，且必須等於核准 target `smallwei0301/tour-platform`
- registry job count、matched / unmatched / state 的計數
- `booking-v2-daily-go-no-go` 的 `state`、`canToggle`
- request ID（若 API 提供且不含 credential）

驗收條件：

- [ ] 回應為成功，且 `hasGithubToken=true`。
- [ ] GitHub connection 為可讀／可寫 ready state。
- [ ] API `repoSlug` 等於 `smallwei0301/tour-platform`；若不同，operator 停止並依 repo mismatch 處置。這是人工操作 check；在 server-side allowlist 合併前，API 不會自行拒絕錯誤 repo 的 mutation。
- [ ] 已對上的 workflow 回傳 live state；不得只顯示 registry。
- [ ] response、server log、audit evidence 均未含 token、Authorization header 或 GitHub raw body。

若回應為 invalid/revoked、permission denied、repo mismatch、rate limited 或 transient error，停止切換，依第 8 節處置；不得用 UI 強行操作。

## 6. 受控 disable → verify → enable round-trip

只有第 3 節與第 5 節全數通過後，才允許執行。使用 `booking-v2-daily-go-no-go`，且預期初始狀態為 `active`。開始前再次確認：無 queued / in-progress run、目前時間不在 `01:30 UTC` 排程邊界、仍在已核准的最大 disable window 內；任一項不符即停止。

1. 讀取並記錄 before state。
2. 在正式 admin UI 或受核准 API 執行一次 disable。
3. 重新 GET / reload，確認 GitHub live state 為 `disabled_manually`；不得接受只更新前端的 optimistic result。
4. 確認 durable audit 有 actor、workflow、before state、after state、timestamp、outcome；不得有 secret。
5. 立刻執行一次 enable。
6. 重新 GET / reload，確認 GitHub live state 已恢復 `active`。
7. 確認第二筆 durable audit complete。
8. 將 GitHub Actions workflow URL、操作時間、before/after、deployment commit、redacted request ID 記入 evidence record。

### Stop / reconciliation / compensation 規則

下列任一情況立即停止新的 mutation：before state 不是預期 `active`、GitHub state 與 API state 不一致、管理端 `GET` / `PATCH`、server-to-GitHub upstream `PUT`、after verification 或 audit intent/finalization 任一失敗、選到非核准 workflow、超出 disable window、rate limit、permission error、repo mismatch 或 raw error redaction 問題。

若 failure 可能發生在 upstream mutation 之後，remote state 即屬未知；**不得**盲目 retry、換 workflow 或直接補償切換。必須依序：

1. 對同一受控 workflow 執行 read-only GET / live state reconciliation，記錄 failure point 與 reconciled live state。
2. 只有 audit 可用、reconciled state 可讀，且 owner/operator 對該一次補償性 `PATCH` 明確核准時，才可做一次補償；完成後重新 GET 驗證並留下 durable audit。
3. 若無法讀取 state、audit 不可用、或沒有明確核准，停止所有 mutation，升級 incident，記錄 redacted 時間線與最終 reconciliation 結果。

## 7. Redacted evidence record（貼到 #1686）

```text
Credential mechanism: fine-grained PAT bridge
Owner / rotation owner: <name or role>
Repository scope: smallwei0301/tour-platform only
Permission: Actions Read and write only
Expiry: <YYYY-MM-DD; no token value>
Vercel env metadata: GITHUB_ACTIONS_ADMIN_TOKEN / Production / <updated time>
Deployment: <runtime URL> / <commit SHA> / <completed time>

Read-only GET:
- HTTP / ok:
- hasGithubToken:
- githubConnection status / canRead / canWrite:
- effective repoSlug / approved target match:
- matched/unmatched/state counts:

Controlled workflow: booking-v2-daily-go-no-go
GitHub Actions URL: <URL>
UTC time / scheduled-window check / maximum disable window:
Queued or in-progress runs: none / details:
Before state:
Disable verified state:
Enable verified state:
Audit evidence: <redacted record IDs or timestamps>
Final state restored: yes/no
Failure point (if any):
Reconciled live state:
Compensation PATCH executed: yes/no
Compensation operator approval: <name or role / timestamp, if applicable>

Secret exposure check: no token, header, raw upstream body, value/prefix/length/hash recorded
```

## 8. Rotation, revocation 與 incident handling

### Planned rotation

- 在 expiry 前至少 48 小時由 rotation owner 建立 replacement token。
- 更新 Vercel Production `GITHUB_ACTIONS_ADMIN_TOKEN`，觸發新 deployment。
- 完成第 5 節 read-only verification。
- 完成後才 revoke old token；記錄完成時間與 operator，不記錄 token。

### Immediate revoke

若懷疑 token 外洩、owner 離職／失去 repo access、GitHub 401、非預期 workflow 操作或 audit anomaly：

1. 在 GitHub revoke 該 fine-grained PAT。
2. 在 Vercel 移除或替換 `GITHUB_ACTIONS_ADMIN_TOKEN`，並 redeploy。
3. 驗證 production 回到 safe missing / disabled-toggle state，或 replacement credential 已 ready。
4. 在 #1686 或 security incident issue 留下 redacted 時間線與後續 owner；不得貼 token 或 raw GitHub response。

## 9. Closing gate

#1686 只有在下列全部為 yes 時才能關閉：

- [ ] 正式環境 server-side credential 已配置。
- [ ] GitHub 最小權限與 repo scope 已驗證。
- [ ] server-side mutation path 對核准 repository allowlist 已強制驗證，且測試證明非核准 `repoSlug` 會被拒絕；在此 code gate 合併前，不得以人工 `repoSlug` 核對視為等價替代。
- [ ] 受控 toggle round-trip 已完成並恢復原狀。
- [ ] 使用者症狀已從正式 UI 預設路徑重驗。
- [ ] Credential rotation/revocation runbook 已完成。
- [ ] Rita 已獨立審查 credential boundary、auth/CSRF、audit、error masking、證據與文件一致性。
