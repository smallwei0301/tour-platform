<!-- query_timestamp: 2026-06-04T13:11:47.044Z -->
<!-- freshness_rule: auto-refreshed every 6h via CI; stale threshold: 12h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-06-04T13:11:47.044Z  
**Commit SHA:** `5d28c2550ab5f82befe1bda7a65e2c85efa6cf54`

---

## Open PRs (3)

| # | Title | Branch |
|---|-------|--------|
| #1210 | [test(toolchain): pin eslint-config-next major to next major to prevent circular config regression (closes #1195)](https://github.com/smallwei0301/tour-platform/pull/1210) | `claude/fix-1195-eslint-version-guard` |
| #1209 | [feat(post-trip): review-invitation sweep decision engine + feature flag (refs #1175, backend slice)](https://github.com/smallwei0301/tour-platform/pull/1209) | `claude/new-session-4ra75` |
| #920 | [feat(line): 接上 LINE Login/LIFF 綁定、webhook、Messaging API 旅客推播（全鏈路，flag 預設 OFF）](https://github.com/smallwei0301/tour-platform/pull/920) | `claude/line-integration-plan-a26p7` |

## Open Issues (24 total)

### P0 (1)

| # | Title | Labels |
|---|-------|--------|
| #1121 | [[Security] Rotate all credentials exposed in git history (service_role JWT × 7, sbp_ PAT × 5, admin token × 10, anon JWT × 4) — pre-launch final check](https://github.com/smallwei0301/tour-platform/issues/1121) | type:bug, priority:P0, security, owner:mixed, status:awaiting-implementation, launch:first-payment-blocker |

### P1 (7)

| # | Title | Labels |
|---|-------|--------|
| #1196 | [[Admin/Booking V2] Clarify unified availability field precedence across admin, guide, and traveler](https://github.com/smallwei0301/tour-platform/issues/1196) | triaged, type:feature, priority:P1, qa, guide-dashboard, agent:backlog, owner:ai-agent, status:ready, traveler-booking, booking-v2, admin |
| #1067 | [[Guide Dashboard] Design V2 activity management and prevent half-day/full-day guide overbooking](https://github.com/smallwei0301/tour-platform/issues/1067) | priority:P1, guide-dashboard, owner:mixed, status:ready, type:decision, booking-v2 |
| #714 | [[Ops] Run real alert drill before first payment](https://github.com/smallwei0301/tour-platform/issues/714) | triaged, type:investigation, priority:P1, agent:queued, owner:ai-agent, status:ready, infra, status:awaiting-implementation, launch:first-payment-blocker |
| #642 | [[Traveler Booking] Monitor V2 observation window and guard legacy fallback after launch](https://github.com/smallwei0301/tour-platform/issues/642) | type:investigation, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, traveler-booking, launch:post-first-payment |
| #605 | [[Launch Content] Strict Andy Lee listing content gate before public exposure](https://github.com/smallwei0301/tour-platform/issues/605) | triaged, type:investigation, priority:P1, qa, agent:backlog, owner:mixed, type:docs, docs, status:awaiting-implementation, launch:first-payment-blocker |
| #319 | [[Ops] Run customer support SOP first-case drill follow-through](https://github.com/smallwei0301/tour-platform/issues/319) | triaged, priority:P1, qa, agent:backlog, owner:mixed, status:ready, type:qa |
| #318 | [[Ops] Run Andy Lee first-guide onboarding demo and retrospective scope](https://github.com/smallwei0301/tour-platform/issues/318) | triaged, type:investigation, priority:P1, agent:backlog, owner:mixed, status:ready, admin-guides |

### P2 (15)

