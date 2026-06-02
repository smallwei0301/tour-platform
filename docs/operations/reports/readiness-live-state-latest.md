<!-- query_timestamp: 2026-06-02T13:23:32.429Z -->
<!-- freshness_rule: auto-refreshed every 6h via CI; stale threshold: 12h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-06-02T13:23:32.429Z  
**Commit SHA:** `68e04a0d95524d40aff369b19bf4d6332bb6a6ed`

---

## Open PRs (3)

| # | Title | Branch |
|---|-------|--------|
| #1123 | [feat(v2/admin): strict-plan-validated schedule create endpoint (#1079 Section B, backend-only)](https://github.com/smallwei0301/tour-platform/pull/1123) | `claude/new-session-4ra75` |
| #1112 | [fix(availability): add canonical season and conflict resolver slice](https://github.com/smallwei0301/tour-platform/pull/1112) | `kanban/issue-1067-canonical-availability-first-slice` |
| #920 | [feat(line): 接上 LINE Login/LIFF 綁定、webhook、Messaging API 旅客推播（全鏈路，flag 預設 OFF）](https://github.com/smallwei0301/tour-platform/pull/920) | `claude/line-integration-plan-a26p7` |

## Open Issues (19 total)

### P0 (2)

| # | Title | Labels |
|---|-------|--------|
| #1121 | [[Security] Rotate all credentials exposed in git history (service_role JWT × 7, sbp_ PAT × 5, admin token × 10, anon JWT × 4) — pre-launch final check](https://github.com/smallwei0301/tour-platform/issues/1121) | type:bug, priority:P0, security, owner:mixed, status:awaiting-implementation, launch:first-payment-blocker |
| #1079 | [[Admin/Booking V2] Align backoffice schedules and availability with V2 activity_plans](https://github.com/smallwei0301/tour-platform/issues/1079) | type:bug, priority:P0, agent:next, owner:ai-agent, status:ready, booking-v2, admin |

### P1 (8)

| # | Title | Labels |
|---|-------|--------|
| #1124 | [[QA] Verify 2026-06-02 merged fixes #1107/#1109/#1111/#1114/#1116/#1120](https://github.com/smallwei0301/tour-platform/issues/1124) | triaged, priority:P1, qa, agent:backlog, owner:ai-agent, status:ready, type:qa, traveler-booking, booking-v2, admin |
| #1083 | [[QA] Verify post-#1076/#1080/#1082 Booking V2 SOT regressions](https://github.com/smallwei0301/tour-platform/issues/1083) | triaged, priority:P1, qa, guide-dashboard, agent:backlog, owner:ai-agent, status:ready, type:qa, traveler-booking, booking-v2 |
| #1067 | [[Guide Dashboard] Design V2 activity management and prevent half-day/full-day guide overbooking](https://github.com/smallwei0301/tour-platform/issues/1067) | priority:P1, guide-dashboard, owner:mixed, status:ready, type:decision, booking-v2 |
| #714 | [[Ops] Run real alert drill before first payment](https://github.com/smallwei0301/tour-platform/issues/714) | triaged, type:investigation, priority:P1, agent:queued, owner:ai-agent, status:ready, infra, status:awaiting-implementation, launch:first-payment-blocker |
| #642 | [[Traveler Booking] Monitor V2 observation window and guard legacy fallback after launch](https://github.com/smallwei0301/tour-platform/issues/642) | type:investigation, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, traveler-booking, launch:post-first-payment |
| #605 | [[Launch Content] Strict Andy Lee listing content gate before public exposure](https://github.com/smallwei0301/tour-platform/issues/605) | triaged, type:investigation, priority:P1, qa, agent:backlog, owner:mixed, type:docs, docs, status:awaiting-implementation, launch:first-payment-blocker |
| #319 | [[Ops] Run customer support SOP first-case drill follow-through](https://github.com/smallwei0301/tour-platform/issues/319) | triaged, priority:P1, qa, agent:backlog, owner:mixed, status:ready, type:qa |
| #318 | [[Ops] Run Andy Lee first-guide onboarding demo and retrospective scope](https://github.com/smallwei0301/tour-platform/issues/318) | triaged, type:investigation, priority:P1, agent:backlog, owner:mixed, status:ready, admin-guides |

### P2 (8)

