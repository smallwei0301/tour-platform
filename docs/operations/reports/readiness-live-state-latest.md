<!-- query_timestamp: 2026-06-05T07:35:41.229Z -->
<!-- freshness_rule: auto-refreshed every 6h via CI; stale threshold: 12h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-06-05T07:35:41.229Z  
**Commit SHA:** `dff1854e0eace7aabaf0436a74da0b63cd44a437`

---

## Open PRs (1)

| # | Title | Branch |
|---|-------|--------|
| #920 | [feat(line): 接上 LINE Login/LIFF 綁定、webhook、Messaging API 旅客推播（全鏈路，flag 預設 OFF）](https://github.com/smallwei0301/tour-platform/pull/920) | `claude/line-integration-plan-a26p7` |

## Open Issues (19 total)

### P0 (1)

| # | Title | Labels |
|---|-------|--------|
| #1121 | [[Security] Rotate all credentials exposed in git history (service_role JWT × 7, sbp_ PAT × 5, admin token × 10, anon JWT × 4) — pre-launch final check](https://github.com/smallwei0301/tour-platform/issues/1121) | type:bug, priority:P0, security, owner:mixed, status:awaiting-implementation, launch:first-payment-blocker |

### P1 (9)

| # | Title | Labels |
|---|-------|--------|
| #1249 | [[Activities] Fix slow loading on public activities listing](https://github.com/smallwei0301/tour-platform/issues/1249) | triaged, type:bug, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, traveler-booking |
| #1238 | [[Admin/Booking V2] 開放季節新增失敗：Failed to create season / invalid token](https://github.com/smallwei0301/tour-platform/issues/1238) | triaged, type:bug, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, booking-v2, admin |
| #1237 | [[Booking V2] Align public activity plans with traveler V2 booking resolver](https://github.com/smallwei0301/tour-platform/issues/1237) | triaged, type:bug, priority:P1, qa, agent:queued, owner:ai-agent, status:blocked, traveler-booking, booking-v2 |
| #1236 | [[QA] Daily test checklist for recent merged PRs 2026-06-05](https://github.com/smallwei0301/tour-platform/issues/1236) | triaged, priority:P1, cron-followup, qa, agent:queued, owner:ai-agent, status:ready, type:qa |
| #714 | [[Ops] Run real alert drill before first payment](https://github.com/smallwei0301/tour-platform/issues/714) | triaged, type:investigation, priority:P1, agent:queued, owner:ai-agent, status:ready, infra, status:awaiting-implementation, launch:first-payment-blocker |
| #642 | [[Traveler Booking] Monitor V2 observation window and guard legacy fallback after launch](https://github.com/smallwei0301/tour-platform/issues/642) | type:investigation, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, traveler-booking, launch:post-first-payment |
| #605 | [[Launch Content] Strict Andy Lee listing content gate before public exposure](https://github.com/smallwei0301/tour-platform/issues/605) | triaged, type:investigation, priority:P1, qa, agent:backlog, owner:mixed, type:docs, docs, status:awaiting-implementation, launch:first-payment-blocker |
| #319 | [[Ops] Run customer support SOP first-case drill follow-through](https://github.com/smallwei0301/tour-platform/issues/319) | triaged, priority:P1, qa, agent:backlog, owner:mixed, status:ready, type:qa |
| #318 | [[Ops] Run Andy Lee first-guide onboarding demo and retrospective scope](https://github.com/smallwei0301/tour-platform/issues/318) | triaged, type:investigation, priority:P1, agent:backlog, owner:mixed, status:ready, admin-guides |

### P2 (9)

