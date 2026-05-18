import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const USAGE = `Usage: node scripts/production-schema-drift-preflight.mjs [options]\n\nOptions:\n  --help                 Show help\n  --json                 Emit JSON output (default: markdown)\n  --markdown             Emit markdown report\n  --output <path>        Write output to file in addition to stdout\n  --no-env-check         (internal) skip env validation`;

const CHECK_DEFINITIONS = [
  {
    feature_area: 'public activities',
    impacted_feature: 'activity browse',
    table: 'activities',
    relation: 'guide_profiles!activities_guide_id_fkey(display_name, profile_photo_url, rating_avg, review_count, slug)',
    required_columns: [
      'id',
      'slug',
      'title',
      'tagline',
      'short_description',
      'region',
      'region_slug',
      'category',
      'price_twd',
      'duration_minutes',
      'min_participants',
      'max_participants',
      'cover_image_url',
      'status',
      'published_at',
      'rating_avg',
      'review_count',
      'guide_id',
      'guide_slug',
    ],
    select:
      'id, slug, title, tagline, short_description, region, region_slug, category, price_twd, duration_minutes, min_participants, max_participants, cover_image_url, status, published_at, rating_avg, review_count, guide_id, guide_slug, guide_profiles!activities_guide_id_fkey(display_name, profile_photo_url, rating_avg, review_count, slug)',
  },
  {
    feature_area: 'public availability',
    impacted_feature: 'availability snapshot',
    table: 'activity_availability_daily',
    relation: 'activities!inner(slug)',
    required_columns: [
      'activity_id',
      'date',
      'plan_id',
      'total_capacity',
      'total_booked',
      'remaining',
      'is_open',
    ],
    select:
      'activity_id, date, plan_id, total_capacity, total_booked, remaining, is_open, activities!inner(slug)',
    tags: ['availability'],
  },
  {
    feature_area: 'public availability fallback',
    impacted_feature: 'availability snapshot',
    table: 'activity_schedules',
    relation: 'activities!inner(slug)',
    required_columns: [
      'id',
      'start_at',
      'end_at',
      'capacity',
      'booked_count',
      'status',
      'plan_id',
      'min_participants',
    ],
    select:
      'id, start_at, end_at, capacity, booked_count, status, plan_id, min_participants, activities!inner(slug)',
    tags: ['availability'],
  },
  {
    feature_area: 'guide availability plan reads',
    impacted_feature: 'guide availability',
    table: 'activity_plans',
    relation: 'activities(guide_id)',
    required_columns: [
      'id',
      'activity_id',
      'status',
      'duration_minutes',
      'max_participants',
      'booking_type',
    ],
    select: 'id, activity_id, status, duration_minutes, max_participants, booking_type, activities(guide_id)',
  },
  {
    feature_area: 'guide availability plan reads',
    impacted_feature: 'guide availability',
    table: 'guide_availability_rules',
    required_columns: [
      'id',
      'guide_id',
      'is_active',
      'activity_plan_id',
      'weekday',
      'start_time_local',
      'end_time_local',
      'timezone',
      'slot_interval_minutes',
      'buffer_before_minutes',
      'buffer_after_minutes',
      'effective_from',
      'effective_to',
    ],
    select: 'id, guide_id, is_active, activity_plan_id, weekday, start_time_local, end_time_local, timezone, slot_interval_minutes, buffer_before_minutes, buffer_after_minutes, effective_from, effective_to',
  },
  {
    feature_area: 'guide availability plan reads',
    impacted_feature: 'guide availability',
    table: 'guide_blackout_dates',
    required_columns: ['id', 'guide_id', 'starts_at', 'ends_at', 'reason', 'source'],
    select: 'id, guide_id, starts_at, ends_at, reason, source',
  },
  {
    feature_area: 'guide availability plan reads',
    impacted_feature: 'guide availability',
    table: 'bookings',
    required_columns: ['id', 'guide_id', 'start_at', 'end_at', 'status'],
    select: 'id, guide_id, start_at, end_at, status',
  },
  {
    feature_area: 'settlement',
    impacted_feature: 'settlement rule',
    table: 'settlement_rules',
    required_columns: [
      'id',
      'version',
      'commission_rate',
      't_days',
      'min_withdrawal_twd',
      'fee_absorbed_by',
      'notes',
      'is_active',
      'created_at',
      'created_by',
    ],
    select: 'id, version, commission_rate, t_days, min_withdrawal_twd, fee_absorbed_by, notes, is_active, created_at, created_by',
  },
  {
    feature_area: 'payouts / balances',
    impacted_feature: 'payout finance',
    table: 'payouts',
    relation: 'guide_profiles(display_name, guide_email)',
    required_columns: [
      'id',
      'guide_id',
      'total_twd',
      'state',
      'confirmed_by',
      'confirmed_at',
      'transfer_ref',
      'notes',
      'created_at',
    ],
    select:
      'id, guide_id, total_twd, state, confirmed_by, confirmed_at, transfer_ref, notes, created_at, guide_profiles(display_name, guide_email)',
  },
  {
    feature_area: 'payouts / balances',
    impacted_feature: 'payout finance',
    table: 'guide_balances',
    required_columns: ['guide_id', 'balance_twd', 'updated_at'],
    select: 'guide_id, balance_twd, updated_at',
  },
  {
    feature_area: 'refund requests',
    impacted_feature: 'refund operations',
    table: 'refund_requests',
    required_columns: [
      'id',
      'order_id',
      'status',
      'retry_count',
      'last_error',
      'created_at',
      'refunded_at',
    ],
    select: 'id, order_id, status, retry_count, last_error, created_at, refunded_at',
  },
  {
    feature_area: 'payment events',
    impacted_feature: 'payment reconciliation',
    table: 'payment_events',
    required_columns: [
      'id',
      'payment_id',
      'order_id',
      'event_type',
      'payload',
      'trade_no',
      'created_at',
    ],
    select: 'id, payment_id, order_id, event_type, payload, trade_no, created_at',
  },
];

