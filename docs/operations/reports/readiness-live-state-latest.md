<!-- query_timestamp: 2026-06-10T00:58:19.414Z -->
<!-- freshness_rule: auto-refreshed every 6h via CI; stale threshold: 12h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-06-10T00:58:19.414Z  
**Commit SHA:** `1077ed120fcd4fe6b7a7e1d26adcda314c5463e7`

---

## Open PRs (2)

| # | Title | Branch |
|---|-------|--------|
| #1329 | [fix(guide-rules): 修復時段規則時間 HH:MM:SS round-trip 導致無法編輯](https://github.com/smallwei0301/tour-platform/pull/1329) | `claude/tour-guide-time-slots-b8j744` |
| #920 | [feat(line): 接上 LINE Login/LIFF 綁定、webhook、Messaging API 旅客推播（全鏈路，flag 預設 OFF）](https://github.com/smallwei0301/tour-platform/pull/920) | `claude/line-integration-plan-a26p7` |

## Open Issues (27 total)

### P0 (0)

_none_

### P1 (10)

| # | Title | Labels |
|---|-------|--------|
| #1317 | [[Production Smoke] Owner-only acceptance verification gaps from recent close-gate sweep (#1306 / #1289 / #1290 OFF / #1286 UI / #1307 TZ)](https://github.com/smallwei0301/tour-platform/issues/1317) | priority:P1, type:qa, owner:human, production-smoke, post-merge |
| #1301 | [[GH-1290][CloseGate] Runtime smoke does not re-emit 10:30 after migration apply](https://github.com/smallwei0301/tour-platform/issues/1301) | triaged, type:bug, priority:P1, guide-dashboard, owner:ai-agent, status:ready, traveler-booking, booking-v2, regression |
| #1293 | [[Ops] Add production migration apply ledger and verified release gate after #1286 drift](https://github.com/smallwei0301/tour-platform/issues/1293) | triaged, type:optimization, priority:P1, agent:backlog, owner:mixed, status:needs-decision, database, infra, docs |
| #1283 | [[QA] Verify post-#1282 review invitation sweep manual smoke](https://github.com/smallwei0301/tour-platform/issues/1283) | triaged, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, type:qa, orders, notifications, infra, launch:post-first-payment |
| #1260 | [[QA] Verify late 2026-06-05 merged PRs after #1236 cutoff](https://github.com/smallwei0301/tour-platform/issues/1260) | triaged, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, type:qa, traveler-booking, payments, orders, booking-v2, admin |
| #714 | [[Ops] Run real alert drill before first payment](https://github.com/smallwei0301/tour-platform/issues/714) | triaged, type:investigation, priority:P1, agent:backlog, owner:mixed, status:blocked, infra, status:awaiting-implementation, launch:first-payment-blocker |
| #642 | [[Traveler Booking] Monitor V2 observation window and guard legacy fallback after launch](https://github.com/smallwei0301/tour-platform/issues/642) | type:investigation, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, traveler-booking, launch:post-first-payment |
| #605 | [[Launch Content] Strict Andy Lee listing content gate before public exposure](https://github.com/smallwei0301/tour-platform/issues/605) | triaged, type:investigation, priority:P1, qa, agent:backlog, owner:mixed, type:docs, docs, status:awaiting-implementation, launch:first-payment-blocker |
| #319 | [[Ops] Run customer support SOP first-case drill follow-through](https://github.com/smallwei0301/tour-platform/issues/319) | triaged, priority:P1, qa, agent:backlog, owner:mixed, status:ready, type:qa |
| #318 | [[Ops] Run Andy Lee first-guide onboarding demo and retrospective scope](https://github.com/smallwei0301/tour-platform/issues/318) | triaged, type:investigation, priority:P1, agent:backlog, owner:mixed, status:ready, admin-guides |

### P2 (16)

