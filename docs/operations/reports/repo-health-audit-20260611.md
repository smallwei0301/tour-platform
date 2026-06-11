# 全 Repo 健檢報告與優化指南（2026-06-11）

> 範圍：產品功能（以 KKday 長期使用者視角）＋ 工程全面健檢（架構、程式碼結構、SEO、資安、潛在 bug、技術債）
> 基準 commit：`763f48f`（main）
> 產出時間：2026-06-11（Asia/Taipei）
> 方法：三路全 repo 掃描（產品功能盤點／架構與技術債／SEO 資安 bug），關鍵主張逐一人工複核原始碼後成文。

---

## 總評

| 面向 | 評分 | 一句話結論 |
|---|---|---|
| 產品完成度 | ★★★★☆ | 訂購漏斗（探索→預訂→付款→訂單管理）完整可營運，缺的是「信任引擎」與「再行銷」層 |
| 系統架構 | ★★★★☆ | 三層 auth、in-memory fallback、feature-flag 設計成熟；債務集中在 `db.mjs` 單體與 V2/legacy 雙軌 |
| SEO | ★★★★☆ | metadata／sitemap／JSON-LD／slug URL 都已到位，剩 rich snippet 與 OG 圖等加分項 |
| 資安 | ★★★★☆ | 核心設計穩（HMAC、CSRF、CheckMacValue、RLS），有 3 個明確補強點（login rate limit、admin cookie Secure flag、HSTS/CSP） |
| 潛在 bug 防護 | ★★★★★ | 超賣、付款冪等、時區、金額精度都有良好設計擋掉；殘餘風險在雙實作漂移 |
| 技術債 | ★★★☆☆ | 紀律好（全 repo 僅 9 處 TODO），但 4,500 行的 `db.mjs` 與雙軌 booking 已到該還債的時點 |

**規模快照**：核心程式約 52,000 行（838 個原始檔）、409 個測試檔、249 份文件、86 個 DB migration。

---

## 第一部分：KKday 長期使用者視角的功能優化建議

### 已做得好的（先肯定）

- 訂購漏斗完整：活動探索 → 日期/方案選擇（Booking V2）→ checkout（ECPay）→ 訂單管理（取消＋退款預覽）。
- 願望清單（`app/me/wishlist/`）、嚮導收益儀表板、admin POS 補款、soft-launch kill-switch 都是同規模產品少見的完成度。
- 退款政策分級明確（168h 全退／72–168h 七成／<72h 不退）且在活動頁與訂單頁都有揭露。

### P0 — 直接影響轉換率（KKday 使用者最有感的落差）

#### 1. 旅客評論撰寫功能（信任引擎缺最後一哩）
- **現況**：評論僅後台管理（`apps/web/app/admin/reviews/page.tsx`），活動頁有 ratingAvg/reviewCount 顯示，行程後評論邀請信已實作（`src/lib/email.ts`），**但旅客沒有提交評論的頁面**。
- **KKday 視角**：訂深度體驗（探洞、溯溪）前必看評論與照片。沒有 UGC 評論，新客轉換率天花板很低。
- **建議**：`/me/orders/[orderId]` 增加「撰寫評論」入口（限 completed 訂單）→ 送審進既有 admin reviews 流程 → 通過後顯示於活動頁，附「驗證購買」標章。第二期補照片評論與星等分布（5-4-3-2-1 bar）。

#### 2. 搜尋與篩選升級（先選日期再挑活動）
- **現況**：`app/activities/ActivitiesContent.tsx` 只有 region＋type＋關鍵字（500ms debounce）。
- **KKday 視角**：核心習慣是「我這個週末有空 → 哪些活動可訂」。目前無日期可訂篩選、無價格區間、無時長／難度，也沒有 autocomplete。
- **建議**：優先補「日期可訂」篩選（V2 availability 引擎已有 available-slots 查詢能力，`app/api/v2/activities/[activityId]/available-slots/`）與價格區間；autocomplete 與熱門關鍵字第二期。

#### 3. 促銷碼旅客端曝光（已建好的轉換工具沒在用）
- **現況**：admin 端 promo-codes 完整（`app/admin/promo-codes/page.tsx`：折扣類型、上限、效期、用量統計），checkout 已能驗證折扣碼，**但旅客端零曝光**——沒有領取入口、活動頁不顯示可用優惠。
- **建議**：活動頁與 checkout 顯示可用優惠碼提示、首購碼機制。成本極低（後端全現成），是最便宜的轉換率槓桿。

