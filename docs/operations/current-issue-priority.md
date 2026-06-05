# Current Issue Priority Queue

Updated: 2026-06-05 16:11 CST (GH-1231 live routing refresh)

Repo: `smallwei0301/tour-platform`

## Purpose

This is a bounded routing snapshot for agents and operators. It is **not** live truth and must not be treated as a permanent queue.

Use this file to avoid obvious stale-routing mistakes, then re-check live GitHub state before dispatching or changing issue labels.

## Live-source requirements

- Canonical auto snapshot: `docs/operations/reports/readiness-live-state-latest.md`
- Refresh command: `npm run readiness:snapshot`
- Live issue query:
  ```bash
  gh issue list --repo smallwei0301/tour-platform --state open --limit 120 \
    --json number,title,labels,updatedAt,url
  ```
- Per-issue verification:
  ```bash
  gh issue view <n> --repo smallwei0301/tour-platform --json number,state,title,labels,comments,url
  ```

If live checks cannot run, stop routing and ask for unblock.

## Agent routing labels vs business priority labels

- `priority:P0`, `priority:P1`, `priority:P2`: business urgency / launch risk.
- `agent:now`, `agent:next`, `agent:queued`, `agent:backlog`: execution routing.
- `status:blocked`, `owner:mixed`, `owner:human-decision`, `security`, `payment`, `auth`, `db-migration`, and `secrets` can override agent routing.

Label meanings:

- `agent:now`: the single default issue agents should pull first **only when it is not blocked and not high-risk without approval**.
- `agent:next`: next safe issue or parallel follow-up after prerequisites.
- `agent:queued`: ordered queue; start only after prerequisites or explicit Ava/user routing.
- `agent:backlog`: important supporting readiness; not the default pickup target.

## Current top pointer

Live state now has an open P0:

- **#1121 — `[Security] Rotate all credentials exposed in git history ...`**
  - Labels observed: `type:bug`, `priority:P0`, `security`, `owner:mixed`, `status:awaiting-implementation`, `launch:first-payment-blocker`
  - Routing: **top business blocker, not automatic agent pickup**. This is a secrets/security rotation issue and needs an owner-approved execution plan plus careful evidence handling.
  - Do not let lower-priority `agent:*` work pretend there is no open P0.

Current `agent:now` recommendation: **none** until Ava/user explicitly routes a safe slice around #1121 or chooses to proceed with a lower-risk issue despite the P0.

Current safe next candidate after explicit routing:

- **#1254 — `[Admin/Post-Trip] post-trip-summary API returns 500 ...`**
  - Labels observed: `priority:P1`, `agent:next`, `owner:ai-agent`, `status:ready`, `orders`, `admin`
  - Routing: backend/API investigation candidate if user chooses product follow-up after acknowledging #1121.

## Agent Routing Invariants

- Never claim that active P0 work is zero unless live GitHub and the readiness snapshot both show zero P0 issues.
- `agent:now` must be at most one OPEN issue.
- Do not set `agent:now` on a high-risk issue (`security`, `secrets`, `payment`, `auth`, `db-migration`) unless the owner-approved execution scope is explicit.
- Closed or historical issues must not be treated as active routing targets.
- Agents must re-check live GitHub state before dispatch because this file is a bounded snapshot.
- Business priority labels and execution routing labels are separate signals and must both be reflected accurately.

## P0 / first-payment blockers

1. **#1121 — [Security] Rotate all credentials exposed in git history** `business-top-blocker`
   - State: OPEN
   - Labels: `priority:P0`, `security`, `owner:mixed`, `status:awaiting-implementation`, `launch:first-payment-blocker`
   - Routing: owner/security-controlled. Do not auto-run credential rotation from a generic builder card.
   - Done signal: rotated credentials verified, old credentials invalidated, secret scan/evidence attached without exposing values.

2. **#714 — [Ops] Run real alert drill before first payment** `blocked`
   - State: OPEN
   - Labels observed after preflight: `priority:P1`, `agent:queued`, `owner:mixed`, `status:blocked`, `infra`, `launch:first-payment-blocker`
   - Routing: blocked on production provisioning/schema readiness; do not trigger live drill until production `incidents` table, soft-launch audit path, `SENTRY_DSN`, and `TELEGRAM_ALERT_*` are confirmed.
   - Latest blocker evidence: issue comment from 2026-06-05 preflight.

3. **#605 — [Launch Content] Strict Andy Lee listing content gate before public exposure** `owner-mixed`
   - State: OPEN
   - Labels: `priority:P1`, `agent:backlog`, `owner:mixed`, `docs`, `status:awaiting-implementation`, `launch:first-payment-blocker`
   - Routing: content/owner mixed; require current content evidence and owner-sensitive media/privacy handling.

4. **#320 — [Launch] Public soft launch with restricted booking and Go/No-Go gate** `queued-gate`
   - State: OPEN
   - Labels: `priority:P2`, `agent:queued`, `infra`, `status:awaiting-implementation`, `launch:first-payment-blocker`
   - Routing: Go/No-Go dashboard/checklist issue; only advance after upstream blockers have credible evidence.

## P1 / ready or queued product/ops work

1. **#1254 — [Admin/Post-Trip] post-trip-summary API returns 500** `agent:next`
   - State: OPEN
   - Labels: `priority:P1`, `agent:next`, `owner:ai-agent`, `status:ready`, `orders`, `admin`
   - Routing: API/backend candidate after P0 acknowledgement; likely Anna/tp-builder-api with Rita review.

