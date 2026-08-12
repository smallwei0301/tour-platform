# #1759 Package 4：詢問轉預約完整鏈 E2E gate 計畫

日期：2026-08-09（Asia/Taipei）
狀態：規劃完成，待 Ava 指派 builder；實作完成後必須由 Rita 獨立審查。

## 目標

用受控、本機、可重現的 Supabase + Playwright gate 驗證 Midao 的真正資料鏈：

旅客登入 → public inquiry 建立 → 導遊標記已回覆並轉為 booking/order → 旅客以一次性確認連結接受 → checkout 前後的 eligibility 變化。

此 gate 的價值是補齊目前「各層各自有單測／mocked UI 測試」與「全鏈真實資料流」之間的空洞；它不是付款金流 E2E，也不會呼叫 ECPay、LINE、production 或 staging。

## 已查證現況

- `apps/web/e2e/midao-inquiry-conversion.spec.ts` 已有導遊 conversion UI 與旅客確認頁的 Playwright 覆蓋，但所有關鍵 API 都由 `page.route()` 回傳 fixture；檔內 Task 43b 段落明定 append-only，不可改寫既有案例。
- `scripts/testing/with-midao-local-supabase.mjs` 已提供 clean-room local DB、baseline/expected-terminal 驗證、Midao overlay seed 與 Playwright lane；目前 `--playwright` 走 digest-bound standalone PostgREST，沒有 GoTrue，因此不能拿 fake traveler cookie 冒充 server-side `getTravelerIdentity()`。
- `scripts/testing/midao-e2e-seed.sql` 目前只 seed 兩個 guide，尚無可登入旅客、可 inquiry 的 published activity/request plan、questionnaire publication fixture。
- 實際 API 鏈：
  - public inquiry：`apps/web/app/api/v2/public/guides/[slug]/inquiries/route.ts:196`
  - guide convert：`apps/web/app/api/v2/guide/inquiries/[inquiryId]/commands/convert/route.ts:76`
  - traveler accept：`apps/web/app/api/v2/me/booking-confirmations/[token]/accept/route.ts:35`
  - checkout guard：`apps/web/app/api/v2/bookings/[bookingId]/checkout/route.ts:171`
- `canCheckoutTravelerConfirmation()` 在 `apps/web/src/lib/booking-type-flow.mjs:131` 對 pending inquiry booking 回傳 `409 TRAVELER_CONFIRMATION_REQUIRED`；confirmed 才放行。

## 範圍決策

### 新增獨立 spec，不擴寫既有 spec

新增 `apps/web/e2e/midao-inquiry-conversion-chain.spec.ts`。不得修改 `apps/web/e2e/midao-inquiry-conversion.spec.ts` 既有內容與其 mock route helpers。

理由：既有檔是 UI contract/mock lane，且有 append-only 限制；把 DB/GoTrue/fixture 壽命混進去會讓既有 fast UI case 變成高耦合、難診斷的 integration lane。新檔能清楚表達「任何主鏈 API 不得被 Playwright 攔截」這個 gate 不變量。

### 真實 auth，不接受 fake traveler chain

新 gate 必須在 runner 內啟用本機 Supabase GoTrue，使用 seed 的 email/password 從真實 `/auth/v1/token?grant_type=password` 取得 session；將取得的真實 session 放入 Supabase SSR 所讀的 cookie。不可重用 `helpers.ts` 的 `setTravelerSession()`，也不可對下列主鏈 endpoint 使用 `page.route()`：

- `/api/v2/public/guides/*/inquiries`
- `/api/v2/guide/inquiries/*/commands/mark-replied`
- `/api/v2/guide/inquiries/*/commands/convert`
- `/api/v2/me/booking-confirmations/*`
- `/api/v2/me/booking-confirmations/*/accept`
- `/api/v2/bookings/*/checkout`

導遊仍使用 `loginMidaoGuideViaApi()`，因為該 helper 呼叫真實的 guide session API，並非 page-route stub。

### checkout 只驗 eligibility，不觸碰 ECPay

