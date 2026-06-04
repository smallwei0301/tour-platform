<!-- query_timestamp: 2026-06-04T01:03:57.522Z -->
<!-- freshness_rule: auto-refreshed every 6h via CI; stale threshold: 12h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-06-04T01:03:57.522Z  
**Commit SHA:** `fe47828fe76e473c8fc3c4601d62dafd71feebc6`

---

## Open PRs (7)

| # | Title | Branch |
|---|-------|--------|
| #1187 | [docs(incident): cross-reference Supabase backup runbook + add §6.1 P0/P1 data-consistency checklist (closes #594)](https://github.com/smallwei0301/tour-platform/pull/1187) | `claude/fix-594-incident-response-backup-xref` |
| #1186 | [docs(incident): add §8.6 sign-off decision log + soft-launch conservative defaults (refs #797)](https://github.com/smallwei0301/tour-platform/pull/1186) | `claude/fix-797-incident-response-signoff` |
| #1185 | [fix(types): replace supabase: any with SupabaseClient in booking-critical lib files (closes #1103)](https://github.com/smallwei0301/tour-platform/pull/1185) | `claude/fix-1103-supabase-client-type` |
| #1184 | [fix(booking-v2): include end_at in activity_schedules SELECT so plan-schedule mismatch check actually fires (closes #1115)](https://github.com/smallwei0301/tour-platform/pull/1184) | `claude/fix-1110-followup-end-at-select` |
| #1183 | [chore(security): remove leaked admin-token literal from WEAK_TOKEN_VALUES + add length-floor regression test (refs #1121)](https://github.com/smallwei0301/tour-platform/pull/1183) | `claude/fix-secrets-security-env-literal` |
| #1182 | [chore(security): untrack supabase/.temp CLI scratch + add to .gitignore (refs #1121)](https://github.com/smallwei0301/tour-platform/pull/1182) | `claude/fix-secrets-untrack-supabase-temp` |
| #920 | [feat(line): 接上 LINE Login/LIFF 綁定、webhook、Messaging API 旅客推播（全鏈路，flag 預設 OFF）](https://github.com/smallwei0301/tour-platform/pull/920) | `claude/line-integration-plan-a26p7` |

## Open Issues (25 total)

### P0 (1)

| # | Title | Labels |
|---|-------|--------|
| #1121 | [[Security] Rotate all credentials exposed in git history (service_role JWT × 7, sbp_ PAT × 5, admin token × 10, anon JWT × 4) — pre-launch final check](https://github.com/smallwei0301/tour-platform/issues/1121) | type:bug, priority:P0, security, owner:mixed, status:awaiting-implementation, launch:first-payment-blocker |

### P1 (9)

| # | Title | Labels |
|---|-------|--------|
| #1198 | [[QA] Daily test checklist for recent merged PRs 2026-06-04](https://github.com/smallwei0301/tour-platform/issues/1198) | triaged, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, type:qa, booking-v2, admin |
| #1196 | [[Admin/Booking V2] Clarify unified availability field precedence across admin, guide, and traveler](https://github.com/smallwei0301/tour-platform/issues/1196) | triaged, type:feature, priority:P1, qa, guide-dashboard, agent:backlog, owner:ai-agent, status:ready, traveler-booking, booking-v2, admin |
| #1188 | [[QA] Verify post-#1180/#1181 Booking V2 conflict override RLS slice](https://github.com/smallwei0301/tour-platform/issues/1188) | triaged, priority:P1, qa, agent:backlog, owner:ai-agent, status:ready, type:qa, traveler-booking, database, rls, booking-v2 |
| #1067 | [[Guide Dashboard] Design V2 activity management and prevent half-day/full-day guide overbooking](https://github.com/smallwei0301/tour-platform/issues/1067) | priority:P1, guide-dashboard, owner:mixed, status:ready, type:decision, booking-v2 |
| #714 | [[Ops] Run real alert drill before first payment](https://github.com/smallwei0301/tour-platform/issues/714) | triaged, type:investigation, priority:P1, agent:queued, owner:ai-agent, status:ready, infra, status:awaiting-implementation, launch:first-payment-blocker |
| #642 | [[Traveler Booking] Monitor V2 observation window and guard legacy fallback after launch](https://github.com/smallwei0301/tour-platform/issues/642) | type:investigation, priority:P1, qa, agent:queued, owner:ai-agent, status:ready, traveler-booking, launch:post-first-payment |
| #605 | [[Launch Content] Strict Andy Lee listing content gate before public exposure](https://github.com/smallwei0301/tour-platform/issues/605) | triaged, type:investigation, priority:P1, qa, agent:backlog, owner:mixed, type:docs, docs, status:awaiting-implementation, launch:first-payment-blocker |
| #319 | [[Ops] Run customer support SOP first-case drill follow-through](https://github.com/smallwei0301/tour-platform/issues/319) | triaged, priority:P1, qa, agent:backlog, owner:mixed, status:ready, type:qa |
| #318 | [[Ops] Run Andy Lee first-guide onboarding demo and retrospective scope](https://github.com/smallwei0301/tour-platform/issues/318) | triaged, type:investigation, priority:P1, agent:backlog, owner:mixed, status:ready, admin-guides |

### P2 (15)

| # | Title | Labels |
|---|-------|--------|
| #1197 | [[daily bug scan] tour-platform 2026-06-04](https://github.com/smallwei0301/tour-platform/issues/1197) | triaged, type:bug, priority:P2, qa, owner:ai-agent, status:needs-repro, traveler-booking |
| #1195 | [[Frontend Daily Check] 2026-06-04 lint blocked by ESLint circular config error](https://github.com/smallwei0301/tour-platform/issues/1195) | triaged, type:bug, priority:P2, qa, owner:ai-agent, status:ready, traveler-booking |
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
| #1202 | [docs(ops): alert-drill readiness refresh + LINE-vs-Telegram decision (#1201)](https://github.com/smallwei0301/tour-platform/pull/1202) | 2026-06-03 |
| #1200 | [docs(ops): Booking V2 observation-window day-0 readiness snapshot (#1199)](https://github.com/smallwei0301/tour-platform/pull/1200) | 2026-06-03 |
| #1194 | [fix(admin): remove silent archive→inactive fallback in plan DELETE handler (#1179)](https://github.com/smallwei0301/tour-platform/pull/1194) | 2026-06-03 |
| #1193 | [fix(admin): gate schedule modal dropdown by active V2 plan count (#1178)](https://github.com/smallwei0301/tour-platform/pull/1193) | 2026-06-03 |
| #1192 | [qa(#1177): daily QA checklist evidence gate 2026-06-03](https://github.com/smallwei0301/tour-platform/pull/1192) | 2026-06-03 |
| #1191 | [qa(#1124): evidence gate for 2026-06-02 merged fixes #1107/#1109/#1111/#1114/#1116/#1120](https://github.com/smallwei0301/tour-platform/pull/1191) | 2026-06-03 |
| #1190 | [qa(#1083): verify post-1076/1080/1082 Booking V2 SOT evidence gate](https://github.com/smallwei0301/tour-platform/pull/1190) | 2026-06-03 |
| #1181 | [feat: add conflict override RLS migration slice](https://github.com/smallwei0301/tour-platform/pull/1181) | 2026-06-03 |
| #1180 | [Booking V2 conflict override compatibility slice (Refs #1067)](https://github.com/smallwei0301/tour-platform/pull/1180) | 2026-06-03 |
| #1172 | [feat(post-trip): admin send-review-invitation endpoint (#1170)](https://github.com/smallwei0301/tour-platform/pull/1172) | 2026-06-02 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
