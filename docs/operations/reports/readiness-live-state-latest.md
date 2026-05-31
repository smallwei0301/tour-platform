<!-- query_timestamp: 2026-05-31T16:17:24.589Z -->
<!-- freshness_rule: auto-refreshed every 6h via CI; stale threshold: 12h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-05-31T16:17:24.589Z  
**Commit SHA:** `90d453dc2999ac160f60a7e99d112300eb448307`

---

## Open PRs (1)

| # | Title | Branch |
|---|-------|--------|
| #920 | [feat(line): 接上 LINE Login/LIFF 綁定、webhook、Messaging API 旅客推播（全鏈路，flag 預設 OFF）](https://github.com/smallwei0301/tour-platform/pull/920) | `claude/line-integration-plan-a26p7` |

## Open Issues (14 total)

### P0 (0)

_none_

### P1 (8)

| # | Title | Labels |
|---|-------|--------|
| #982 | [[QA] Daily test checklist for recent merged PRs 2026-05-31](https://github.com/smallwei0301/tour-platform/issues/982) | priority:P1, qa |
| #959 | [[QA] Daily test checklist for recent merged PRs 2026-05-30](https://github.com/smallwei0301/tour-platform/issues/959) | priority:P1, qa |
| #838 | [[Traveler Booking] Align Booking V2 price with selected plan amount](https://github.com/smallwei0301/tour-platform/issues/838) | triaged, type:bug, priority:P1, agent:next, owner:ai-agent, status:blocked, traveler-booking, launch:first-payment-blocker |
| #714 | [[Ops] Run real alert drill before first payment](https://github.com/smallwei0301/tour-platform/issues/714) | triaged, type:investigation, priority:P1, agent:queued, owner:ai-agent, status:ready, infra, status:awaiting-implementation, launch:first-payment-blocker |
| #642 | [[Traveler Booking] Monitor V2 observation window and guard legacy fallback after launch](https://github.com/smallwei0301/tour-platform/issues/642) | type:investigation, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, traveler-booking, launch:post-first-payment |
| #605 | [[Launch Content] Strict Andy Lee listing content gate before public exposure](https://github.com/smallwei0301/tour-platform/issues/605) | triaged, type:investigation, priority:P1, qa, agent:backlog, owner:mixed, type:docs, docs, status:awaiting-implementation, launch:first-payment-blocker |
| #319 | [[Ops] Run customer support SOP first-case drill follow-through](https://github.com/smallwei0301/tour-platform/issues/319) | triaged, priority:P1, qa, agent:backlog, owner:mixed, status:ready, type:qa |
| #318 | [[Ops] Run Andy Lee first-guide onboarding demo and retrospective scope](https://github.com/smallwei0301/tour-platform/issues/318) | triaged, type:investigation, priority:P1, agent:backlog, owner:mixed, status:ready, admin-guides |

### P2 (6)

| # | Title | Labels |
|---|-------|--------|
| #926 | [[Ops] Add LINE/LIFF Messaging API rollout evidence gate after #920](https://github.com/smallwei0301/tour-platform/issues/926) | triaged, priority:P2, qa, agent:backlog, owner:mixed, status:blocked, type:qa, auth, notifications, infra |
| #797 | [[Compliance] Internal conservative incident reporting playbook for soft launch](https://github.com/smallwei0301/tour-platform/issues/797) | triaged, priority:P2, security, owner:ai-agent, infra, docs, status:awaiting-implementation |
| #724 | [[Ops] Execute Supabase live restore drill within 7 days after soft launch](https://github.com/smallwei0301/tour-platform/issues/724) | triaged, type:investigation, priority:P2, agent:backlog, owner:mixed, database, infra, status:awaiting-implementation, launch:post-first-payment |
| #685 | [[Monitoring] Add simple outside website monitor after soft launch](https://github.com/smallwei0301/tour-platform/issues/685) | triaged, type:optimization, priority:P2, qa, agent:backlog, owner:ai-agent, infra, status:awaiting-implementation, launch:post-first-payment |
| #594 | [[Ops] Define Supabase backup/restore runbook before soft launch](https://github.com/smallwei0301/tour-platform/issues/594) | triaged, type:investigation, priority:P2, qa, owner:mixed, type:docs, database, infra, status:awaiting-implementation |
| #320 | [[Launch] Public soft launch with restricted booking and Go/No-Go gate](https://github.com/smallwei0301/tour-platform/issues/320) | triaged, priority:P2, agent:queued, infra, status:awaiting-implementation, launch:first-payment-blocker |

### Human-Decision (0)

_none_

### Other (0)

_none_

---

## Recent Merged PRs (last 10)

| # | Title | Merged |
|---|-------|--------|
| #1033 | [fix(test): isolate issue965 go-no-go fixture tests to prevent parallel-run races](https://github.com/smallwei0301/tour-platform/pull/1033) | 2026-05-31 |
| #1031 | [feat(guides): add text search with URL persistence to guides listing](https://github.com/smallwei0301/tour-platform/pull/1031) | 2026-05-31 |
| #1030 | [feat(guides): wire up sort controls on guides listing](https://github.com/smallwei0301/tour-platform/pull/1030) | 2026-05-31 |
| #1029 | [feat(guides): wire up URL-persistent filter controls on guides listing](https://github.com/smallwei0301/tour-platform/pull/1029) | 2026-05-31 |
| #1028 | [fix(ops): add DATA_QUALITY_WARNING when aggregate > 0 but variant counts = 0](https://github.com/smallwei0301/tour-platform/pull/1028) | 2026-05-31 |
| #1025 | [fix: keep Booking V2 selected date on participant changes](https://github.com/smallwei0301/tour-platform/pull/1025) | 2026-05-31 |
| #1024 | [a11y: label associations for traveler order review/refund form](https://github.com/smallwei0301/tour-platform/pull/1024) | 2026-05-31 |
| #1023 | [a11y: add htmlFor/id to admin soft-launch reason textarea](https://github.com/smallwei0301/tour-platform/pull/1023) | 2026-05-31 |
| #1021 | [a11y: proper label associations on admin activity plans form (closes aria-label redundancy)](https://github.com/smallwei0301/tour-platform/pull/1021) | 2026-05-31 |
| #1020 | [a11y: label associations for guide/availability + admin guide availability forms](https://github.com/smallwei0301/tour-platform/pull/1020) | 2026-05-31 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
