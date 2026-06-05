function errorMessage(error) {
  return String(error?.message || '');
}

function extractMissingColumn(error) {
  const msg = errorMessage(error);

  const qualifiedMatch = msg.match(/column\s+([a-z0-9_]+)\.([a-z0-9_]+)\s+does not exist/i);
  if (qualifiedMatch) {
    return { relation: qualifiedMatch[1], column: qualifiedMatch[2] };
  }

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

export function isMissingActivityPlanIsYearRoundError(error) {
  const missing = extractMissingColumn(error);
  if (!missing || missing.column !== 'is_year_round') {
    return false;
  }

  return !missing.relation || missing.relation === 'activity_plans';
}

export async function loadActivityPlanWithMissingIsYearRoundFallback(runOperation) {
  const first = await runOperation({ includeIsYearRound: true });
  if (!first?.error) {
    return { data: first?.data ?? null, error: null, schemaFallback: null };
  }

  if (!isMissingActivityPlanIsYearRoundError(first.error)) {
    return { data: first?.data ?? null, error: first.error, schemaFallback: null };
  }

  const second = await runOperation({ includeIsYearRound: false });
  if (second?.error) {
    return { data: second?.data ?? null, error: second.error, schemaFallback: 'missing_is_year_round' };
  }

  const data = second?.data && typeof second.data === 'object'
    ? { ...second.data, is_year_round: false }
    : second?.data ?? null;

  return { data, error: null, schemaFallback: 'missing_is_year_round' };
}
