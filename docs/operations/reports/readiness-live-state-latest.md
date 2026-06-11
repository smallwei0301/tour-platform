<!-- query_timestamp: 2026-06-11T07:47:59.677Z -->
<!-- freshness_rule: auto-refreshed every 6h via CI; stale threshold: 12h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-06-11T07:47:59.677Z  
**Commit SHA:** `00ee048ac7a05a8302f4a33e9d3742f1adfc7a32`

---

## Open PRs (2)

| # | Title | Branch |
|---|-------|--------|
| #1372 | [fix(settlement): 補正 payout_items.order_id UNIQUE 約束，修復 sweep upsert ON CONFLICT 500 (#1365)](https://github.com/smallwei0301/tour-platform/pull/1372) | `claude/post-merge-qa-verification-kgspK` |
| #920 | [feat(line): 接上 LINE Login/LIFF 綁定、webhook、Messaging API 旅客推播（全鏈路，flag 預設 OFF）](https://github.com/smallwei0301/tour-platform/pull/920) | `claude/line-integration-plan-a26p7` |

## Open Issues (18 total)

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

### P2 (10)

| # | Title | Labels |
|---|-------|--------|
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

### Other (1)

| # | Title | Labels |
|---|-------|--------|
| #1121 | [[Security] Rotate all credentials exposed in git history (service_role JWT × 7, sbp_ PAT × 5, admin token × 10, anon JWT × 4) — 正式上線前執行](https://github.com/smallwei0301/tour-platform/issues/1121) | type:bug, security, owner:mixed, status:needs-decision, launch:post-first-payment |

---

## Recent Merged PRs (last 10)

| # | Title | Merged |
|---|-------|--------|
| #1371 | [fix(settlement): sweep 移除 PostgREST 不支援的 raw subquery，改 JS 過濾已結算 order_id (#1365)](https://github.com/smallwei0301/tour-platform/pull/1371) | 2026-06-11 |
| #1370 | [feat(admin): 下架（停權）導遊連帶隱藏其導遊頁與所有行程](https://github.com/smallwei0301/tour-platform/pull/1370) | 2026-06-11 |
| #1369 | [feat(ops): settlement pipeline 自動排程 — 每日 sweep → generate-payouts cron（#1365 缺口 1）](https://github.com/smallwei0301/tour-platform/pull/1369) | 2026-06-11 |
| #1368 | [feat(guides): 導遊自主發佈 + on-demand revalidation（取代定時 ISR）](https://github.com/smallwei0301/tour-platform/pull/1368) | 2026-06-11 |
| #1367 | [feat(admin/payouts): 出款管理手動操作 fallback — 餘額清單（含未達門檻）+ 手動產生/取消出款單（#1365 缺口 2）](https://github.com/smallwei0301/tour-platform/pull/1367) | 2026-06-11 |
| #1366 | [fix(guides): 認識導遊頁加 ISR revalidate — 新核可導遊不再要等 deploy 才出現](https://github.com/smallwei0301/tour-platform/pull/1366) | 2026-06-11 |
| #1364 | [feat(guides): 申請即收照片並全鏈帶入 — 表單真上傳→審核可見→上線自動建檔](https://github.com/smallwei0301/tour-platform/pull/1364) | 2026-06-11 |
| #1363 | [fix(admin): 導遊詳情雙實體 resolver + 申請→上線資料完整串接](https://github.com/smallwei0301/tour-platform/pull/1363) | 2026-06-10 |
| #1362 | [perf(activities): enable AVIF + lower quality 75→60 to cut cover image bytes (refs #1344)](https://github.com/smallwei0301/tour-platform/pull/1362) | 2026-06-10 |
| #1361 | [test(e2e): verify admin 出款管理 (/admin/payouts) full flow with mock data (#1360)](https://github.com/smallwei0301/tour-platform/pull/1361) | 2026-06-10 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
