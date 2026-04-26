# Issue #218 — KPI lineage conditional FK + events.session_id non-FK contract

## Decision summary

### 1) `kpi_settings_history.source_version_id`
- Enforce **self-FK conditionally** only when orphan precheck returns `0`.
- FK target: `kpi_settings_history(version_id)`.
- FK name: `fk_kpi_settings_history_source_version_id`.
- Delete action: `ON DELETE SET NULL`.
- If orphan precheck is non-zero, migration intentionally **skips** FK creation and emits NOTICE evidence.

### 2) `events.session_id`
- Explicitly documented as an **analytics token, intentional non-FK**.
- No FK DDL introduced in this issue.
- Rationale: session token is client-generated/high-cardinality and should not block ingestion unless a dedicated `sessions` parent table is introduced later.

## Artifacts
- Migration: `supabase/migrations/20260426023000_issue_218_kpi_lineage_fk_conditional.sql`
- Rollback: `supabase/migrations/20260426023000_issue_218_kpi_lineage_fk_conditional.rollback.sql`
- Precheck + verification SQL: `supabase/scripts/phase12/issue-218-precheck-kpi-events.sql`

## How to run precheck/verification
```bash
psql "$SUPABASE_DB_URL" -f supabase/scripts/phase12/issue-218-precheck-kpi-events.sql
```

Expected interpretation:
- `orphan_count = 0` → migration should add FK.
- `orphan_count > 0` → migration should skip FK and preserve current non-enforced state with NOTICE evidence.
- `fk_count_on_events_session_id = 0` → confirms intentional non-FK contract for analytics token.

## Rollback
- Run rollback migration to drop `fk_kpi_settings_history_source_version_id` if present.
- `events.session_id` keeps non-FK semantics; rollback only restores shorter legacy wording.

## Observability
- Monitor migration NOTICE output for `FK added` vs `FK skipped due to orphan_count`.
- After deploy, monitor DB errors for FK violations on KPI history writes (only in environments where FK was added).
- Analytics ingestion path should remain unaffected by `events.session_id` because no FK is enforced.

## Risks
- If production data has hidden/late-arriving orphan lineage rows, FK may be skipped (by design); enforcement remains deferred until cleanup.
- If future team adds a sessions parent table, this contract must be revisited and migration policy updated explicitly.

## Explicit handoff to Judy
- Judy can execute `supabase/scripts/phase12/issue-218-precheck-kpi-events.sql` in target environments and attach output as deployment evidence.
- Judy should verify migration NOTICE logs and confirm final state (`FK present` or `FK intentionally skipped`) before merge/deploy sign-off.
