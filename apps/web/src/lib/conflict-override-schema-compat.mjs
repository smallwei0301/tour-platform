const OVERRIDE_TABLE = 'guide_slot_conflict_overrides';
// Optional booking columns the draft insert can gracefully drop when the
// production schema lags behind a migration (deploy-ordering safety). Includes
// the conflict-override columns and guide_approval_status (三種預約模式).
const BOOKING_OVERRIDE_COLUMNS = new Set([
  'conflict_override_id',
  'conflict_override_snapshot',
  'guide_approval_status',
]);

function errorMessage(error) {
  return String(error?.message || '');
}

function extractMissingColumn(error) {
  const msg = errorMessage(error);
  const relationMatch = msg.match(/column\s+"([^"]+)"\s+of\s+relation\s+"([^"]+)"\s+does not exist/i);
  if (relationMatch) {
    return { column: relationMatch[1], relation: relationMatch[2] };
  }

  const tableCacheMatch = msg.match(/Could not find the ['"]([^'"]+)['"]\s+column of ['"]([^'"]+)['"]/i);
  if (tableCacheMatch) {
    return { column: tableCacheMatch[1], relation: tableCacheMatch[2] };
  }

  const bareColumnMatch = msg.match(/column\s+"([^"]+)"\s+does not exist/i);
  if (bareColumnMatch) {
    return { column: bareColumnMatch[1], relation: null };
  }

  return null;
}

function isMissingOverrideTableError(error) {
  const msg = errorMessage(error);
  return (
    /relation\s+"(?:public\.)?guide_slot_conflict_overrides"\s+does not exist/i.test(msg) ||
    /Could not find the table ['"](?:public\.)?guide_slot_conflict_overrides['"]/i.test(msg)
  );
}

function isMissingOverrideColumnError(error) {
  const missing = extractMissingColumn(error);
  return Boolean(missing && (!missing.relation || missing.relation === OVERRIDE_TABLE));
}

export async function loadConflictOverridesWithSchemaFallback(runOperation) {
  const { data, error } = await runOperation();
  if (!error) {
    return { data, error: null, schemaFallback: null };
  }

  if (isMissingOverrideTableError(error)) {
    return { data: [], error: null, schemaFallback: 'missing_table' };
  }

  if (isMissingOverrideColumnError(error)) {
    return { data: [], error: null, schemaFallback: 'missing_column' };
  }

  return { data: null, error, schemaFallback: null };
}

export async function applyBookingConflictOverrideColumnFallback(runOperation, payload, options = {}) {
  const maxRetries = options.maxRetries ?? 4;
  const droppedColumns = [];
  let attempt = { ...payload };

  for (let i = 0; i <= maxRetries; i++) {
    const { data, error } = await runOperation(attempt);
    if (!error) {
      return { data, error: null, droppedColumns };
    }

    const missing = extractMissingColumn(error);
    if (!missing?.column || !(missing.column in attempt) || !BOOKING_OVERRIDE_COLUMNS.has(missing.column)) {
      return { data: null, error, droppedColumns };
    }

    droppedColumns.push(missing.column);
    delete attempt[missing.column];
  }

  return {
    data: null,
    error: { code: 'SCHEMA_MISMATCH', message: 'Exceeded conflict override fallback retries' },
    droppedColumns,
  };
}
