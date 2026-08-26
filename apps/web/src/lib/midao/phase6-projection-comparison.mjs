const CATEGORIES = [
  'match',
  'missing_left',
  'missing_right',
  'one_to_many',
  'many_to_one',
  'state_mismatch',
  'stale_projection',
  'unresolvable_key',
];

const SAFE_STATES = new Set([
  'open',
  'replied',
  'converted',
  'confirmed',
  'expired',
  'pending',
  'pending_payment',
  'not_required',
]);
const OUTPUT_STATES = new Set([
  'open',
  'converted',
  'confirmed',
  'expired',
  'pending',
  'pending_payment',
  'not_required',
]);
const MEASUREMENT_STATUSES = new Set([
  'complete',
  'no_eligible',
  'no_real_traffic',
  'incomplete',
  'failed',
]);
const ALLOWED_RECORD_FIELDS = new Set([
  'joinKey',
  'state',
  'observedAt',
  'preConfirmationCheckoutCount',
  'manualLineMetric',
]);
const ALLOWED_SUMMARY_ROW_FIELDS = new Set([
  'category',
  'surrogateKeyPrefix',
  'preConfirmationCheckoutCount',
  'manualLineMetric',
  'leftState',
  'rightState',
]);

function initialCategoryCounts() {
  return Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isJoinKey(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function toOutputState(value) {
  return OUTPUT_STATES.has(value) ? value : 'withheld';
}

function normalizeRecord(record) {
  if (!isObject(record) || Object.keys(record).some((key) => !ALLOWED_RECORD_FIELDS.has(key))) {
    return { valid: false };
  }

  const observedAtMs = Date.parse(record.observedAt);
  const manualLineMetric = record.manualLineMetric;
  const validManualLineMetric = manualLineMetric === undefined || manualLineMetric === 'prepared_or_opened_manually';
  const validCheckoutCount = Number.isSafeInteger(record.preConfirmationCheckoutCount)
    && record.preConfirmationCheckoutCount >= 0;

  if (!isJoinKey(record.joinKey)
    || !SAFE_STATES.has(record.state)
    || Number.isNaN(observedAtMs)
    || !validCheckoutCount
    || !validManualLineMetric) {
    return { valid: false };
  }

  return {
    valid: true,
    joinKey: record.joinKey,
    state: record.state,
    observedAtMs,
    preConfirmationCheckoutCount: record.preConfirmationCheckoutCount,
    manualLineMetric,
  };
}

function makeRow(category, record = undefined, state = undefined, counterpartState = undefined) {
  const row = {
    category,
    surrogateKeyPrefix: record?.joinKey?.slice(0, 12) ?? null,
    preConfirmationCheckoutCount: record?.preConfirmationCheckoutCount ?? 0,
    manualLineMetric: record?.manualLineMetric ?? null,
  };

  if (state !== undefined) row.leftState = toOutputState(state);
  if (counterpartState !== undefined) row.rightState = toOutputState(counterpartState);
  return row;
}

function isStale(record, nowMs, staleAfterMs) {
  return nowMs - record.observedAtMs > staleAfterMs;
}

function isSafeSummaryRow(row) {
  if (!isObject(row)
    || Object.keys(row).some((key) => !ALLOWED_SUMMARY_ROW_FIELDS.has(key))
    || !CATEGORIES.includes(row.category)) {
    return false;
  }

  const validPrefix = row.surrogateKeyPrefix === undefined
    || row.surrogateKeyPrefix === null
    || (typeof row.surrogateKeyPrefix === 'string' && /^[a-f0-9]{12}$/.test(row.surrogateKeyPrefix));
  const validCheckoutCount = row.preConfirmationCheckoutCount === undefined
    || (Number.isSafeInteger(row.preConfirmationCheckoutCount) && row.preConfirmationCheckoutCount >= 0);
  const validManualLineMetric = row.manualLineMetric === undefined
    || row.manualLineMetric === null
    || row.manualLineMetric === 'prepared_or_opened_manually';
  const validState = (state) => state === undefined
    || (typeof state === 'string' && (OUTPUT_STATES.has(state) || state === 'withheld'));

  return validPrefix
    && validCheckoutCount
    && validManualLineMetric
    && validState(row.leftState)
    && validState(row.rightState);
}

export function compareProjectionRows(left, right, options = {}) {
  const nowMs = Date.parse(options.now ?? '');
  const staleAfterMs = options.staleAfterMs ?? 24 * 60 * 60 * 1000;
  const rows = [];
  const leftGroups = new Map();
  const rightGroups = new Map();

  const addRecord = (groups, record) => {
    const normalized = normalizeRecord(record);
    if (!normalized.valid) {
      rows.push(makeRow('unresolvable_key'));
      return;
    }
    const existing = groups.get(normalized.joinKey) ?? [];
    existing.push(normalized);
    groups.set(normalized.joinKey, existing);
  };

  if (!Array.isArray(left) || !Array.isArray(right)
    || Number.isNaN(nowMs)
    || !Number.isSafeInteger(staleAfterMs)
    || staleAfterMs < 0) {
    return {
      rows: [makeRow('unresolvable_key')],
      categoryCounts: { ...initialCategoryCounts(), unresolvable_key: 1 },
      complete: false,
    };
  }

  left.forEach((record) => addRecord(leftGroups, record));
  right.forEach((record) => addRecord(rightGroups, record));

  const keys = [...new Set([...leftGroups.keys(), ...rightGroups.keys()])].sort();
  for (const key of keys) {
    const leftRows = leftGroups.get(key) ?? [];
    const rightRows = rightGroups.get(key) ?? [];
    const representative = leftRows[0] ?? rightRows[0];

    if (leftRows.length === 0) {
      rows.push(makeRow('missing_left', representative));
      continue;
    }
    if (rightRows.length === 0) {
      rows.push(makeRow('missing_right', representative));
      continue;
    }
    if (leftRows.length === 1 && rightRows.length > 1) {
      rows.push(makeRow('one_to_many', representative));
      continue;
    }
    if (leftRows.length > 1 && rightRows.length === 1) {
      rows.push(makeRow('many_to_one', representative));
      continue;
    }
    if (leftRows.length !== 1 || rightRows.length !== 1) {
      rows.push(makeRow('unresolvable_key', representative));
      continue;
    }

    const [leftRecord] = leftRows;
    const [rightRecord] = rightRows;
    if (isStale(leftRecord, nowMs, staleAfterMs) || isStale(rightRecord, nowMs, staleAfterMs)) {
      rows.push(makeRow('stale_projection', representative));
    } else if (leftRecord.state !== rightRecord.state) {
      rows.push(makeRow('state_mismatch', representative, leftRecord.state, rightRecord.state));
    } else {
      rows.push(makeRow('match', representative));
    }
  }

  const categoryCounts = initialCategoryCounts();
  for (const row of rows) categoryCounts[row.category] += 1;
  return {
    rows,
    categoryCounts,
    complete: rows.every((row) => row.category === 'match'),
  };
}

export function summarizeObservation(rows, health) {
  const categoryCounts = initialCategoryCounts();
  const safeRows = Array.isArray(rows) ? rows : [undefined];
  const validRows = safeRows.filter((row) => isSafeSummaryRow(row));
  const malformedRows = safeRows.length - validRows.length;

  for (const row of validRows) categoryCounts[row.category] += 1;
  categoryCounts.unresolvable_key += malformedRows;

  const eligible = validRows.filter((row) => row.category !== 'unresolvable_key').length;
  const preConfirmationCheckoutCount = validRows.reduce((total, row) => (
    total + (Number.isSafeInteger(row.preConfirmationCheckoutCount) && row.preConfirmationCheckoutCount > 0
      ? row.preConfirmationCheckoutCount
      : 0)
  ), 0);
  const manualLineCount = validRows.filter((row) => row.manualLineMetric === 'prepared_or_opened_manually').length;
  const requestedStatus = health?.measurementStatus;
  const healthComplete = isObject(health)
    && MEASUREMENT_STATUSES.has(requestedStatus)
    && health.sourcePagesComplete === true
    && health.commandExitCode === 0
    && health.maskingCheck === 'pass';
  const measurementStatus = categoryCounts.unresolvable_key > 0 || !healthComplete
    ? 'incomplete'
    : eligible === 0 ? 'no_eligible' : requestedStatus;
  const anomalyCount = Object.entries(categoryCounts)
    .filter(([category]) => category !== 'match')
    .reduce((total, [, count]) => total + count, 0);

  return {
    categoryCounts,
    eligible,
    preConfirmationCheckoutCount,
    manualLine: { prepared_or_opened_manually: manualLineCount },
    measurementStatus,
    complete: measurementStatus === 'complete' && anomalyCount === 0 && preConfirmationCheckoutCount === 0,
    pass: measurementStatus === 'complete' && anomalyCount === 0 && preConfirmationCheckoutCount === 0,
  };
}
