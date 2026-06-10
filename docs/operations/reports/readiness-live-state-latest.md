<!-- query_timestamp: 2026-06-10T07:35:39.399Z -->
<!-- freshness_rule: auto-refreshed every 6h via CI; stale threshold: 12h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-06-10T07:35:39.399Z  
**Commit SHA:** `729ac8e3efcaa7d2e591cdb161e98e730aa27478`

---

## Open PRs (2)

| # | Title | Branch |
|---|-------|--------|
| #1356 | [chore(lint): add pre-lint Node 22 guard with actionable message on Node ≥24 (#1335)](https://github.com/smallwei0301/tour-platform/pull/1356) | `claude/issue-1335-lint-node-guard` |
| #920 | [feat(line): 接上 LINE Login/LIFF 綁定、webhook、Messaging API 旅客推播（全鏈路，flag 預設 OFF）](https://github.com/smallwei0301/tour-platform/pull/920) | `claude/line-integration-plan-a26p7` |

## Open Issues (19 total)

### P0 (0)

_none_

### P1 (8)

| # | Title | Labels |
|---|-------|--------|
| #1317 | [[Production Smoke] Owner-only acceptance verification gaps from recent close-gate sweep (#1306 / #1289 / #1290 OFF / #1286 UI / #1307 TZ)](https://github.com/smallwei0301/tour-platform/issues/1317) | priority:P1, type:qa, owner:human, production-smoke, post-merge |
| #1301 | [[GH-1290][CloseGate] Runtime smoke does not re-emit 10:30 after migration apply](https://github.com/smallwei0301/tour-platform/issues/1301) | triaged, type:bug, priority:P1, guide-dashboard, owner:ai-agent, status:ready, traveler-booking, booking-v2, regression |
| #1293 | [[Ops] Add production migration apply ledger and verified release gate after #1286 drift](https://github.com/smallwei0301/tour-platform/issues/1293) | triaged, type:optimization, priority:P1, agent:backlog, owner:mixed, status:needs-decision, database, infra, docs |
| #714 | [[Ops] Run real alert drill before first payment](https://github.com/smallwei0301/tour-platform/issues/714) | triaged, type:investigation, priority:P1, agent:backlog, owner:mixed, status:blocked, infra, status:awaiting-implementation, launch:first-payment-blocker |
| #642 | [[需 Operator][Traveler Booking] Monitor V2 observation window and guard legacy fallback after launch](https://github.com/smallwei0301/tour-platform/issues/642) | type:investigation, priority:P1, qa, agent:backlog, owner:mixed, status:ready, traveler-booking, launch:post-first-payment |
| #605 | [[Launch Content] Strict Andy Lee listing content gate before public exposure](https://github.com/smallwei0301/tour-platform/issues/605) | triaged, type:investigation, priority:P1, qa, agent:backlog, owner:mixed, type:docs, docs, status:awaiting-implementation, launch:first-payment-blocker |
| #319 | [[Ops] Run customer support SOP first-case drill follow-through](https://github.com/smallwei0301/tour-platform/issues/319) | triaged, priority:P1, qa, agent:backlog, owner:mixed, status:ready, type:qa |
| #318 | [[Ops] Run Andy Lee first-guide onboarding demo and retrospective scope](https://github.com/smallwei0301/tour-platform/issues/318) | triaged, type:investigation, priority:P1, agent:backlog, owner:mixed, status:ready, admin-guides |

### P2 (9)

