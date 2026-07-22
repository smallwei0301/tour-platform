# Current Issue Priority Queue

Updated: 2026-07-22 09:40 CST (GH-1658 post-#1656/#1654 drift refresh; #1301/#1336 closed; daily-scan duplicates #1684–#1748 consolidated into #1749)

Repo: `smallwei0301/tour-platform`

## Purpose

This is a bounded routing snapshot for agents and operators. It is **not** live truth and must not be treated as a permanent queue.

Use this file to avoid obvious stale-routing mistakes, then re-check live GitHub state before dispatching or changing issue labels.

## Live-source requirements

- Canonical auto snapshot: `docs/operations/reports/readiness-live-state-latest.md`（daily 05:00 UTC 自動刷新；stale 門檻 26h — #1654）
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
  - Labels observed (2026-07-22): `type:bug`, `security`, `owner:mixed`, `status:needs-decision`, `launch:post-first-payment`
  - Routing: owner/security-controlled, awaiting human decision. **Not** currently labeled `priority:P0` and **not** `launch:first-payment-blocker` — earlier snapshots that called it P0 were stale.
  - Do not auto-run credential rotation from a generic builder card.

Safe-next candidates: pull from live `gh issue list --state open --label status:ready --label owner:ai-agent` rather than hard-coding here, since they rotate quickly. As of this snapshot the largest ready cluster is the **daily QA checklist backlog**（#1641/#1642/#1648/#1653/#1657/#1661/#1673/#1682/#1685/#1695/#1706/#1710/#1715/#1729/#1745，`agent:queued` `owner:ai-agent` `status:ready`）— newest first; older ones may be superseded by newer checklists' 去重 sections.

## Agent Routing Invariants

- Never claim that active P0 work is zero unless live GitHub and the readiness snapshot both show zero P0 issues.
- `agent:now` must be at most one OPEN issue.
- Do not set `agent:now` on a high-risk issue (`security`, `secrets`, `payment`, `auth`, `db-migration`) unless the owner-approved execution scope is explicit.
- Closed or historical issues must not be treated as active routing targets.
- Agents must re-check live GitHub state before dispatch because this file is a bounded snapshot.
- Business priority labels and execution routing labels are separate signals and must both be reflected accurately.

## P0 / first-payment blockers

> **本 snapshot 時間點：live `priority:P0` 為空。** 仍保留以下幾條 `launch:first-payment-blocker` 標籤的歷史 P1/P2 條目，方便 routing。若 readiness snapshot P0 section 又非空，**先以 live 為準更新本區段**，並把對應 issue 移上來。

1. **#714 — [Ops] Run real alert drill before first payment** `blocked`
   - State: OPEN
   - Labels: `priority:P1`, `agent:backlog`, `owner:mixed`, `status:blocked`, `infra`, `launch:first-payment-blocker`
   - Routing: blocked on production provisioning/schema readiness; do not trigger live drill until production `incidents` table, soft-launch audit path, `SENTRY_DSN`, and `TELEGRAM_ALERT_*` are confirmed.

2. **#605 — [Launch Content] Strict Andy Lee listing content gate before public exposure** `owner-mixed`
   - State: OPEN
   - Labels: `priority:P1`, `agent:backlog`, `owner:mixed`, `docs`, `status:awaiting-implementation`, `launch:first-payment-blocker`
   - Routing: content/owner mixed; require current content evidence and owner-sensitive media/privacy handling.

3. **#320 — [Launch] Public soft launch with restricted booking and Go/No-Go gate** `queued-gate`
   - State: OPEN
   - Labels: `priority:P2`, `agent:queued`, `infra`, `status:awaiting-implementation`, `launch:first-payment-blocker`
   - Routing: Go/No-Go dashboard/checklist issue; only advance after upstream blockers have credible evidence.

## P1 / ready or queued product/ops work

1. **#1652 — [Booking V2][Phase 1/6] 訂單讀取面 v2 接線（#1649）** `in-progress`
   - State: OPEN
   - Labels: `priority:P1`, `owner:ai-agent`, `status:in-progress`, `traveler-booking`, `booking-v2`
   - Routing: active phase of the #1649 v2 全面串接計劃；接手前先讀 `docs/operations/worklogs/issue1649.md` 對齊進度，不可重做已 merge 的 phase。

2. **#1649 — [Booking/Order/Payment][P1] 訂單／退款／金流 v2 全面串接計劃** `plan-of-record`
   - State: OPEN
   - Labels: `type:feature`, `priority:P1`, `owner:mixed`, `status:ready`, `payments`, `booking-v2`
   - Routing: umbrella plan; execute via phase issues（#1652 …），不直接在本卡動工。

3. **#1686 — [Admin][GitHub Actions] 修復正式環境缺少 admin token 導致排程開關不可用** `owner-mixed`
   - State: OPEN
   - Labels: `priority:P1`, `security`, `agent:queued`, `owner:mixed`, `status:ready`, `auth`, `admin`
   - Routing: secrets/token provisioning 屬 owner；agent 只能做 code/doc 面（見 worklog issue1686）。

4. **#1647 — [Payments] Decide and verify post-#1637 historical paid-order / payout reconciliation** `needs-decision`
   - State: OPEN
   - Labels: `priority:P1`, `owner:human-decision`, `status:needs-decision`, `type:decision`, `payments`, `orders`
   - Routing: human decision required; do not auto-reconcile production payouts.

5. **#1659 — [Security][RLS] Revoke post-#1646 anon write grants and default privileges drift** `needs-decision`
   - State: OPEN
   - Labels: `priority:P1`, `security`, `owner:mixed`, `status:needs-decision`, `database`, `rls`
   - Routing: schema/RLS 變更需 migration + SQL-OVERRIDE 協議；等待 owner 決定。

6. **#319 — [Ops] Run customer support SOP first-case drill follow-through** `agent:backlog`
   - State: OPEN
   - Labels: `priority:P1`, `agent:backlog`, `owner:mixed`, `status:ready`, `type:qa`
   - Routing: mixed ops drill; prepare evidence, but confirm owner/human pieces before completion.

7. **#318 — [Ops] Run Andy Lee first-guide onboarding demo and retrospective scope** `agent:backlog`
   - State: OPEN
   - Labels: `priority:P1`, `agent:backlog`, `owner:mixed`, `status:ready`, `admin-guides`
   - Routing: owner/guide-facing demo; do not post private guide evidence publicly.

8. **#642 — [Traveler Booking] Monitor V2 observation window and guard legacy fallback after launch** `agent:backlog`
   - State: OPEN
   - Labels: `priority:P1`, `agent:backlog`, `owner:mixed`, `status:ready`, `traveler-booking`, `launch:post-first-payment`
   - Routing: post-first-payment observation, not a first-payment unblocker.

9. **#1317 — [Production Smoke] Owner-only acceptance verification gaps** `owner:human`
   - State: OPEN
   - Labels: `priority:P1`, `type:qa`, `owner:human`, `production-smoke`, `post-merge`
   - Routing: owner-only；agent 不可代跑。

## P2 / launch support and readiness backlog

1. **#1670 — [Frontend Daily Check] health check failures（runner hygiene）** `status:ready`
   - State: OPEN
   - Labels: `priority:P2`, `qa`, `owner:ai-agent`, `status:ready`, `traveler-booking`
   - Routing: 歷史失敗已定性為 stale-checkout 假陽性；殘留工作＝canonical runner install/maxBuffer 缺口（修補在 branch `claude/resolve-open-issues-uiv0ql`，見 worklog issue1670）。

2. **#1654 — [Ops] readiness live-state snapshot stale** `fix-in-branch`
   - State: OPEN
   - Labels: `priority:P2`, `cron-followup`, `agent:backlog`, `owner:ai-agent`, `status:ready`, `infra`, `docs`
   - Routing: 每日自動刷新已恢復；門檻/文案對齊修補在 branch `claude/resolve-open-issues-uiv0ql`（見 worklog issue1654）。

3. **#1660 — [Ops] Reconcile stale open PR queue after #1656/#1646 main drift** `needs-decision`
   - State: OPEN
   - Labels: `priority:P2`, `qa`, `agent:backlog`, `owner:mixed`, `status:needs-decision`
   - Routing: 開放 PR 佇列盤點需 owner 對逐支 PR 的去留決定。

4. **#1344 — [Perf][P2] Mobile LCP regression on /activities** `owner:ai-agent`
   - State: OPEN
   - Labels: `type:bug`, `priority:P2`, `owner:ai-agent`, `traveler-booking`, `performance`
   - Routing: perf 工作；與 ISR/快取策略（#1603/#1604 parked 決策）相鄰，動工前先讀該兩張的 owner 拍板。

5. **#926 — [Ops] Add LINE/LIFF Messaging API rollout evidence gate after #920** `blocked`
   - State: OPEN
   - Labels: `priority:P2`, `agent:backlog`, `owner:mixed`, `status:blocked`, `auth`, `notifications`, `infra`
   - Routing: blocked by LINE/LIFF rollout state.

6. **#797 — [Compliance] Internal conservative incident reporting playbook for soft launch** `awaiting-implementation`
   - State: OPEN
   - Labels: `priority:P2`, `security`, `owner:ai-agent`, `infra`, `docs`, `status:awaiting-implementation`
   - Routing: docs/security playbook; safe only if it does not claim legal advice or expose incident details.

7. **#724 — [Ops] Execute Supabase live restore drill within 7 days after soft launch** `post-first-payment`
   - State: OPEN
   - Labels: `priority:P2`, `agent:backlog`, `owner:mixed`, `database`, `infra`, `status:awaiting-implementation`, `launch:post-first-payment`
   - Routing: read-only planning first; live restore drill needs explicit operator approval.

8. **#685 — [Monitoring] Add simple outside website monitor after soft launch** `post-first-payment`
   - State: OPEN
   - Labels: `priority:P2`, `agent:backlog`, `owner:ai-agent`, `infra`, `status:awaiting-implementation`, `launch:post-first-payment`
   - Routing: post-soft-launch monitor setup; do not confuse with #714 alert drill.

## Historical/non-routing notes

- #1751 — closed 2026-07-22：daily QA checklist（PR #1750 booking UUID 入口）GO，報告 `docs/operations/qa-reports/issue1751-daily-qa-2026-07-22.md`。
- #1684/#1694/#1705/#1709/#1714/#1717/#1728/#1746/#1747/#1748 — closed 2026-07-22 as duplicates of #1749（stale-branch scanner 假陽性；#1749 仍 open、由 owner HOLD 中，等安全 baseline scan 與 cron 決策）。
- #1603/#1604 — open but **parked by owner（2026-07-03 拍板）**：多 root layout 大搬遷前置；不要重複調查或重啟，除非 owner 解 park。
- #1607/#1608/#1609 — 導遊開店 roadmap placeholder（無 labels）；#1609 明確等 owner 拍板定價。
- #1474 — QA：PR #1473 部分退款 staging 實測（ECPay 測試卡）；需 staging 金流環境。
- #1388 — Growth backlog 總綱（P2）；phase-12 對齊後再展開。
- #1301 — closed（Booking V2 close-gate smoke 完成）。
- #1336 — closed（INTERNAL_ALERT_TOKEN ops 完成）。
- #1121 — open security issue, label set 2026-07-22：`security`, `owner:mixed`, `status:needs-decision`, `launch:post-first-payment`。**not** P0, **not** `first-payment-blocker`.
- #1175/#1231/#1237/#1238/#1249/#1254/#1265 — closed/verified（前次 routing 刷新紀錄）。
- #621, #639, #640, #641, #813, #1106 — historical closed launch-readiness entries; do not route.

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
for n in 1121 714 605 320 1652 1649 1686 1647 1659 319 318 642 1317 1670 1654 1660 1344 926 797 724 685
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