| # | Title | Labels |
|---|-------|--------|
| #1235 | [[daily bug scan] tour-platform 2026-06-05](https://github.com/smallwei0301/tour-platform/issues/1235) | triaged, type:bug, priority:P2, qa, owner:ai-agent, status:needs-repro, traveler-booking |
| #1231 | [[Ops] Refresh current issue priority routing after #1121 P0 appears](https://github.com/smallwei0301/tour-platform/issues/1231) | triaged, priority:P2, agent:backlog, owner:ai-agent, status:ready, type:docs, infra, docs |
| #1175 | [[Post-Trip Ops] Automate review invitation sweep after delivery log](https://github.com/smallwei0301/tour-platform/issues/1175) | triaged, type:feature, priority:P2, qa, agent:backlog, owner:ai-agent, status:blocked, orders, notifications, infra, launch:post-first-payment |
| #1106 | [[Post-Trip Ops] Implement completion, review invitation, guide report, and payout eligibility workflow](https://github.com/smallwei0301/tour-platform/issues/1106) | triaged, type:feature, priority:P2, qa, agent:backlog, owner:ai-agent, status:ready, payments, orders, notifications, launch:post-first-payment |
| #926 | [[Ops] Add LINE/LIFF Messaging API rollout evidence gate after #920](https://github.com/smallwei0301/tour-platform/issues/926) | triaged, priority:P2, qa, agent:backlog, owner:mixed, status:blocked, type:qa, auth, notifications, infra |
| #797 | [[Compliance] Internal conservative incident reporting playbook for soft launch](https://github.com/smallwei0301/tour-platform/issues/797) | triaged, priority:P2, security, owner:ai-agent, infra, docs, status:awaiting-implementation |
| #724 | [[Ops] Execute Supabase live restore drill within 7 days after soft launch](https://github.com/smallwei0301/tour-platform/issues/724) | triaged, type:investigation, priority:P2, agent:backlog, owner:mixed, database, infra, status:awaiting-implementation, launch:post-first-payment |
| #685 | [[Monitoring] Add simple outside website monitor after soft launch](https://github.com/smallwei0301/tour-platform/issues/685) | triaged, type:optimization, priority:P2, qa, agent:backlog, owner:ai-agent, infra, status:awaiting-implementation, launch:post-first-payment |
| #320 | [[Launch] Public soft launch with restricted booking and Go/No-Go gate](https://github.com/smallwei0301/tour-platform/issues/320) | triaged, priority:P2, agent:queued, infra, status:awaiting-implementation, launch:first-payment-blocker |

### Human-Decision (0)

_none_

### Other (0)

_none_

---

## Recent Merged PRs (last 10)

| # | Title | Merged |
|---|-------|--------|
| #1251 | [perf(activities): public Cache-Control for /api/activities (refs #1249 criterion 2)](https://github.com/smallwei0301/tour-platform/pull/1251) | 2026-06-05 |
| #1250 | [feat(availability-v2): wire describePreviewReason through getCanonicalReasonCopy (closes #1212)](https://github.com/smallwei0301/tour-platform/pull/1250) | 2026-06-05 |
| #1248 | [fix(booking-v2): zh-TW messageZh for "Activity plan not found / not active" (refs #1237 criterion 4)](https://github.com/smallwei0301/tour-platform/pull/1248) | 2026-06-05 |
| #1247 | [chore(toolchain): pin eslint-config-next via root overrides to prevent circular config regression (closes #1233)](https://github.com/smallwei0301/tour-platform/pull/1247) | 2026-06-05 |
| #1246 | [fix(booking): recover public Booking V2 entry URLs](https://github.com/smallwei0301/tour-platform/pull/1246) | 2026-06-05 |
| #1245 | [feat(availability-v2): canonical zh-TW reason copy helper for 9 states (refs #1212, backend slice)](https://github.com/smallwei0301/tour-platform/pull/1245) | 2026-06-05 |
| #1244 | [feat(admin/booking-v2): seed endHH from plan duration + echo base_price in schedule modal (closes #1213)](https://github.com/smallwei0301/tour-platform/pull/1244) | 2026-06-05 |
| #1243 | [fix(admin/seasons): replace generic 'Failed to create season' with actionable Supabase error mapping (refs #1238)](https://github.com/smallwei0301/tour-platform/pull/1243) | 2026-06-05 |
| #1242 | [fix(settlement): enforce payout hold via isPayoutOnHold in computeSweepPayoutItem (closes #1221)](https://github.com/smallwei0301/tour-platform/pull/1242) | 2026-06-05 |
| #1241 | [fix(booking-v2): empty/inactive seasons → fail-open (全部開放) (closes #1239)](https://github.com/smallwei0301/tour-platform/pull/1241) | 2026-06-05 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