function parseArgs(argv) {
  const options = {
    help: false,
    json: false,
    markdown: false,
    output: null,
    noEnvCheck: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--markdown') {
      options.markdown = true;
      continue;
    }
    if (arg === '--output') {
      options.output = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === '--no-env-check') {
      options.noEnvCheck = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.json && !options.markdown) {
    options.markdown = true;
  }

  return options;
}

function sanitizeOutputText(text) {
  return text
    .replace(/(SUPABASE_URL=)([^\s]+)/gi, '$1<redacted>')
    .replace(/(SUPABASE_SERVICE_ROLE_KEY=)([^\s]+)/gi, '$1<redacted>')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1<redacted>');
}

function classifyError(error) {
  const message = String(error?.message || '').toLowerCase();
  const detail = String(error?.details || '').toLowerCase();
  const hint = String(error?.hint || '').toLowerCase();
  const source = `${message} ${detail} ${hint}`;

  if (source.includes('does not exist') && source.includes('relation')) {
    return { error_classification: 'missing_relation' };
  }
  if (source.includes('does not exist') && source.includes('column')) {
    return { error_classification: 'missing_column' };
  }
  if (source.includes('does not exist') && source.includes('table')) {
    return { error_classification: 'missing_table' };
  }
  if (source.includes('invalid api') || source.includes('not found') || source.includes('jwt')) {
    return { error_classification: 'postgrest_auth_error' };
  }

  return { error_classification: 'postgrest_error' };
}

function detectMissingTarget(error) {
  const message = String(error?.message || '');
  const details = String(error?.details || '');
  const hint = String(error?.hint || '');
  const all = `${message} ${details} ${hint}`;

  const extractTableName = (qualified) => {
    if (!qualified) return null;
    const normalized = String(qualified).replace(/^"|"$/g, '');
    const segments = normalized.split('.').map((seg) => seg.replace(/^"|"$/g, '')).filter(Boolean);
    if (segments.length === 0) return null;
    return segments[segments.length - 1];
  };

  const relationToken =
    all.match(/(?:relation|table)\s+((?:"?[a-zA-Z0-9_]+"?\.)?"?[a-zA-Z0-9_]+"?)\s+does not exist/i)?.[1]
    ?? all.match(/(?:relation|table)\s+"([^"]+)"\s+does not exist/i)?.[1]
    ?? null;
  const columnToken =
    all.match(/column\s+((?:"?[a-zA-Z0-9_]+"?\.)?"?[a-zA-Z0-9_]+"?)\s+does not exist/i)?.[1]
    ?? all.match(/column\s+"([^"]+)"\s+does not exist/i)?.[1]
    ?? null;

  if (/relation|table/i.test(all) && /does not exist/i.test(all)) {
    return { missing_table: extractTableName(relationToken) };
  }

  if (/column/i.test(all) && /does not exist/i.test(all)) {
    const missing_column = columnToken ? extractTableName(columnToken) : null;
    const missing_table = columnToken?.includes('.')
      ? extractTableName(columnToken.split('.').slice(0, -1).join('.'))
      : null;
    return {
      missing_column,
      missing_table,
    };
  }

  if (/relationship/i.test(all) && /does not exist/i.test(all)) {
    const missing_relation = all.match(/"([a-zA-Z0-9_!]+)"/i)?.[1] || null;
    return { missing_relation, missing_table: extractTableName(relationToken) };
  }

  return {};
}

