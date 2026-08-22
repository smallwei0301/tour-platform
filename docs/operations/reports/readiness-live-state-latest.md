<!-- query_timestamp: 2026-08-21T05:10:34.130Z -->
<!-- freshness_rule: auto-refreshed daily (05:00 UTC) via CI; stale threshold: 26h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-08-21T05:10:34.130Z
**Commit SHA:** `28dac019017a1d698c5366f746b477006c441ce5`

---

## Open PRs (11)

| # | Title | Branch |
|---|-------|--------|
| #1776 | [feat(shop): 完成導遊商店匯款 beta 文案與 SOP（#1607）](https://github.com/smallwei0301/tour-platform/pull/1776) _(draft)_ | `fix/issue-1607-guide-shop-beta` |
| #1763 | [feat: midao2 導遊接案後台（接案 CRM）＋公開接案頁 /g/[slug]](https://github.com/smallwei0301/tour-platform/pull/1763) | `claude/superpowers-midao-backend-x90czx` |
| #1690 | [docs(security): 建立「已接受安全風險」定案清單](https://github.com/smallwei0301/tour-platform/pull/1690) | `claude/code-workflow-architecture-mmm4ba` |
| #1687 | [修正排程管理的持久稽核機制](https://github.com/smallwei0301/tour-platform/pull/1687) | `kanban/issue-1686-durable-audit` |
| #1651 | [docs(#1649): 訂單／退款／金流 v2 全面串接計劃書＋worklog（docs-only）](https://github.com/smallwei0301/tour-platform/pull/1651) | `claude/issue1649-v2-migration-plan` |
| #1602 | [feat(ui): redesign guide shop booking flow](https://github.com/smallwei0301/tour-platform/pull/1602) | `ui/midao-shop-booking-redesign` |
| #1534 | [feat(guide): 導遊大頭照上傳支援自選裁切範圍與大小](https://github.com/smallwei0301/tour-platform/pull/1534) | `claude/guide-profile-photo-crop-2vbzrr` |
| #1469 | [導遊後台：新增 Dashboard 首頁與指標卡（免費/付費分級）](https://github.com/smallwei0301/tour-platform/pull/1469) | `codex/-dashboard` |
| #1438 | [Use next/font variables in globals, set CJK fonts to `display: optional`, and scope serif usage to LP/brand](https://github.com/smallwei0301/tour-platform/pull/1438) | `codex/improve-homepage-loading-speed` |
| #1415 | [feat(home): hero 改版為 boomerang 影片背景的 motion hero](https://github.com/smallwei0301/tour-platform/pull/1415) | `claude/hero-section-redesign-4v9z2a` |
| #1372 | [fix(settlement): 補正 payout_items.order_id UNIQUE 約束，修復 sweep upsert ON CONFLICT 500 (#1365)](https://github.com/smallwei0301/tour-platform/pull/1372) | `claude/post-merge-qa-verification-kgspK` |

## Open Issues (69 total)

### P0 (1)

| # | Title | Labels |
|---|-------|--------|
| #1777 | [[Payments][P0] 修正結算／部分退款／出款非原子鏈，避免漏帳、重扣與錯誤撥款](https://github.com/smallwei0301/tour-platform/issues/1777) | triaged, type:bug, priority:P0, agent:backlog, owner:ai-agent, status:ready, payments, orders, database |

### P1 (39)

