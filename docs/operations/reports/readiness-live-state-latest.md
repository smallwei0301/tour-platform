<!-- query_timestamp: 2026-08-01T05:59:52.808Z -->
<!-- freshness_rule: auto-refreshed daily (05:00 UTC) via CI; stale threshold: 26h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-08-01T05:59:52.808Z  
**Commit SHA:** `ba1066d57fea1f7a81bf0a21dd743c53f1776c2d`

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

## Open Issues (54 total)

### P0 (1)

| # | Title | Labels |
|---|-------|--------|
| #1777 | [[Payments][P0] 修正結算／部分退款／出款非原子鏈，避免漏帳、重扣與錯誤撥款](https://github.com/smallwei0301/tour-platform/issues/1777) | triaged, type:bug, priority:P0, agent:backlog, owner:ai-agent, status:ready, payments, orders, database |

### P1 (32)

| # | Title | Labels |
|---|-------|--------|
| #1773 | [[QA] Daily test checklist for recent merged PRs 2026-07-29](https://github.com/smallwei0301/tour-platform/issues/1773) | triaged, priority:P1, cron-followup, qa, agent:queued, owner:ai-agent, status:ready, type:qa, docs, post-merge |
| #1770 | [[QA] Daily test checklist for recent merged PRs 2026-07-28](https://github.com/smallwei0301/tour-platform/issues/1770) | triaged, priority:P1, cron-followup, qa, agent:queued, owner:ai-agent, status:ready, type:qa, traveler-booking, admin, post-merge |
| #1762 | [[QA] Daily test checklist for recent merged PRs 2026-07-23](https://github.com/smallwei0301/tour-platform/issues/1762) | priority:P1, cron-followup, qa, agent:queued, owner:ai-agent, status:ready, type:qa, auth, admin, post-merge |
| #1761 | [[Midao Backend] Unify public guide page, cut over safely, and verify](https://github.com/smallwei0301/tour-platform/issues/1761) | triaged, type:feature, priority:P1, qa, guide-dashboard, agent:queued, owner:ai-agent, status:blocked, traveler-booking, notifications, infra |
| #1760 | [[Midao Backend] Implement global calendar and effective availability policy](https://github.com/smallwei0301/tour-platform/issues/1760) | triaged, type:feature, priority:P1, guide-dashboard, agent:queued, owner:ai-agent, status:blocked, traveler-booking, database |
| #1759 | [[Midao Backend] Implement LINE inquiries and traveler booking confirmation](https://github.com/smallwei0301/tour-platform/issues/1759) | triaged, type:feature, priority:P1, agent:queued, owner:ai-agent, status:blocked, traveler-booking, orders, database, rls, notifications |
| #1758 | [[Midao Backend] Implement service drafts, questionnaires, and direct publishing](https://github.com/smallwei0301/tour-platform/issues/1758) | triaged, type:feature, priority:P1, guide-dashboard, agent:queued, owner:ai-agent, status:blocked, database, rls |
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

### P2 (13)

| # | Title | Labels |
|---|-------|--------|
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

### Other (7)

| # | Title | Labels |
|---|-------|--------|
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
| #1786 | [[Database] 收斂 Midao migration verified ledger 與回滾證據](https://github.com/smallwei0301/tour-platform/pull/1786) | 2026-07-30 |
| #1785 | [fix(domain): 自訂網域切換前的網址盤點 — BRAND_BOOK 改 midao.com.tw、修死連結 fallback](https://github.com/smallwei0301/tour-platform/pull/1785) | 2026-07-30 |
| #1784 | [fix(seo): JSON-LD 絕對網址改走 SITE_URL，並修正 LINE 查詢的錯誤網域 fallback](https://github.com/smallwei0301/tour-platform/pull/1784) | 2026-07-30 |
| #1783 | [fix(admin): 申請詳情欄位表手機版遮擋，並把 EMAIL_FROM 納入通知 env 診斷](https://github.com/smallwei0301/tour-platform/pull/1783) | 2026-07-30 |
| #1782 | [feat(guide-application): 申請通知管理者（email＋Telegram）、後台顯示完整填寫與未填寫欄位、移除招募頁分潤文案](https://github.com/smallwei0301/tour-platform/pull/1782) | 2026-07-30 |
| #1781 | [feat(guide-apply): 申請流程單頁化、照片全選填、文案改用招募海報、用語統一「嚮導」](https://github.com/smallwei0301/tour-platform/pull/1781) | 2026-07-30 |
| #1780 | [docs(worklog): #1777 收尾 — PR merged、AC 11/11 sign-off、剩餘兩項](https://github.com/smallwei0301/tour-platform/pull/1780) | 2026-07-29 |
| #1779 | [feat(accounting): #1777 收尾 — 對帳補資格稽核維度，#1647 preview 實測](https://github.com/smallwei0301/tour-platform/pull/1779) | 2026-07-29 |
| #1778 | [fix(payments): #1777 修正結算／部分退款／出款非原子鏈（Phase 1–4）](https://github.com/smallwei0301/tour-platform/pull/1778) | 2026-07-29 |
| #1775 | [fix(ops): 對齊 readiness snapshot 刷新節奏與 freshness guard（#1654）](https://github.com/smallwei0301/tour-platform/pull/1775) | 2026-07-29 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
