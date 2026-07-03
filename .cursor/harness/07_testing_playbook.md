# 07 — 測試與 QA 驗收 Playbook（CLAUDE.md 抽離全文＋harness 整合）

> 本檔是 CLAUDE.md「QA 驗收標準」「Testing policy」的完整版。CLAUDE.md 只留鐵律摘要，細節以本檔為準。
> 治理等級：🔒 鎖定檔（`05_maintenance.md`）。

## 1. QA 驗收標準（驗收 QA issue 時逐條遵守）

1. **實際達成 issue 列出的測試驗證項目。** 把 issue 的 Acceptance criteria 逐條跑出**綠燈／實測證據**，不得只靠推測或臆斷當作通過。能跑的就跑（focused `node --test`、Playwright、authenticated API smoke），不要用契約測試「代替」其實做得到的實測。
2. **進行真實 browser smoke。** 凡牽涉使用者可見頁面／流程（traveler、guide、admin），務必用**真實瀏覽器**驗證：優先 Playwright E2E（必要時用 `e2e/helpers.ts` 的 `adminLogin`／`setGuideSession`、或對 preview 實際登入），不得只做 source-contract 而宣稱前端已驗。本環境資源足以跑 `next dev` + Playwright；若真的被環境阻擋，需在報告明確標 `NOT_AUTOMATABLE`／`NOT_VERIFIED-live` 並附最接近的安全替代與 blocker 原因。
3. **只有在確實無法安全執行時**（例如需要 operator-only secret、會寄真實信件／動到正式付款或營運資料）才標 `NOT_VERIFIED-live`／`NOT_PROD_EXECUTED`，並說明 blocker、替代證據與下一步；不得用未驗證結果當 pass。
4. **驗收文件用繁體中文**寫入 `docs/operations/qa-reports/`，記錄環境 URL、deploy/commit SHA、Asia/Taipei 時間、逐條 AC 證據、判定（PASS／HOLD／FAIL），且不得含密鑰／cookie／token／service-role key／完整付款 payload／未遮蔽 PII。
5. **標準流程：** 開 PR → 盯 CI → merge（**merge 前必須有 CI conclusion=success 證據，紀錄入 worklog**）→ 逐條檢查 AC 清單 → 留 sign-off 留言 → 關閉 issue → 挑下一個 QA issue。

## 2. 測試指令速查

Node 22 固定（`.nvmrc` + `engines`）。fresh container 開工先在 repo root 跑 `npm install`（tests 依賴 `typescript` 做 transpile-import，沒裝整套紅）。

| 目的 | 指令 |
|---|---|
| 全套單元/整合 | `npm test`（= `node --test tests/**/*.test.mjs`） |
| 單檔 | `node --test apps/web/tests/api/booking-state.test.mjs` |
| 按名稱 | `node --test --test-name-pattern='Blackout' apps/web/tests/slot-generator.test.mjs` |
| **產生 commit 證據（必用）** | `.claude/hooks/run-checks.sh <test 檔…>`／`--typecheck`／`--all` |
| targeted smoke | `apps/web/package.json` 的 `test:smoke:*` scripts |
| E2E | `npm run test:e2e -w @tour/web`（`:ui`、`:headed`；config 無 webServer，需另開 `npm run dev`） |
| E2E smoke lane（CI） | `npm run test:e2e:smoke -w @tour/web`（backend-mocked allowlist，`.github/workflows/e2e-smoke.yml`） |
| lint / typecheck | `npm run lint`（**Node 22 上跑**，≥24 會被 pre-lint guard 擋）／`npm run typecheck` |

CI（`ci.yml`）順序：lint → typecheck → test → build → `scripts/preflight-check.sh`。build 以 `NODE_ENV=production` 跑，security-env guards 需要強秘密（CI 注入 `GUIDE_SESSION_SECRET`／`ADMIN_ACCESS_TOKEN`）。

**harness 整合**：凡 commit 觸碰程式碼，bash-guard 會要求 30 分鐘內的 `run-checks.sh` 綠燈證據（`.claude/state/last-checks.json`）。正確節奏：改碼 → `run-checks.sh <targeted>` → 綠 → commit → 開 PR 前 `run-checks.sh --all`。

## 3. Backend 任務 → TDD with `node --test`

適用：server routes、`src/lib/**` helpers、DB gateways、evaluators、validators、schedulers、payment/refund pipelines——任何不渲染 DOM 的東西。

