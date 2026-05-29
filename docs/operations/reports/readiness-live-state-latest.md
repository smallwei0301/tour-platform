<!-- query_timestamp: 2026-05-29T00:55:53.418Z -->
<!-- freshness_rule: auto-refreshed every 6h via CI; stale threshold: 12h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-05-29T00:55:53.418Z  
**Commit SHA:** `f86c0b025dff27a36b9eec7457623a150c4bc321`

---

## Open PRs (5)

| # | Title | Branch |
|---|-------|--------|
| #901 | [feat(admin): mobile-responsive overhaul across all admin pages](https://github.com/smallwei0301/tour-platform/pull/901) | `claude/feature-section-reorder-yGPlt` |
| #900 | [fix(seo): exclude playwright-/e2e- test seed slugs from public sitemap](https://github.com/smallwei0301/tour-platform/pull/900) | `claude/fix-sitemap-test-data-leak` |
| #899 | [feat(rollout): add checkout-init success metric to booking-v2 dashboard (#888)](https://github.com/smallwei0301/tour-platform/pull/899) | `feat/888-checkout-init-metric` |
| #873 | [fix(booking): align activity detail formal plan pricing](https://github.com/smallwei0301/tour-platform/pull/873) | `kanban/issue-838-post-845-price-alignment` |
| #868 | [docs(qa): refresh #828 launch-critical evidence against latest staging](https://github.com/smallwei0301/tour-platform/pull/868) | `claude/qa-828-evidence-20260528` |

## Open Issues (35 total)

### P0 (0)

_none_

### P1 (22)

| # | Title | Labels |
|---|-------|--------|
| #906 | [[Admin] Add or route missing settlements page instead of generic 404](https://github.com/smallwei0301/tour-platform/issues/906) | type:bug, priority:P1, agent:queued, owner:ai-agent, status:ready, payments, orders, regression |
| #905 | [[Ops] Restore or correct missing Booking Plan Repair workflow link](https://github.com/smallwei0301/tour-platform/issues/905) | type:bug, priority:P1, agent:queued, owner:ai-agent, status:ready, database, infra, booking-v2 |
| #904 | [[Admin] Fix activity plan creation schema mismatch causing Failed to create plan](https://github.com/smallwei0301/tour-platform/issues/904) | type:bug, priority:P1, agent:queued, owner:ai-agent, status:ready, database, booking-v2, regression |
| #903 | [[Traveler Booking] Fix Booking V2 full-day plan deep link resolving to AMBIGUOUS_PLAN](https://github.com/smallwei0301/tour-platform/issues/903) | type:bug, priority:P1, agent:queued, owner:ai-agent, status:ready, traveler-booking, database, booking-v2 |
| #902 | [[Traveler Booking] Resolve Andy Lee legacy activity URL to canonical published activity](https://github.com/smallwei0301/tour-platform/issues/902) | type:bug, priority:P1, agent:queued, owner:ai-agent, status:ready, traveler-booking, regression |
| #898 | [[QA] Daily test checklist for recent merged PRs 2026-05-29](https://github.com/smallwei0301/tour-platform/issues/898) | priority:P1, qa, type:qa |
| #883 | [[P1] 修復 production published activities 的 formal plans / public plans 對應資料](https://github.com/smallwei0301/tour-platform/issues/883) | type:bug, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, traveler-booking, database, booking-v2 |
| #881 | [[P1] 發佈前新增 Booking readiness validation，阻擋未對齊方案/場次/容量公開](https://github.com/smallwei0301/tour-platform/issues/881) | type:bug, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, admin-guides, traveler-booking, database, booking-v2 |
| #880 | [[Bug] Booking V2 公開方案 slug/UUID 不一致導致 Invalid planId format，且容量與後台不符](https://github.com/smallwei0301/tour-platform/issues/880) | bug, type:bug, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, traveler-booking, booking-v2 |
| #876 | [[QA] Late-wave regression checklist for PRs merged after #850 on 2026-05-28](https://github.com/smallwei0301/tour-platform/issues/876) | triaged, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, type:qa, admin-guides, traveler-booking, docs |
| #860 | [[Bug] Booking V2 可預約場次進入付款前回 SLOT_UNAVAILABLE](https://github.com/smallwei0301/tour-platform/issues/860) | bug, priority:P1, qa, traveler-booking, payments |
| #850 | [[QA] Daily test checklist for recent merged PRs 2026-05-28](https://github.com/smallwei0301/tour-platform/issues/850) | triaged, priority:P1, qa, owner:ai-agent, status:ready, type:qa |
| #838 | [[Traveler Booking] Align Booking V2 price with selected plan amount](https://github.com/smallwei0301/tour-platform/issues/838) | triaged, type:bug, priority:P1, agent:next, owner:ai-agent, status:blocked, traveler-booking, launch:first-payment-blocker |
| #834 | [[QA] Daily test checklist for recent merged PRs 2026-05-27](https://github.com/smallwei0301/tour-platform/issues/834) | triaged, priority:P1, qa, owner:ai-agent, status:ready, type:qa |
| #828 | [[QA Gate] Focused launch-critical QA before first real payment](https://github.com/smallwei0301/tour-platform/issues/828) | triaged, priority:P1, qa, owner:ai-agent, status:ready, type:qa, traveler-booking, payments, launch:first-payment-blocker |
| #824 | [[QA] Verify post-#818 Booking V2 availability delta for PR #820/#823](https://github.com/smallwei0301/tour-platform/issues/824) | triaged, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, type:qa, traveler-booking |
| #818 | [[QA] Daily test checklist for recent merged PRs 2026-05-26](https://github.com/smallwei0301/tour-platform/issues/818) | triaged, priority:P1, qa, owner:ai-agent, status:ready, type:qa |
| #714 | [[Ops] Run real alert drill before first payment](https://github.com/smallwei0301/tour-platform/issues/714) | triaged, type:investigation, priority:P1, agent:queued, owner:ai-agent, status:ready, infra, status:awaiting-implementation, launch:first-payment-blocker |
| #642 | [[Traveler Booking] Monitor V2 observation window and guard legacy fallback after launch](https://github.com/smallwei0301/tour-platform/issues/642) | type:investigation, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, traveler-booking, launch:post-first-payment |
| #605 | [[Launch Content] Strict Andy Lee listing content gate before public exposure](https://github.com/smallwei0301/tour-platform/issues/605) | triaged, type:investigation, priority:P1, qa, agent:backlog, owner:mixed, type:docs, docs, status:awaiting-implementation, launch:first-payment-blocker |
| #319 | [[Ops] Run customer support SOP first-case drill follow-through](https://github.com/smallwei0301/tour-platform/issues/319) | triaged, priority:P1, qa, agent:backlog, owner:mixed, status:ready, type:qa |
| #318 | [[Ops] Run Andy Lee first-guide onboarding demo and retrospective scope](https://github.com/smallwei0301/tour-platform/issues/318) | triaged, type:investigation, priority:P1, agent:backlog, owner:mixed, status:ready, admin-guides |

