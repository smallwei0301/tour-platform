# QA 驗收報告 — #1649 訂單／退款／金流全面串接 v2（Phase 1–5 非凍結範圍）

> 驗收時間：2026-07-08 00:20（Asia/Taipei）｜branch：`claude/payment-order-v2-migration-vq0lau`
> 基準 commits：`d578a44`（traveler）＋`adc6bf8`（admin/guide/補付）＋本報告同 commit 的收尾修正
> 驗收環境：遠端 CCR container（Node v22.22.2、Next dev、in-memory store、Playwright 1.58.2＋
> `PW_EXECUTABLE_PATH=/opt/pw-browsers/chromium`，lessons `playwright-version-mismatch-symlink`／
> `e2e-webserver-owns-env` 適用）

## 一、範圍與結論

**結論：範圍內全數綠燈。** 前端（traveler／admin／guide 全部頁面）訂單、退款、payouts、
留言、改期、促銷碼、補付款呼叫點 100% 切換至 `/api/v2/**`；全域 grep 前端 legacy
endpoint 零命中（僅剩註解）。凍結區 `app/api/payments/**` 未觸碰（無 P0-OVERRIDE）；
legacy API routes 依計劃保留（退役＝#1649 Phase 6 另案）；ECPay callback 路徑切換
（Phase 5.1）屬 owner 部署協調決策，未納入本輪。

## 二、逐項 AC 證據

### AC1 — 前端零 legacy 訂單/金流呼叫
- 證據：`grep -rn "/api/me/orders|/api/admin/{orders,refund-requests,payouts}|/api/guide/{bookings,payout,messages,orders/,reschedule-requests}|/api/payments/ecpay/create|/api/promo-codes/public" apps/web/app apps/web/src`（排除 app/api）→ **零命中**（僅 2 處註解）。
- 守門：`tests/api/issue1649-v2-traveler-orders-contract.test.mjs`（14 tests）＋
  `tests/api/issue1649-v2-admin-guide-namespace-contract.test.mjs`（4 tests）鎖住
  「頁面零 legacy＋v2 殼委派」不回流。

### AC2 — 單元/契約測試全綠（node --test 全套）
- `run-checks.sh --typecheck --all`：**4533 tests / 4530 pass / 0 fail / 3 skipped**＋
  `tsc --noEmit` 綠＋`npm run lint` 綠。證據檔：`.claude/state/last-checks.json`（2026-07-08 00:1x）。
- 涵蓋：既有金流回歸基線（issue1571 三鏈路、ecpay-callback 系列、settlement/payout 系列）
  全數未破；四個 ratchet guard（db.mjs 行數／@supabase 直接 import／process.env／src/lib 頂層）
  天花板未升。

### AC3 — Playwright 真實瀏覽器實跑（dev server + in-memory + page.route mock）
整合批次（27 specs / 67 tests）：**64 pass**；3 fail 全數查證非本次回歸：

| 失敗 test | 判定 | 證據 |
|---|---|---|
| `issue1381-promo-exposure`（/checkout 一鍵套用） | **main 既有失敗** | main worktree（`a75f21f`）基準線同敗（見下） |
| `admin-order-detail-mobile-modal`（批次中 169ms 即敗） | 批次負載 flaky | 單獨重跑 **2/2 綠** |
| `issue-member-pages-redesign`（networkidle 手機） | 批次負載 flaky | 單獨重跑 **3/3 綠**（本輪已 deflake：mock 外部 unsplash 圖＋abort Vercel Analytics scripts——沙盒 Chromium 無 proxy 掛住外部請求所致，debug script 實證 `va.vercel-scripts.com` pending） |

**main 基準線交叉驗證**（git worktree @ `a75f21f`、port 3444、同 env）：以下 6 個失敗
在「未含本次任何變更」的 main 上**完全相同**——既有問題、與 v2 遷移無關，另案追蹤：
`issue-multilingual-checkout`（zh-Hant/en ×2）、`issue1116` T1116.1/T1116.4（/admin/qa
tablist focus ×2）、`issue1381` /checkout 套用（×1）、`order-pay-login-redirect`（×1，
spec regex 未跳脫 `?` 的既有斷言瑕疵，頁面實際已正確導轉至
`/login?redirectTo=%2Forder%2Fpay%3ForderId%3D…`）。