### P1 — 留存與客單價

#### 4. 推薦與最近瀏覽
- 活動頁底部加「同地區其他活動」「同類型你可能也喜歡」（用既有 region/type 查詢即可，不需推薦引擎）；「最近瀏覽」可先用 localStorage 實作，不動後端。

#### 5. 訂單改期（取消之外的第二條路）
- **現況**：`app/me/orders/` 只能取消＋退款。
- **KKday 視角**：天氣型活動（溯溪、探洞）改期是高頻需求；只能取消會把可挽回的訂單變成退款流失。
- **建議**：confirmed 訂單在政策時限內可申請改期 → 嚮導確認 → 換 slot 不動金流。需設計 booking V2 的 slot 轉移邏輯，屬中型工程。

#### 6. 旅客個人資料與通知偏好
- `/me` 目前只有 orders 與 wishlist，無 profile 編輯、無通知偏好設定。最小版本：姓名／電話預填（checkout 免重打）＋ email 通知開關。

#### 7. 行前溝通管道（站內訊息）
- 旅客與嚮導目前無任何溝通方式（僅 Q&A 在活動頁公開問答）。深度體驗的集合點確認、裝備提醒是剛需。最小版本：訂單頁的留言串（非即時聊天），複用 Q&A 的資料模型思路。

### P2 — 成長基礎（與既有 roadmap Phase 12 對齊）

8. **i18n 英文版**＋hreflang（外國旅客是台灣深度體驗的天然客群；BRAND_BOOK 已有英文品牌定位 "An island, untold"）。
9. **會員回購機制**：點數或回購折扣（可先用 promo-code 引擎發「老客專屬碼」起步）。
10. 彈性日期搜尋、組合行程、禮品卡——量級夠大後再做。

---

## 第二部分：工程健檢

### A. 系統架構與技術債（依影響排序）

#### 🔴 A1. `src/lib/db.mjs` 資料層單體（4,527 行、66 個 exported async functions）
- 業務邏輯（退款回沖、payout 餘額修復、audit log）與資料存取糾纏；`processPaymentCallbackDb`、`executeRefundDb` 等函式 300–500 行，無法脫離 Supabase 單測。
- audit log 寫入邏輯在 `db.mjs` 與 `admin.mjs` 各自實作一份（複製貼上漂移源）。
- **建議**：抽 service layer（純業務邏輯，可用 in-memory seam 單測）＋共用 audit-log 抽象。不需要一次大爆改，每次碰到該區域時順手抽一塊（strangler 模式）。

#### 🔴 A2. Booking V2 vs legacy 雙軌並存
- `app/api/v2/**`（31 檔）與 legacy routes（108 檔）是兩套完整的 checkout／availability／order-state 堆疊；feature flag（`NEXT_PUBLIC_BOOKING_V2_ENABLED`，預設 ON）要在 3 處以上保持一致。
- 最大單檔 `app/api/v2/bookings/draft/route.ts`（1,093 行）混合 slot 查詢與 draft 產生。
- **建議**：V2 已是 primary 且過觀察期後，**訂出 legacy 退役時間表**（先凍結 legacy 修改 → 移除入口 → 刪碼）。這是本 repo 最大的長期維護負擔。

#### 🟡 A3. in-memory fallback 與 Supabase 實作漂移
- 測試大量依賴 `hasSupabaseEnv()` false 分支（`store.mjs`/`services.mjs`/`admin.mjs`），但兩套實作無契約測試保證行為一致——**測試綠燈不代表 production 正確**。
- **建議**：對關鍵流程（createOrder、payment callback、refund）寫「同輸入雙實作同輸出」的 contract tests；新增 db 函式時強制同步 fallback。

#### 🟡 A4. `faq-route-helpers` 雙檔漂移（已實證）
- `faq-route-helpers.ts`（2,024 行）與 `faq-route-helpers.mjs`（1,007 行）並存；**production route（`app/api/admin/activities/[id]/route.ts:4`）引用 `.ts`，測試（`tests/api/activity-faq-route.test.mjs:12`）卻測 `.mjs`**——測試測的不是上線的那份。
- **建議**：收斂為單一檔案（依 edge 相容需求擇一），更新引用。