在 traveler accept 前，對真實 checkout API 送 `{ "provider": "transfer" }`，必須得到 `409 TRAVELER_CONFIRMATION_REQUIRED`。accept 成功後以相同 booking/request 再送一次，必須通過 confirmation gate 並取得 transfer 的受控本機結果（`awaitingManualPayment: true`）。

此為真正 checkout route 及其 `canCheckoutTravelerConfirmation` gate 的驗證；不送預設 ECPay provider，避免需要外部 merchant credential 或外部金流呼叫。runner 僅在這條新 gate 的 child environment 設定 transfer feature flag；production 設定不變。

## 實作順序與檔案級工作

### 1. local runner：新增嚴格隔離的「真實 traveler auth」Playwright lane

檔案：`scripts/testing/with-midao-local-supabase.mjs`、`scripts/testing/run-midao-e2e.sh`，以及對應 runner unit tests。

1. 將新 chain spec 解析為明確、allowlisted 的 real-auth Playwright invocation；不得讓任意 path 或環境變數意外開啟 full-service auth。
2. 保留既有 `--playwright` / standalone PostgREST 行為與既有 specs 的執行方式。real-auth lane 不得擴大既有 lane 的權限或放寬 runner ownership、baseline manifest、image digest、loopback、redaction、cleanup 檢查。
3. real-auth lane 的 local config 要啟用 GoTrue 與其必要 gateway/API services；仍停用與本測試無關的 storage/realtime/mail 等服務。不得接 production/staging，所有 URL 必須是 `127.0.0.1`。
4. 保持「materialize → exact migration replay → canonical seed → Midao overlay seed → 起 API/auth → fixture probe → Playwright」順序。若 full-service startup 需要 schema reload，明確等待並驗證後才啟動 Next/Playwright。
5. `run-midao-e2e.sh` 必須讓下列指令可直接執行新 gate，並保留無參數的現有 smoke 預設：

   `bash scripts/testing/run-midao-e2e.sh apps/web/e2e/midao-inquiry-conversion-chain.spec.ts`

6. 為 parser、full-auth config、fixture probe、runner cleanup 與「既有 default lane 不退化」補 Node unit tests。失敗輸出只可含既有 redacted diagnostic code，不能寫出 session token、cookie、password、DB URL 或 service key。

### 2. deterministic overlay fixture：僅加本機 E2E 所需資料

檔案：`scripts/testing/midao-e2e-seed.sql`。

新增與既有 guide fixture 不衝突的固定識別資料：

1. 可用 password 登入的 traveler `auth.users` + `public.users(role='traveler')`；只使用 local-only test identity，密碼不能出現在測試失敗輸出或 artifact。
2. Midao guide 名下、`published` + `inquiry_enabled=true` 的 activity。
3. 對應 `active`、`booking_type='request'`、`is_year_round=true`、容量足夠的 plan。
4. 最新 `service_publication_versions` questionnaire snapshot；至少包含一題必填且可由公開 inquiry request 合法回答的題目。
5. fixture probe 需確認此最小資料集的 identity/狀態，不可查詢、序列化或列印個資、password hash、JWT/service key。

禁止新增/改動 migration、schema、RLS policy 或 production seed。每次 runner 都 materialize fresh DB，spec 不可依賴上次殘留資料。

### 3. 新 full-chain Playwright spec

檔案：`apps/web/e2e/midao-inquiry-conversion-chain.spec.ts`；如真的缺少可重用「真實 Supabase traveler login」行為，才在 `apps/web/e2e/helpers.ts` 新增語意明確 helper，且既有 `setTravelerSession()` 不修改。

一個 serial chain test 以兩個 browser context 隔離 traveler/guide cookies，並以實際 HTTP API 與 traveler confirmation browser page 串接：

