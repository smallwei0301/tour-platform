#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

DB_MODE="env_psql"
if [[ -z "${DATABASE_URL:-}" && -z "${PGHOST:-}" ]]; then
  DB_MODE="supabase_linked"
fi

TS="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="reports/issue-217/${TS}"
mkdir -p "$OUT_DIR"

SQL_FILE="supabase/scripts/phase12/issue-217-plan-linkage-guardrails.sql"
DB_OUT="$OUT_DIR/issue-217-plan-linkage-guardrails-output.txt"
SUMMARY_OUT="$OUT_DIR/summary.md"

SQL_SOURCE="$SQL_FILE"
if [[ "$DB_MODE" == "supabase_linked" ]]; then
  SQL_SOURCE="supabase/scripts/phase12/issue-217-plan-linkage-guardrails.linked.sql"
fi

echo "[INFO] Running issue-217 guardrail SQL pack: $SQL_SOURCE"
if [[ "$DB_MODE" == "supabase_linked" ]]; then
  npx -y supabase db query --linked --file "$SQL_SOURCE" --output table --agent=no | tee "$DB_OUT"
elif [[ -n "${DATABASE_URL:-}" ]]; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE" | tee "$DB_OUT"
else
  psql -v ON_ERROR_STOP=1 -f "$SQL_FILE" | tee "$DB_OUT"
fi

{
  echo "# Issue #217 Option-B Plan Linkage Guardrail Summary"
  echo
  echo "- executed_at: $(date -Iseconds)"
  echo "- db_mode: $DB_MODE"
  echo "- sql_source: \`$SQL_SOURCE\`"
  echo "- out_dir: \`$OUT_DIR\`"
  echo "- sql_output: \`$DB_OUT\`"
  echo
  echo "## Metric quick grep"
  for key in \
    snapshot_plan_id_column_type \
    activity_plans_id_column_type \
    snapshot_total_rows \
    snapshot_null_rows \
    snapshot_blank_rows \
    snapshot_distinct_non_blank_plan_ids \
    schedule_total_rows \
    schedule_null_rows \
    schedule_blank_rows \
    schedule_distinct_non_blank_plan_ids \
    snapshot_plan_ids_not_in_schedules \
    schedule_plan_ids_not_in_snapshot \
    snapshot_plan_id_to_activity_plans_slug_match_count \
    snapshot_plan_id_without_activity_plans_slug_match_count \
    refresh_probe_invocation \
    issue_217_guardrail_pack_completed
  do
    echo
    echo "### $key"
    grep -n "$key" "$DB_OUT" || true
  done
} > "$SUMMARY_OUT"

echo "[DONE] Issue #217 guardrail pack complete"
echo "[DONE] Evidence dir: $OUT_DIR"