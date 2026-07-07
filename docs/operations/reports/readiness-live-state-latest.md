<!-- query_timestamp: 2026-07-07T12:53:07.792Z -->
<!-- freshness_rule: auto-refreshed every 6h via CI; stale threshold: 12h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-07-07T12:53:07.792Z  
**Commit SHA:** `dd8f69e33662c1a5ff28ddbb15b34bae5eb259fd`

---

## Open PRs (8)

| # | Title | Branch |
|---|-------|--------|
| #1651 | [docs(#1649): 訂單／退款／金流 v2 全面串接計劃書＋worklog（docs-only）](https://github.com/smallwei0301/tour-platform/pull/1651) | `claude/issue1649-v2-migration-plan` |
| #1646 | [security(rls): preflight 全表掃描 RPC — 掃全部 public 表＋檢查 RLS 是否啟用](https://github.com/smallwei0301/tour-platform/pull/1646) | `claude/code-workflow-architecture-mmm4ba` |
| #1602 | [feat(ui): redesign guide shop booking flow](https://github.com/smallwei0301/tour-platform/pull/1602) | `ui/midao-shop-booking-redesign` |
| #1534 | [feat(guide): 導遊大頭照上傳支援自選裁切範圍與大小](https://github.com/smallwei0301/tour-platform/pull/1534) | `claude/guide-profile-photo-crop-2vbzrr` |
| #1469 | [導遊後台：新增 Dashboard 首頁與指標卡（免費/付費分級）](https://github.com/smallwei0301/tour-platform/pull/1469) | `codex/-dashboard` |
| #1438 | [Use next/font variables in globals, set CJK fonts to `display: optional`, and scope serif usage to LP/brand](https://github.com/smallwei0301/tour-platform/pull/1438) | `codex/improve-homepage-loading-speed` |
| #1415 | [feat(home): hero 改版為 boomerang 影片背景的 motion hero](https://github.com/smallwei0301/tour-platform/pull/1415) | `claude/hero-section-redesign-4v9z2a` |
| #1372 | [fix(settlement): 補正 payout_items.order_id UNIQUE 約束，修復 sweep upsert ON CONFLICT 500 (#1365)](https://github.com/smallwei0301/tour-platform/pull/1372) | `claude/post-merge-qa-verification-kgspK` |

## Open Issues (26 total)

### P0 (0)

_none_

### P1 (11)

