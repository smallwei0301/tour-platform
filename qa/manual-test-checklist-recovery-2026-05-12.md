# Manual Test Checklist Recovery — 最近 2 天合併 PRs

Updated: 2026-05-12 18:38 CST (Asia/Taipei)
Target: https://tour-platform-nine.vercel.app/
Reviewer: Rita / tp-reviewer

## Legend

- ✅ PASS — verified by direct evidence, or explicitly confirmed by user/manual operator.
- ❌ FAIL — direct evidence shows it does not work.
- ⚠️ BLOCKED/PARTIAL — some evidence exists, but acceptance cannot be fully verified.
- ➖ NOT RUN — not yet executed or evidence insufficient.

## Current Checklist Status

### A. 金流 / 退款

- [x] ✅ 真實信用卡付款流程：活動頁 → checkout → ECPay → callback → 訂單變 paid
  - Evidence: User manually confirmed PASS on 2026-05-12.
- [x] ✅ Admin 執行退款：找 refund_pending 訂單 → 按「執行退款」→ ECPay AllRefund 觸發 → 訂單變 refunded（#370/#372/#375/#376）
  - Evidence: User manually confirmed A section PASS on 2026-05-12.
- [x] ✅ 退款後管理員/旅客收到 email 通知
  - Evidence: User manually confirmed A section PASS on 2026-05-12.

### B. Wishlist 收藏

- [ ] ❌ 登入後點活動頁心型 → 加入收藏 → 圖示變實心（#347/#351）
  - Current evidence: logged-in session works, but wishlist API is blocked by #405.
  - Additional code evidence: `ActivityBottomBar` renders `WishlistToggle` without passing `isLoggedIn`, while `WishlistToggle` defaults `isLoggedIn=false`; logged-in heart click can still redirect to `/login` unless fixed.
  - Blocking issues: #405 and #416.
- [ ] ❌ /me/wishlist 頁面列出收藏，可移除
  - Current evidence: `GET /api/me/wishlist` returns HTTP 500: `Could not find the table 'public.wishlists' in the schema cache`.
  - Blocking issue: #405.
- [x] ✅ 未登入點心型 → 導向 /login
  - Evidence: non-auth mobile activity page heart click redirects to `https://tour-platform-nine.vercel.app/login`.
  - Evidence file: `/root/.openclaw/workspace/tour-platform-non-auth-wishlist-faq-qa-2026-05-12.json`.

### C. 評論系統

- [ ] ❌ 旅客在 /me/orders 對 completed 訂單填寫評論（5星 + 文字）→ 送出（#360/#364）
  - Current evidence: `/me/orders` has paid orders, but no completed-order detail pages were available to test review controls. Review eligibility is `completed`-only (product decision #413 Option B).
  - Blocking issue: #413 (需提供 completed 測試訂單).
- [ ] ➖ Admin 在評論管理頁看到待審核評論，可 approve/reject（#364）
  - Not run; blocked until a review can be submitted or seeded.
- [x] ✅ Activity 詳情頁顯示 approved 評論 + 星等
  - Evidence: activity detail page showed `★ 5.0`, `共 4 則評價`, and approved review content.

### D. Q&A 問答

- [ ] ➖ 旅客在活動詳情頁提問 → 送出（#362/#366）
  - Not run; requires safe approval for production mutation or test data path.
- [ ] ➖ Admin/Guide 在管理頁看到問題，可填回覆並 approve（#368/#374/#377）
  - Not run; requires admin/guide session.
- [ ] ⚠️ 活動詳情頁顯示 approved Q&A
  - Current evidence: activity page has Q&A anchor/section, but approved Q&A content was not confirmed.

### E. 折扣碼

- [ ] ➖ Admin 建立折扣碼（#354）
  - Not run; requires admin session and safe test-code naming policy.
- [ ] ➖ Checkout 頁輸入折扣碼 → 驗證 → 金額折減（#356）
  - Not run.
- [ ] ➖ 折扣碼使用後庫存 -1
  - Not run; requires safe production mutation approval or DB/API verification path.

### F. Activity FAQ

- [ ] ➖ Guide 在 admin edit 頁新增/編輯 FAQ → 儲存（#343）
  - Not run; requires guide/admin session and safe production mutation approval.
- [x] ✅ Activity 詳情頁顯示 FAQ 區塊（有 faq 時）
  - Evidence: mobile activity detail showed `常見問題` with FAQ questions.
  - Evidence file: `/root/.openclaw/workspace/tour-platform-non-auth-wishlist-faq-qa-2026-05-12.json`.

### G. Guide Dashboard

- [ ] ➖ 登入 Guide 帳號 → /guide 看到 GMV、6 個月趨勢（#358）
  - Not run; requires guide session.
- [ ] ➖ Guide 看到自己活動的 Q&A 待回覆提示（#374）
  - Not run; requires guide session and pending Q&A data.

### H. 旅客退款申請

- [ ] ❌ 旅客在 /me/orders 的 paid 訂單點「申請取消/退款」→ 選原因 → 送出（#346）
  - Current evidence: `/me/orders` has paid orders, but paid order detail pages show no refund request controls.
  - Blocking issue: #413.
- [ ] ⚠️ 訂單狀態變 refund_pending，管理員收到 email
  - Current evidence: an existing `refund_pending` order is visible, but this pass did not execute paid → refund_pending nor verify admin email.

## Recovery Plan

1. B Wishlist first: fix/verify #405 schema/API and re-run logged-in + logged-out wishlist flows.
2. C/H traveler order flows: resolve #413 or align spec/test data, then re-run review + refund request paths.
3. D/E/F/G admin/guide flows: obtain or validate admin/guide session, then test Q&A, discounts, FAQ, guide dashboard.
4. Email/provider side effects: only mark PASS with direct inbox/provider/log evidence or explicit manual confirmation from user.

## Evidence Files

- `/root/.openclaw/workspace/tour-platform-storageState-lite-qa-2026-05-12-redacted.json`
- `/root/.openclaw/workspace/tour-platform-order-detail-nonmutating-qa-2026-05-12-redacted.json`

## Related Issues

- #405 — Wishlist production schema/API failure.
- #413 — `/me/orders` checklist wording corrected: review requires `completed` order (Option B); refund requires future-departure `paid`/`confirmed` order. Test data (completed order + future-departure paid order) needed for QA re-run.
- #416 — Activity wishlist heart lacks logged-in auth state wiring.
