<!-- query_timestamp: 2026-06-01T19:42:05.355Z -->
<!-- freshness_rule: auto-refreshed every 6h via CI; stale threshold: 12h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-06-01T19:42:05.355Z  
**Commit SHA:** `1649f6f8c820851cafd010c1c616a37a29a6a001`

---

## Open PRs (1)

| # | Title | Branch |
|---|-------|--------|
| #920 | [feat(line): 接上 LINE Login/LIFF 綁定、webhook、Messaging API 旅客推播（全鏈路，flag 預設 OFF）](https://github.com/smallwei0301/tour-platform/pull/920) | `claude/line-integration-plan-a26p7` |

## Open Issues (28 total)

### P0 (2)

| # | Title | Labels |
|---|-------|--------|
| #1079 | [[Admin/Booking V2] Align backoffice schedules and availability with V2 activity_plans](https://github.com/smallwei0301/tour-platform/issues/1079) | type:bug, priority:P0, agent:next, owner:ai-agent, status:ready, booking-v2, admin |
| #1069 | [[Bug] Booking V2 capacity/blocked reasons and public/backoffice plan drift](https://github.com/smallwei0301/tour-platform/issues/1069) | type:bug, priority:P0, guide-dashboard, traveler-booking, booking-v2, admin |

### P1 (15)

| # | Title | Labels |
|---|-------|--------|
| #1083 | [[QA] Verify post-#1076/#1080/#1082 Booking V2 SOT regressions](https://github.com/smallwei0301/tour-platform/issues/1083) | triaged, priority:P1, qa, guide-dashboard, agent:backlog, owner:ai-agent, status:ready, type:qa, traveler-booking, booking-v2 |
| #1077 | [[QA] Verify post-#1066–#1075 guide dashboard and Booking V2 regressions](https://github.com/smallwei0301/tour-platform/issues/1077) | triaged, priority:P1, qa, guide-dashboard, agent:backlog, owner:ai-agent, status:ready, type:qa, traveler-booking, booking-v2 |
| #1073 | [[Activities] Fix /activities/kaohsiung rendering 404 instead of region listing](https://github.com/smallwei0301/tour-platform/issues/1073) | type:bug, priority:P1, qa, agent:next, owner:ai-agent, status:ready, seo |
| #1072 | [[Admin QA] Fix 待審核 tab missing pending_moderation questions](https://github.com/smallwei0301/tour-platform/issues/1072) | type:bug, priority:P1, qa, agent:next, owner:ai-agent, status:ready, admin |
| #1067 | [[Guide Dashboard] Design V2 activity management and prevent half-day/full-day guide overbooking](https://github.com/smallwei0301/tour-platform/issues/1067) | priority:P1, guide-dashboard, owner:mixed, status:ready, type:decision, booking-v2 |
| #1065 | [[QA] Daily test checklist for recent merged PRs 2026-06-01](https://github.com/smallwei0301/tour-platform/issues/1065) | priority:P1, qa |
| #1054 | [[QA] Verify early 2026-06-01 PRs #1031/#1033-#1053 regression](https://github.com/smallwei0301/tour-platform/issues/1054) | triaged, priority:P1, qa, agent:backlog, owner:ai-agent, status:ready, type:qa |
| #982 | [[QA] Daily test checklist for recent merged PRs 2026-05-31](https://github.com/smallwei0301/tour-platform/issues/982) | priority:P1, qa |
| #959 | [[QA] Daily test checklist for recent merged PRs 2026-05-30](https://github.com/smallwei0301/tour-platform/issues/959) | priority:P1, qa |
| #838 | [[Traveler Booking] Align Booking V2 price with selected plan amount](https://github.com/smallwei0301/tour-platform/issues/838) | triaged, type:bug, priority:P1, agent:next, owner:ai-agent, status:blocked, traveler-booking, launch:first-payment-blocker |
| #714 | [[Ops] Run real alert drill before first payment](https://github.com/smallwei0301/tour-platform/issues/714) | triaged, type:investigation, priority:P1, agent:queued, owner:ai-agent, status:ready, infra, status:awaiting-implementation, launch:first-payment-blocker |
| #642 | [[Traveler Booking] Monitor V2 observation window and guard legacy fallback after launch](https://github.com/smallwei0301/tour-platform/issues/642) | type:investigation, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, traveler-booking, launch:post-first-payment |
| #605 | [[Launch Content] Strict Andy Lee listing content gate before public exposure](https://github.com/smallwei0301/tour-platform/issues/605) | triaged, type:investigation, priority:P1, qa, agent:backlog, owner:mixed, type:docs, docs, status:awaiting-implementation, launch:first-payment-blocker |
| #319 | [[Ops] Run customer support SOP first-case drill follow-through](https://github.com/smallwei0301/tour-platform/issues/319) | triaged, priority:P1, qa, agent:backlog, owner:mixed, status:ready, type:qa |
| #318 | [[Ops] Run Andy Lee first-guide onboarding demo and retrospective scope](https://github.com/smallwei0301/tour-platform/issues/318) | triaged, type:investigation, priority:P1, agent:backlog, owner:mixed, status:ready, admin-guides |

