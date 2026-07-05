<!-- query_timestamp: 2026-07-05T00:45:47.365Z -->
<!-- freshness_rule: auto-refreshed every 6h via CI; stale threshold: 12h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-07-05T00:45:47.365Z  
**Commit SHA:** `1e290153eb91c30e9ef7b065c0129bf1012bc1f5`

---

## Open PRs (8)

| # | Title | Branch |
|---|-------|--------|
| #1624 | [健檢 v2 剩餘 backlog：#1596 #1590 #1592 #1591 #1593 #1594（6 issue 後端全交付，需 owner 套 5 支 migration）](https://github.com/smallwei0301/tour-platform/pull/1624) | `claude/repo-audit-optimization-m4s8os` |
| #1610 | [feat(guide-shop): 導遊開店第 1 週改版 — /for-guides landing、商店首頁方案卡、預約延後登入](https://github.com/smallwei0301/tour-platform/pull/1610) | `claude/plan-evaluation-shop-page-09krqv` |
| #1602 | [feat(ui): redesign guide shop booking flow](https://github.com/smallwei0301/tour-platform/pull/1602) | `ui/midao-shop-booking-redesign` |
| #1534 | [feat(guide): 導遊大頭照上傳支援自選裁切範圍與大小](https://github.com/smallwei0301/tour-platform/pull/1534) | `claude/guide-profile-photo-crop-2vbzrr` |
| #1469 | [導遊後台：新增 Dashboard 首頁與指標卡（免費/付費分級）](https://github.com/smallwei0301/tour-platform/pull/1469) | `codex/-dashboard` |
| #1438 | [Use next/font variables in globals, set CJK fonts to `display: optional`, and scope serif usage to LP/brand](https://github.com/smallwei0301/tour-platform/pull/1438) | `codex/improve-homepage-loading-speed` |
| #1415 | [feat(home): hero 改版為 boomerang 影片背景的 motion hero](https://github.com/smallwei0301/tour-platform/pull/1415) | `claude/hero-section-redesign-4v9z2a` |
| #1372 | [fix(settlement): 補正 payout_items.order_id UNIQUE 約束，修復 sweep upsert ON CONFLICT 500 (#1365)](https://github.com/smallwei0301/tour-platform/pull/1372) | `claude/post-merge-qa-verification-kgspK` |

## Open Issues (31 total)

### P0 (0)

_none_

### P1 (7)

| # | Title | Labels |
|---|-------|--------|
| #1590 | [[Payment][P1] ECPay 付款方式擴充第一波 — ATM 轉帳＋超商代碼（健檢 v2 P0-3）](https://github.com/smallwei0301/tour-platform/issues/1590) | type:optimization, priority:P1, agent:backlog, owner:ai-agent, traveler-booking |
| #1317 | [[Production Smoke] Owner-only acceptance verification gaps from recent close-gate sweep (#1306 / #1289 / #1290 OFF / #1286 UI / #1307 TZ)](https://github.com/smallwei0301/tour-platform/issues/1317) | priority:P1, type:qa, owner:human, production-smoke, post-merge |
| #714 | [[Ops] Run real alert drill before first payment](https://github.com/smallwei0301/tour-platform/issues/714) | triaged, type:investigation, priority:P1, agent:backlog, owner:mixed, status:blocked, infra, status:awaiting-implementation, launch:first-payment-blocker |
| #642 | [[需 Operator][Traveler Booking] Monitor V2 observation window and guard legacy fallback after launch](https://github.com/smallwei0301/tour-platform/issues/642) | type:investigation, priority:P1, qa, agent:backlog, owner:mixed, status:ready, traveler-booking, launch:post-first-payment |
| #605 | [[Launch Content] Strict Andy Lee listing content gate before public exposure](https://github.com/smallwei0301/tour-platform/issues/605) | triaged, type:investigation, priority:P1, qa, agent:backlog, owner:mixed, type:docs, docs, status:awaiting-implementation, launch:first-payment-blocker |
| #319 | [[Ops] Run customer support SOP first-case drill follow-through](https://github.com/smallwei0301/tour-platform/issues/319) | triaged, priority:P1, qa, agent:backlog, owner:mixed, status:ready, type:qa |
| #318 | [[Ops] Run Andy Lee first-guide onboarding demo and retrospective scope](https://github.com/smallwei0301/tour-platform/issues/318) | triaged, type:investigation, priority:P1, agent:backlog, owner:mixed, status:ready, admin-guides |