#### 🟡 A5. TypeScript strict 覆蓋不全
- `tsconfig` strict 全域開啟，但 booking-critical 模組仍有缺口（issue #68 既有追蹤）。優先補：`db.mjs` 周邊型別、payment callback、slot generator。

#### 🟢 A6. Quick wins（各 < 1 小時）
| 項目 | 位置 | 動作 |
|---|---|---|
| 殭屍套件 | `packages/ui`（已實證全 repo 零引用） | 移除 |
| Legacy scratch scripts | root 的 `apply_migrations.sh`、`execute-migrations.*`、`auto-migrate-012-013.js` | 移除或搬入 `docs/` 標註 historical |
| Production console.log | `src/lib/pre-tour-reminder.ts`、`email.ts`、`line-notify.ts` | 改 console.warn/error 或移除 |
| Migration 命名 | 25 個編號制＋23 個 timestamp 制並存 | 文件化「新 migration 一律 timestamp 制」 |
| API 錯誤格式 | 各 route 回應 shape 不一 | 統一為 `{ error: { code, message } }`（先規範 v2） |
| TS 版本不一致 | app `typescript@6.0.2` vs root `5.9.3` | 對齊 |

### B. SEO

#### 已到位（優於同階段產品的水準）
- 全頁 `metadata`/`generateMetadata`（`app/layout.tsx` 含 metadataBase＋robots、活動詳情頁動態 metadata）。
- 動態 sitemap 每小時 revalidate（`app/sitemap.ts`，含活動／嚮導／體驗頁）＋ `app/robots.ts`。
- JSON-LD：Organization、WebSite、FAQPage（首頁）、CollectionPage＋BreadcrumbList（列表頁）；全部 `JSON.stringify` 安全注入。
- Slug-based URL（`/activities/[region]/[slug]`）、next/image＋AVIF/WebP＋LCP preload、字型 CLS 已有 mitigation（issue #1345，`display: 'optional'`）。

#### 改善建議（依 ROI 排序）
1. **活動詳情頁補 Product/TouristTrip schema 含 `AggregateRating` 與 `Offer`**——SERP 顯示星等與價格是 OTA 點擊率最大槓桿（資料都在頁面上，只差 schema 輸出）。
2. **OG image 改用活動自身圖片**：目前行銷頁 OG 圖是 Unsplash 通用圖；活動詳情頁分享到 LINE/FB 時應出該活動封面。
3. i18n 上線時補 hreflang（與 P2-8 綁定）。
4. 評論功能上線後，schema 的 AggregateRating 即有真實 reviewCount 支撐，形成正循環。

### C. 資安

#### 已到位
- 三層 auth 設計乾淨：guide HMAC-SHA256（32-byte secret 強制、constant-time compare，`src/lib/guide-auth.ts`）；admin token＋email allowlist＋session version（`src/lib/admin-auth.mjs`）；traveler 交給 Supabase（middleware 限時 refresh）。
- CSRF double-submit（`middleware.ts`）、ECPay CheckMacValue 驗證＋輸入截斷（`app/api/payments/ecpay/callback/route.ts`）、付款冪等 atomic RPC＋unique constraint。
- RLS 全表啟用（`supabase/migrations/001_mvp_core_v2.sql`）、service-role key 零客戶端洩漏（已 grep 實證）、無 raw SQL、無 `dangerouslySetInnerHTML` 用於使用者內容、無硬編碼密鑰。