關鍵流程逐一實跑綠燈（非 mock 斷言即頁面互動）：
- Traveler：訂單列表/詳情、電子憑證 QR（#1565）、行前聯絡卡（#1596）、留言（#1411）、
  改期申請＋撤回（#1383）、退款申請入口、付款期限提示（#1493）、success 頁（#926）、
  多語 orders/order-flow、商店訂單頁（#1475）、評價流程（#1379＋照片上傳）。
- Admin：訂單列表/詳情/來源篩選（#1501）、取消＋全額退款、退款錯誤防呆、部分退款金額、
  手動狀態 guard、行動版詳情彈窗、資料載入錯誤可見性、payouts 全流程（#1360/#1365 含
  409 冪等阻擋）——**CI smoke lane 四支 spec 全綠**（issue1294/1269/1360/1365）。
- Guide：request 預約審核（booking-type approval）、留言回覆、改期審核、conflict-override
  警示（#1273）。

### AC4 — 行為等價保證
- **Admin/Guide/補付款＝單一實作**：v2 route 是 legacy handler 的 re-export／CSRF wrapper
  委派殼（零複製、零分岔），envelope 與錯誤碼 by construction 等價；殼契約由
  `issue1649-v2-admin-guide-namespace-contract` 鎖定。
- **Traveler v2 routes**：委派與 legacy 相同 db gateway 函式＋相同通知扇出；
  逐點在 `issue1649-v2-traveler-orders-contract` 鎖定（冪等 requestId、policy snapshot、
  auto-execute guard、rate limit、CSRF、PII 防線）。
- **安全**：middleware CSRF 不涵蓋 `/api/v2` 非 admin 路徑 → 所有新增 traveler/guide 寫入
  route 殼內顯式 `validateCsrf`（v2 redeem 同模式）；`/api/v2/admin/**` 由 middleware
  matcher 原生涵蓋 auth＋CSRF。

## 三、本輪一併修復的測試基建問題（非回歸）
1. cwd 依賴（`path.resolve` 相對路徑）修為 `WEB_ROOT`：`issue1381-public-promo-codes`、
   `guide-payout-csv-contract`、`issue1411-order-messages-routes`（run-checks 從 repo root
   跑與 npm test 從 apps/web 跑皆綠）。
2. `#1598 route-error coverage guard`：新增「#1649 委派殼」結構性辨識（殼零 try/catch、
   零業務碼，靜默失敗結構上不可能；判定條件嚴格白名單樣板，殼一長出自己的邏輯即回到
   一般規則）。自寫 traveler routes 全數真接 `handleRouteError/reportRouteError`。
3. 死碼測試改寫：`issue826`（submitEcpayCallback ack）→ 退役殘留守門；
   `issue461a` AC2 → 改鎖訂單詳情頁退款 POST 的 CSRF。
4. e2e deflake：`issue-member-pages-redesign` networkidle 測試 mock 外部圖＋abort
   analytics scripts（根因實證，非蓋牌）。

## 四、範圍外／後續（另案）
- Phase 5.1：`POST /api/v2/payments/ecpay/callback`＋ReturnURL 切換（凍結區＋ECPay 站方
  設定，需 owner `P0-OVERRIDE`＋部署協調；建議首筆正式付款前完成）。
- Phase 6：legacy routes 分批退役＋殘留守門測試＋`10-api-spec-v2-booking-pos.md` 契約同步
  （含本輪 order-scoped cancel/reschedule 與契約 bookings-scoped 端點的正名）。
- main 既有 e2e 失敗 6 項（見上表）——與本次無關，建議開獨立 issue 追蹤。
- `/api/guide/dashboard`、`/api/guide/qa`、`/api/promo-codes/validate` 不在 #1649 範圍清單，未動。

## 五、無密鑰/PII 聲明
本報告與測試證據不含任何生產密鑰、真實用戶 PII；e2e 全程 in-memory store＋mock fixture。
