<!-- query_timestamp: 2026-05-25T18:38:26.942Z -->
<!-- freshness_rule: auto-refreshed every 6h via CI; stale threshold: 12h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-05-25T18:38:26.942Z  
**Commit SHA:** `924c552d02aeec41827808e63d6317640466bd5b`

---

## Open PRs (0)

_none_

## Open Issues (12 total)

### P0 (1)

| # | Title | Labels |
|---|-------|--------|
| #621 | [[Traveler Booking] Enable Booking/Availability V2 as primary traveler flow](https://github.com/smallwei0301/tour-platform/issues/621) | triaged, type:feature, priority:P0, guide-dashboard, agent:now, owner:ai-agent, status:ready, traveler-booking, launch:first-payment-blocker |

### P1 (6)

| # | Title | Labels |
|---|-------|--------|
| #813 | [[QA] Post-PR #805–#812 soft-launch / maintenance / SEO-a11y regression pass](https://github.com/smallwei0301/tour-platform/issues/813) | triaged, priority:P1, qa, agent:backlog, owner:mixed, status:ready, type:qa, launch:first-payment-blocker |
| #714 | [[Ops] Execute production alert drill and fill evidence skeleton](https://github.com/smallwei0301/tour-platform/issues/714) | triaged, type:investigation, priority:P1, agent:queued, owner:ai-agent, status:ready, infra, launch:post-first-payment |
| #642 | [[Traveler Booking] Monitor V2 observation window and guard legacy fallback after launch](https://github.com/smallwei0301/tour-platform/issues/642) | type:investigation, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, traveler-booking, launch:post-first-payment |
| #605 | [[Ops] Finalize Andy Lee launch listing content and media before public booking](https://github.com/smallwei0301/tour-platform/issues/605) | triaged, type:investigation, priority:P1, qa, agent:backlog, owner:mixed, status:needs-info, type:docs, docs, launch:first-payment-blocker |
| #319 | [[Ops] Run customer support SOP first-case drill follow-through](https://github.com/smallwei0301/tour-platform/issues/319) | triaged, priority:P1, qa, agent:backlog, owner:mixed, status:ready, type:qa |
| #318 | [[Ops] Run Andy Lee first-guide onboarding demo and retrospective scope](https://github.com/smallwei0301/tour-platform/issues/318) | triaged, type:investigation, priority:P1, agent:backlog, owner:mixed, status:ready, admin-guides |

### P2 (4)

| # | Title | Labels |
|---|-------|--------|
| #724 | [[Ops] Execute live Supabase restore drill and fill evidence template](https://github.com/smallwei0301/tour-platform/issues/724) | triaged, type:investigation, priority:P2, agent:backlog, owner:mixed, status:blocked, database, infra, launch:first-payment-blocker |
| #685 | [[Ops] Add third-party synthetic monitor after soft launch](https://github.com/smallwei0301/tour-platform/issues/685) | triaged, type:optimization, priority:P2, qa, agent:backlog, owner:ai-agent, status:blocked, infra, launch:post-first-payment |
| #594 | [[Ops] Define and drill Supabase backup/restore runbook before soft launch](https://github.com/smallwei0301/tour-platform/issues/594) | triaged, type:investigation, priority:P2, qa, owner:mixed, status:ready, type:docs, database, infra |
| #320 | [[Ops] Implement pre-launch readiness gate, soft-launch control, and Admin Go/No-Go dashboard](https://github.com/smallwei0301/tour-platform/issues/320) | triaged, type:feature, priority:P2, agent:queued, owner:ai-agent, status:ready, infra, launch:first-payment-blocker |

### Human-Decision (1)

| # | Title | Labels |
|---|-------|--------|
| #797 | [[Decision] Confirm incident regulatory reporting and compliance sign-off](https://github.com/smallwei0301/tour-platform/issues/797) | triaged, priority:P2, security, owner:human-decision, status:needs-decision, type:decision, infra, docs |

### Other (0)

_none_

---

## Recent Merged PRs (last 10)

| # | Title | Merged |
|---|-------|--------|
| #812 | [qa: daily QA evidence for PRs #802–#804 merged 2026-05-25](https://github.com/smallwei0301/tour-platform/pull/812) | 2026-05-25 |
| #811 | [qa: daily QA evidence for PRs merged 2026-05-21 to 2026-05-23 (closes #704)](https://github.com/smallwei0301/tour-platform/pull/811) | 2026-05-25 |
| #810 | [seo+a11y: aggregateRating on experience page + form label associations](https://github.com/smallwei0301/tour-platform/pull/810) | 2026-05-25 |
| #809 | [feat(ux): branded maintenance page for public_paused state (closes #808)](https://github.com/smallwei0301/tour-platform/pull/809) | 2026-05-25 |
| #807 | [feat(soft-launch): enforce public_paused control at middleware entry (closes #805)](https://github.com/smallwei0301/tour-platform/pull/807) | 2026-05-25 |
| #806 | [docs(guide): KYC data-minimization, retention rules, and notification templates (closes #606)](https://github.com/smallwei0301/tour-platform/pull/806) | 2026-05-25 |
| #804 | [docs: Andy Lee launch safety & risk disclosure evidence checklist (closes #593)](https://github.com/smallwei0301/tour-platform/pull/804) | 2026-05-25 |
| #803 | [docs: sync docs index and next phase plan after Booking V2 turnover (closes #792)](https://github.com/smallwei0301/tour-platform/pull/803) | 2026-05-25 |
| #802 | [feat(guide): add guide self-edit public profile page (closes #791)](https://github.com/smallwei0301/tour-platform/pull/802) | 2026-05-25 |
| #801 | [qa: daily QA evidence for PRs #705-#800 merged 2026-05-25 (closes #784)](https://github.com/smallwei0301/tour-platform/pull/801) | 2026-05-25 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
