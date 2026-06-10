# Current Issue Priority Queue

Updated: 2026-06-10 15:30 CST (GH-1265 post-#1254/#1231 close + #1121 label refresh)

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

`agent:now` recommendation: **none** in this snapshot. Re-check live `gh issue list` + readiness snapshot before dispatching; this file is a routing aid, not a queue.

Open security issue under owner decision (NOT a launch blocker per current labels):

- **#1121 — `[Security] Rotate all credentials exposed in git history ...`**
  - Labels observed (2026-06-10): `type:bug`, `security`, `owner:mixed`, `status:needs-decision`, `launch:post-first-payment`
  - Routing: owner/security-controlled, awaiting human decision. **Not** currently labeled `priority:P0` and **not** `launch:first-payment-blocker` — earlier snapshots that called it P0 were stale.
  - Do not auto-run credential rotation from a generic builder card.

Safe-next candidates: pull from live `gh issue list --state open --label status:ready --label owner:ai-agent` rather than hard-coding here, since they rotate quickly. Recent verified-active examples include #1301 (Booking V2 close-gate, owner smoke pending) and #1265 (this doc refresh itself).

## Agent Routing Invariants

- Never claim that active P0 work is zero unless live GitHub and the readiness snapshot both show zero P0 issues.
- `agent:now` must be at most one OPEN issue.
- Do not set `agent:now` on a high-risk issue (`security`, `secrets`, `payment`, `auth`, `db-migration`) unless the owner-approved execution scope is explicit.
- Closed or historical issues must not be treated as active routing targets.
- Agents must re-check live GitHub state before dispatch because this file is a bounded snapshot.
- Business priority labels and execution routing labels are separate signals and must both be reflected accurately.

## P0 / first-payment blockers

> **本 snapshot 時間點：live `priority:P0` 為空。** 仍保留以下幾條 `launch:first-payment-blocker` 標籤的歷史 P1 條目，方便 routing。若 readiness snapshot P0 section 又非空，**先以 live 為準更新本區段**，並把對應 issue 移上來。

1. **#714 — [Ops] Run real alert drill before first payment** `blocked`
   - State: OPEN
   - Labels observed after preflight: `priority:P1`, `agent:queued`, `owner:mixed`, `status:blocked`, `infra`, `launch:first-payment-blocker`
   - Routing: blocked on production provisioning/schema readiness; do not trigger live drill until production `incidents` table, soft-launch audit path, `SENTRY_DSN`, and `TELEGRAM_ALERT_*` are confirmed.
   - Latest blocker evidence: issue comment from 2026-06-05 preflight.

2. **#605 — [Launch Content] Strict Andy Lee listing content gate before public exposure** `owner-mixed`
   - State: OPEN
   - Labels: `priority:P1`, `agent:backlog`, `owner:mixed`, `docs`, `status:awaiting-implementation`, `launch:first-payment-blocker`
   - Routing: content/owner mixed; require current content evidence and owner-sensitive media/privacy handling.

3. **#320 — [Launch] Public soft launch with restricted booking and Go/No-Go gate** `queued-gate`
   - State: OPEN
   - Labels: `priority:P2`, `agent:queued`, `infra`, `status:awaiting-implementation`, `launch:first-payment-blocker`
   - Routing: Go/No-Go dashboard/checklist issue; only advance after upstream blockers have credible evidence.

## P1 / ready or queued product/ops work

1. **#642 — [Traveler Booking] Monitor V2 observation window and guard legacy fallback after launch** `agent:queued`
   - State: OPEN
   - Labels: `priority:P1`, `agent:queued`, `owner:ai-agent`, `status:ready`, `traveler-booking`, `launch:post-first-payment`
   - Routing: post-first-payment observation, not a first-payment unblocker.

2. **#319 — [Ops] Run customer support SOP first-case drill follow-through** `agent:backlog`
   - State: OPEN
   - Labels: `priority:P1`, `agent:backlog`, `owner:mixed`, `status:ready`, `type:qa`
   - Routing: mixed ops drill; prepare evidence, but confirm owner/human pieces before completion.

3. **#318 — [Ops] Run Andy Lee first-guide onboarding demo and retrospective scope** `agent:backlog`
   - State: OPEN
   - Labels: `priority:P1`, `agent:backlog`, `owner:mixed`, `status:ready`, `admin-guides`
   - Routing: owner/guide-facing demo; do not post private guide evidence publicly.

4. **#1301 — [GH-1290][CloseGate] Runtime smoke does not re-emit 10:30 after migration apply** `closegate-pending`
   - State: OPEN
   - Labels: `priority:P1`, `type:bug`, `owner:ai-agent`, `status:ready`, `booking-v2`, `regression`
   - Routing: all known backend fixes merged (`a6dc7f7` / `ffa2e2d` / `8b74006` / `e748ff3`) and live on `7f177fd`; remaining work is owner production close-gate smoke (build fixture → verify 10:30 → cleanup). Do not auto-mutate production data.

## P2 / launch support and readiness backlog

1. **#926 — [Ops] Add LINE/LIFF Messaging API rollout evidence gate after #920** `blocked`
   - State: OPEN
   - Labels: `priority:P2`, `agent:backlog`, `owner:mixed`, `status:blocked`, `auth`, `notifications`, `infra`
   - Routing: blocked by LINE/LIFF rollout state.

2. **#797 — [Compliance] Internal conservative incident reporting playbook for soft launch** `awaiting-implementation`
   - State: OPEN
   - Labels: `priority:P2`, `security`, `owner:ai-agent`, `infra`, `docs`, `status:awaiting-implementation`
   - Routing: docs/security playbook; safe only if it does not claim legal advice or expose incident details.

3. **#724 — [Ops] Execute Supabase live restore drill within 7 days after soft launch** `post-first-payment`
   - State: OPEN
   - Labels: `priority:P2`, `agent:backlog`, `owner:mixed`, `database`, `infra`, `status:awaiting-implementation`, `launch:post-first-payment`
   - Routing: read-only planning first; live restore drill needs explicit operator approval.

4. **#685 — [Monitoring] Add simple outside website monitor after soft launch** `post-first-payment`
   - State: OPEN
   - Labels: `priority:P2`, `agent:backlog`, `owner:ai-agent`, `infra`, `status:awaiting-implementation`, `launch:post-first-payment`
   - Routing: post-soft-launch monitor setup; do not confuse with #714 alert drill.

5. **#1336 — [Ops/Infra] 設定 INTERNAL_ALERT_TOKEN 並啟用 6 個 internal cron sweep endpoints**
   - State: OPEN
   - Labels: `triaged`, `priority:P2`, `infra`, `launch:post-first-payment`
   - Routing: human ops (Vercel project env + GitHub Actions secret 寫入); 不在 AI agent 權限範圍。

## Historical/non-routing notes

- #1106 — closed/verified 2026-06-10 after PR #1341 closed the payout-eligibility enforcement gap (Post-Trip Ops epic complete).
- #1121 — open security issue, label set 2026-06-10：`security`, `owner:mixed`, `status:needs-decision`, `launch:post-first-payment`。**not** P0, **not** `first-payment-blocker`.
- #1175 — closed/verified after PR #1282 + #1283 QA sign-off + #1336 ops follow-up.
- #1231 — closed/verified 2026-06-05 after the previous routing-doc refresh.
- #1237 — closed/verified after PR #1246 and owner-approved prelaunch slot seed close-gate.
- #1238 — closed 2026-06-05; admin seasons fix merged.
- #1249 — closed; activities performance work merged via PR #1252.
- #1254 — closed/verified 2026-06-05 after PR #1259 (post-trip-summary FK embed fix).
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
for n in 1121 714 605 320 642 319 318 1301 926 797 724 685 1336
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
