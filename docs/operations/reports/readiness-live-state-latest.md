<!-- query_timestamp: 2026-07-02T12:43:32.763Z -->
<!-- freshness_rule: auto-refreshed every 6h via CI; stale threshold: 12h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-07-02T12:43:32.763Z  
**Commit SHA:** `1e83ef488e6e550f981860caf41937a36a8fb7b0`

---

## Open PRs (5)

| # | Title | Branch |
|---|-------|--------|
| #1534 | [feat(guide): 導遊大頭照上傳支援自選裁切範圍與大小](https://github.com/smallwei0301/tour-platform/pull/1534) | `claude/guide-profile-photo-crop-2vbzrr` |
| #1469 | [導遊後台：新增 Dashboard 首頁與指標卡（免費/付費分級）](https://github.com/smallwei0301/tour-platform/pull/1469) | `codex/-dashboard` |
| #1438 | [Use next/font variables in globals, set CJK fonts to `display: optional`, and scope serif usage to LP/brand](https://github.com/smallwei0301/tour-platform/pull/1438) | `codex/improve-homepage-loading-speed` |
| #1415 | [feat(home): hero 改版為 boomerang 影片背景的 motion hero](https://github.com/smallwei0301/tour-platform/pull/1415) | `claude/hero-section-redesign-4v9z2a` |
| #1372 | [fix(settlement): 補正 payout_items.order_id UNIQUE 約束，修復 sweep upsert ON CONFLICT 500 (#1365)](https://github.com/smallwei0301/tour-platform/pull/1372) | `claude/post-merge-qa-verification-kgspK` |

## Open Issues (19 total)

### P0 (0)

_none_

### P1 (6)

| # | Title | Labels |
|---|-------|--------|
| #1317 | [[Production Smoke] Owner-only acceptance verification gaps from recent close-gate sweep (#1306 / #1289 / #1290 OFF / #1286 UI / #1307 TZ)](https://github.com/smallwei0301/tour-platform/issues/1317) | priority:P1, type:qa, owner:human, production-smoke, post-merge |
| #714 | [[Ops] Run real alert drill before first payment](https://github.com/smallwei0301/tour-platform/issues/714) | triaged, type:investigation, priority:P1, agent:backlog, owner:mixed, status:blocked, infra, status:awaiting-implementation, launch:first-payment-blocker |
| #642 | [[需 Operator][Traveler Booking] Monitor V2 observation window and guard legacy fallback after launch](https://github.com/smallwei0301/tour-platform/issues/642) | type:investigation, priority:P1, qa, agent:backlog, owner:mixed, status:ready, traveler-booking, launch:post-first-payment |
| #605 | [[Launch Content] Strict Andy Lee listing content gate before public exposure](https://github.com/smallwei0301/tour-platform/issues/605) | triaged, type:investigation, priority:P1, qa, agent:backlog, owner:mixed, type:docs, docs, status:awaiting-implementation, launch:first-payment-blocker |
| #319 | [[Ops] Run customer support SOP first-case drill follow-through](https://github.com/smallwei0301/tour-platform/issues/319) | triaged, priority:P1, qa, agent:backlog, owner:mixed, status:ready, type:qa |
| #318 | [[Ops] Run Andy Lee first-guide onboarding demo and retrospective scope](https://github.com/smallwei0301/tour-platform/issues/318) | triaged, type:investigation, priority:P1, agent:backlog, owner:mixed, status:ready, admin-guides |

### P2 (11)

