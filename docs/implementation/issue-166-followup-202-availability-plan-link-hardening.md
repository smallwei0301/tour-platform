# Follow-up Draft (Batch 2) — activity_availability_daily.plan_id hardening

## Title suggestion
`[Phase 12][FK][Batch2] Decide and harden plan linkage for activity_availability_daily.plan_id`

## Problem
`activity_availability_daily.plan_id` is nullable text and currently stores semantic plan identifiers; no canonical parent key is enforced.

## Scope (bounded)
- Confirm canonical plan identity model:
  - Option A: normalize to FK-able entity (e.g. `activity_plans.id` uuid)
  - Option B: keep text domain and enforce via check/domain rules (explicit non-FK decision)
- Implement chosen model with migration-safe path.

## Precheck SQL contract
- Distinct `plan_id` cardinality and null rate.
- Values not present in expected source (`activity_schedules.plan_id` or chosen canonical source).
- Impact count on snapshot refresh function.

## Migration path (if FK chosen)
1. Add new canonical column (e.g. `activity_plan_id uuid`).
2. Deterministic mapping/backfill from existing text plan_id.
3. Validate zero orphan canonical ids.
4. Add FK + index.
5. Keep/drop legacy `plan_id` depending on compatibility constraints.

## Rollback
- Remove FK/index/new column; keep legacy text behavior.

## Observability
- Snapshot refresh success/failure rate.
- Mismatch counts between schedule source and daily aggregate.

## Acceptance
- Plan linkage model explicitly documented.
- If FK path selected, zero-orphan precheck and successful FK enforcement.
- If non-FK path selected, explicit rationale + guardrail checks committed.

## Issue #217 implementation note
- 選擇 **Option-B（non-FK）**：`activity_availability_daily.plan_id` 保持語意 text key。
- 實作檔案：
  - `docs/implementation/issue-217-option-b-plan-linkage-decision.md`
  - `supabase/scripts/phase12/issue-217-plan-linkage-guardrails.sql`
  - `scripts/phase12/run-issue-217-plan-linkage-guardrails.sh`
