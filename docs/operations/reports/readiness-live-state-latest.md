<!-- query_timestamp: 2026-05-29T18:57:21.229Z -->
<!-- freshness_rule: auto-refreshed every 6h via CI; stale threshold: 12h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-05-29T18:57:21.229Z  
**Commit SHA:** `aeb9165fe34bfdb39622002cf3524db47122ee29`

---

## Open PRs (4)

| # | Title | Branch |
|---|-------|--------|
| #948 | [fix(blog): return proper 404 for missing blog articles](https://github.com/smallwei0301/tour-platform/pull/948) | `fix/blog-detail-notfound` |
| #925 | [fix(booking-v2): align date/people inputs with Legacy + people stepper](https://github.com/smallwei0301/tour-platform/pull/925) | `claude/booking-v2-date-people-style` |
| #920 | [feat(line): 接上 LINE Login/LIFF 綁定、webhook、Messaging API 旅客推播（全鏈路，flag 預設 OFF）](https://github.com/smallwei0301/tour-platform/pull/920) | `claude/line-integration-plan-a26p7` |
| #868 | [docs(qa): refresh #828 launch-critical evidence against latest staging](https://github.com/smallwei0301/tour-platform/pull/868) | `claude/qa-828-evidence-20260528` |

## Open Issues (17 total)

### P0 (0)

_none_

### P1 (10)

| # | Title | Labels |
|---|-------|--------|
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

### Other (1)

| # | Title | Labels |
|---|-------|--------|
| #907 | [chore(data): demote 3 playwright/e2e test-seed activities from status=published](https://github.com/smallwei0301/tour-platform/issues/907) | good-first-issue, seo, data-hygiene, ops |

---

## Recent Merged PRs (last 10)

| # | Title | Merged |
|---|-------|--------|
| #947 | [perf: priority load home featured activity image for LCP](https://github.com/smallwei0301/tour-platform/pull/947) | 2026-05-29 |
| #946 | [a11y: add required + aria-required + name to booking contact form inputs](https://github.com/smallwei0301/tour-platform/pull/946) | 2026-05-29 |
| #945 | [seo: add /experiences to robots.txt allow list](https://github.com/smallwei0301/tour-platform/pull/945) | 2026-05-29 |
| #944 | [seo: add experience detail pages to sitemap.xml](https://github.com/smallwei0301/tour-platform/pull/944) | 2026-05-29 |
| #943 | [fix(scripts): correct activities endpoint in public booking audit (closes #942)](https://github.com/smallwei0301/tour-platform/pull/943) | 2026-05-29 |
| #940 | [fix(ci): add taxonomy labels + cross-generator dedup for [daily bug scan] issues (closes #848)](https://github.com/smallwei0301/tour-platform/pull/940) | 2026-05-29 |
| #939 | [docs: refresh entry docs after #621/#787 closure (closes #846)](https://github.com/smallwei0301/tour-platform/pull/939) | 2026-05-29 |
| #938 | [fix(ci): align secret-scan and rls-grants-preflight to Node 22 (closes #936)](https://github.com/smallwei0301/tour-platform/pull/938) | 2026-05-29 |
| #937 | [fix(ci): add taxonomy labels for [Frontend Daily Check] issues (closes #832)](https://github.com/smallwei0301/tour-platform/pull/937) | 2026-05-29 |
| #935 | [fix(ci): align synthetic-health-probe to Node 22 (closes #816)](https://github.com/smallwei0301/tour-platform/pull/935) | 2026-05-29 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