| # | Title | Labels |
|---|-------|--------|
| #1863 | [[Midao Program] Execute #1763 release, canonical calendar, reliability convergence, then legacy retirement](https://github.com/smallwei0301/tour-platform/issues/1863) | triaged, type:feature, priority:P1, qa, guide-dashboard, agent:backlog, owner:mixed, status:blocked, traveler-booking, database, infra |
| #1861 | [[Midao Convergence] Absorb inquiry-to-booking reliability into #1763 without duplicate truth](https://github.com/smallwei0301/tour-platform/issues/1861) | triaged, type:feature, priority:P1, qa, guide-dashboard, agent:backlog, owner:ai-agent, status:blocked, traveler-booking, database, notifications |
| #1860 | [[Midao Release] Integrate PR #1763 onto latest main and deploy with minimal conflicts](https://github.com/smallwei0301/tour-platform/issues/1860) | triaged, type:feature, priority:P1, qa, guide-dashboard, agent:backlog, owner:mixed, status:blocked, database, infra |
| #1859 | [[Midao2 Services] Port multi-plan fidelity and prevent silent plan deactivation](https://github.com/smallwei0301/tour-platform/issues/1859) | triaged, type:bug, priority:P1, guide-dashboard, agent:backlog, owner:ai-agent, status:blocked, regression-risk |
| #1848 | [[Guide Dashboard] Fix Andy Lee 公開商店首頁缺少可預約服務卡片](https://github.com/smallwei0301/tour-platform/issues/1848) | triaged, type:bug, priority:P1, qa, guide-dashboard, agent:queued, owner:ai-agent, status:ready |
| #1847 | [[QA] Daily test checklist for recent merged PRs 2026-08-18](https://github.com/smallwei0301/tour-platform/issues/1847) | triaged, priority:P1, cron-followup, qa, guide-dashboard, agent:queued, owner:ai-agent, status:ready, type:qa, traveler-booking, payments, orders, auth, database, docs, admin, post-merge |
| #1845 | [[QA] Daily test checklist for recent merged PRs 2026-08-17](https://github.com/smallwei0301/tour-platform/issues/1845) | triaged, priority:P1, cron-followup, qa, agent:queued, owner:ai-agent, status:ready, type:qa, traveler-booking, payments, orders, auth, database, admin, post-merge |
| #1841 | [[#1825] 在較大資源環境執行 exact PostgreSQL replay（4/4）交棒](https://github.com/smallwei0301/tour-platform/issues/1841) | type:investigation, priority:P1, owner:ai-agent, status:ready, database |
| #1827 | [[Midao Backend] 收斂為新 UI、既有核心系統：功能遷移與 PR #1763 UI 吸收路線圖](https://github.com/smallwei0301/tour-platform/issues/1827) | triaged, type:investigation, priority:P1, guide-dashboard, agent:backlog, owner:ai-agent, status:blocked, database |
| #1773 | [[QA] Daily test checklist for recent merged PRs 2026-07-29](https://github.com/smallwei0301/tour-platform/issues/1773) | triaged, priority:P1, cron-followup, qa, agent:queued, owner:ai-agent, status:ready, type:qa, docs, post-merge |
| #1770 | [[QA] Daily test checklist for recent merged PRs 2026-07-28](https://github.com/smallwei0301/tour-platform/issues/1770) | triaged, priority:P1, cron-followup, qa, agent:queued, owner:ai-agent, status:ready, type:qa, traveler-booking, admin, post-merge |
| #1762 | [[QA] Daily test checklist for recent merged PRs 2026-07-23](https://github.com/smallwei0301/tour-platform/issues/1762) | priority:P1, cron-followup, qa, agent:queued, owner:ai-agent, status:ready, type:qa, auth, admin, post-merge |
| #1761 | [[Midao Cutover] Retire legacy UI by proven capability coverage](https://github.com/smallwei0301/tour-platform/issues/1761) | triaged, type:feature, priority:P1, qa, guide-dashboard, agent:backlog, owner:ai-agent, status:blocked, traveler-booking, notifications, infra |
| #1760 | [[Midao Calendar] Converge /midao2 on canonical effective availability](https://github.com/smallwei0301/tour-platform/issues/1760) | triaged, type:feature, priority:P1, guide-dashboard, agent:backlog, owner:ai-agent, status:blocked, traveler-booking, database |
| #1755 | [[Midao Backend] Implement approved guide backend redesign](https://github.com/smallwei0301/tour-platform/issues/1755) | triaged, type:feature, priority:P1, guide-dashboard, agent:backlog, owner:ai-agent, status:in-progress |
| #1749 | [[daily bug scan] tour-platform 2026-07-21](https://github.com/smallwei0301/tour-platform/issues/1749) | triaged, type:bug, priority:P1, priority:P2, cron-followup, qa, owner:ai-agent, status:ready, status:needs-repro, traveler-booking |
| #1745 | [[QA] Daily test checklist for recent merged PRs 2026-07-18](https://github.com/smallwei0301/tour-platform/issues/1745) | priority:P1, cron-followup, qa, agent:queued, owner:ai-agent, status:ready, type:qa, auth, notifications, admin, post-merge |
| #1729 | [[QA] Daily test checklist for recent merged PRs 2026-07-17](https://github.com/smallwei0301/tour-platform/issues/1729) | priority:P1, cron-followup, qa, agent:queued, owner:ai-agent, status:ready, type:qa, seo, post-merge |
| #1715 | [[QA] Daily test checklist for recent merged PRs 2026-07-15](https://github.com/smallwei0301/tour-platform/issues/1715) | triaged, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, type:qa, traveler-booking, post-merge |
| #1710 | [[QA] Daily test checklist for recent merged PRs 2026-07-14](https://github.com/smallwei0301/tour-platform/issues/1710) | triaged, priority:P1, cron-followup, qa, guide-dashboard, agent:queued, owner:ai-agent, status:ready, type:qa, auth, infra, admin |
| #1695 | [[QA] Daily test checklist for recent merged PRs 2026-07-11](https://github.com/smallwei0301/tour-platform/issues/1695) | triaged, priority:P1, cron-followup, qa, agent:queued, owner:ai-agent, status:ready, type:qa, payments, auth, infra, admin |
| #1686 | [[Admin][GitHub Actions] 修復正式環境缺少 admin token 導致排程開關不可用](https://github.com/smallwei0301/tour-platform/issues/1686) | triaged, type:bug, priority:P1, security, agent:queued, owner:mixed, status:ready, auth, notifications, infra, admin |
| #1685 | [[QA] Daily test checklist for recent merged PRs 2026-07-10](https://github.com/smallwei0301/tour-platform/issues/1685) | triaged, priority:P1, cron-followup, qa, agent:queued, owner:ai-agent, status:ready, type:qa, auth, notifications, infra, admin |
| #1682 | [[QA] Verify post-#1676/#1677/#1679 admin trend and RLS preflight evidence](https://github.com/smallwei0301/tour-platform/issues/1682) | triaged, priority:P1, cron-followup, qa, security, agent:queued, owner:ai-agent, status:ready, type:qa, database, rls, infra, admin |
| #1673 | [[QA] Daily test checklist for recent merged PRs 2026-07-09](https://github.com/smallwei0301/tour-platform/issues/1673) | triaged, priority:P1, cron-followup, qa, agent:queued, owner:ai-agent, status:ready, type:qa, traveler-booking, auth |
| #1661 | [[QA] Daily test checklist for recent merged PRs 2026-07-08](https://github.com/smallwei0301/tour-platform/issues/1661) | triaged, priority:P1, cron-followup, qa, agent:queued, owner:ai-agent, status:ready, type:qa, auth, rls, infra, post-merge |
| #1657 | [[QA] Verify post-#1656 v2 order/refund/payment full-wiring regression](https://github.com/smallwei0301/tour-platform/issues/1657) | triaged, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, type:qa, traveler-booking, payments, orders, booking-v2, refund |
| #1653 | [[QA] Verify post-#1650 v2 Admin POS auth/CSRF contract before further UI接線](https://github.com/smallwei0301/tour-platform/issues/1653) | triaged, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, type:qa, payments, orders, auth, booking-v2 |
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