### P2 (16)

| # | Title | Labels |
|---|-------|--------|
| #1616 | [[TechDebt][P2] process.env 讀取集中回 src/config — SERVICE_ROLE_KEY 先行、ratchet 驅動收斂（架構健檢 2026-07 路線圖 P4）](https://github.com/smallwei0301/tour-platform/issues/1616) | type:optimization, priority:P2, security, agent:backlog, owner:ai-agent |
| #1615 | [[TechDebt][P2] 拆解 4 個 1,200 行級 god-page — admin/guide availability 先抽共用元件（架構健檢 2026-07 路線圖 P3）](https://github.com/smallwei0301/tour-platform/issues/1615) | type:optimization, priority:P2, agent:backlog, owner:ai-agent |
| #1614 | [[TechDebt][P2] 共用 API 回應 helper（jsonOk/jsonError 回傳 NextResponse）— 新 v2 route 一律採用（架構健檢 2026-07 路線圖 P2）](https://github.com/smallwei0301/tour-platform/issues/1614) | type:optimization, priority:P2, agent:backlog, owner:ai-agent |
| #1613 | [[TechDebt][P2] db.mjs strangler 續拆 — 先解 db-* 循環 import，再逐領域整塊搬遷（架構健檢 2026-07 路線圖 P1）](https://github.com/smallwei0301/tour-platform/issues/1613) | type:optimization, priority:P2, agent:backlog, owner:ai-agent |
| #1596 | [[Support][P2] 行前即時聯絡 — 出發前 24h 訂單頁顯示導遊聯絡方式（健檢 v2 P2-11 第一步）](https://github.com/smallwei0301/tour-platform/issues/1596) | type:optimization, priority:P2, agent:backlog, owner:ai-agent, traveler-booking |
| #1594 | [[Growth][P2] 點數／會員等級最小可行設計（健檢 v2 P2-9，接 #1388）](https://github.com/smallwei0301/tour-platform/issues/1594) | type:optimization, priority:P2, agent:backlog, owner:mixed, status:needs-decision |
| #1593 | [[Growth][P2] 站內通知中心（鈴鐺）第一版（健檢 v2 P1-8，接 #1388）](https://github.com/smallwei0301/tour-platform/issues/1593) | type:optimization, priority:P2, agent:backlog, owner:ai-agent, traveler-booking |
| #1592 | [[Reviews][P2] 評論互動強化 — 評分分佈長條＋附照片篩選＋導遊公開回覆（健檢 v2 P1-7）](https://github.com/smallwei0301/tour-platform/issues/1592) | type:optimization, priority:P2, agent:backlog, owner:ai-agent, traveler-booking |
| #1591 | [[Product][P2] 加購（add-on）資料模型＋結帳整合（健檢 v2 P1-5）](https://github.com/smallwei0301/tour-platform/issues/1591) | type:optimization, priority:P2, agent:backlog, owner:ai-agent, traveler-booking |
| #1388 | [[Growth][P2] 成長基礎 backlog 總綱 — i18n 英文版、站內訊息、會員回購（Phase 12 對齊）](https://github.com/smallwei0301/tour-platform/issues/1388) | type:optimization, priority:P2, agent:backlog, owner:mixed, traveler-booking |
| #1344 | [[Perf][P2] Mobile LCP regression on /activities — 10–12s vs 2s desktop](https://github.com/smallwei0301/tour-platform/issues/1344) | type:bug, priority:P2, owner:ai-agent, traveler-booking, performance |
| #926 | [[Ops] Add LINE/LIFF Messaging API rollout evidence gate after #920](https://github.com/smallwei0301/tour-platform/issues/926) | triaged, priority:P2, qa, agent:backlog, owner:mixed, status:blocked, type:qa, auth, notifications, infra |
| #797 | [[Compliance] Internal conservative incident reporting playbook for soft launch](https://github.com/smallwei0301/tour-platform/issues/797) | triaged, priority:P2, security, owner:ai-agent, infra, docs, status:awaiting-implementation |
| #724 | [[Ops] Execute Supabase live restore drill within 7 days after soft launch](https://github.com/smallwei0301/tour-platform/issues/724) | triaged, type:investigation, priority:P2, agent:backlog, owner:mixed, database, infra, status:awaiting-implementation, launch:post-first-payment |
| #685 | [[Monitoring] Add simple outside website monitor after soft launch](https://github.com/smallwei0301/tour-platform/issues/685) | triaged, type:optimization, priority:P2, qa, agent:backlog, owner:ai-agent, infra, status:awaiting-implementation, launch:post-first-payment |
| #320 | [[Launch] Public soft launch with restricted booking and Go/No-Go gate](https://github.com/smallwei0301/tour-platform/issues/320) | triaged, priority:P2, agent:queued, infra, status:awaiting-implementation, launch:first-payment-blocker |