### P2 (10)

| # | Title | Labels |
|---|-------|--------|
| #1104 | [[QA] Verify post-#1092–#1102 a11y and SEO regression guards](https://github.com/smallwei0301/tour-platform/issues/1104) | triaged, priority:P2, qa, guide-dashboard, agent:backlog, owner:ai-agent, status:ready, type:qa, docs, seo, admin |
| #1090 | [[QA] Verify post-#1084/#1087/#1089 a11y and SEO regressions](https://github.com/smallwei0301/tour-platform/issues/1090) | triaged, priority:P2, qa, guide-dashboard, agent:backlog, owner:ai-agent, status:ready, type:qa, traveler-booking, docs, admin |
| #1081 | [[Ops] Harden readiness live-state snapshot auto-refresh after stale regression](https://github.com/smallwei0301/tour-platform/issues/1081) | triaged, type:optimization, priority:P2, qa, agent:backlog, owner:ai-agent, status:ready, infra, docs |
| #1078 | [[Ops] Prevent temporary Go/No-Go report artifacts from polluting repo reports](https://github.com/smallwei0301/tour-platform/issues/1078) | triaged, type:optimization, priority:P2, qa, agent:backlog, owner:ai-agent, status:ready, infra, docs |
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
| #1103 | [[TypeScript] Replace supabase: any with SupabaseClient type in booking-critical lib files](https://github.com/smallwei0301/tour-platform/issues/1103) | — |

---

## Recent Merged PRs (last 10)

| # | Title | Merged |
|---|-------|--------|
| #1102 | [test: global BreadcrumbList JSON-LD guard for public pages](https://github.com/smallwei0301/tour-platform/pull/1102) | 2026-06-01 |
| #1101 | [test: admin guide availability buffer-time label/id guard (GH-1093)](https://github.com/smallwei0301/tour-platform/pull/1101) | 2026-06-01 |
| #1100 | [test(a11y): regression guards for GH-1093 and GH-1097 (#1099)](https://github.com/smallwei0301/tour-platform/pull/1100) | 2026-06-01 |
| #1098 | [a11y: aria-label on capacity inline edit + descriptive alt on image previews (GH-1097)](https://github.com/smallwei0301/tour-platform/pull/1098) | 2026-06-01 |
| #1096 | [test: global regression guard — all raw <th> must have scope=col (GH-1095)](https://github.com/smallwei0301/tour-platform/pull/1096) | 2026-06-01 |
| #1094 | [a11y/ux: file accept attrs + label association (GH-1093)](https://github.com/smallwei0301/tour-platform/pull/1094) | 2026-06-01 |
| #1092 | [test: regression guards for GH-1085 GH-1086 GH-1088 a11y/SEO fixes](https://github.com/smallwei0301/tour-platform/pull/1092) | 2026-06-01 |
| #1089 | [a11y: add aria-current to admin and guide nav active states (GH-1088)](https://github.com/smallwei0301/tour-platform/pull/1089) | 2026-06-01 |
| #1087 | [[A11y/SEO] h1 hierarchy, scope=col, BreadcrumbList fixes (GH-1085 GH-1086)](https://github.com/smallwei0301/tour-platform/pull/1087) | 2026-06-01 |
| #1084 | [[A11y] Add scope=col to guide dashboard table headers (GH-1060)](https://github.com/smallwei0301/tour-platform/pull/1084) | 2026-06-01 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