### P2 (16)

| # | Title | Labels |
|---|-------|--------|
| #1844 | [補記 6 支既有 migration 的 verified ledger record（#1811/#1812/#1813/#1814/#1760 相關，release gate 現 HOLD）](https://github.com/smallwei0301/tour-platform/issues/1844) | type:investigation, priority:P2, owner:ai-agent, status:ready, database |
| #1817 | [[Payments] Deepen refund provider-success result materialization and repair seam](https://github.com/smallwei0301/tour-platform/issues/1817) | triaged, type:optimization, priority:P2, agent:backlog, owner:ai-agent, status:blocked, payments, orders, database |
| #1816 | [[Midao] Harden shared confirmation runtime behind a private adapter seam](https://github.com/smallwei0301/tour-platform/issues/1816) | triaged, type:optimization, priority:P2, agent:backlog, owner:ai-agent, status:blocked, traveler-booking, database |
| #1765 | [[QA] Daily test checklist for recent merged PRs 2026-07-27 (no recent merged PRs)](https://github.com/smallwei0301/tour-platform/issues/1765) | triaged, priority:P2, cron-followup, qa, agent:queued, owner:ai-agent, status:ready, type:qa, traveler-booking, payments, auth, infra, admin |
| #1764 | [[QA] Daily test checklist for recent merged PRs 2026-07-26 (no recent merged PRs)](https://github.com/smallwei0301/tour-platform/issues/1764) | triaged, priority:P2, cron-followup, qa, agent:queued, owner:ai-agent, status:ready, type:qa, traveler-booking, payments, auth, infra, admin |
| #1706 | [[QA] Daily test checklist for recent merged PRs 2026-07-13 (no recent merged PRs)](https://github.com/smallwei0301/tour-platform/issues/1706) | triaged, priority:P2, cron-followup, qa, agent:queued, owner:ai-agent, status:ready, type:qa, traveler-booking, payments, auth, infra, admin |
| #1670 | [[Frontend Daily Check] 2026-07-09 health check failures](https://github.com/smallwei0301/tour-platform/issues/1670) | triaged, type:bug, priority:P2, qa, owner:ai-agent, status:ready, traveler-booking |
| #1660 | [[Ops] Reconcile stale open PR queue after #1656/#1646 main drift](https://github.com/smallwei0301/tour-platform/issues/1660) | triaged, type:investigation, priority:P2, qa, agent:backlog, owner:mixed, status:needs-decision |
| #1658 | [[Ops] Refresh current issue priority routing after #1656/#1654 drift and #1121 label change](https://github.com/smallwei0301/tour-platform/issues/1658) | triaged, priority:P2, cron-followup, agent:backlog, owner:ai-agent, status:ready, type:docs, infra, docs |
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

