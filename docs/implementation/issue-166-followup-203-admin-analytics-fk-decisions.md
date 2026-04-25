# Follow-up Draft (Batch 3) — admin/analytics FK decisions

## Title suggestion
`[Phase 12][FK][Batch3] Harden KPI history lineage and document analytics session non-FK contract`

## Scope (bounded)
1. `kpi_settings_history.source_version_id`
   - Evaluate optional self-FK to `kpi_settings_history.version_id`.
   - Enforce only after orphan precheck passes.
2. `events.session_id`
   - Explicitly document as non-FK analytics token unless a dedicated session table is introduced.

## Precheck SQL contract
- `kpi_settings_history.source_version_id` orphan count.
- Null-rate + distinct count for `events.session_id`.

## Migration path
- If KPI self-FK viable: add idempotent FK with suitable ON DELETE behavior (`SET NULL` preferred).
- For `events.session_id`: no FK DDL; add schema comment/docs contract asserting non-FK intent.

## Rollback
- Drop KPI self-FK if added.
- Documentation rollback not required beyond revert.

## Observability
- KPI history write failures / FK violations.
- Analytics ingestion stability unaffected by non-FK session token.

## Acceptance
- KPI history lineage constraint decision implemented and verified.
- events.session_id explicitly categorized as non-FK by design.
- Batch 3 closed with clear “enforce vs intentionally no-enforce” outcomes.