| # | Title | Labels |
|---|-------|--------|
| #1652 | [[Booking V2][Phase 1/6] 訂單讀取面 v2 接線 — 詳情頁接既有 v2 route、新增 v2 訂單列表、POS UI 接線、死碼清理（#1649）](https://github.com/smallwei0301/tour-platform/issues/1652) | priority:P1, owner:ai-agent, status:in-progress, traveler-booking, booking-v2 |
| #1649 | [[Booking/Order/Payment][P1] 訂單／退款／金流 v2 全面串接計劃 — legacy 殘餘盤點與分階段遷移](https://github.com/smallwei0301/tour-platform/issues/1649) | type:feature, priority:P1, owner:mixed, status:ready, traveler-booking, payments, booking-v2 |
| #1648 | [[QA] Verify late 2026-07-07 merged PRs (#1643–#1645)](https://github.com/smallwei0301/tour-platform/issues/1648) | triaged, priority:P1, qa, guide-dashboard, agent:queued, owner:ai-agent, status:ready, type:qa, payments, infra |
| #1642 | [[QA] Daily test checklist for recent merged PRs 2026-07-07](https://github.com/smallwei0301/tour-platform/issues/1642) | triaged, priority:P1, qa, guide-dashboard, agent:queued, owner:ai-agent, status:ready, type:qa, traveler-booking, payments, auth, rls |
| #1641 | [[QA] Daily regression checklist for 2026-07-06 merged PR train (#1624–#1639)](https://github.com/smallwei0301/tour-platform/issues/1641) | triaged, priority:P1, qa, guide-dashboard, security, agent:queued, owner:ai-agent, status:ready, type:qa, traveler-booking, payments, infra |
| #1317 | [[Production Smoke] Owner-only acceptance verification gaps from recent close-gate sweep (#1306 / #1289 / #1290 OFF / #1286 UI / #1307 TZ)](https://github.com/smallwei0301/tour-platform/issues/1317) | priority:P1, type:qa, owner:human, production-smoke, post-merge |
| #714 | [[Ops] Run real alert drill before first payment](https://github.com/smallwei0301/tour-platform/issues/714) | triaged, type:investigation, priority:P1, agent:backlog, owner:mixed, status:blocked, infra, status:awaiting-implementation, launch:first-payment-blocker |
| #642 | [[需 Operator][Traveler Booking] Monitor V2 observation window and guard legacy fallback after launch](https://github.com/smallwei0301/tour-platform/issues/642) | type:investigation, priority:P1, qa, agent:backlog, owner:mixed, status:ready, traveler-booking, launch:post-first-payment |
| #605 | [[Launch Content] Strict Andy Lee listing content gate before public exposure](https://github.com/smallwei0301/tour-platform/issues/605) | triaged, type:investigation, priority:P1, qa, agent:backlog, owner:mixed, type:docs, docs, status:awaiting-implementation, launch:first-payment-blocker |
| #319 | [[Ops] Run customer support SOP first-case drill follow-through](https://github.com/smallwei0301/tour-platform/issues/319) | triaged, priority:P1, qa, agent:backlog, owner:mixed, status:ready, type:qa |
| #318 | [[Ops] Run Andy Lee first-guide onboarding demo and retrospective scope](https://github.com/smallwei0301/tour-platform/issues/318) | triaged, type:investigation, priority:P1, agent:backlog, owner:mixed, status:ready, admin-guides |

### P2 (7)

| # | Title | Labels |
|---|-------|--------|
| #1388 | [[Growth][P2] 成長基礎 backlog 總綱 — i18n 英文版、站內訊息、會員回購（Phase 12 對齊）](https://github.com/smallwei0301/tour-platform/issues/1388) | type:optimization, priority:P2, agent:backlog, owner:mixed, traveler-booking |
| #1344 | [[Perf][P2] Mobile LCP regression on /activities — 10–12s vs 2s desktop](https://github.com/smallwei0301/tour-platform/issues/1344) | type:bug, priority:P2, owner:ai-agent, traveler-booking, performance |
| #926 | [[Ops] Add LINE/LIFF Messaging API rollout evidence gate after #920](https://github.com/smallwei0301/tour-platform/issues/926) | triaged, priority:P2, qa, agent:backlog, owner:mixed, status:blocked, type:qa, auth, notifications, infra |
| #797 | [[Compliance] Internal conservative incident reporting playbook for soft launch](https://github.com/smallwei0301/tour-platform/issues/797) | triaged, priority:P2, security, owner:ai-agent, infra, docs, status:awaiting-implementation |
| #724 | [[Ops] Execute Supabase live restore drill within 7 days after soft launch](https://github.com/smallwei0301/tour-platform/issues/724) | triaged, type:investigation, priority:P2, agent:backlog, owner:mixed, database, infra, status:awaiting-implementation, launch:post-first-payment |
| #685 | [[Monitoring] Add simple outside website monitor after soft launch](https://github.com/smallwei0301/tour-platform/issues/685) | triaged, type:optimization, priority:P2, qa, agent:backlog, owner:ai-agent, infra, status:awaiting-implementation, launch:post-first-payment |
| #320 | [[Launch] Public soft launch with restricted booking and Go/No-Go gate](https://github.com/smallwei0301/tour-platform/issues/320) | triaged, priority:P2, agent:queued, infra, status:awaiting-implementation, launch:first-payment-blocker |

### Human-Decision (1)

