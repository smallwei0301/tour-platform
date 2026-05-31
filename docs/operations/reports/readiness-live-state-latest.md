<!-- query_timestamp: 2026-05-31T17:35:59.752Z -->
<!-- freshness_rule: auto-refreshed every 6h via CI; stale threshold: 12h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-05-31T17:35:59.752Z  
**Commit SHA:** `a3b41177d551391e547aa83ac0cc2b7a86e7a909`

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
| #1047 | [seo: add numberOfItems to guides listing ItemList JSON-LD schema](https://github.com/smallwei0301/tour-platform/pull/1047) | 2026-05-31 |
| #1046 | [seo: add knowsAbout and knowsLanguage to guide profile JSON-LD](https://github.com/smallwei0301/tour-platform/pull/1046) | 2026-05-31 |
| #1045 | [feat/a11y: extend guides search to include languages; add aria-label to admin date inputs](https://github.com/smallwei0301/tour-platform/pull/1045) | 2026-05-31 |
| #1044 | [a11y: add aria-expanded and aria-controls to guide mobile navigation button](https://github.com/smallwei0301/tour-platform/pull/1044) | 2026-05-31 |
| #1043 | [a11y: add ARIA dialog to admin mobile navigation drawer](https://github.com/smallwei0301/tour-platform/pull/1043) | 2026-05-31 |
| #1042 | [a11y: add ARIA dialog pattern to guide bookings order detail modal](https://github.com/smallwei0301/tour-platform/pull/1042) | 2026-05-31 |
| #1041 | [test: extend issue1027 test suite to cover guides text search contract](https://github.com/smallwei0301/tour-platform/pull/1041) | 2026-05-31 |
| #1040 | [a11y: add aria-label to guide and admin navigation landmarks](https://github.com/smallwei0301/tour-platform/pull/1040) | 2026-05-31 |
| #1039 | [a11y: add ARIA dialog pattern to traveler order cancel dialog](https://github.com/smallwei0301/tour-platform/pull/1039) | 2026-05-31 |
| #1038 | [a11y: add ARIA tablist/tab semantics to admin status filter tabs](https://github.com/smallwei0301/tour-platform/pull/1038) | 2026-05-31 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
