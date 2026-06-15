// Detect the PostgREST/Postgres "relation does not exist / not in schema cache"
// error family — used so notification reads can fail-open (default all-on)
// before the notification_event_settings migration is applied in an env.
//
// Mirrors the patterns already handled in activity-plan-seasons-error.mjs:
//   - 42P01  undefined_table
//   - PGRST205 / PGRST204  PostgREST schema-cache miss
//   - free-text "schema cache" / "does not exist" fallbacks

export function isMissingTableError(error) {
  if (!error) return false;
  const code = error.code || error.pgCode || '';
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST204') return true;
  const msg = String(error.message || error).toLowerCase();
  if (msg.includes('schema cache')) return true;
  if (msg.includes('does not exist') && (msg.includes('relation') || msg.includes('table'))) return true;
  return false;
}
