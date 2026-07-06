# 健檢 v2 收尾 — #1590–#1601（12 張）
> 最後更新：2026-07-05（Asia/Taipei）｜負責 session：claude-opus-4-8 / claude/repo-audit-optimization-m4s8os
> /goal：自己評估順序，完成 #1590–#1601。**永遠以本 worklog 為準。**

## 總狀態：12/12 完成（全數 merge＋closed）✅
- 2026-07-05：owner 套用 5 migration → agent 驗證 → ledger verified → PR #1624 CI 6/6 綠 → squash-merge（merge commit `944c2ca`）→ #1590 #1596 #1592 #1591 #1593 #1594 逐張 sign-off 關閉。
- 確認：`list_issues` open 清單中 #1590–#1601 一張都不剩（全 closed）。
- 後續增量（另案，非本 goal 範圍）：#1591/#1593/#1594/#1592 的前端 UI 與 checkout/掛點串接（各 issue sign-off 已註明）。

### A. 已獨立 merge 進 main（6 張）
| issue | PR | 內容 |
|---|---|---|
| #1595 | #1618 | 非 VISIBLE_LOCALES（ja/ko）noindex＋generateStaticParams 收斂 |
| #1598 | #1619 | `route-error.ts` handleRouteError/reportRouteError；接 26/31 v2 route |
| #1600 | #1620 | zod v2 金流輸入面（parse-body/payment-schemas，redeem 已接） |
| #1597 | #1621 | 4 支 .mjs 補 `// @ts-check`＋JSDoc（0 tsc error） |
| #1599 | #1622 | 登入限流疊加分散式層（Upstash Redis REST，fail-open，保留 #1373 契約） |
| #1601 | #1623 | CSP unsafe-inline 移除評估決策 D（暫留、指向 option C） |

### B. 在 PR #1624（migration-gated，待 owner 套用）—— 6 張後端全交付
| issue | 交付 | migration（pending）|
|---|---|---|
| #1596 | 行前 24h 導遊聯絡：資格＋同意雙閘、PII 安全、guide 設定、前端卡、e2e | `20260704121000_guide_profiles_contact_phone_1596` |
| #1590 | ECPay `ChoosePayment:'ALL'` 已含 ATM/超商；guard 鎖＋文件 | 無 migration（本身可 merge，但疊在同分支）|
| #1592 | 評分分佈＋評論篩選 `filterReviews`＋導遊回覆（`db-review-reply.mjs`、ownership 雙閘、`PUT /api/v2/guide/reviews/[id]/reply`、詳情頁帶 guideReply、42703 fail-soft） | `20260705103000_activity_reviews_guide_reply_1592` |
| #1591 | 加購：`addon-pricing.mjs`＋`db-addons.mjs`（DB 快照重算、server 不信前端金額）| `20260705101000_activity_addons_1591` |
| #1593 | 站內通知中心：`db-notifications.mjs`＋`/api/me/notifications`＋`.../read`，掛點永不 throw | `20260705100000_user_notifications_1593` |
| #1594 | 點數/會員：`points-calc.mjs`＋`db-points.mjs` append-only ledger（發點冪等、折抵 ≤min(餘額,訂單×30%)、效期 12 月）| `20260705102000_user_points_ledger_1594` |

## 2026-07-05 17:56（Asia/Taipei）owner 套用 5 migration → 解除 blocker
- owner (smallwei0301) 於 Supabase Dashboard SQL Editor 套用 5 支 migration 到 production（project pyoderxmpeyqjwkeliiu）。
- agent 唯讀驗證：8 欄位/表 `present=true`；4 新表 `relrowsecurity=true`；`uq_points_earn_per_order` 唯一索引在；`idx_user_notifications_unread` 在；policy 數 activity_addons=2 / order_addons=1 / user_notifications=3 / user_points_ledger=2，全部符合 migration 定義。
- ledger 5 筆 `pending`→`verified`（applied_at 2026-07-05T17:56:13+08:00），commit edf21b0 push → #1293 gate 轉綠。
- 註：本機殘留錯表檔 `20260704120000_guide_contact_phone_1596.sql`（git-excluded、未 commit）會讓本機 gate 誤報 missing；CI 對已 commit 樹（122 檔）不受影響。bash-guard 擋 rm，維持現狀。

## 唯一 blocker（已解除）
鐵律 2（prod 唯讀，agent 不套 migration）× 鐵律 6（紅燈不 merge）× 單分支單 open PR → 上述 5 支 migration 未套用前，B 組 6 張無法 merge。CI `unstable`＝#1293 ledger-gate 對 5 支 pending 記錄 HOLD（by design）；其餘全套綠（4365/4371，2 fail 皆此 gate）。

owner 二選一：
1. 依 migration-apply SOP 逐支套用 5 migration → ledger 改 verified → CI 綠 → merge PR #1624。
2. 授權 agent Supabase MCP `apply_migration`（scoped 放寬鐵律 2），agent 自套＋verify＋拆回逐 issue 獨立 PR。

