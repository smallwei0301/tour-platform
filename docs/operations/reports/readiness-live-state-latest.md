<!-- query_timestamp: 2026-06-24T00:49:25.201Z -->
<!-- freshness_rule: auto-refreshed every 6h via CI; stale threshold: 12h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-06-24T00:49:25.201Z  
**Commit SHA:** `3ced0f71fe744c2eb20aa7d990ab5d8185ecff6f`

---

## Open PRs (5)

| # | Title | Branch |
|---|-------|--------|
| #1488 | [feat(i18n): 多語言網站基礎建設 + [locale] 路由 PoC（首頁 + /activities）](https://github.com/smallwei0301/tour-platform/pull/1488) | `claude/multilingual-website-plan-1xb9ny` |
| #1469 | [導遊後台：新增 Dashboard 首頁與指標卡（免費/付費分級）](https://github.com/smallwei0301/tour-platform/pull/1469) | `codex/-dashboard` |
| #1438 | [Use next/font variables in globals, set CJK fonts to `display: optional`, and scope serif usage to LP/brand](https://github.com/smallwei0301/tour-platform/pull/1438) | `codex/improve-homepage-loading-speed` |
| #1415 | [feat(home): hero 改版為 boomerang 影片背景的 motion hero](https://github.com/smallwei0301/tour-platform/pull/1415) | `claude/hero-section-redesign-4v9z2a` |
| #1372 | [fix(settlement): 補正 payout_items.order_id UNIQUE 約束，修復 sweep upsert ON CONFLICT 500 (#1365)](https://github.com/smallwei0301/tour-platform/pull/1372) | `claude/post-merge-qa-verification-kgspK` |

## Open Issues (24 total)

### P0 (0)

_none_

### P1 (7)

| # | Title | Labels |
|---|-------|--------|
| #1317 | [[Production Smoke] Owner-only acceptance verification gaps from recent close-gate sweep (#1306 / #1289 / #1290 OFF / #1286 UI / #1307 TZ)](https://github.com/smallwei0301/tour-platform/issues/1317) | priority:P1, type:qa, owner:human, production-smoke, post-merge |
| #1293 | [[Ops] Add production migration apply ledger and verified release gate after #1286 drift](https://github.com/smallwei0301/tour-platform/issues/1293) | triaged, type:optimization, priority:P1, agent:backlog, owner:mixed, status:needs-decision, database, infra, docs |
| #714 | [[Ops] Run real alert drill before first payment](https://github.com/smallwei0301/tour-platform/issues/714) | triaged, type:investigation, priority:P1, agent:backlog, owner:mixed, status:blocked, infra, status:awaiting-implementation, launch:first-payment-blocker |
| #642 | [[需 Operator][Traveler Booking] Monitor V2 observation window and guard legacy fallback after launch](https://github.com/smallwei0301/tour-platform/issues/642) | type:investigation, priority:P1, qa, agent:backlog, owner:mixed, status:ready, traveler-booking, launch:post-first-payment |
| #605 | [[Launch Content] Strict Andy Lee listing content gate before public exposure](https://github.com/smallwei0301/tour-platform/issues/605) | triaged, type:investigation, priority:P1, qa, agent:backlog, owner:mixed, type:docs, docs, status:awaiting-implementation, launch:first-payment-blocker |
| #319 | [[Ops] Run customer support SOP first-case drill follow-through](https://github.com/smallwei0301/tour-platform/issues/319) | triaged, priority:P1, qa, agent:backlog, owner:mixed, status:ready, type:qa |
| #318 | [[Ops] Run Andy Lee first-guide onboarding demo and retrospective scope](https://github.com/smallwei0301/tour-platform/issues/318) | triaged, type:investigation, priority:P1, agent:backlog, owner:mixed, status:ready, admin-guides |

### P2 (14)