### Human-Decision (0)

_none_

### Other (8)

| # | Title | Labels |
|---|-------|--------|
| #1617 | [[Decision] 倉庫結構清理 — packages/ 空殼宣告、根目錄歷史報告檔、巢狀 tour-platform/ 目錄（架構健檢 2026-07 路線圖 P5）](https://github.com/smallwei0301/tour-platform/issues/1617) | agent:backlog, owner:mixed, status:needs-decision, docs |
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
| #1623 | [docs(security): CSP unsafe-inline 移除評估與決策（暫不移除，記錄不可行證據）(#1601)](https://github.com/smallwei0301/tour-platform/pull/1623) | 2026-07-04 |
| #1622 | [feat(security): 登入限流疊加分散式（Upstash Redis）跨實例層 (#1599)](https://github.com/smallwei0301/tour-platform/pull/1622) | 2026-07-04 |
| #1621 | [refactor(types): .mjs 核心檔 @ts-check 第一批納管 (#1597)](https://github.com/smallwei0301/tour-platform/pull/1621) | 2026-07-04 |
| #1620 | [feat(validation): 導入 zod＋parseBody helper，redeem 首發（v2 金流輸入面）(#1600)](https://github.com/smallwei0301/tour-platform/pull/1620) | 2026-07-04 |
| #1619 | [feat(observability): v2 routes 統一事故上報，消滅靜默失敗 (#1598)](https://github.com/smallwei0301/tour-platform/pull/1619) | 2026-07-04 |
| #1618 | [feat(i18n): 未開站 locale（ja/ko）noindex guard＋新語系上線 checklist (#1595)](https://github.com/smallwei0301/tour-platform/pull/1618) | 2026-07-04 |
| #1612 | [docs(worklog): 補記 issue1605 PR #1611 merge commit 資訊](https://github.com/smallwei0301/tour-platform/pull/1612) | 2026-07-04 |
| #1611 | [perf(guide): 導遊後台儀表板 API 查詢平行化 — 25 個序列 DB round-trip 降為 3 階段](https://github.com/smallwei0301/tour-platform/pull/1611) | 2026-07-04 |
| #1606 | [feat(booking)!: legacy 全面退役 — 刪 legacy routes/pages、flags 退場、301 redirects (#1407)](https://github.com/smallwei0301/tour-platform/pull/1606) | 2026-07-03 |
| #1589 | [fix(admin): 修正編輯導遊帳號 SERVER_ERROR、移除擋 UI 的「?」FAB、新增後台刪除導遊](https://github.com/smallwei0301/tour-platform/pull/1589) | 2026-07-03 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
