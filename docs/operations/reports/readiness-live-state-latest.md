<!-- query_timestamp: 2026-06-12T18:44:57.657Z -->
<!-- freshness_rule: auto-refreshed every 6h via CI; stale threshold: 12h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-06-12T18:44:57.657Z  
**Commit SHA:** `e6d39427b82f6bfaff11cb35d838f0d943b990a7`

---

## Open PRs (4)

| # | Title | Branch |
|---|-------|--------|
| #1415 | [feat(home): hero 改版為 boomerang 影片背景的 motion hero](https://github.com/smallwei0301/tour-platform/pull/1415) | `claude/hero-section-redesign-4v9z2a` |
| #1414 | [feat(home): 祕島 LP 首頁改版＋全站套用山墨×古紙×黃銅品牌風格](https://github.com/smallwei0301/tour-platform/pull/1414) | `claude/landing-page-nextjs-dsaf0u` |
| #1372 | [fix(settlement): 補正 payout_items.order_id UNIQUE 約束，修復 sweep upsert ON CONFLICT 500 (#1365)](https://github.com/smallwei0301/tour-platform/pull/1372) | `claude/post-merge-qa-verification-kgspK` |
| #920 | [feat(line): 接上 LINE Login/LIFF 綁定、webhook、Messaging API 旅客推播（全鏈路，flag 預設 OFF）](https://github.com/smallwei0301/tour-platform/pull/920) | `claude/line-integration-plan-a26p7` |

## Open Issues (21 total)

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

### P2 (13)

| # | Title | Labels |
|---|-------|--------|
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

### Other (1)

| # | Title | Labels |
|---|-------|--------|
| #1121 | [[Security] Rotate all credentials exposed in git history (service_role JWT × 7, sbp_ PAT × 5, admin token × 10, anon JWT × 4) — 正式上線前執行](https://github.com/smallwei0301/tour-platform/issues/1121) | type:bug, security, owner:mixed, status:needs-decision, launch:post-first-payment |

---

## Recent Merged PRs (last 10)

| # | Title | Merged |
|---|-------|--------|
| #1416 | [feat(reschedule): #1383 自助改期限距活動 >168h（窗內導向客服）＋ #1411 驗收報告（AC4 實寄 PASS）](https://github.com/smallwei0301/tour-platform/pull/1416) | 2026-06-12 |
| #1413 | [docs(qa): issue #1411 站內訊息第一期驗收報告＋AC5 rate-limit 行為補測](https://github.com/smallwei0301/tour-platform/pull/1413) | 2026-06-11 |
| #1412 | [feat(messaging): 站內訊息第一期 — 訂單留言串（traveler ↔ guide）＋ email 通知 (#1411)](https://github.com/smallwei0301/tour-platform/pull/1412) | 2026-06-11 |
| #1410 | [feat(booking): 訂單改期第一期 — 同活動同方案同價、嚮導確認制 (#1383)](https://github.com/smallwei0301/tour-platform/pull/1410) | 2026-06-11 |
| #1409 | [feat(growth): 會員回購起步版 — review invitation 信掛老客專屬碼 (#1408)](https://github.com/smallwei0301/tour-platform/pull/1409) | 2026-06-11 |
| #1405 | [fix(refund): reject 依 paid_at 回正確狀態 (#1401) + legacy 凍結政策生效 (#1386)](https://github.com/smallwei0301/tour-platform/pull/1405) | 2026-06-11 |
| #1404 | [docs(architecture): 訂單改期設計草案 — #1383 第一階段交付物（待 review）](https://github.com/smallwei0301/tour-platform/pull/1404) | 2026-06-11 |
| #1403 | [feat(me): 旅客 profile 編輯與通知偏好（最小版）+ checkout 聯絡資訊預填 (#1387)](https://github.com/smallwei0301/tour-platform/pull/1403) | 2026-06-11 |
| #1402 | [refactor(db): strangler 第一步 — audit-log 單一實作 + refund 狀態機抽純函式 (#1385)](https://github.com/smallwei0301/tour-platform/pull/1402) | 2026-06-11 |
| #1400 | [test(contract): in-memory/Supabase 三流程契約測試 + payment callback 原子性複核 (#1384)](https://github.com/smallwei0301/tour-platform/pull/1400) | 2026-06-11 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
