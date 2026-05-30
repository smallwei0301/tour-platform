<!-- query_timestamp: 2026-05-30T18:28:15.698Z -->
<!-- freshness_rule: auto-refreshed every 6h via CI; stale threshold: 12h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-05-30T18:28:15.698Z  
**Commit SHA:** `c5d36f40a9f21804bee1e6e19616fd71dcc2e772`

---

## Open PRs (2)

| # | Title | Branch |
|---|-------|--------|
| #920 | [feat(line): 接上 LINE Login/LIFF 綁定、webhook、Messaging API 旅客推播（全鏈路，flag 預設 OFF）](https://github.com/smallwei0301/tour-platform/pull/920) | `claude/line-integration-plan-a26p7` |
| #868 | [docs(qa): refresh #828 launch-critical evidence against latest staging](https://github.com/smallwei0301/tour-platform/pull/868) | `claude/qa-828-evidence-20260528` |

## Open Issues (19 total)

### P0 (0)

_none_

### P1 (10)

| # | Title | Labels |
|---|-------|--------|
| #959 | [[QA] Daily test checklist for recent merged PRs 2026-05-30](https://github.com/smallwei0301/tour-platform/issues/959) | priority:P1, qa |
| #909 | [[P1] #883 phase 2 APPLY: 修復 5 個 missing formal plans + 1 個 pricing mismatch（dry-run report 已產出）](https://github.com/smallwei0301/tour-platform/issues/909) | type:bug, priority:P1, owner:ai-agent, status:ready, traveler-booking, database, booking-v2 |
| #880 | [[Bug] Booking V2 公開方案 slug/UUID 不一致導致 Invalid planId format，且容量與後台不符](https://github.com/smallwei0301/tour-platform/issues/880) | bug, type:bug, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, traveler-booking, booking-v2 |
| #838 | [[Traveler Booking] Align Booking V2 price with selected plan amount](https://github.com/smallwei0301/tour-platform/issues/838) | triaged, type:bug, priority:P1, agent:next, owner:ai-agent, status:blocked, traveler-booking, launch:first-payment-blocker |
| #824 | [[QA] Verify post-#818 Booking V2 availability delta for PR #820/#823](https://github.com/smallwei0301/tour-platform/issues/824) | triaged, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, type:qa, traveler-booking |
| #714 | [[Ops] Run real alert drill before first payment](https://github.com/smallwei0301/tour-platform/issues/714) | triaged, type:investigation, priority:P1, agent:queued, owner:ai-agent, status:ready, infra, status:awaiting-implementation, launch:first-payment-blocker |
| #642 | [[Traveler Booking] Monitor V2 observation window and guard legacy fallback after launch](https://github.com/smallwei0301/tour-platform/issues/642) | type:investigation, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, traveler-booking, launch:post-first-payment |
| #605 | [[Launch Content] Strict Andy Lee listing content gate before public exposure](https://github.com/smallwei0301/tour-platform/issues/605) | triaged, type:investigation, priority:P1, qa, agent:backlog, owner:mixed, type:docs, docs, status:awaiting-implementation, launch:first-payment-blocker |
| #319 | [[Ops] Run customer support SOP first-case drill follow-through](https://github.com/smallwei0301/tour-platform/issues/319) | triaged, priority:P1, qa, agent:backlog, owner:mixed, status:ready, type:qa |
| #318 | [[Ops] Run Andy Lee first-guide onboarding demo and retrospective scope](https://github.com/smallwei0301/tour-platform/issues/318) | triaged, type:investigation, priority:P1, agent:backlog, owner:mixed, status:ready, admin-guides |

### P2 (7)