async function runProbe(client, check) {
  try {
    const { error } = await client.from(check.table).select(check.select).limit(0);
    if (error) {
      const classification = classifyError(error);
      return {
        feature_area: check.feature_area,
        table: check.table,
        relation: check.relation || null,
        required_columns: check.required_columns,
        impacted_feature: check.impacted_feature,
        status: 'fail',
        error_classification: classification.error_classification,
        ...detectMissingTarget(error),
      };
    }

    return {
      feature_area: check.feature_area,
      table: check.table,
      relation: check.relation || null,
      required_columns: check.required_columns,
      impacted_feature: check.impacted_feature,
      status: 'pass',
      error_classification: null,
    };
  } catch (error) {
    const classification = classifyError(error);
    return {
      feature_area: check.feature_area,
      table: check.table,
      relation: check.relation || null,
      required_columns: check.required_columns,
      impacted_feature: check.impacted_feature,
      status: 'fail',
      error_classification: classification.error_classification,
      ...detectMissingTarget(error),
    };
  }
}

function aggregateAvailabilityResult(checks) {
  const availabilityPrimary = checks.find((item) => item.table === 'activity_availability_daily');
  const availabilityFallback = checks.find((item) => item.table === 'activity_schedules');

  if (!availabilityPrimary || !availabilityFallback) {
    return {
      feature_area: 'public availability',
      table: 'activity_availability_daily, activity_schedules',
      relation: 'activities!inner(slug)',
      required_columns: [
        'activity_availability_daily.activity_id',
        'activity_schedules.id',
      ],
      impacted_feature: 'availability snapshot',
      status: 'fail',
      error_classification: 'availability_check_missing',
    };
  }

  if (availabilityPrimary.status === 'pass' || availabilityFallback.status === 'pass') {
    return {
      feature_area: 'public availability',
      table: availabilityPrimary.status === 'pass'
        ? availabilityPrimary.table
        : availabilityFallback.table,
      relation: 'activities!inner(slug)',
      required_columns: [
        'activity_id',
        'date',
        'plan_id',
        'total_capacity',
        'total_booked',
        'remaining',
        'is_open',
        'id',
        'start_at',
        'end_at',
        'capacity',
        'booked_count',
        'status',
        'min_participants',
      ],
      impacted_feature: 'availability snapshot',
      status: 'pass',
      error_classification: null,
    };
  }

  return {
    feature_area: 'public availability',
    table: 'activity_availability_daily | activity_schedules',
    relation: 'activities!inner(slug)',
    required_columns: [
      'activity_id',
      'date',
      'plan_id',
      'total_capacity',
      'total_booked',
      'remaining',
      'is_open',
      'id',
      'start_at',
      'end_at',
      'capacity',
      'booked_count',
      'status',
      'min_participants',
    ],
    impacted_feature: 'availability snapshot',
    status: 'fail',
    error_classification: 'availability_snapshot_missing',
    ...availabilityPrimary,
  };
}

function buildSummary(checks, overallStatus) {
  const pass = checks.filter((item) => item.status === 'pass').length;
  const fail = checks.filter((item) => item.status === 'fail').length;
  const blocked = checks.filter((item) => item.status === 'blocked').length;
  return {
    total_checks: checks.length,
    pass,
    fail,
    blocked,
    overall_status: overallStatus,
  };
}