### Other (12)

| # | Title | Labels |
|---|-------|--------|
| #1857 | [#1825 回滾 precondition 指紋已對今天的 Production 失效（#1855 修復後）](https://github.com/smallwei0301/tour-platform/issues/1857) | — |
| #1851 | [[Midao] 「我的服務」需區分「已發布到 Midao 前台」與「僅商店頁展示」兩種狀態](https://github.com/smallwei0301/tour-platform/issues/1851) | — |
| #1819 | [[Docs] 建立正式測試分層規範（unit / integration real-HTTP / mock E2E / real-data E2E + CI enforcement）](https://github.com/smallwei0301/tour-platform/issues/1819) | — |
| #1796 | [fn_expire_unpaid_order_atomic 有 42702 ambiguous column 缺陷（OUT 參數 booking_id 遮蔽表欄位）](https://github.com/smallwei0301/tour-platform/issues/1796) | bug |
| #1795 | [旅客自助下單（POST /api/v2/bookings/draft）非原子交易，存在超賣競態風險](https://github.com/smallwei0301/tour-platform/issues/1795) | bug |
| #1662 | [[Cleanup][P3] legacy 訂單/金流 endpoint 退役清單 — 系統穩定後執行（#1649 follow-up）](https://github.com/smallwei0301/tour-platform/issues/1662) | owner:mixed, status:blocked, priority:P3, payments, booking-v2, type:chore |
| #1609 | [導遊開店第 4–6 週：導遊訂閱方案（plan tier）SaaS 化 — placeholder，待 owner 拍板定價](https://github.com/smallwei0301/tour-platform/issues/1609) | — |
| #1608 | [導遊開店第 2–3 週：導遊後台「開店進度」新頁＋「本月商店表現」](https://github.com/smallwei0301/tour-platform/issues/1608) | — |
| #1607 | [導遊開店第 2–3 週：商店 FAQ／政策區塊擴充＋匯款付款 beta（文案＋SOP＋flag）](https://github.com/smallwei0301/tour-platform/issues/1607) | — |
| #1604 | [[SEO] 不存在的頁面回 HTTP 200 而非 404（not-found 狀態碼）— #1585 調查附帶發現](https://github.com/smallwei0301/tour-platform/issues/1604) | type:investigation, agent:backlog, seo |
| #1474 | [QA：PR #1473 部分退款功能 — Staging 實測（ECPay 測試卡）](https://github.com/smallwei0301/tour-platform/issues/1474) | qa, refund |
| #1121 | [[Security] Rotate all credentials exposed in git history (service_role JWT × 7, sbp_ PAT × 5, admin token × 10, anon JWT × 4) — 正式上線前執行](https://github.com/smallwei0301/tour-platform/issues/1121) | type:bug, security, owner:mixed, status:needs-decision, launch:post-first-payment |

---

## Recent Merged PRs (last 10)

| # | Title | Merged |
|---|-------|--------|
| #1858 | [docs(ops): #1855 migration SOP 第 1 步補 Free-plan（無 PITR）替代 backup 分支](https://github.com/smallwei0301/tour-platform/pull/1858) | 2026-08-19 |
| #1856 | [fix(db): #1855 修復 midao 原子函式誤用 pg_catalog.nullif（production 已套用 + ledger）](https://github.com/smallwei0301/tour-platform/pull/1856) | 2026-08-19 |
| #1854 | [chore(ops): #1825 補 migration-ledger production record 並更新 gate 測試期望值](https://github.com/smallwei0301/tour-platform/pull/1854) | 2026-08-19 |
| #1852 | [fix(midao): #1825 native draft lazy ensure + unified lifecycle state](https://github.com/smallwei0301/tour-platform/pull/1852) | 2026-08-19 |
| #1850 | [fix(midao): #1825 native published fallback in guide service list](https://github.com/smallwei0301/tour-platform/pull/1850) | 2026-08-18 |
| #1849 | [fix(admin): #1825 accept structural UUIDs in plan routes](https://github.com/smallwei0301/tour-platform/pull/1849) | 2026-08-18 |
| #1846 | [feat(midao): #1825 啟用 legacy draft materialization（master flag + guide allowlist）](https://github.com/smallwei0301/tour-platform/pull/1846) | 2026-08-17 |
| #1843 | [docs(ledger): record #1825 legacy Midao draft materialization verified apply](https://github.com/smallwei0301/tour-platform/pull/1843) | 2026-08-17 |
| #1840 | [feat(availability): wire traveler dynamic canonical selector](https://github.com/smallwei0301/tour-platform/pull/1840) | 2026-08-16 |
| #1839 | [[#1825] rollback 伴隨檔 exact-source static guard checkpoint](https://github.com/smallwei0301/tour-platform/pull/1839) | 2026-08-15 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