| # | Title | Labels |
|---|-------|--------|
| #978 | [[Ops] Verify post-#970 Booking V2 variant metrics are populated before trusting delta GO](https://github.com/smallwei0301/tour-platform/issues/978) | triaged, type:investigation, priority:P2, qa, agent:backlog, owner:ai-agent, status:ready, traveler-booking, infra, booking-v2 |
| #926 | [[Ops] Add LINE/LIFF Messaging API rollout evidence gate after #920](https://github.com/smallwei0301/tour-platform/issues/926) | triaged, priority:P2, qa, agent:backlog, owner:mixed, status:blocked, type:qa, auth, notifications, infra |
| #797 | [[Compliance] Internal conservative incident reporting playbook for soft launch](https://github.com/smallwei0301/tour-platform/issues/797) | triaged, priority:P2, security, owner:ai-agent, infra, docs, status:awaiting-implementation |
| #724 | [[Ops] Execute Supabase live restore drill within 7 days after soft launch](https://github.com/smallwei0301/tour-platform/issues/724) | triaged, type:investigation, priority:P2, agent:backlog, owner:mixed, database, infra, status:awaiting-implementation, launch:post-first-payment |
| #685 | [[Monitoring] Add simple outside website monitor after soft launch](https://github.com/smallwei0301/tour-platform/issues/685) | triaged, type:optimization, priority:P2, qa, agent:backlog, owner:ai-agent, infra, status:awaiting-implementation, launch:post-first-payment |
| #594 | [[Ops] Define Supabase backup/restore runbook before soft launch](https://github.com/smallwei0301/tour-platform/issues/594) | triaged, type:investigation, priority:P2, qa, owner:mixed, type:docs, database, infra, status:awaiting-implementation |
| #320 | [[Launch] Public soft launch with restricted booking and Go/No-Go gate](https://github.com/smallwei0301/tour-platform/issues/320) | triaged, priority:P2, agent:queued, infra, status:awaiting-implementation, launch:first-payment-blocker |

### Human-Decision (0)

_none_

### Other (2)

| # | Title | Labels |
|---|-------|--------|
| #977 | [perf: convert homepage hero CSS background-image to Next.js Image with priority for LCP](https://github.com/smallwei0301/tour-platform/issues/977) | — |
| #907 | [chore(data): demote 3 playwright/e2e test-seed activities from status=published](https://github.com/smallwei0301/tour-platform/issues/907) | good-first-issue, seo, data-hygiene, ops |

---

## Recent Merged PRs (last 10)

| # | Title | Merged |
|---|-------|--------|
| #976 | [seo/a11y: fix aggregateRating schema + admin modal ARIA (closes #974, closes #975)](https://github.com/smallwei0301/tour-platform/pull/976) | 2026-05-30 |
| #973 | [a11y/seo: CalendarModal focus trap + activities/[region] metadata (closes #971, closes #972)](https://github.com/smallwei0301/tour-platform/pull/973) | 2026-05-30 |
| #970 | [feat(rollout): legacy/v2 funnel delta metrics for Booking V2 Go/No-Go (closes #965)](https://github.com/smallwei0301/tour-platform/pull/970) | 2026-05-30 |
| #969 | [a11y: add focus trap and Escape-close to PlanDetailModal (closes #951)](https://github.com/smallwei0301/tour-platform/pull/969) | 2026-05-30 |
| #968 | [docs(qa): correct andy-lee-private-tour to canonical URL (closes #902)](https://github.com/smallwei0301/tour-platform/pull/968) | 2026-05-30 |
| #967 | [fix(ci): repair auto-check-issue-policy YAML structure (closes #966)](https://github.com/smallwei0301/tour-platform/pull/967) | 2026-05-30 |
| #964 | [fix(a11y): add GH-960 detail tab keyboard semantics](https://github.com/smallwei0301/tour-platform/pull/964) | 2026-05-30 |
| #963 | [fix(activities): normalize GH-960 type filter restore](https://github.com/smallwei0301/tour-platform/pull/963) | 2026-05-30 |
| #962 | [fix(api): return empty availability for ambiguous booking plan](https://github.com/smallwei0301/tour-platform/pull/962) | 2026-05-30 |
| #961 | [fix(blog): return true 404 for unknown blog slugs](https://github.com/smallwei0301/tour-platform/pull/961) | 2026-05-30 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