function formatMarkdown(checks, summary) {
  const lines = [];
  lines.push('# Production Schema Drift Preflight');
  lines.push(`Overall status: ${summary.overall_status}`);
  lines.push(`Checks: pass ${summary.pass} / fail ${summary.fail} / blocked ${summary.blocked}`);
  lines.push('');
  lines.push('| Feature area | Table/Relation | Required columns | Status | Impacted feature | Error classification |');
  lines.push('| --- | --- | --- | --- | --- | --- |');

  for (const check of checks) {
    const tableOrRelation = [
      check.table,
      check.relation ? ` (relation: ${check.relation})` : '',
    ].join('');

    const cols = (check.required_columns || []).join(', ');
    lines.push(`| ${check.feature_area} | ${tableOrRelation} | ${cols} | ${check.status} | ${check.impacted_feature} | ${check.error_classification || '-'} |`);
  }

  return lines.join('\n');
}

function applyNoEnvChecks() {
  const hasUrl = Boolean(process.env.SUPABASE_URL);
  const hasKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return hasUrl && hasKey;
}

function blockedResultForCheck(check) {
  return {
    feature_area: check.feature_area,
    table: check.table,
    relation: check.relation || null,
    required_columns: check.required_columns,
    impacted_feature: check.impacted_feature,
    status: 'blocked',
    error_classification: 'no_db_env',
    missing_table: null,
    missing_column: null,
    missing_relation: null,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  const hasDbEnv = options.noEnvCheck || applyNoEnvChecks();

  const checks = [];

  if (!hasDbEnv) {
    for (const check of CHECK_DEFINITIONS) {
      checks.push(blockedResultForCheck(check));
    }
    checks.push({
      feature_area: 'public availability',
      table: 'activity_availability_daily | activity_schedules',
      relation: 'activities!inner(slug)',
      required_columns: [
        'activity_id',
        'date',
        'plan_id',
        'start_at',
        'end_at',
      ],
      impacted_feature: 'availability snapshot',
      status: 'blocked',
      error_classification: 'no_db_env',
    });
    const result = {
      checks,
      summary: {
        total_checks: checks.length,
        pass: 0,
        fail: 0,
        blocked: checks.length,
        overall_status: 'blocked',
      },
      generated_at_utc: new Date().toISOString(),
    };
    const output = options.json
      ? JSON.stringify(result, null, 2)
      : formatMarkdown(checks, result.summary);

    const safeOutput = sanitizeOutputText(output);
    console.log(safeOutput);
    if (options.output) {
      await mkdir(path.dirname(options.output), { recursive: true });
      fs.writeFileSync(options.output, `${safeOutput}\n`, 'utf8');
    }
    return 1;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: 'public',
    },
  });

  const rawChecks = [];
  for (const check of CHECK_DEFINITIONS) {
    rawChecks.push(await runProbe(client, check));
  }

  const availabilityAggregate = aggregateAvailabilityResult(rawChecks);

  const normalizedChecks = [...rawChecks];
  normalizedChecks.push(availabilityAggregate);

  const hasBlocked = normalizedChecks.some((check) => check.status === 'blocked');
  const hasFail = normalizedChecks.some((check) =>
    (check.feature_area.startsWith('public availability') ? check.status === 'fail' : false)
  );

  const availability = normalizedChecks.find((check) => check.feature_area === 'public availability');
  const coreChecks = normalizedChecks.filter((check) => !check.feature_area.startsWith('public availability'));
  const availabilityPass = availability?.status === 'pass';

  let overall_status = 'pass';
  if (hasBlocked) {
    overall_status = 'blocked';
  } else if (!availabilityPass || coreChecks.some((check) => check.status === 'fail')) {
    overall_status = 'fail';
  }

  const summary = buildSummary(normalizedChecks, overall_status);
  const result = {
    checks: normalizedChecks,
    summary,
    generated_at_utc: new Date().toISOString(),
  };

  const output = options.json
    ? JSON.stringify(result, null, 2)
    : formatMarkdown(normalizedChecks, summary);

  const safeOutput = sanitizeOutputText(output);
  console.log(safeOutput);
  if (options.output) {
    await mkdir(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, `${safeOutput}\n`, 'utf8');
  }

  return overall_status === 'pass' ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    const fallback = {
      checks: [],
      summary: {
        total_checks: 0,
        pass: 0,
        fail: 0,
        blocked: 0,
        overall_status: 'fail',
      },
      error: {
        message: 'preflight_runtime_error',
        error_classification: 'runtime_error',
      },
      generated_at_utc: new Date().toISOString(),
    };
    console.error(sanitizeOutputText(JSON.stringify(fallback, null, 2)));
    process.exit(1);
  });