### P2 (12)

| # | Title | Labels |
|---|-------|--------|
| #897 | [[Auto Check] STAGING healthcheck returns 404 at /api/health](https://github.com/smallwei0301/tour-platform/issues/897) | triaged, type:investigation, priority:P2, qa, owner:ai-agent, status:needs-repro, infra |
| #888 | [[Ops] Align Booking V2 Go/No-Go checkout-init success metric contract](https://github.com/smallwei0301/tour-platform/issues/888) | triaged, type:optimization, priority:P2, qa, agent:backlog, owner:ai-agent, status:ready, traveler-booking, infra, booking-v2 |
| #848 | [[Ops] Dedupe automated QA failure issues across daily scan generators](https://github.com/smallwei0301/tour-platform/issues/848) | triaged, type:optimization, priority:P2, qa, agent:backlog, owner:ai-agent, status:ready, infra |
| #846 | [[Docs] Refresh entry docs after #621/#787 turnover and current readiness drift](https://github.com/smallwei0301/tour-platform/issues/846) | triaged, priority:P2, agent:backlog, owner:ai-agent, status:ready, type:docs, docs |
| #832 | [[Ops] Add taxonomy labels to Frontend Daily Check issues](https://github.com/smallwei0301/tour-platform/issues/832) | triaged, type:optimization, priority:P2, qa, agent:backlog, owner:ai-agent, status:ready, infra |
| #827 | [[Ops] Repair agent:now routing after #621 closure](https://github.com/smallwei0301/tour-platform/issues/827) | triaged, type:optimization, priority:P2, agent:backlog, owner:ai-agent, status:ready, infra, docs |
| #816 | [[Ops] Align synthetic health probe workflow with Node 22 runtime contract](https://github.com/smallwei0301/tour-platform/issues/816) | triaged, type:optimization, priority:P2, qa, agent:backlog, owner:ai-agent, status:ready, infra |
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
| #896 | [[Frontend Daily Check] 2026-05-29 lint/test failed: module resolution errors](https://github.com/smallwei0301/tour-platform/issues/896) | — |

---

## Recent Merged PRs (last 10)

| # | Title | Merged |
|---|-------|--------|
| #894 | [feat(scripts): booking plan repair DRY_RUN audit (#893, refs #883)](https://github.com/smallwei0301/tour-platform/pull/894) | 2026-05-28 |
| #892 | [fix(admin): block schedule capacity > plan.max_participants at write time (#891)](https://github.com/smallwei0301/tour-platform/pull/892) | 2026-05-28 |
| #890 | [feat(qa): full public booking regression — CI fixture + nightly audit (#885)](https://github.com/smallwei0301/tour-platform/pull/890) | 2026-05-28 |
| #889 | [feat(admin): booking readiness validation gate before publish (#881)](https://github.com/smallwei0301/tour-platform/pull/889) | 2026-05-28 |
| #887 | [refactor(booking-v2): canonical plan resolver helper (closes #882)](https://github.com/smallwei0301/tour-platform/pull/887) | 2026-05-28 |
| #886 | [fix(booking-v2): graceful 404 + capacity cap for available-slots (refs #880)](https://github.com/smallwei0301/tour-platform/pull/886) | 2026-05-28 |
| #879 | [fix(settlement): align sweep eligibility with v1 payout policy (closes #847)](https://github.com/smallwei0301/tour-platform/pull/879) | 2026-05-28 |
| #878 | [feat(taxonomy): add label-conflict detection script for open issues (closes #830)](https://github.com/smallwei0301/tour-platform/pull/878) | 2026-05-28 |
| #877 | [chore(admin/go-no-go): align readiness checklist with current first-payment gates](https://github.com/smallwei0301/tour-platform/pull/877) | 2026-05-28 |
| #875 | [fix(admin-v2): protect plan CRUD and visible errors](https://github.com/smallwei0301/tour-platform/pull/875) | 2026-05-28 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
