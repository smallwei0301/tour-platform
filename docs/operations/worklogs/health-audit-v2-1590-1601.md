# 健檢 v2 收尾 — #1590–#1601（12 張）
> 最後更新：2026-07-05（Asia/Taipei）｜負責 session：claude-opus-4-8 / claude/repo-audit-optimization-m4s8os
> /goal：自己評估順序，完成 #1590–#1601。**永遠以本 worklog 為準。**

## 總狀態：12/12 後端交付完成

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

## 唯一 blocker（需 owner 決策）
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