2. **#642 — [Traveler Booking] Monitor V2 observation window and guard legacy fallback after launch** `agent:queued`
   - State: OPEN
   - Labels: `priority:P1`, `agent:queued`, `owner:ai-agent`, `status:ready`, `traveler-booking`, `launch:post-first-payment`
   - Routing: post-first-payment observation, not a first-payment unblocker.

3. **#319 — [Ops] Run customer support SOP first-case drill follow-through** `agent:backlog`
   - State: OPEN
   - Labels: `priority:P1`, `agent:backlog`, `owner:mixed`, `status:ready`, `type:qa`
   - Routing: mixed ops drill; prepare evidence, but confirm owner/human pieces before completion.

4. **#318 — [Ops] Run Andy Lee first-guide onboarding demo and retrospective scope** `agent:backlog`
   - State: OPEN
   - Labels: `priority:P1`, `agent:backlog`, `owner:mixed`, `status:ready`, `admin-guides`
   - Routing: owner/guide-facing demo; do not post private guide evidence publicly.

## P2 / launch support and readiness backlog

1. **#1231 — [Ops] Refresh current issue priority routing after #1121 P0 appears** `current-doc-fix`
   - State: OPEN while this branch/PR is in progress.
   - Labels: `priority:P2`, `agent:backlog`, `owner:ai-agent`, `status:ready`, `type:docs`, `infra`, `docs`
   - Routing: this doc refresh. Close only after PR merge or accepted docs evidence.

2. **#1106 — [Post-Trip Ops] Implement completion, review invitation, guide report, and payout eligibility workflow** `agent:backlog`
   - State: OPEN
   - Labels: `priority:P2`, `agent:backlog`, `owner:ai-agent`, `status:ready`, `payments`, `orders`, `notifications`, `launch:post-first-payment`
   - Routing: post-first-payment feature, not launch gate.

3. **#1175 — [Post-Trip Ops] Automate review invitation sweep after delivery log** `blocked`
   - State: OPEN
   - Labels: `priority:P2`, `agent:backlog`, `status:blocked`, `orders`, `notifications`, `infra`, `launch:post-first-payment`
   - Routing: do not start while blocked.

4. **#926 — [Ops] Add LINE/LIFF Messaging API rollout evidence gate after #920** `blocked`
   - State: OPEN
   - Labels: `priority:P2`, `agent:backlog`, `owner:mixed`, `status:blocked`, `auth`, `notifications`, `infra`
   - Routing: blocked by LINE/LIFF rollout state.

5. **#797 — [Compliance] Internal conservative incident reporting playbook for soft launch** `awaiting-implementation`
   - State: OPEN
   - Labels: `priority:P2`, `security`, `owner:ai-agent`, `infra`, `docs`, `status:awaiting-implementation`
   - Routing: docs/security playbook; safe only if it does not claim legal advice or expose incident details.

6. **#724 — [Ops] Execute Supabase live restore drill within 7 days after soft launch** `post-first-payment`
   - State: OPEN
   - Labels: `priority:P2`, `agent:backlog`, `owner:mixed`, `database`, `infra`, `status:awaiting-implementation`, `launch:post-first-payment`
   - Routing: read-only planning first; live restore drill needs explicit operator approval.

7. **#685 — [Monitoring] Add simple outside website monitor after soft launch** `post-first-payment`
   - State: OPEN
   - Labels: `priority:P2`, `agent:backlog`, `owner:ai-agent`, `infra`, `status:awaiting-implementation`, `launch:post-first-payment`
   - Routing: post-soft-launch monitor setup; do not confuse with #714 alert drill.

## Historical/non-routing notes

- #1237 — closed/verified after PR #1246 and owner-approved prelaunch slot seed close-gate.
- #1238 — recent admin seasons fix appears merged in latest main; verify live issue state before routing.
- #1249 — recent activities performance work appears merged via PR #1252; verify live issue state before routing.
- #621, #639, #640, #641, #813 — historical closed launch-readiness entries; do not route.

## Stale-check protocol

Before dispatch or label changes, rerun:

```bash
gh issue list --repo smallwei0301/tour-platform --state open --limit 120 \
  --json number,title,labels,updatedAt,url \
  --jq '.[] | {number,title,labels:[.labels[].name],updatedAt,url}'

npm run readiness:snapshot
```

Then verify every issue in this snapshot that is marked routing-active or blocked:

```bash
for n in 1121 1254 714 605 320 642 319 318 1231 1106 1175 926 797 724 685
 do
   gh issue view "$n" --repo smallwei0301/tour-platform \
     --json number,state,title,labels \
     --jq '{num:.number,state:.state,title:.title,labels:(.labels|map(.name))}'
 done
```

Rules:

- If a listed issue is `CLOSED`, move it to historical notes and remove it from active routing order.
- If a listed issue is `OPEN`, ensure its `priority:*`, `status:*`, owner, and `agent:*` labels are reflected before routing.
- If the readiness snapshot P0 section is non-empty, this document must name the P0 issue(s) and must not contain any “no open P0” wording.
- If any mapped labels/states changed since this snapshot, update this doc before dispatch.

## Rules for agents

1. Re-check live GitHub before acting.
2. Do not bypass #1121 merely because it lacks `agent:now`; it is the top business blocker.
3. Do not auto-execute high-risk credentials/security/auth/payment/db-migration work without explicit owner-approved scope.
4. Do not treat blocked #714 as runnable until production provisioning evidence is present.
5. After any fix/finalize, return to Rita for independent review when code or runtime behavior changed.
