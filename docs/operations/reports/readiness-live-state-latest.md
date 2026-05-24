<!-- query_timestamp: 2026-05-24T16:48:00.937Z -->
<!-- freshness_rule: auto-refreshed every 6h via CI; stale threshold: 12h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-05-24T16:48:00.937Z  
**Commit SHA:** `e356506a9119496af6ac0ddced1eb2bebb9dab8e`

---

## Open PRs (0)

_none_

## Open Issues (15 total)

### P0 (1)

| # | Title | Labels |
|---|-------|--------|
| #621 | [[Traveler Booking] Enable Booking/Availability V2 as primary traveler flow](https://github.com/smallwei0301/tour-platform/issues/621) | triaged, type:feature, priority:P0, guide-dashboard, agent:now, owner:ai-agent, status:ready, traveler-booking |

### P1 (4)

| # | Title | Labels |
|---|-------|--------|
| #704 | [[QA] Daily test checklist for recent merged PRs 2026-05-23](https://github.com/smallwei0301/tour-platform/issues/704) | priority:P1, qa |
| #642 | [[Traveler Booking] Monitor V2 observation window and guard legacy fallback after launch](https://github.com/smallwei0301/tour-platform/issues/642) | type:investigation, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, traveler-booking |
| #607 | [[Ops] Execute production alert drill evidence before soft-launch sign-off](https://github.com/smallwei0301/tour-platform/issues/607) | triaged, type:investigation, priority:P1, qa, agent:backlog, owner:ai-agent, status:ready, infra |
| #605 | [[Ops] Finalize Andy Lee launch listing content and media before public booking](https://github.com/smallwei0301/tour-platform/issues/605) | triaged, type:investigation, priority:P1, qa, agent:backlog, owner:mixed, status:needs-info, type:docs, docs |

### P2 (3)

| # | Title | Labels |
|---|-------|--------|
| #685 | [[Ops] Add third-party synthetic monitor after soft launch](https://github.com/smallwei0301/tour-platform/issues/685) | triaged, type:optimization, priority:P2, qa, owner:mixed, status:needs-decision, infra |
| #628 | [[Docs] Align public brand copy and CTA consistency before soft launch](https://github.com/smallwei0301/tour-platform/issues/628) | triaged, type:optimization, priority:P2, qa, owner:mixed, status:needs-decision, type:docs, docs |
| #594 | [[Ops] Define and drill Supabase backup/restore runbook before soft launch](https://github.com/smallwei0301/tour-platform/issues/594) | triaged, type:investigation, priority:P2, qa, owner:mixed, status:ready, type:docs, database, infra |

### Human-Decision (7)

| # | Title | Labels |
|---|-------|--------|
| #724 | [[Ops] Execute live Supabase restore drill + fill evidence template (parent: #594)](https://github.com/smallwei0301/tour-platform/issues/724) | triaged, type:investigation, priority:P2, owner:human-decision, status:needs-decision, database, infra |
| #714 | [[Ops] Operator executes production alert drill + fills evidence skeleton (parent: #607)](https://github.com/smallwei0301/tour-platform/issues/714) | triaged, type:investigation, priority:P1, owner:human-decision, status:needs-decision, infra |
| #606 | [[Decision] Choose guide onboarding KYC, data-retention, and notification rules](https://github.com/smallwei0301/tour-platform/issues/606) | triaged, priority:P2, owner:human-decision, status:needs-decision, type:decision, admin-guides, notifications |
| #593 | [[Decision] Choose Andy Lee launch activity safety, insurance, and risk disclosures](https://github.com/smallwei0301/tour-platform/issues/593) | triaged, priority:P1, owner:human-decision, status:needs-decision, type:decision |
| #320 | [[Decision] Choose pre-launch readiness gate, soft-launch control, and Admin Go/No-Go dashboard](https://github.com/smallwei0301/tour-platform/issues/320) | triaged, priority:P2, owner:human-decision, status:needs-decision, type:decision, infra |
| #319 | [[Decision] Choose customer support SOP drill coverage for cancellation, refund, tour exception, and emergency scenarios](https://github.com/smallwei0301/tour-platform/issues/319) | triaged, priority:P1, owner:human-decision, status:needs-decision, type:decision |
| #318 | [[Decision] Choose Andy Lee first-guide onboarding run and retrospective scope](https://github.com/smallwei0301/tour-platform/issues/318) | triaged, priority:P1, owner:human-decision, status:needs-decision, type:decision, admin-guides |

### Other (0)

_none_

---

## Release Evidence Gates

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via workflow_dispatch; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off |

---

## Recent Merged PRs (last 10)

| # | Title | Merged |
|---|-------|--------|
| #730 | [security(rls): add automated preflight workflow + update runbook + readiness docs (closes #701)](https://github.com/smallwei0301/tour-platform/pull/730) | 2026-05-24 |
| #729 | [ops(cron): add fingerprint dedup + secret sanitization to health-check issue generator (closes #721)](https://github.com/smallwei0301/tour-platform/pull/729) | 2026-05-24 |
| #728 | [ops(tests): replace process.cwd() with import.meta.url across 50 test files (closes #711)](https://github.com/smallwei0301/tour-platform/pull/728) | 2026-05-24 |
| #727 | [docs(readiness): add snapshot freshness guard + drift check script (closes #700)](https://github.com/smallwei0301/tour-platform/pull/727) | 2026-05-24 |
| #726 | [payout(monthly): use active settlement_rules for commission calc (closes #719)](https://github.com/smallwei0301/tour-platform/pull/726) | 2026-05-24 |
| #725 | [ops(supabase): backup/restore runbook + drill template (closes #723)](https://github.com/smallwei0301/tour-platform/pull/725) | 2026-05-24 |
| #722 | [ops(auto-check): post-hoc issue policy enforcer + #702 retroactive fix (closes #720)](https://github.com/smallwei0301/tour-platform/pull/722) | 2026-05-24 |
| #718 | [qa(booking-v2): slug-rejection regression tests + delta QA for PR #708 (closes #709)](https://github.com/smallwei0301/tour-platform/pull/718) | 2026-05-24 |
| #717 | [docs(booking-v2): Phase 7 observation window report scaffold (closes #716)](https://github.com/smallwei0301/tour-platform/pull/717) | 2026-05-24 |
| #715 | [ops(alert-drill): static verification + drill evidence skeleton (closes #713)](https://github.com/smallwei0301/tour-platform/pull/715) | 2026-05-24 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