| # | Title | Labels |
|---|-------|--------|
| #1526 | [[Decision][Auth] 評估加開 LINE Login 作為平台登入方式（與 LINE 通知綁定統一身分）](https://github.com/smallwei0301/tour-platform/issues/1526) | triaged, priority:P2, type:decision, auth, notifications |
| #1407 | [[Booking][P2] Legacy 退役階段三 — 刪除 legacy routes 與測試清點、flag 退場](https://github.com/smallwei0301/tour-platform/issues/1407) | priority:P2, agent:backlog, owner:ai-agent, status:blocked, traveler-booking, booking-v2 |
| #1406 | [[Booking][P2] Legacy 退役階段二 — 移除 flag fallback UI 與 legacy 入口](https://github.com/smallwei0301/tour-platform/issues/1406) | priority:P2, agent:backlog, owner:ai-agent, status:blocked, traveler-booking, booking-v2 |
| #1388 | [[Growth][P2] 成長基礎 backlog 總綱 — i18n 英文版、站內訊息、會員回購（Phase 12 對齊）](https://github.com/smallwei0301/tour-platform/issues/1388) | type:optimization, priority:P2, agent:backlog, owner:mixed, traveler-booking |
| #1344 | [[Perf][P2] Mobile LCP regression on /activities — 10–12s vs 2s desktop](https://github.com/smallwei0301/tour-platform/issues/1344) | type:bug, priority:P2, owner:ai-agent, traveler-booking, performance |
| #1321 | [[#1212 follow-up] AC#2 vs AC#4 tension — Traveler dynamic-interpolation messageZh wiring needs product decision](https://github.com/smallwei0301/tour-platform/issues/1321) | priority:P2, type:decision, booking-v2, owner:human, ux-copy |
| #926 | [[Ops] Add LINE/LIFF Messaging API rollout evidence gate after #920](https://github.com/smallwei0301/tour-platform/issues/926) | triaged, priority:P2, qa, agent:backlog, owner:mixed, status:blocked, type:qa, auth, notifications, infra |
| #797 | [[Compliance] Internal conservative incident reporting playbook for soft launch](https://github.com/smallwei0301/tour-platform/issues/797) | triaged, priority:P2, security, owner:ai-agent, infra, docs, status:awaiting-implementation |
| #724 | [[Ops] Execute Supabase live restore drill within 7 days after soft launch](https://github.com/smallwei0301/tour-platform/issues/724) | triaged, type:investigation, priority:P2, agent:backlog, owner:mixed, database, infra, status:awaiting-implementation, launch:post-first-payment |
| #685 | [[Monitoring] Add simple outside website monitor after soft launch](https://github.com/smallwei0301/tour-platform/issues/685) | triaged, type:optimization, priority:P2, qa, agent:backlog, owner:ai-agent, infra, status:awaiting-implementation, launch:post-first-payment |
| #320 | [[Launch] Public soft launch with restricted booking and Go/No-Go gate](https://github.com/smallwei0301/tour-platform/issues/320) | triaged, priority:P2, agent:queued, infra, status:awaiting-implementation, launch:first-payment-blocker |

### Human-Decision (0)

_none_

### Other (2)

| # | Title | Labels |
|---|-------|--------|
| #1474 | [QA：PR #1473 部分退款功能 — Staging 實測（ECPay 測試卡）](https://github.com/smallwei0301/tour-platform/issues/1474) | qa, refund |
| #1121 | [[Security] Rotate all credentials exposed in git history (service_role JWT × 7, sbp_ PAT × 5, admin token × 10, anon JWT × 4) — 正式上線前執行](https://github.com/smallwei0301/tour-platform/issues/1121) | type:bug, security, owner:mixed, status:needs-decision, launch:post-first-payment |

---

## Recent Merged PRs (last 10)

| # | Title | Merged |
|---|-------|--------|
| #1561 | [feat(ops): migration apply ledger 與 release gate（#1293 選項 B）](https://github.com/smallwei0301/tour-platform/pull/1561) | 2026-07-02 |
| #1559 | [fix(drift): 缺表探測改 GET+limit(0)，修復 HEAD 探測永遠假陰性的盲區](https://github.com/smallwei0301/tour-platform/pull/1559) | 2026-07-02 |
| #1558 | [feat(activities): 列表「評價最高」排序＋無限捲動 (#1557)](https://github.com/smallwei0301/tour-platform/pull/1558) | 2026-07-02 |
| #1556 | [健檢 v2 立即批次：資安 timing-safe／CSRF／scrypt＋SEO hreflang＋依賴對齊＋訂單自動完成 sweep (#1554)](https://github.com/smallwei0301/tour-platform/pull/1556) | 2026-07-02 |
| #1555 | [feat(admin): 排程工作流控制台 — go-no-go 後台顯示結果、開關、排程時間](https://github.com/smallwei0301/tour-platform/pull/1555) | 2026-07-02 |
| #1553 | [ci(cron): 補齊 ecpay-reconcile 與 ecpay-failure-sweep 排程載體（#1336 殘餘缺口）](https://github.com/smallwei0301/tour-platform/pull/1553) | 2026-07-02 |
| #1552 | [feat: 方案卡片依螢幕寬度多欄並排（非手機），修正大螢幕單欄留白](https://github.com/smallwei0301/tour-platform/pull/1552) | 2026-07-02 |
| #1551 | [fix(monitoring)+perf(activities): probe 重試防誤報 (#1472)、SSR 首屏真卡片消除 LCP render delay (#1344)](https://github.com/smallwei0301/tour-platform/pull/1551) | 2026-07-02 |
| #1550 | [feat: 電腦版活動照片改為大圖＋可捲動縮圖列（復原 #1547，含 16:9 比例與 768px 響應式修正）](https://github.com/smallwei0301/tour-platform/pull/1550) | 2026-07-01 |
| #1549 | [fix: revalidatePath 帶各 locale 前綴，admin/guide 改動後前台即時更新（#1488 後續）](https://github.com/smallwei0301/tour-platform/pull/1549) | 2026-07-01 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
