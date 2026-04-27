# Issue #167 — Truthful Remediation Policy (for #172 authoring)

_Last updated: 2026-04-24 (Asia/Taipei)_

## 1) Schema truth (must not be rewritten)

1. `bookings.order_id`
   - Current evidence does **not** show an active repair target.
   - In recent precheck evidence, no grounded null/orphan repair queue was produced for `bookings.order_id`.
   - Therefore, #167/#172 must **not** frame this as a live historical repair campaign.

2. `payments.booking_id`
   - There is currently **no grounded automatic historical backfill path**.
   - Existing evidence does not provide a verifiable one-to-one mapping basis that can safely auto-fill all historical rows.
   - Therefore, #167/#172 must **not** claim or imply “full historical auto-backfill completed/guaranteed”.

## 2) Policy split required by #172

#172 must separate work into three explicit tracks:

### A. Schema / constraint changes (DDL-level)
- Only include real, forward-safe schema operations.
- Do not encode fake assumptions that historical `payments.booking_id` can be fully reconstructed automatically.
- Any new relation introduction must be written as staged and evidence-gated.

### B. Forward-only hygiene (write-path correctness)
- Ensure new writes remain internally consistent on canonical paths.
- Success criteria are future-write integrity and guardrails, not “historical perfection”.
- Require idempotent checks and measurable counters for ongoing health.

### C. Manual / audit remediation (historical data)
- Historical anomalies require audit queue + operator decision path.
- Use explicit “manual or evidence-backed batch remediation” wording.
- Ban heuristic inference when mapping cannot be proven deterministically.

## 3) Explicit non-goals (must stay in #172 text)

- Not a promise of full historical `payments.booking_id` auto-backfill.
- Not a heuristic inferred repair without verifiable mapping.
- Not a broad omnibus cleanup for unrelated legacy rows.
- Not reframing `bookings.order_id` as the main current repair target.

## 4) Suggested canonical wording for #172

Use this as the normative wording block:

> This migration/remediation slice is intentionally split into: (1) schema/constraint hardening, (2) forward-only write-path hygiene, and (3) manual/audit-based historical remediation.  
> Current evidence does not justify claiming a complete automatic historical backfill for `payments.booking_id`; therefore success is defined by truthful schema alignment, safe forward behavior, and auditable manual remediation pathways where deterministic mapping is unavailable.  
> `bookings.order_id` is not treated as an active historical repair campaign in this slice unless new evidence proves otherwise.

## 5) Rollback plan

- DDL changes: apply reversible migration steps where possible (drop newly added constraint/index/column only if introduced in this slice).
- Forward-only hygiene: gate by feature flag / guarded path so rollback can disable new strict checks without destructive rewrites.
- Manual/audit remediation: append-only audit logs; rollback = stop new remediation batches, do not mutate audit history.

## 6) Observability requirements

Minimum observability before marking green:

- Counter: new-write integrity failures on canonical relation path.
- Counter: rows entering manual remediation queue.
- Gauge/report: unresolved historical remediation items.
- Structured logs for each remediation decision (who/when/why/evidence).
- Release note entry that explicitly states: no claim of full historical `payments.booking_id` auto-backfill.

## 7) Risk notes

- **Primary risk:** narrative drift (docs/PR text over-claiming historical repair completeness).
- **Data risk:** heuristic backfill can create silent bad links when mapping is non-deterministic.
- **Process risk:** mixing DDL, forward hygiene, and historical repair into one “done” metric hides partial truth.

Mitigation: keep acceptance criteria partitioned and require evidence per track.

## 8) Unblock condition for #172

#167 unblocks #172 **only if** #172 preserves these truth boundaries:

1. No “full historical `payments.booking_id` auto-backfill” claim.
2. Clear separation of schema change vs forward hygiene vs manual/audit remediation.
3. `bookings.order_id` not reframed as the main current repair target without fresh evidence.
4. Success criteria tied to truthful, measurable outcomes.
