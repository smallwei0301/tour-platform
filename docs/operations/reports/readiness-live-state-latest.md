<!-- query_timestamp: 2026-06-04T18:52:14.527Z -->
<!-- freshness_rule: auto-refreshed every 6h via CI; stale threshold: 12h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-06-04T18:52:14.527Z  
**Commit SHA:** `7b5238ad7d65ad8e6799e1a19e4c08e78ee034c1`

---

## Open PRs (2)

| # | Title | Branch |
|---|-------|--------|
| #1210 | [test(toolchain): pin eslint-config-next major to next major to prevent circular config regression (closes #1195)](https://github.com/smallwei0301/tour-platform/pull/1210) | `claude/fix-1195-eslint-version-guard` |
| #920 | [feat(line): 接上 LINE Login/LIFF 綁定、webhook、Messaging API 旅客推播（全鏈路，flag 預設 OFF）](https://github.com/smallwei0301/tour-platform/pull/920) | `claude/line-integration-plan-a26p7` |

## Open Issues (19 total)

### P0 (1)

| # | Title | Labels |
|---|-------|--------|
| #1121 | [[Security] Rotate all credentials exposed in git history (service_role JWT × 7, sbp_ PAT × 5, admin token × 10, anon JWT × 4) — pre-launch final check](https://github.com/smallwei0301/tour-platform/issues/1121) | type:bug, priority:P0, security, owner:mixed, status:awaiting-implementation, launch:first-payment-blocker |

### P1 (7)

| # | Title | Labels |
|---|-------|--------|
| #1221 | [[Post-Trip Ops] Enforce payout hold for disputed/refunded/complaint orders in settlement pipeline](https://github.com/smallwei0301/tour-platform/issues/1221) | triaged, type:feature, priority:P1, agent:backlog, owner:ai-agent, status:ready, payments, orders, launch:post-first-payment |
| #1067 | [[Guide Dashboard] Design V2 activity management and prevent half-day/full-day guide overbooking](https://github.com/smallwei0301/tour-platform/issues/1067) | priority:P1, guide-dashboard, owner:mixed, status:ready, type:decision, booking-v2 |
| #714 | [[Ops] Run real alert drill before first payment](https://github.com/smallwei0301/tour-platform/issues/714) | triaged, type:investigation, priority:P1, agent:queued, owner:ai-agent, status:ready, infra, status:awaiting-implementation, launch:first-payment-blocker |
| #642 | [[Traveler Booking] Monitor V2 observation window and guard legacy fallback after launch](https://github.com/smallwei0301/tour-platform/issues/642) | type:investigation, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, traveler-booking, launch:post-first-payment |
| #605 | [[Launch Content] Strict Andy Lee listing content gate before public exposure](https://github.com/smallwei0301/tour-platform/issues/605) | triaged, type:investigation, priority:P1, qa, agent:backlog, owner:mixed, type:docs, docs, status:awaiting-implementation, launch:first-payment-blocker |
| #319 | [[Ops] Run customer support SOP first-case drill follow-through](https://github.com/smallwei0301/tour-platform/issues/319) | triaged, priority:P1, qa, agent:backlog, owner:mixed, status:ready, type:qa |
| #318 | [[Ops] Run Andy Lee first-guide onboarding demo and retrospective scope](https://github.com/smallwei0301/tour-platform/issues/318) | triaged, type:investigation, priority:P1, agent:backlog, owner:mixed, status:ready, admin-guides |

### P2 (10)

| # | Title | Labels |
|---|-------|--------|
| #1212 | [[Booking V2] Cross-surface QA: Admin / Guide / Traveler must show the same blocked reason for the same input (#1196 follow-up)](https://github.com/smallwei0301/tour-platform/issues/1212) | priority:P2, qa, guide-dashboard, owner:ai-agent, status:ready, type:qa, traveler-booking, booking-v2, admin |
| #1197 | [[daily bug scan] tour-platform 2026-06-04](https://github.com/smallwei0301/tour-platform/issues/1197) | triaged, type:bug, priority:P2, qa, owner:ai-agent, status:needs-repro, traveler-booking |
| #1176 | [[daily bug scan] tour-platform 2026-06-03](https://github.com/smallwei0301/tour-platform/issues/1176) | triaged, type:bug, priority:P2, qa, owner:ai-agent, status:needs-repro, traveler-booking |
| #1175 | [[Post-Trip Ops] Automate review invitation sweep after delivery log](https://github.com/smallwei0301/tour-platform/issues/1175) | triaged, type:feature, priority:P2, qa, agent:backlog, owner:ai-agent, status:blocked, orders, notifications, infra, launch:post-first-payment |
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
| #1229 | [chore: untrack apps/web/tsconfig.tsbuildinfo (#1216)](https://github.com/smallwei0301/tour-platform/pull/1229) | 2026-06-04 |
| #1228 | [docs(post-trip): align runbook with PR #1222 reality (closes #1225)](https://github.com/smallwei0301/tour-platform/pull/1228) | 2026-06-04 |
| #1227 | [fix(rollout): gate PAYMENT_SUCCESS_LOW/CHECKOUT_SUCCESS_LOW behind sample-size adequacy (#1214)](https://github.com/smallwei0301/tour-platform/pull/1227) | 2026-06-04 |
| #1226 | [docs(issue-1189): archive stale migration notes, remove scripts with hardcoded project ref](https://github.com/smallwei0301/tour-platform/pull/1226) | 2026-06-04 |
| #1224 | [feat(admin): add plan season editor UI](https://github.com/smallwei0301/tour-platform/pull/1224) | 2026-06-04 |
| #1223 | [feat(post-trip): wire review invitation idempotency guard + delivery log (closes #1174)](https://github.com/smallwei0301/tour-platform/pull/1223) | 2026-06-04 |
| #1222 | [feat(post-trip): add guide trip-report submit endpoint + wire submitted_at in read routes (closes #1171)](https://github.com/smallwei0301/tour-platform/pull/1222) | 2026-06-04 |
| #1220 | [feat(notifications): migrate incident alerting bus from LINE Notify to Telegram (closes #1215)](https://github.com/smallwei0301/tour-platform/pull/1220) | 2026-06-04 |
| #1219 | [feat(admin): add activity plan seasons API slice](https://github.com/smallwei0301/tour-platform/pull/1219) | 2026-06-04 |
| #1217 | [feat(availability-v2): clarify field precedence with tests + zh-TW helper copy (closes #1196)](https://github.com/smallwei0301/tour-platform/pull/1217) | 2026-06-04 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