1. 用 real-auth traveler context 呼叫 public inquiry API，附真實 cookie、合法 CSRF header/cookie、固定 valid questionnaire answer；斷言 `201`、得到 inquiry ID，且回傳不含內部 token/PII。
2. 用 guide context 的真實 guide login 呼叫 mark-replied；斷言成功，再以唯一的 idempotency key 呼叫 convert，斷言 `created=true`、取得 booking/order ID 與只在首次、caller-owned response 出現的 confirmation token。
3. traveler 在 accept 前對 checkout API 呼叫 transfer provider；斷言 `409` 與 `TRAVELER_CONFIRMATION_REQUIRED`，證明不是只確認 UI 文案。
4. traveler browser context 導航 `/booking/confirm/[token]`。不攔截 preview/accept，斷言真實 pending content 和 action 可用；點擊接受後，等實際 acceptance API 回應與頁面付款導向。
5. 使用同一 traveler context 重新呼叫 checkout transfer；斷言成功、`awaitingManualPayment=true`，且再也不是 confirmation-required。
6. 只截圖/trace 成功或失敗 UI 證據；禁止寫入或斷言 raw confirmation token、session、cookie、password。

## 風險與防線

- GoTrue/full local service 與現有 digest-bound PostgREST lane 不同：新 lane 必須 strict opt-in，並保留既有 runner unit tests與兩個 default E2E spec 的回歸。
- local auth cookie 名稱依 `SUPABASE_URL` project reference 衍生：helper 必須從實際 runtime URL 派生，不能硬寫 host/ref。
- chain 需要 request booking 可 checkout：seed 與 conversion body 必須使 `guide_approval_status` 達可付款狀態；如果 conversion RPC 的 request-plan 預設 approval gate 無法滿足，先用既有、正式 route/API 的合法導遊核准步驟，不得 SQL 側寫狀態。
- Checkout transfer 建立 local payment/event：fresh DB 與 runner cleanup 是唯一隔離方式；不能把 fixture 清理寫到 production path。
- 跨 step 的 raw confirmation token 是必然的 test process 記憶體資料，但不可傳到 console、assertion message、screenshot filename、trace title、worklog 或 Kanban metadata。

## 驗收條件

1. 新 spec 無 `page.route()` / mocked response 覆蓋上述六個主鏈 endpoint。
2. fresh local runner 的真實資料鏈順序為 public 201 → mark replied → convert created → checkout 409 required → real browser accept → checkout transfer success。
3. accept 前 checkout 回應為 `409 TRAVELER_CONFIRMATION_REQUIRED`；accept 後同一 booking 不再被 traveler-confirmation gate 阻擋。
4. existing `midao-inquiry-conversion.spec.ts` 不被修改，既有 runner default specs 仍通過。
5. runner/fixture 改動有 focused Node tests，並透過 `.claude/hooks/run-checks.sh` 留下實跑證據；完整 branch 最少執行 targeted test、typecheck、lint，且 chain gate 成功。
6. local run 全程 loopback、fresh worktree、clean git state；無 production/staging/migration apply/ECPay/LINE 呼叫與 secret leak。
7. builder 完成後先由 Rita (`tp-reviewer`) 針對 final HEAD 獨立審查；Rita 必須確認「Issue 目標是否已直接驗證：yes/no」。

## 建議 Kanban 執行鏈

1. `tp-builder`：實作 runner opt-in lane、seed、new E2E spec與 focused tests；本卡 parent handoff 作為唯一 scope。
2. `tp-tester`：在乾淨 worktree 實跑 real-auth chain gate與既有 Midao default lane，輸出 redacted evidence。
3. `tp-reviewer`（Rita）：final-head independent review，檢查無 mock 主鏈、無 secret、no migration/production side effect、AC evidence 完整。

高風險完成不得停在 planner 或 builder；必經 Rita review gate。

## 現有基線驗證

2026-08-09 已在本 clean worktree 實跑：

`GUIDE_SESSION_SECRET='<local test value>' node --test --test-concurrency=1 apps/web/tests/api/midao-checkout-confirmation-gate.test.mjs apps/web/tests/api/midao-inquiry-convert.test.mjs`

結果：42 passed、0 failed。未跑新 chain gate，因為它尚未實作；不可把此 focused baseline 誤報為全鏈 E2E 通過。
