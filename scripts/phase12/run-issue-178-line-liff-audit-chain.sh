#!/usr/bin/env bash
set -euo pipefail

REPORT_DIR="reports/issue-178"
REPORT_FILE="$REPORT_DIR/line-liff-audit-chain-verification.md"
mkdir -p "$REPORT_DIR"

{
  echo "# GH #178 LINE/LIFF audit chain verification"
  echo
  echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  echo "## Static checks"
  echo
  echo '- migration file exists: `supabase/migrations/20260508203000_issue178_line_liff_callback_audit_continuity.sql`'
  test -f supabase/migrations/20260508203000_issue178_line_liff_callback_audit_continuity.sql
  echo '- verification SQL exists: `supabase/scripts/phase12/issue-178-line-liff-audit-chain.sql`'
  test -f supabase/scripts/phase12/issue-178-line-liff-audit-chain.sql
  echo '- callback audit signal present'
  grep -q "line_liff_payment_callback_status_transition" supabase/migrations/20260508203000_issue178_line_liff_callback_audit_continuity.sql
  echo '- origin source channel and correlation id present'
  grep -q "originSourceChannel" supabase/migrations/20260508203000_issue178_line_liff_callback_audit_continuity.sql
  grep -q "correlationId" supabase/migrations/20260508203000_issue178_line_liff_callback_audit_continuity.sql
  echo
  echo "## Runtime SQL check"
  echo
  if [[ -n "${DATABASE_URL:-}" && -n "${BOOKING_ID:-}" ]]; then
    echo "DATABASE_URL and BOOKING_ID detected; running read-only chain query."
    psql "$DATABASE_URL" -v booking_id="$BOOKING_ID" -f supabase/scripts/phase12/issue-178-line-liff-audit-chain.sql
  else
    echo "no_db_env: DATABASE_URL and/or BOOKING_ID not set; SQL runtime was skipped truthfully."
  fi
} > "$REPORT_FILE"

echo "$REPORT_FILE"
