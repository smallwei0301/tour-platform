<!-- query_timestamp: 2026-05-30T00:51:22.755Z -->
<!-- freshness_rule: auto-refreshed every 6h via CI; stale threshold: 12h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-05-30T00:51:22.755Z  
**Commit SHA:** `fbeae4260a7ecde9bc8cb3e6be5ea4b9a78415b8`

---

## Open PRs (3)

| # | Title | Branch |
|---|-------|--------|
| #925 | [fix(booking-v2): align date/people inputs with Legacy + people stepper](https://github.com/smallwei0301/tour-platform/pull/925) | `claude/booking-v2-date-people-style` |
| #920 | [feat(line): 接上 LINE Login/LIFF 綁定、webhook、Messaging API 旅客推播（全鏈路，flag 預設 OFF）](https://github.com/smallwei0301/tour-platform/pull/920) | `claude/line-integration-plan-a26p7` |
| #868 | [docs(qa): refresh #828 launch-critical evidence against latest staging](https://github.com/smallwei0301/tour-platform/pull/868) | `claude/qa-828-evidence-20260528` |

## Open Issues (21 total)

### P0 (0)

_none_

### P1 (12)

| # | Title | Labels |
|---|-------|--------|
| #959 | [[QA] Daily test checklist for recent merged PRs 2026-05-30](https://github.com/smallwei0301/tour-platform/issues/959) | priority:P1, qa |
| #957 | [[QA] Late-wave daily regression checklist for PRs #933-#956 on 2026-05-30](https://github.com/smallwei0301/tour-platform/issues/957) | triaged, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, type:qa, traveler-booking, infra, booking-v2 |
| #909 | [[P1] #883 phase 2 APPLY: 修復 5 個 missing formal plans + 1 個 pricing mismatch（dry-run report 已產出）](https://github.com/smallwei0301/tour-platform/issues/909) | type:bug, priority:P1, owner:ai-agent, status:ready, traveler-booking, database, booking-v2 |
| #902 | [[Traveler Booking] Resolve Andy Lee legacy activity URL to canonical published activity](https://github.com/smallwei0301/tour-platform/issues/902) | type:bug, priority:P1, agent:queued, owner:ai-agent, status:ready, traveler-booking, regression |
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
| #951 | [[a11y] Add focus trap to PlanDetailModal for keyboard accessibility](https://github.com/smallwei0301/tour-platform/issues/951) | type:optimization, priority:P2, owner:ai-agent, status:ready |
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
| #958 | [[Auto Check] STAGING healthcheck returns 404 at /api/health](https://github.com/smallwei0301/tour-platform/issues/958) | — |
| #907 | [chore(data): demote 3 playwright/e2e test-seed activities from status=published](https://github.com/smallwei0301/tour-platform/issues/907) | good-first-issue, seo, data-hygiene, ops |

---

## Recent Merged PRs (last 10)

| # | Title | Merged |
|---|-------|--------|
| #956 | [feat(activities): debounced URL persistence for text search query](https://github.com/smallwei0301/tour-platform/pull/956) | 2026-05-29 |
| #955 | [a11y: add ARIA stepper pattern to booking progress indicator](https://github.com/smallwei0301/tour-platform/pull/955) | 2026-05-29 |
| #954 | [a11y: add arrow key keyboard navigation to ActivityTabs](https://github.com/smallwei0301/tour-platform/pull/954) | 2026-05-29 |
| #953 | [a11y: fix guides listing page heading hierarchy (h2→h1)](https://github.com/smallwei0301/tour-platform/pull/953) | 2026-05-29 |
| #952 | [a11y: fix activities listing page heading hierarchy (h2→h1)](https://github.com/smallwei0301/tour-platform/pull/952) | 2026-05-29 |
| #950 | [feat(activities): persist filter selection in URL for shareability](https://github.com/smallwei0301/tour-platform/pull/950) | 2026-05-29 |
| #949 | [test: source-level contract tests for blog/experience 404 handling (refs #948)](https://github.com/smallwei0301/tour-platform/pull/949) | 2026-05-29 |
| #948 | [fix(blog): return proper 404 for missing blog articles](https://github.com/smallwei0301/tour-platform/pull/948) | 2026-05-29 |
| #947 | [perf: priority load home featured activity image for LCP](https://github.com/smallwei0301/tour-platform/pull/947) | 2026-05-29 |
| #946 | [a11y: add required + aria-required + name to booking contact form inputs](https://github.com/smallwei0301/tour-platform/pull/946) | 2026-05-29 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