| # | Title | Labels |
|---|-------|--------|
| #1344 | [[Perf][P2] Mobile LCP regression on /activities — 10–12s vs 2s desktop](https://github.com/smallwei0301/tour-platform/issues/1344) | type:bug, priority:P2, owner:ai-agent, traveler-booking, performance |
| #1336 | [[Ops/Infra] 設定 INTERNAL_ALERT_TOKEN 並啟用 6 個 internal cron sweep endpoints](https://github.com/smallwei0301/tour-platform/issues/1336) | triaged, priority:P2, infra, launch:post-first-payment |
| #1321 | [[#1212 follow-up] AC#2 vs AC#4 tension — Traveler dynamic-interpolation messageZh wiring needs product decision](https://github.com/smallwei0301/tour-platform/issues/1321) | priority:P2, type:decision, booking-v2, owner:human, ux-copy |
| #1280 | [[Decision] Decide fate and slicing plan for stale LINE/LIFF PR #920 before further drift](https://github.com/smallwei0301/tour-platform/issues/1280) | triaged, priority:P2, agent:backlog, owner:mixed, status:needs-decision, type:decision, auth, notifications, infra |
| #926 | [[Ops] Add LINE/LIFF Messaging API rollout evidence gate after #920](https://github.com/smallwei0301/tour-platform/issues/926) | triaged, priority:P2, qa, agent:backlog, owner:mixed, status:blocked, type:qa, auth, notifications, infra |
| #797 | [[Compliance] Internal conservative incident reporting playbook for soft launch](https://github.com/smallwei0301/tour-platform/issues/797) | triaged, priority:P2, security, owner:ai-agent, infra, docs, status:awaiting-implementation |
| #724 | [[Ops] Execute Supabase live restore drill within 7 days after soft launch](https://github.com/smallwei0301/tour-platform/issues/724) | triaged, type:investigation, priority:P2, agent:backlog, owner:mixed, database, infra, status:awaiting-implementation, launch:post-first-payment |
| #685 | [[Monitoring] Add simple outside website monitor after soft launch](https://github.com/smallwei0301/tour-platform/issues/685) | triaged, type:optimization, priority:P2, qa, agent:backlog, owner:ai-agent, infra, status:awaiting-implementation, launch:post-first-payment |
| #320 | [[Launch] Public soft launch with restricted booking and Go/No-Go gate](https://github.com/smallwei0301/tour-platform/issues/320) | triaged, priority:P2, agent:queued, infra, status:awaiting-implementation, launch:first-payment-blocker |

### Human-Decision (0)

_none_

### Other (2)

| # | Title | Labels |
|---|-------|--------|
| #1335 | [[Test Infra] Daily bug scan 在 Node 24 對 `npm run lint` 誤報 — 讓 ESLint 對 Node 24 有韌性／掃描器改用 pin 的 Node 22](https://github.com/smallwei0301/tour-platform/issues/1335) | type:investigation, qa, owner:ai-agent, status:ready, priority:P3, infra |
| #1121 | [[Security] Rotate all credentials exposed in git history (service_role JWT × 7, sbp_ PAT × 5, admin token × 10, anon JWT × 4) — 正式上線前執行](https://github.com/smallwei0301/tour-platform/issues/1121) | type:bug, security, owner:mixed, status:needs-decision, launch:post-first-payment |

---

## Recent Merged PRs (last 10)

| # | Title | Merged |
|---|-------|--------|
| #1355 | [docs(ops): refresh routing doc + add source-contract test (closes #1265)](https://github.com/smallwei0301/tour-platform/pull/1355) | 2026-06-10 |
| #1354 | [fix(activities): 補 loading.tsx 讓 region 頁 streaming fallback 真正渲染（refs #1345 part 5）](https://github.com/smallwei0301/tour-platform/pull/1354) | 2026-06-10 |
| #1353 | [test(post-trip): lock the unified post-trip workflow as one verifiable contract (#1106)](https://github.com/smallwei0301/tour-platform/pull/1353) | 2026-06-10 |
| #1352 | [docs(claude): 新增 session branch hygiene 段落（patch-id 驗證 + force-push-with-lease SOP）](https://github.com/smallwei0301/tour-platform/pull/1352) | 2026-06-10 |
| #1351 | [fix(activities): skeleton min-height 對齊 real card 解 region page CLS（refs #1345 part 4）](https://github.com/smallwei0301/tour-platform/pull/1351) | 2026-06-10 |
| #1350 | [fix(activities): Suspense 改 same-footprint skeleton 消除 streaming CLS（refs #1345 part 3）](https://github.com/smallwei0301/tour-platform/pull/1350) | 2026-06-10 |
| #1349 | [fix(layout): Noto Sans TC 改 display: optional 消除中文字體 swap-shift（refs #1345 part 2）](https://github.com/smallwei0301/tour-platform/pull/1349) | 2026-06-10 |
| #1348 | [fix(activities): widen image priority + add responsive sizes to fix mobile LCP (closes #1344)](https://github.com/smallwei0301/tour-platform/pull/1348) | 2026-06-10 |
| #1347 | [fix(activities): skip mount-time refetch when SSR shipped cards (closes #1345)](https://github.com/smallwei0301/tour-platform/pull/1347) | 2026-06-10 |
| #1346 | [docs(claude): document the e2e-smoke CI lane in the testing policy](https://github.com/smallwei0301/tour-platform/pull/1346) | 2026-06-10 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