| # | Title | Labels |
|---|-------|--------|
| #1647 | [[Payments] Decide and verify post-#1637 historical paid-order / payout reconciliation](https://github.com/smallwei0301/tour-platform/issues/1647) | triaged, priority:P1, owner:human-decision, status:needs-decision, type:decision, payments, orders |

### Other (7)

| # | Title | Labels |
|---|-------|--------|
| #1609 | [導遊開店第 4–6 週：導遊訂閱方案（plan tier）SaaS 化 — placeholder，待 owner 拍板定價](https://github.com/smallwei0301/tour-platform/issues/1609) | — |
| #1608 | [導遊開店第 2–3 週：導遊後台「開店進度」新頁＋「本月商店表現」](https://github.com/smallwei0301/tour-platform/issues/1608) | — |
| #1607 | [導遊開店第 2–3 週：商店 FAQ／政策區塊擴充＋匯款付款 beta（文案＋SOP＋flag）](https://github.com/smallwei0301/tour-platform/issues/1607) | — |
| #1604 | [[SEO] 不存在的頁面回 HTTP 200 而非 404（not-found 狀態碼）— #1585 調查附帶發現](https://github.com/smallwei0301/tour-platform/issues/1604) | type:investigation, agent:backlog, seo |
| #1603 | [[SEO] server-rendered `<html lang>` 隨 locale 正確輸出（多 root layout 結構）— #1585 follow-up](https://github.com/smallwei0301/tour-platform/issues/1603) | type:investigation, agent:backlog, seo |
| #1474 | [QA：PR #1473 部分退款功能 — Staging 實測（ECPay 測試卡）](https://github.com/smallwei0301/tour-platform/issues/1474) | qa, refund |
| #1121 | [[Security] Rotate all credentials exposed in git history (service_role JWT × 7, sbp_ PAT × 5, admin token × 10, anon JWT × 4) — 正式上線前執行](https://github.com/smallwei0301/tour-platform/issues/1121) | type:bug, security, owner:mixed, status:needs-decision, launch:post-first-payment |

---

## Recent Merged PRs (last 10)

| # | Title | Merged |
|---|-------|--------|
| #1650 | [test(api): add v2 admin POS auth csrf contract](https://github.com/smallwei0301/tour-platform/pull/1650) | 2026-07-07 |
| #1645 | [feat: add admin evidence sweep scanner](https://github.com/smallwei0301/tour-platform/pull/1645) | 2026-07-07 |
| #1644 | [feat: #1637 金流全鏈修復＋月結報表＋導遊已入帳/憑證核銷頁＋金流說明全鏈流程](https://github.com/smallwei0301/tour-platform/pull/1644) | 2026-07-07 |
| #1643 | [fix(shop): 商店首頁字級/卡片逐項重新校正對齊參考圖](https://github.com/smallwei0301/tour-platform/pull/1643) | 2026-07-07 |
| #1640 | [feat(security): anon-rls-probe 失敗時推播 Telegram+Email](https://github.com/smallwei0301/tour-platform/pull/1640) | 2026-07-06 |
| #1639 | [security(rls): 自動稽核加固 — preflight 補 users + 行為式 anon-probe（防 #1563 復發）](https://github.com/smallwei0301/tour-platform/pull/1639) | 2026-07-06 |
| #1638 | [feat(harness): execute_sql 改讀寫全自動＋事後審計（owner 二次拍板）](https://github.com/smallwei0301/tour-platform/pull/1638) | 2026-07-06 |
| #1636 | [fix(reviews): 暖場評論併入評分分佈與篩選 (#1592 補強)](https://github.com/smallwei0301/tour-platform/pull/1636) | 2026-07-06 |
| #1635 | [feat: 統一聯絡信箱為 midao2026@gmail.com，並支援管理員直接進入導遊後台](https://github.com/smallwei0301/tour-platform/pull/1635) | 2026-07-06 |
| #1634 | [fix(shop): 商店首頁像素級對齊參考圖（新增 mock 比對頁）](https://github.com/smallwei0301/tour-platform/pull/1634) | 2026-07-06 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
