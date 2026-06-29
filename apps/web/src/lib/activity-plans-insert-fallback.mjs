// Generic "missing column" fallback for activity_plans insert / update.
// Production schema may lag behind the migration in 20260527_issue841_activity_plans_rich_fields.sql;
// when a rich column is missing, strip it from the payload and retry so basic plan
// creation still succeeds. Caller receives droppedColumns[] for UI surfacing.

export function extractMissingColumn(error) {
  const msg = String(error?.message || '');
  // Postgres direct: column "foo" of relation "activity_plans" does not exist
  const m1 = msg.match(/column\s+"([^"]+)"\s+of\s+relation/i);
  if (m1) return m1[1];
  // PostgREST schema cache: Could not find the 'foo' column of 'activity_plans'
  const m2 = msg.match(/Could not find the ['"]([^'"]+)['"]\s+column/i);
  if (m2) return m2[1];
  // Postgres alt: column "foo" does not exist
  const m3 = msg.match(/column\s+"([^"]+)"\s+does not exist/i);
  if (m3) return m3[1];
  // PostgREST/Supabase unquoted, optionally table-qualified: column orders.trade_no does not exist
  const m4 = msg.match(/column\s+(?:[\w]+\.)?([\w]+)\s+does not exist/i);
  if (m4) return m4[1];
  return null;
}

const RICH_COLUMNS = new Set([
  'description',
  'legacy_plan_id',
  'details_link_text',
  'booking_btn_text',
  'highlights',
  'language',
  'earliest_departure',
  'confirm_by_days',
  'free_cancel_days',
  'plan_inclusions',
  'plan_exclusions',
  'plan_itinerary',
  'plan_itinerary_image_url',
  'meeting_point_name',
  'meeting_address',
  'experience_point_name',
  'experience_address',
  'plan_notices',
  'plan_refund_rules',
]);

export function isRichColumn(name) {
  return RICH_COLUMNS.has(name);
}

// Run runOperation(payload) -> { data, error } repeatedly, peeling off any column
// the server reports as missing. Bail if we can't parse the error or the missing
// column isn't a rich field (so we never silently drop basic required fields).
export async function applyWithMissingColumnFallback(runOperation, payload, options = {}) {
  const maxRetries = options.maxRetries ?? 25;
  const droppedColumns = [];
  let attempt = { ...payload };

  for (let i = 0; i <= maxRetries; i++) {
    const { data, error } = await runOperation(attempt);
    if (!error) {
      return { data, error: null, droppedColumns };
    }
    const missing = extractMissingColumn(error);
    if (!missing || !(missing in attempt) || !isRichColumn(missing)) {
      return { data: null, error, droppedColumns };
    }
    droppedColumns.push(missing);
    delete attempt[missing];
  }

  return {
    data: null,
    error: { code: 'SCHEMA_MISMATCH', message: 'Exceeded missing-column fallback retries' },
    droppedColumns,
  };
}

// Array-aware variant for bulk upserts (e.g. JSON-import backfill into activity_plans).
// Run runOperation(rows) repeatedly, peeling off any rich column the server reports as
// missing from EVERY row before retrying. Bails (returns the original error) when the
// missing column isn't a rich field, so a genuinely broken required column still surfaces.
export async function applyUpsertWithMissingColumnFallback(runOperation, rows, options = {}) {
  const maxRetries = options.maxRetries ?? 25;
  const droppedColumns = [];
  let attempt = Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];

  for (let i = 0; i <= maxRetries; i++) {
    const { data, error } = await runOperation(attempt);
    if (!error) {
      return { data, error: null, droppedColumns };
    }
    const missing = extractMissingColumn(error);
    const presentInSomeRow = attempt.some((row) => missing != null && missing in row);
    if (!missing || !presentInSomeRow || !isRichColumn(missing)) {
      return { data: null, error, droppedColumns };
    }
    droppedColumns.push(missing);
    attempt = attempt.map((row) => {
      const next = { ...row };
      delete next[missing];
      return next;
    });
  }

  return {
    data: null,
    error: { code: 'SCHEMA_MISMATCH', message: 'Exceeded missing-column fallback retries' },
    droppedColumns,
  };
}