| # | Title | Labels |
|---|-------|--------|
| #1472 | [[Auto Check] main healthcheck failed at / (status=N/A)](https://github.com/smallwei0301/tour-platform/issues/1472) | triaged, type:investigation, priority:P2, qa, owner:ai-agent, status:needs-repro, infra |
| #1407 | [[Booking][P2] Legacy 退役階段三 — 刪除 legacy routes 與測試清點、flag 退場](https://github.com/smallwei0301/tour-platform/issues/1407) | priority:P2, agent:backlog, owner:ai-agent, status:blocked, traveler-booking, booking-v2 |
| #1406 | [[Booking][P2] Legacy 退役階段二 — 移除 flag fallback UI 與 legacy 入口](https://github.com/smallwei0301/tour-platform/issues/1406) | priority:P2, agent:backlog, owner:ai-agent, status:blocked, traveler-booking, booking-v2 |
| #1388 | [[Growth][P2] 成長基礎 backlog 總綱 — i18n 英文版、站內訊息、會員回購（Phase 12 對齊）](https://github.com/smallwei0301/tour-platform/issues/1388) | type:optimization, priority:P2, agent:backlog, owner:mixed, traveler-booking |
| #1365 | [[Ops][需 Operator] 出款 pipeline 無自動排程 — 補 settlement cron + admin 出款管理手動操作 fallback（未達門檻餘額可見、可手動產生/調整出款）](https://github.com/smallwei0301/tour-platform/issues/1365) | priority:P2, agent:backlog, owner:mixed, infra, status:awaiting-implementation |
| #1344 | [[Perf][P2] Mobile LCP regression on /activities — 10–12s vs 2s desktop](https://github.com/smallwei0301/tour-platform/issues/1344) | type:bug, priority:P2, owner:ai-agent, traveler-booking, performance |
| #1336 | [[Ops/Infra] 設定 INTERNAL_ALERT_TOKEN 並啟用 6 個 internal cron sweep endpoints](https://github.com/smallwei0301/tour-platform/issues/1336) | triaged, priority:P2, infra, launch:post-first-payment |
| #1321 | [[#1212 follow-up] AC#2 vs AC#4 tension — Traveler dynamic-interpolation messageZh wiring needs product decision](https://github.com/smallwei0301/tour-platform/issues/1321) | priority:P2, type:decision, booking-v2, owner:human, ux-copy |
| #1280 | [[Decision] Decide fate and slicing plan for stale LINE/LIFF PR #920 before further drift](https://github.com/smallwei0301/tour-platform/issues/1280) | triaged, priority:P2, agent:backlog, owner:mixed, status:needs-decision, type:decision, auth, notifications, infra |
| #926 | [[Ops] Add LINE/LIFF Messaging API rollout evidence gate after #920](https://github.com/smallwei0301/tour-platform/issues/926) | triaged, priority:P2, qa, agent:backlog, owner:mixed, status:blocked, type:qa, auth, notifications, infra |
| #797 | [[Compliance] Internal conservative incident reporting playbook for soft launch](https://github.com/smallwei0301/tour-platform/issues/797) | triaged, priority:P2, security, owner:ai-agent, infra, docs, status:awaiting-implementation |
| #724 | [[Ops] Execute Supabase live restore drill within 7 days after soft launch](https://github.com/smallwei0301/tour-platform/issues/724) | triaged, type:investigation, priority:P2, agent:backlog, owner:mixed, database, infra, status:awaiting-implementation, launch:post-first-payment |
| #685 | [[Monitoring] Add simple outside website monitor after soft launch](https://github.com/smallwei0301/tour-platform/issues/685) | triaged, type:optimization, priority:P2, qa, agent:backlog, owner:ai-agent, infra, status:awaiting-implementation, launch:post-first-payment |
| #320 | [[Launch] Public soft launch with restricted booking and Go/No-Go gate](https://github.com/smallwei0301/tour-platform/issues/320) | triaged, priority:P2, agent:queued, infra, status:awaiting-implementation, launch:first-payment-blocker |

### Human-Decision (0)

_none_

### Other (3)

| # | Title | Labels |
|---|-------|--------|
| #1474 | [QA：PR #1473 部分退款功能 — Staging 實測（ECPay 測試卡）](https://github.com/smallwei0301/tour-platform/issues/1474) | qa, refund |
| #1449 | [[ops] 套用 LINE/Telegram 通知 migration 到 production Supabase（#920 後續）](https://github.com/smallwei0301/tour-platform/issues/1449) | database, ops |
| #1121 | [[Security] Rotate all credentials exposed in git history (service_role JWT × 7, sbp_ PAT × 5, admin token × 10, anon JWT × 4) — 正式上線前執行](https://github.com/smallwei0301/tour-platform/issues/1121) | type:bug, security, owner:mixed, status:needs-decision, launch:post-first-payment |

---

## Recent Merged PRs (last 10)

| # | Title | Merged |
|---|-------|--------|
| #1490 | [fix(guide): 申請表單照片上傳前先壓縮，修正 Vercel 4.5MB 上限導致的上傳失敗](https://github.com/smallwei0301/tour-platform/pull/1490) | 2026-06-23 |
| #1489 | [feat(guide): 熟悉區域全台化、申請資料導入公開頁可自編、收款方式可複選](https://github.com/smallwei0301/tour-platform/pull/1489) | 2026-06-23 |
| #1487 | [fix(settlement): 結算付款 gate + 回沖未付款卻已結算的 payout_items](https://github.com/smallwei0301/tour-platform/pull/1487) | 2026-06-22 |
| #1486 | [feat(seo): 分享縮圖改用站內 og-default 圖](https://github.com/smallwei0301/tour-platform/pull/1486) | 2026-06-22 |
| #1485 | [fix(shop): 會員入口按鈕提升可見度（實心深綠膠囊）(#1475)](https://github.com/smallwei0301/tour-platform/pull/1485) | 2026-06-18 |
| #1484 | [feat(shop): 首頁封面照+會員入口、商店頁隱藏 footer、換步驟回頂部 (#1475)](https://github.com/smallwei0301/tour-platform/pull/1484) | 2026-06-18 |
| #1483 | [perf(shop): 商店 API 60 秒邊緣快取 (#1475)](https://github.com/smallwei0301/tour-platform/pull/1483) | 2026-06-18 |
| #1482 | [perf+ui(shop): 並行查詢降冷啟動 + 月曆日期選擇器 (#1475)](https://github.com/smallwei0301/tour-platform/pull/1482) | 2026-06-18 |
| #1481 | [perf(shop): getGuideShopDb 內嵌關聯單一 round-trip (#1475)](https://github.com/smallwei0301/tour-platform/pull/1481) | 2026-06-18 |
| #1480 | [fix(shop): 修正商店預約頁無可預約時段 + 載入過慢 (#1475)](https://github.com/smallwei0301/tour-platform/pull/1480) | 2026-06-18 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