#### 需補強（依嚴重度）
1. **🟡 HIGH — login endpoints 無 rate limit（已實證）**：`app/api/admin/auth/session/route.ts` 與 `app/api/guide/auth/session/route.ts` 的 POST 皆無限流，admin token 與 guide 密碼可被暴力嘗試。`src/lib/rate-limit.ts` 已有現成 RateLimiter（orders 10/min、callback 30/min 都在用），直接套 5–10 req/min/IP 即可。
2. **🟡 HIGH — admin session cookie 缺 `Secure` flag（本次複核新發現）**：`app/api/admin/auth/session/route.ts:64-67` 設定 `admin_token`／`admin_email` cookie 只有 `HttpOnly; SameSite=Lax`，**無 `Secure`**——production 下若有任何 http 降級或子資源混雜，token 可能明文傳輸。guide cookie 有做 production Secure，admin 應比照。
3. **🔵 LOW — 缺 HSTS 與 CSP**：`next.config.mjs:12-18` 的 securityHeaders 已有 X-Frame-Options 等五項，但無 `Strict-Transport-Security` 與 `Content-Security-Policy`。建議加 HSTS（`max-age=31536000; includeSubDomains`）；CSP 需先盤點第三方 script（Sentry、Vercel Analytics、ECPay 表單跳轉）再上 report-only 模式試行。
4. **🔵 複核項** — `fn_process_payment_callback_atomic` stored procedure：app 層假設它在單一交易內完成「鎖定→容量檢查→扣位→改狀態」；建議在 migration SQL 內確認 `SELECT ... FOR UPDATE` 順序並將原子性假設文件化。

### D. 潛在 bug 面

| 風險 | 狀態 | 防護機制 |
|---|---|---|
| Slot 超賣（race condition） | 🟢 已防護 | `fn_process_payment_callback_atomic` DB 層原子操作 |
| 付款 callback 重放／重複入帳 | 🟢 已防護 | payment events unique constraint＋idempotency 檢查（`payment-reconciliation.ts`），有 replay contract test |
| 金額浮點誤差 | 🟢 無風險 | TWD 整數運算＋`Math.round` |
| 時區混淆 | 🟢 一致 | availability-v2 全程顯式 `Asia/Taipei` 參數 |
| fallback/Supabase 行為漂移 | 🟡 殘餘風險 | 無契約測試（見 A3） |
| 測試測錯目標 | 🟡 已實證一例 | faq-route-helpers（見 A4） |
| feature-flag 邊界行為差異 | 🟡 殘餘風險 | V2/legacy 錯誤處理 pattern 不一致 |

---

## 第三部分：優化路線圖

### 立即（quick wins，各 ≤ 1 天）
1. login endpoints 加 rate limit（資安 HIGH）
2. admin cookie 補 `Secure` flag（資安 HIGH）
3. `next.config.mjs` 加 HSTS
4. 移除 `packages/ui`＋root legacy scratch scripts
5. 收斂 `faq-route-helpers` 雙檔
6. 活動詳情頁補 Product JSON-LD（含 AggregateRating/Offer）

### 短期（1–2 週，轉換率優先）
7. 旅客評論撰寫（P0-1）
8. 搜尋篩選升級：日期可訂＋價格區間（P0-2）
9. Promo code 旅客端曝光（P0-3）
10. 活動 OG image 動態化
11. fallback/Supabase 契約測試（關鍵三流程）

### 中期（1–2 月）
12. `db.mjs` service-layer 漸進抽離（strangler）
13. Legacy booking 退役計畫（凍結→移除入口→刪碼）
14. 訂單改期（P1-5）
15. 推薦／最近瀏覽（P1-4）
16. CSP report-only 試行→enforce

### 長期（Phase 12 對齊）
17. i18n 英文版＋hreflang
18. 站內訊息／行前溝通
19. 會員回購機制

---

## 附錄：關鍵檔案索引

| 主題 | 檔案 |
|---|---|
| 資料層單體 | `apps/web/src/lib/db.mjs`（4,527 行） |
| in-memory fallback | `apps/web/src/lib/{store,services,admin}.mjs` |
| Feature flags | `apps/web/src/config/feature-flags.mjs` |
| 三層 auth | `apps/web/middleware.ts`、`src/lib/guide-auth.ts`、`src/lib/admin-auth.mjs` |
| 付款安全 | `apps/web/app/api/payments/ecpay/callback/route.ts`、`src/lib/payment-reconciliation.ts` |
| Rate limiter（現成可複用） | `apps/web/src/lib/rate-limit.ts` |
| Security headers | `apps/web/next.config.mjs:12-18` |
| SEO | `apps/web/app/sitemap.ts`、`app/robots.ts`、`app/layout.tsx` |
| 搜尋篩選 | `apps/web/app/activities/ActivitiesContent.tsx` |
| Promo codes（admin 已完成） | `apps/web/app/admin/promo-codes/page.tsx` |
| 評論（admin 已完成） | `apps/web/app/admin/reviews/page.tsx` |