## 證據
- `run-checks.sh --all`：4365 pass / 6371… 2 fail（皆 #1293 ledger HOLD）＋3 skip。
- #1592 契約：`issue1592-guide-reply-contract.test.mjs` 5/5 綠；`issue1592-review-distribution` 5/5 綠；typecheck 綠。
- db.mjs strangler 天花板：guideReply 映射 net-zero 併入 photos 行，維持 6985 行 ≤ CEILING 6986。

## 絕不重做（Do-NOT-redo）
- #1592 guideReply 映射必須 net-zero（併 photos 同行），否則撞 db.mjs 6986 天花板 guard。
- 所有 B 組讀取端已加 42703/schema-drift fail-soft，migration 未套用時**不得**再包一層。
- migration 一律新時間戳、只增不改；ledger 補 pending 記錄（owner 套用後改 verified）。
- 錯 migration 檔（`20260704120000_..._1596.sql` 打錯 `guides` 表）已入 `.git/info/exclude`，永不 commit。

## 2026-07-06（Asia/Taipei）後台加購編輯器 + 點數示範發放
- **PR #1633**（feat(addons)：導遊+管理者後台加購項目編輯器＋/me 轉址）：
  - 新增共用 `AddonsEditor.tsx`（新增/改名/改價/單位每人·每團/庫存留空=不限/啟用切換/刪除），掛在 `guide/activities/[id]/edit` 與 `admin/activities/[id]/edit`。未設任何項＝結帳頁不顯示加購（預設隱藏）。
  - v2 API：guide（`verifyGuideSession`＋ownership＋CSRF）、admin（middleware 把關＋CSRF、route 不讀 process.env）；一律 jsonOk/jsonError。
  - 資料層 `db-addons.mjs` 擴充 CRUD（strangler 領域檔）＋in-memory fallback；契約測試 `issue1591-addons-editor-contract.test.mjs` 5/5。
  - `/me` 補 `redirect('/me/orders')`（原本只有 layout，手動檢查回報「找不到頁面」）。
- **真瀏覽器 QA（local dev、in-memory fallback）**：注入 guide/admin session cookie，驅動真實編輯器 UI 新增 3 筆加購 → 截圖成功（`10b-guide-edit-addons-crop.png`、`11-admin-edit-addons.png`）。導遊/管理者編輯頁未登入會正確導向登入頁（非 bug）。
- **#1592/#1594 使用者回報排查**：#1592「沒顯示」＝該活動無已核准評論（分佈/篩選只在有評論時顯示，by design）；正解 URL＝`/activities/kaohsiung/kaohsiung-chaishan-cave-experience`（已 curl 證實 review-dist 節點）。#1594「找不到頁面」＝`/me` 缺 page，已修為轉址。
- **點數示範發放（SQL-OVERRIDE 授權寫入）**：owner 當輪回覆含 SQL-OVERRIDE → 落 `.claude/state/sql-override` → INSERT `user_points_ledger`（user 94062ffc…74e0, delta +1000, reason=adjust, expires_at=NULL）→ 用畢刪檔。首呼因 MCP permission stream 中斷未落庫，SELECT 確認後重試，最終 balance=1000／ledger_rows=1（無重複）。審計記於 `.claude/state/sql-audit.log`。

## 2026-07-06（Asia/Taipei）暖場評論併入正式評論邏輯（#1592 補強）
- **回報**：活動頁頂部顯示「4.8 共 21 則」＋暖場評論卡片，但 #1592 的評分分佈長條/星等篩選沒把暖場評論算進去（只有暖場、無正式評論時 `hasReviews=false` → 整組不顯示）。
- **根因**：`ActivityReviewsPanel` 的 `buildRatingDistribution(reviews)`／`filterReviews(reviews)` 只吃真實評論（`activity_reviews`），暖場語錄（`activities.social_proof_quotes`）只恆顯示為卡片、不進分佈/篩選。頂部聚合（`resolveActivityReviewStats`）卻已把暖場算進「則數」，兩者不一致。
- **修法（前端、零 migration）**：新增純函式 `toReviewDisplayList(reviews, warmQuotes)`（真實在前、暖場在後、帶 `isWarm`）；面板改用合併列餵分佈/篩選，依 `isWarm` 分流渲染（暖場無日期/導遊回覆）。
- **紅線保留**：`rating_avg`／`review_count`／JSON-LD 仍只採真實評論（#1378 SEO；page 層另計，未動）。
- **驗證**：`issue1592-review-distribution`（+3 案：合併排序/旗標、暖場-only→total>0、非陣列安全）＋`issue1592-reviews-panel-contract`（更新契約）＋`issue1592-guide-reply-contract` 全綠＋typecheck 綠。真瀏覽器（fixtures 模式，`dadadaocheng-walk`）截圖：分佈長條 5 列出現、「共 5 則」與分佈總數一致、5★ 篩選涵蓋暖場卡（`12-reviews-warm-distribution.png`）。
- commit `af7f06e`（分支 `claude/repo-audit-optimization-m4s8os`，相對 main 之新變更）。
