# Issue #179 — LINE / LIFF Booking Staged Rollout + Fallback + Support SOP

> Status truth (2026-04-26): **Phase 12 LINE / LIFF booking is planned / draft-aligned scope, not GA**.
>
> This SOP is for readiness review and controlled pilot operation only.

## 0) Source-of-truth scope and boundaries

This document is constrained by current repository truth:

- API/channel intent source: `docs/04-tech/04-tech-architecture/10-api-spec-v2-booking-pos.md`
- Phase ownership/status context: `docs/implementation/phase-12-mainline-matrix.md`
- Existing V2 rollout controls baseline: `docs/operations/booking-v2-b3-rollout.md`
- Existing manual QA baseline: `docs/qa/booking-v2-rollout-manual-checklist.md`

Background planning notes (non-truth source): `docs/LINE_BOOKING_PLAN.md`

### Not-doing boundaries (readiness-review-safe)

This SOP **does not claim** the following are already production-ready:

1. Full LINE / LIFF GA rollout to all users.
2. New architecture/API behavior not already described in the current Phase 12 specs.

> **Update (#302b):** dedicated LINE feature flags / kill switches now exist and are
> verified by automated tests + production build (see §2.5). They default **OFF**, so
> the boundaries above remain truthful: enabling them is a deliberate, staged action.

---

## 1) Staged rollout policy (truthful, bounded)

Use a four-stage gate. Progression requires both technical and support signals.

### Stage L0 — Internal dry-run only (0%)

**Entry criteria**
- Web booking V2 baseline controls and rollback path are documented and still valid.
- QA can execute core booking manual checklist paths in test/staging.
- Support lead confirms incident intake template and escalation contacts.

**Exit criteria (to L1)**
- At least one end-to-end internal dry-run of LINE/LIFF booking path is completed with evidence.
- No unresolved P0/P1 defects in booking draft/checkout/callback chain.

### Stage L1 — Staff / friendly pilot (allowlist)

**Entry criteria**
- L0 evidence archived (date, tester, environment, known gaps).
- Operator on-call window defined (who watches and when).

**Operational constraints**
- Pilot only to explicit allowlist cohort.
- Daily check-in against observability checklist (Section 3).

**Exit criteria (to L2)**
- Stable pilot window (recommended 24h+) with no repeated critical incidents.
- Support ticket pattern is understandable and operationally manageable.

### Stage L2 — Controlled external pilot (small % equivalent)

**Entry criteria**
- L1 pilot retrospective completed (issues, mitigations, open risks).
- Rollback decision owner and communication channel confirmed.

**Operational constraints**
- Keep enablement controlled by approved rollout decision owner.
- Keep fallback messaging ready for support and frontline operators.

**Exit criteria (to L3 readiness)**
- No active blocker in payment callback integrity / booking state consistency.
- Escalation volume remains within support team handling capacity.

### Stage L3 — Readiness for broader enablement (not automatic GA)

**Entry criteria**
- L2 stability and support metrics meet agreed threshold.
- Readiness review explicitly approves broadened scope.

**Exit criteria (to GA decision)**
- Separate business + technical go/no-go approval.
- This SOP alone is insufficient to declare GA.

---

## 2) Fallback / disable guidance (without inventing unverified switches)

When LINE / LIFF booking path shows incident-level risk, operators should execute **safe fallback to proven booking path** using currently documented V2 operational controls.

### Trigger conditions for fallback/disable decision

Initiate incident decision if any of the following occur:

1. Repeated booking draft/checkout failures affecting pilot users.
2. Payment callback confirmation mismatch or delayed booking status updates.
3. Rapid increase in support contacts with same failure signature.
4. Data-integrity concern (e.g., booking state inconsistency) requiring containment.

### Operator action order

1. **Contain**: stop further rollout progression (do not expand cohort).
2. **Fallback**: direct affected users to currently stable booking path per existing runbook (`docs/operations/booking-v2-b3-rollout.md`).
3. **Communicate**: publish support-facing status statement (incident active, workaround available, ETA pending).
4. **Verify**: confirm fallback path availability with at least one operator-side validation.
5. **Escalate**: hand off to engineering on-call with timestamped symptom set and examples.

### Explicit limitation statement

A dedicated LINE-only kill switch **now exists** (§2.5, #302b) and is verified by tests
+ build. Operators should prefer it for fast containment; the Booking V2 operational
fallback above remains the backstop for booking-chain (non-LINE-specific) incidents.

---

## 2.5) LINE feature flags / kill switches (#302b — verified)

All LINE integration is gated by environment flags that default **OFF**. Each is a real,
test-covered switch; flipping a flag to `0`/unset takes effect on the next deploy/boot
(flags are read at request time, so a redeploy with the new value is sufficient — no code
change). There is **no** persisted state that keeps a disabled feature running.

| Flag | Scope | Default | Effect when OFF |
|---|---|---|---|
| `LINE_MESSAGING_ENABLED` | **Master** kill switch for all outbound Messaging API calls (ops notifications **and** per-traveler push) | OFF | All outbound LINE messages return `skipped` (`messaging_disabled`); nothing is sent. Inbound webhook still ACKs 200. |
| `LINE_PUSH_ENABLED` | Per-traveler push only (booking / payment / cancel / refund / pre-tour reminder) | OFF | Traveler pushes return `skipped` (`push_disabled`); ops notifications unaffected. |
| `NEXT_PUBLIC_LINE_LIFF_ENABLED` | Real LIFF login + idToken verification on `/booking/line` | OFF | Entry reverts to the **legacy query-param handoff** (no LIFF SDK, no idToken) — instant, behavior-preserving rollback. |

Supporting secrets (only **required** at boot when the relevant flag is ON — enforced in
`startup-env.mjs` / `security-env.mjs`, so the OFF default never hard-fails CI/build):
`LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `LINE_OPS_GROUP_ID`,
`LINE_LOGIN_CHANNEL_ID`, `NEXT_PUBLIC_LIFF_ID`.

### Flag posture per stage

| Stage | `NEXT_PUBLIC_LINE_LIFF_ENABLED` | `LINE_MESSAGING_ENABLED` | `LINE_PUSH_ENABLED` |
|---|---|---|---|
| **L0** internal dry-run (staging/test) | ON (staging) | ON (staging) | OFF→ON to internal testers only |
| **L1** staff / friendly pilot | ON (prod, allowlist) | ON | ON (bindings limited to staff) |
| **L2** controlled external pilot | ON | ON | ON |
| **L3** readiness for broader enablement | ON | ON | ON |

### Fast containment (kill order)

1. **Stop traveler push only** (notifications noisy/wrong, booking fine):
   set `LINE_PUSH_ENABLED=0` → all per-traveler pushes skip; ops alerts keep working.
2. **Stop all LINE messaging** (any outbound LINE concern):
   set `LINE_MESSAGING_ENABLED=0` → ops + push both stop sending.
3. **Disable LIFF login** (auth/entry concern):
   set `NEXT_PUBLIC_LINE_LIFF_ENABLED=0` → `/booking/line` falls back to the proven
   query-param handoff; travelers can still book.

Each switch is independent; use the narrowest one that contains the incident. None of them
block or delay the booking/payment chain (all LINE calls are fire-and-forget).

---

## 3) Observability checklist for rollout decisions

Minimum signals to review at each stage gate:

### Technical signals
- Booking draft success trend (LINE/LIFF pilot cohort)
- Checkout initiation success trend
- Payment callback success/failure trend
- Booking status transition anomalies (`INVALID_STATE_TRANSITION`, `INTERNAL_ERROR` class)

### Support signals
- New ticket count related to LINE/LIFF booking per shift
- Repeated symptom categories (cannot pay / paid but not confirmed / cannot enter LIFF flow)
- First-response SLA adherence

### Decision logging
For each stage hold/advance/rollback decision, record:
- Decision time
- Decision owner
- Evidence snapshot (metrics + support summary)
- Next review time

---

## 4) Support SOP (symptom → first response → operator action → escalation)

| Symptom (user-facing) | First response (support) | Operator action | Escalation threshold |
|---|---|---|---|
| 無法從 LINE/LIFF 進入可預約流程 | 先致歉，確認 user/time/flow step，提供可用替代下單路徑 | 檢查是否為已知事件；若是，套用 fallback 指引並回報事件編號 | 同 30 分鐘內 >= 3 件同症狀，升級 P1 |
| 已付款但狀態未更新/未收到確認 | 先回覆「已收到，正在優先核對付款與訂單狀態」 | 收集交易識別資訊，交由值班工程師核對 callback/order/booking 關聯 | 任一「付款成功但訂單狀態異常」案例即刻升級 |
| 建立預約草稿失敗（重試仍失敗） | 提供替代下單方式，避免用戶卡單 | 記錄活動/方案/時間/裝置資訊；標記是否集中於單一方案或時段 | 20 分鐘內連續失敗 >= 5 次，升級 P1 |
| 流程可進入但頻繁錯誤訊息 | 指引重試一次並告知已啟動檢查 | 比對當前事件是否超過基線；暫停進一步放量 | 錯誤率持續高於基線且超過 15 分鐘 |

### Support response template (short)

- 目前狀態：LINE/LIFF 預約功能正在受控放量，部分用戶可能受影響。
- 已採取措施：已啟用替代下單路徑，您的訂單需求可先由支援流程處理。
- 下一步：我們已交由值班工程團隊優先檢查，將在 `X` 分鐘內回覆進度。

---

## 5) Rollback / risk summary for readiness review

### Rollback (documented and truthful)
- This SOP itself is docs-only; rollback means revert this document revision.
- Operational rollback for incidents follows existing Booking V2 rollback playbook and controlled fallback communications.

### Risks
1. Pilot truth drift: teams may over-assume GA readiness from pilot success.
2. Support overload risk if cohort expansion precedes evidence review.
3. If LINE-specific controls are assumed but unverified, incident response may be delayed.

### Risk controls
- Enforce stage gates with explicit entry/exit criteria.
- Require decision logs for every expansion step.
- Keep fallback messaging and escalation thresholds pre-approved before each stage change.