| # | Title | Labels |
|---|-------|--------|
| #1126 | [[QA] Verify post-#1122 admin login fixture and QA status URL-sync regressions](https://github.com/smallwei0301/tour-platform/issues/1126) | triaged, priority:P2, qa, agent:backlog, owner:ai-agent, status:ready, type:qa, admin, a11y, test-infra |
| #1106 | [[Post-Trip Ops] Implement completion, review invitation, guide report, and payout eligibility workflow](https://github.com/smallwei0301/tour-platform/issues/1106) | triaged, type:feature, priority:P2, qa, agent:backlog, owner:ai-agent, status:ready, payments, orders, notifications, launch:post-first-payment |
| #926 | [[Ops] Add LINE/LIFF Messaging API rollout evidence gate after #920](https://github.com/smallwei0301/tour-platform/issues/926) | triaged, priority:P2, qa, agent:backlog, owner:mixed, status:blocked, type:qa, auth, notifications, infra |
| #797 | [[Compliance] Internal conservative incident reporting playbook for soft launch](https://github.com/smallwei0301/tour-platform/issues/797) | triaged, priority:P2, security, owner:ai-agent, infra, docs, status:awaiting-implementation |
| #724 | [[Ops] Execute Supabase live restore drill within 7 days after soft launch](https://github.com/smallwei0301/tour-platform/issues/724) | triaged, type:investigation, priority:P2, agent:backlog, owner:mixed, database, infra, status:awaiting-implementation, launch:post-first-payment |
| #685 | [[Monitoring] Add simple outside website monitor after soft launch](https://github.com/smallwei0301/tour-platform/issues/685) | triaged, type:optimization, priority:P2, qa, agent:backlog, owner:ai-agent, infra, status:awaiting-implementation, launch:post-first-payment |
| #594 | [[Ops] Define Supabase backup/restore runbook before soft launch](https://github.com/smallwei0301/tour-platform/issues/594) | triaged, type:investigation, priority:P2, qa, owner:mixed, type:docs, database, infra, status:awaiting-implementation |
| #320 | [[Launch] Public soft launch with restricted booking and Go/No-Go gate](https://github.com/smallwei0301/tour-platform/issues/320) | triaged, priority:P2, agent:queued, infra, status:awaiting-implementation, launch:first-payment-blocker |

### Human-Decision (0)

_none_

### Other (1)

| # | Title | Labels |
|---|-------|--------|
| #1125 | [[e2e] T1072.1 flakes under Next-dev Fast Refresh — raise waitForResponse timeout from 10s → 30s](https://github.com/smallwei0301/tour-platform/issues/1125) | type:bug, priority:P3, admin, test-infra |

---

## Recent Merged PRs (last 10)

| # | Title | Merged |
|---|-------|--------|
| #1122 | [fix(admin): URL-sync QA status filter + un-race e2e admin login (closes #1118, #1119)](https://github.com/smallwei0301/tour-platform/pull/1122) | 2026-06-02 |
| #1120 | [fix(booking-v2): include end_at in activity_schedules SELECT so #1110 mismatch guard actually fires (closes #1115)](https://github.com/smallwei0301/tour-platform/pull/1120) | 2026-06-02 |
| #1117 | [docs(claude.md): codify backend TDD / frontend Playwright E2E policy](https://github.com/smallwei0301/tour-platform/pull/1117) | 2026-06-02 |
| #1116 | [fix(a11y): add ArrowRight/Left/Home/End keyboard nav to 7 tablists (#1113)](https://github.com/smallwei0301/tour-platform/pull/1116) | 2026-06-02 |
| #1114 | [fix(booking-v2): reject plan-schedule duration mismatch on legacy plan_id=NULL schedules (closes #1110)](https://github.com/smallwei0301/tour-platform/pull/1114) | 2026-06-02 |
| #1111 | [fix(booking-v2): eliminate ~1.5s fee detail price transient (closes #1108)](https://github.com/smallwei0301/tour-platform/pull/1111) | 2026-06-02 |
| #1109 | [fix(activities): render region listing for /activities/:region instead of 404 (closes #1073)](https://github.com/smallwei0301/tour-platform/pull/1109) | 2026-06-02 |
| #1107 | [fix(admin/qa): align pending status with DB constraint (closes #1072)](https://github.com/smallwei0301/tour-platform/pull/1107) | 2026-06-02 |
| #1102 | [test: global BreadcrumbList JSON-LD guard for public pages](https://github.com/smallwei0301/tour-platform/pull/1102) | 2026-06-01 |
| #1101 | [test: admin guide availability buffer-time label/id guard (GH-1093)](https://github.com/smallwei0301/tour-platform/pull/1101) | 2026-06-01 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