| # | Title | Labels |
|---|-------|--------|
| #1321 | [[#1212 follow-up] AC#2 vs AC#4 tension — Traveler dynamic-interpolation messageZh wiring needs product decision](https://github.com/smallwei0301/tour-platform/issues/1321) | priority:P2, type:decision, booking-v2, owner:human, ux-copy |
| #1298 | [[Ops] Fix recurring stale readiness live-state snapshot after #1081](https://github.com/smallwei0301/tour-platform/issues/1298) | triaged, type:optimization, priority:P2, qa, agent:backlog, owner:ai-agent, status:ready, infra, docs |
| #1281 | [[Test Infra] Fix local child-process specs failing to resolve Next.js](https://github.com/smallwei0301/tour-platform/issues/1281) | triaged, type:optimization, priority:P2, qa, agent:backlog, owner:ai-agent, status:ready, infra, test-infra |
| #1280 | [[Decision] Decide fate and slicing plan for stale LINE/LIFF PR #920 before further drift](https://github.com/smallwei0301/tour-platform/issues/1280) | triaged, priority:P2, agent:backlog, owner:mixed, status:needs-decision, type:decision, auth, notifications, infra |
| #1275 | [[Test Infra] Add focused Playwright E2E CI smoke for launch-critical browser regressions](https://github.com/smallwei0301/tour-platform/issues/1275) | triaged, type:optimization, priority:P2, qa, agent:backlog, owner:ai-agent, status:ready, infra, test-infra |
| #1273 | [[QA] Run online Playwright E2E for GH-1257 conflict-override + guide-warning + single-day opening](https://github.com/smallwei0301/tour-platform/issues/1273) | priority:P2, qa, guide-dashboard, agent:queued, owner:ai-agent, status:ready, type:qa, traveler-booking, booking-v2, admin |
| #1266 | [[daily bug scan] tour-platform 2026-06-06](https://github.com/smallwei0301/tour-platform/issues/1266) | triaged, type:bug, priority:P2, qa, owner:ai-agent, status:needs-repro, traveler-booking |
| #1265 | [[Ops] Refresh current issue priority routing after #1254 closure and #1121 label change](https://github.com/smallwei0301/tour-platform/issues/1265) | triaged, priority:P2, agent:backlog, owner:ai-agent, status:ready, type:docs, infra, docs |
| #1264 | [[Frontend Daily Check] 2026-06-06 lint fails with ESLint circular config error](https://github.com/smallwei0301/tour-platform/issues/1264) | triaged, type:bug, priority:P2, qa, owner:ai-agent, status:ready, traveler-booking |
| #1235 | [[daily bug scan] tour-platform 2026-06-05](https://github.com/smallwei0301/tour-platform/issues/1235) | triaged, type:bug, priority:P2, qa, owner:ai-agent, status:needs-repro, traveler-booking |
| #1106 | [[Post-Trip Ops] Implement completion, review invitation, guide report, and payout eligibility workflow](https://github.com/smallwei0301/tour-platform/issues/1106) | triaged, type:feature, priority:P2, qa, agent:backlog, owner:ai-agent, status:ready, payments, orders, notifications, launch:post-first-payment |
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
| #1328 | [docs(qa): #1267 daily checklist 2026-06-06 批次驗收（GO）](https://github.com/smallwei0301/tour-platform/pull/1328) | 2026-06-10 |
| #1327 | [fix(guide-preview): 修復導遊後台預設視圖時段預覽（#1307 follow-up）](https://github.com/smallwei0301/tour-platform/pull/1327) | 2026-06-10 |
| #1326 | [docs(qa): #1299 daily checklist 2026-06-09 批次驗收（GO）](https://github.com/smallwei0301/tour-platform/pull/1326) | 2026-06-10 |
| #1325 | [docs(qa): #1297 guide payout estimate hold parity 驗收（post-#1285）](https://github.com/smallwei0301/tour-platform/pull/1325) | 2026-06-10 |
| #1324 | [docs(claude): 強化繁中回應規範並新增 QA 驗收標準](https://github.com/smallwei0301/tour-platform/pull/1324) | 2026-06-10 |
| #1323 | [test(ui): lock unprotected UX guard copy in admin schedule + guide availability (refs #1257, #1239)](https://github.com/smallwei0301/tour-platform/pull/1323) | 2026-06-10 |
| #1322 | [fix(available-slots): route traveler messageZh through canonical helper (refs #1212 gap)](https://github.com/smallwei0301/tour-platform/pull/1322) | 2026-06-09 |
| #1320 | [fix(traveler/availability): wire canonical bodyZh into messageZh fallback (refs #1212, #1239)](https://github.com/smallwei0301/tour-platform/pull/1320) | 2026-06-09 |
| #1319 | [test(admin/conflict-override): lock CONFLICT_NOT_FOUND safety guard (refs #1257)](https://github.com/smallwei0301/tour-platform/pull/1319) | 2026-06-09 |
| #1318 | [test(booking-v2): cover #1304 group add-on acceptance scenarios (closes #1316)](https://github.com/smallwei0301/tour-platform/pull/1318) | 2026-06-09 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
