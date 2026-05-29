<!-- query_timestamp: 2026-05-29T13:12:49.730Z -->
<!-- freshness_rule: auto-refreshed every 6h via CI; stale threshold: 12h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-05-29T13:12:49.730Z  
**Commit SHA:** `6b1d92c48ffa280cabc29db946e3bfd379fcd339`

---

## Open PRs (4)

| # | Title | Branch |
|---|-------|--------|
| #925 | [fix(booking-v2): align date/people inputs with Legacy + people stepper](https://github.com/smallwei0301/tour-platform/pull/925) | `claude/booking-v2-date-people-style` |
| #920 | [feat(line): 接上 LINE Login/LIFF 綁定、webhook、Messaging API 旅客推播（全鏈路，flag 預設 OFF）](https://github.com/smallwei0301/tour-platform/pull/920) | `claude/line-integration-plan-a26p7` |
| #899 | [feat(rollout): add checkout-init success metric to booking-v2 dashboard (#888)](https://github.com/smallwei0301/tour-platform/pull/899) | `feat/888-checkout-init-metric` |
| #868 | [docs(qa): refresh #828 launch-critical evidence against latest staging](https://github.com/smallwei0301/tour-platform/pull/868) | `claude/qa-828-evidence-20260528` |

## Open Issues (33 total)

### P0 (0)

_none_

### P1 (18)

| # | Title | Labels |
|---|-------|--------|
| #909 | [[P1] #883 phase 2 APPLY: 修復 5 個 missing formal plans + 1 個 pricing mismatch（dry-run report 已產出）](https://github.com/smallwei0301/tour-platform/issues/909) | type:bug, priority:P1, owner:ai-agent, status:ready, traveler-booking, database, booking-v2 |
| #906 | [[Admin] Add or route missing settlements page instead of generic 404](https://github.com/smallwei0301/tour-platform/issues/906) | type:bug, priority:P1, agent:queued, owner:ai-agent, status:ready, payments, orders, regression |
| #902 | [[Traveler Booking] Resolve Andy Lee legacy activity URL to canonical published activity](https://github.com/smallwei0301/tour-platform/issues/902) | type:bug, priority:P1, agent:queued, owner:ai-agent, status:ready, traveler-booking, regression |
| #898 | [[QA] Daily test checklist for recent merged PRs 2026-05-29](https://github.com/smallwei0301/tour-platform/issues/898) | priority:P1, qa, type:qa |
| #881 | [[P1] 發佈前新增 Booking readiness validation，阻擋未對齊方案/場次/容量公開](https://github.com/smallwei0301/tour-platform/issues/881) | type:bug, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, admin-guides, traveler-booking, database, booking-v2 |
| #880 | [[Bug] Booking V2 公開方案 slug/UUID 不一致導致 Invalid planId format，且容量與後台不符](https://github.com/smallwei0301/tour-platform/issues/880) | bug, type:bug, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, traveler-booking, booking-v2 |
| #876 | [[QA] Late-wave regression checklist for PRs merged after #850 on 2026-05-28](https://github.com/smallwei0301/tour-platform/issues/876) | triaged, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, type:qa, admin-guides, traveler-booking, docs |
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

### P2 (14)

| # | Title | Labels |
|---|-------|--------|
| #927 | [[Tech Debt] Extract shared Booking availability evaluator as single source of truth](https://github.com/smallwei0301/tour-platform/issues/927) | triaged, type:optimization, priority:P2, traveler-booking, booking-v2 |
| #926 | [[Ops] Add LINE/LIFF Messaging API rollout evidence gate after #920](https://github.com/smallwei0301/tour-platform/issues/926) | triaged, priority:P2, qa, agent:backlog, owner:mixed, status:blocked, type:qa, auth, notifications, infra |
| #908 | [[Blog] Fix desktop article card width mismatch while preserving mobile stacking](https://github.com/smallwei0301/tour-platform/issues/908) | type:bug, priority:P2, qa, agent:queued, owner:ai-agent, status:ready, regression |
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
| #907 | [chore(data): demote 3 playwright/e2e test-seed activities from status=published](https://github.com/smallwei0301/tour-platform/issues/907) | good-first-issue, seo, data-hygiene, ops |

---

## Recent Merged PRs (last 10)

| # | Title | Merged |
|---|-------|--------|
| #924 | [fix: align available-slots selected schedule with hold overlap semantics](https://github.com/smallwei0301/tour-platform/pull/924) | 2026-05-29 |
| #922 | [fix: align booking draft selected schedule validation](https://github.com/smallwei0301/tour-platform/pull/922) | 2026-05-29 |
| #921 | [fix(activity): bottom CTA reflects selected plan; scroll when none picked (#919)](https://github.com/smallwei0301/tour-platform/pull/921) | 2026-05-29 |
| #918 | [fix(admin): persist plans when saving the activity editor (#917)](https://github.com/smallwei0301/tour-platform/pull/918) | 2026-05-29 |
| #916 | [chore(db): add activity_plans.description migration (#904)](https://github.com/smallwei0301/tour-platform/pull/916) | 2026-05-29 |
| #915 | [fix(admin): plan create works for both form + JSON-import paths when schema lags (#904)](https://github.com/smallwei0301/tour-platform/pull/915) | 2026-05-29 |
| #914 | [fix(booking): zh-TW messageZh on V2 failure (#903) + restore booking-plan-repair workflow (#905)](https://github.com/smallwei0301/tour-platform/pull/914) | 2026-05-29 |
| #913 | [fix(booking): use selected plan metadata on v2 deep links](https://github.com/smallwei0301/tour-platform/pull/913) | 2026-05-29 |
| #911 | [docs(reports): booking plan repair dry-run audit 2026-05-29 (refs #883, #909)](https://github.com/smallwei0301/tour-platform/pull/911) | 2026-05-29 |
| #901 | [feat(admin): mobile-responsive overhaul across all admin pages](https://github.com/smallwei0301/tour-platform/pull/901) | 2026-05-29 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