| # | Title | Labels |
|---|-------|--------|
| #1214 | [[Ops] Fix Booking V2 Go/No-Go zero-sample decision semantics](https://github.com/smallwei0301/tour-platform/issues/1214) | triaged, type:optimization, priority:P2, qa, agent:backlog, owner:ai-agent, status:ready, traveler-booking, infra, booking-v2 |
| #1212 | [[Booking V2] Cross-surface QA: Admin / Guide / Traveler must show the same blocked reason for the same input (#1196 follow-up)](https://github.com/smallwei0301/tour-platform/issues/1212) | priority:P2, qa, guide-dashboard, owner:ai-agent, status:ready, type:qa, traveler-booking, booking-v2, admin |
| #1197 | [[daily bug scan] tour-platform 2026-06-04](https://github.com/smallwei0301/tour-platform/issues/1197) | triaged, type:bug, priority:P2, qa, owner:ai-agent, status:needs-repro, traveler-booking |
| #1189 | [[Docs] Archive or refresh stale root migration rollback automation notes](https://github.com/smallwei0301/tour-platform/issues/1189) | triaged, priority:P2, agent:backlog, owner:ai-agent, status:ready, type:docs, database, infra, docs |
| #1176 | [[daily bug scan] tour-platform 2026-06-03](https://github.com/smallwei0301/tour-platform/issues/1176) | triaged, type:bug, priority:P2, qa, owner:ai-agent, status:needs-repro, traveler-booking |
| #1175 | [[Post-Trip Ops] Automate review invitation sweep after delivery log](https://github.com/smallwei0301/tour-platform/issues/1175) | triaged, type:feature, priority:P2, qa, agent:backlog, owner:ai-agent, status:blocked, orders, notifications, infra, launch:post-first-payment |
| #1174 | [[Post-Trip Ops] Add review invitation delivery log and idempotency guard](https://github.com/smallwei0301/tour-platform/issues/1174) | triaged, type:feature, priority:P2, qa, agent:backlog, owner:ai-agent, status:ready, orders, database, notifications, launch:post-first-payment |
| #1173 | [[Frontend Daily Check] 2026-06-03 frontend checks blocked by missing toolchain](https://github.com/smallwei0301/tour-platform/issues/1173) | triaged, type:bug, priority:P2, qa, owner:ai-agent, status:ready, traveler-booking |
| #1171 | [[Post-Trip Ops] Add guide trip report submission storage and API](https://github.com/smallwei0301/tour-platform/issues/1171) | triaged, type:feature, priority:P2, qa, guide-dashboard, agent:backlog, owner:ai-agent, status:ready, orders, database, launch:post-first-payment |
| #1106 | [[Post-Trip Ops] Implement completion, review invitation, guide report, and payout eligibility workflow](https://github.com/smallwei0301/tour-platform/issues/1106) | triaged, type:feature, priority:P2, qa, agent:backlog, owner:ai-agent, status:ready, payments, orders, notifications, launch:post-first-payment |
| #926 | [[Ops] Add LINE/LIFF Messaging API rollout evidence gate after #920](https://github.com/smallwei0301/tour-platform/issues/926) | triaged, priority:P2, qa, agent:backlog, owner:mixed, status:blocked, type:qa, auth, notifications, infra |
| #797 | [[Compliance] Internal conservative incident reporting playbook for soft launch](https://github.com/smallwei0301/tour-platform/issues/797) | triaged, priority:P2, security, owner:ai-agent, infra, docs, status:awaiting-implementation |
| #724 | [[Ops] Execute Supabase live restore drill within 7 days after soft launch](https://github.com/smallwei0301/tour-platform/issues/724) | triaged, type:investigation, priority:P2, agent:backlog, owner:mixed, database, infra, status:awaiting-implementation, launch:post-first-payment |
| #685 | [[Monitoring] Add simple outside website monitor after soft launch](https://github.com/smallwei0301/tour-platform/issues/685) | triaged, type:optimization, priority:P2, qa, agent:backlog, owner:ai-agent, infra, status:awaiting-implementation, launch:post-first-payment |
| #320 | [[Launch] Public soft launch with restricted booking and Go/No-Go gate](https://github.com/smallwei0301/tour-platform/issues/320) | triaged, priority:P2, agent:queued, infra, status:awaiting-implementation, launch:first-payment-blocker |

### Human-Decision (0)

_none_

### Other (1)

| # | Title | Labels |
|---|-------|--------|
| #1213 | [[Admin/Booking V2] Pre-populate remaining plan-derived fields in the schedule-create modal (#1196 follow-up)](https://github.com/smallwei0301/tour-platform/issues/1213) | type:feature, agent:backlog, owner:ai-agent, status:ready, priority:P3, booking-v2, admin |

---

## Recent Merged PRs (last 10)

| # | Title | Merged |
|---|-------|--------|
| #1211 | [fix(booking-v2): clarify field precedence across admin + guide UI + lock resolver contract (#1196 first slice)](https://github.com/smallwei0301/tour-platform/pull/1211) | 2026-06-04 |
| #1208 | [test(e2e): admin login goes through the API, not the form (closes #1206)](https://github.com/smallwei0301/tour-platform/pull/1208) | 2026-06-04 |
| #1207 | [feat(post-trip): guide_trip_reports storage + authz/idempotency helpers (refs #1171, backend slice)](https://github.com/smallwei0301/tour-platform/pull/1207) | 2026-06-04 |
| #1205 | [test(e2e): add focused availability taxonomy smoke under resource gate (closes #1203)](https://github.com/smallwei0301/tour-platform/pull/1205) | 2026-06-04 |
| #1204 | [feat(post-trip): review_invitations delivery log + eligibility/idempotency helpers (refs #1174, backend slice)](https://github.com/smallwei0301/tour-platform/pull/1204) | 2026-06-04 |
| #1202 | [docs(ops): alert-drill readiness refresh + LINE-vs-Telegram decision (#1201)](https://github.com/smallwei0301/tour-platform/pull/1202) | 2026-06-03 |
| #1200 | [docs(ops): Booking V2 observation-window day-0 readiness snapshot (#1199)](https://github.com/smallwei0301/tour-platform/pull/1200) | 2026-06-03 |
| #1194 | [fix(admin): remove silent archive→inactive fallback in plan DELETE handler (#1179)](https://github.com/smallwei0301/tour-platform/pull/1194) | 2026-06-03 |
| #1193 | [fix(admin): gate schedule modal dropdown by active V2 plan count (#1178)](https://github.com/smallwei0301/tour-platform/pull/1193) | 2026-06-03 |
| #1192 | [qa(#1177): daily QA checklist evidence gate 2026-06-03](https://github.com/smallwei0301/tour-platform/pull/1192) | 2026-06-03 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