1. **Red first**：寫 `apps/web/tests/{api,unit,services}/issueNNNN-*.test.mjs` 覆蓋新行為；跑一次看它失敗。
2. **Green**：寫最少代碼讓測試過。優先把純邏輯抽到 `src/lib/` 讓單元可以不靠 Supabase 測——in-memory fallback（`hasSupabaseEnv()` false 分支）就是現成的 seam。
3. **Refactor + regression**：重跑 targeted 檔，再跑 `npm test` 全套，之後才 commit。
4. **Source-contract tests**（`fs.readFileSync` + regex 讀 source）可用於鎖 route wiring（import 順序、`.eq('status', …)` shape、helper 先於 `.insert(`）。範例：`tests/api/issue1072-admin-qa-status-helper.test.mjs`、`tests/api/issue1110-plan-schedule-mismatch.test.mjs`。

### db.mjs 特別條款
- **strangler 硬規則（#1385／#1570）**：新的資料存取函式**禁止寫進 `db.mjs`**，一律開領域檔（`db-kpi.mjs`、`db-auto-complete.mjs`、`db-settlement.mjs`…），caller 直接 import 領域檔（不經 db.mjs re-export）。領域檔的 Supabase 分支＋in-memory fallback 要同步、並補契約測試。
- **CI 行數天花板 guard**（`tests/unit/db-mjs-size-guard.test.mjs`）：`db.mjs` 只能降不能升。每次抽出一塊後把該檔 `CEILING` 下修到新值鎖住成果。因修 P0 bug 必須在既有函式內加行而超標，是唯一該調高 CEILING 的理由，且須在 PR 說明。
- 改 `db.mjs` 既有函式時，順手把可獨立的業務邏輯（狀態機、金額計算、資格判斷）抽到 `src/lib/` 純函式並補單測——逐函式漸進，不開大重構 PR。audit log 一律用 `src/lib/audit-log.mjs`；refund 狀態機在 `src/lib/refund-transition.mjs`。
- **新增/修改 gateway 函式必須同步 in-memory fallback 並補契約測試**（同輸入→同輸出 shape／同狀態轉移；範本 `tests/api/issue1384-flow-contract.test.mjs`）。fallback 與 Supabase 實作沒有契約測試時，綠燈不代表 production 正確（#1376 實例）。
- payment callback 原子性假設見 `docs/04-tech/04-tech-architecture/12-payment-callback-atomicity.md`；新 RPC 鎖序必須遵循 orders → bookings → activity_schedules。

## 4. Frontend／互動任務 → Playwright E2E

適用：`apps/web/app/**` 頁面、client components、導覽、filters、表單、價格/費用呈現——任何使用者看得到或點得到的東西。

1. spec 放 `apps/web/e2e/issueNNNN-*.spec.ts`（範本：`issue1072-admin-qa-pending-tab.spec.ts`、`issue1073-activities-region-listing.spec.ts`）。
2. **重用 `apps/web/e2e/helpers.ts`**——已有 `adminLogin()` 與 `authedPage` fixture。不重造 auth；只有真的缺共用概念才擴充 helpers.ts。traveler-authed pattern（`/me/**`）：假 `sb-127-auth-token` cookie + `page.route('**/auth/v1/user**')` 攔截——範本 `e2e/issue1379-traveler-review.spec.ts` 的 `setTravelerSession`；第二個 spec 需要時抽進 helpers.ts。
3. **Mock backend**：`page.route('**/api/**', …)`，不依賴 Supabase seed（範本 issue1073 的 mocked `/api/activities` + `/api/me/wishlist/ids`）。
4. **新 spec 一定 commit；既有 spec（`t0-*`…`t7-t8-*`、`funnel-*`、deeplink、booking-flow）不得刪改**——file-guard 會硬擋；契約真的變了需要動舊 spec 時，走 P0-OVERRIDE＋PR 說明。
5. 本地執行：`npm run test:e2e -w @tour/web -- e2e/issueNNNN-…spec.ts`（另開終端跑 `npm run dev`）。
6. 前端 bug 由後端行為驅動時，**配對後端單測**（如 #1108 同時交 `tests/ui/issue1108-…` 契約測試＋頁面修改）。

## 5. Hybrid 任務

先用 TDD 修後端層，再加 Playwright spec 走完可見行為。**不要因為單測過了就跳過 E2E**——真正咬到使用者的回歸幾乎都在層與層的接縫。

## 6. 驗收判定的量化門檻

任務「可交付」的定義以 `03_rubrics.md` R2 為準（本檔負責「怎麼跑」，R2 負責「跑到什麼程度才算完成」）。
