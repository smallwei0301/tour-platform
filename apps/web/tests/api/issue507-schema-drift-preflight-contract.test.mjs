import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '../../../../scripts/production-schema-drift-preflight.mjs');
const ROOT_PATH = path.resolve(__dirname, '../../../');

function runPreflight(args = [], extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };

  const proc = spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    cwd: ROOT_PATH,
    env,
    encoding: 'utf8',
  });

  return {
    status: proc.status,
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
    output: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
  };
}

function withNoDbEnv(baseEnv = {}) {
  const env = { ...process.env, ...baseEnv };
  delete env.SUPABASE_URL;
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  return env;
}

const EXPECTED_CHECKS = [
  {
    feature_area: 'public activities',
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
  },
  {
    feature_area: 'public availability',
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
  },
  {
    feature_area: 'public availability fallback',
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
  },
  {
    feature_area: 'guide availability plan reads',
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
  },
  {
    feature_area: 'guide availability plan reads',
    table: 'guide_availability_rules',
    relation: null,
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
  },
  {
    feature_area: 'guide availability plan reads',
    table: 'guide_blackout_dates',
    relation: null,
    required_columns: [
      'id',
      'guide_id',
      'starts_at',
      'ends_at',
      'reason',
      'source',
    ],
  },
  {
    feature_area: 'guide availability plan reads',
    table: 'bookings',
    relation: null,
    required_columns: [
      'id',
      'guide_id',
      'start_at',
      'end_at',
      'status',
    ],
  },
  {
    feature_area: 'settlement',
    table: 'settlement_rules',
    relation: null,
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
  },
  {
    feature_area: 'payouts / balances',
    table: 'payouts',
    relation: 'guide_profiles(display_name, email)',
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
  },
  {
    feature_area: 'payouts / balances',
    table: 'guide_balances',
    relation: null,
    required_columns: [
      'guide_id',
      'balance_twd',
      'updated_at',
    ],
  },
  {
    feature_area: 'refund requests',
    table: 'refund_requests',
    relation: null,
    required_columns: [
      'id',
      'order_id',
      'status',
      'retry_count',
      'last_error',
      'created_at',
      'refunded_at',
    ],
  },
  {
    feature_area: 'payment events',
    table: 'payment_events',
    relation: null,
    required_columns: [
      'id',
      'payment_id',
      'order_id',
      'event_type',
      'payload',
      'trade_no',
      'created_at',
    ],
  },
];

describe('Issue 507 schema drift preflight contract', () => {
  it('requires the preflight script file to exist at repo scripts path', () => {
    assert.ok(fs.existsSync(SCRIPT_PATH), `Missing script: ${SCRIPT_PATH}`);
  });

  it('supports --help and documents required flags', () => {
    const result = runPreflight(['--help']);
    assert.equal(result.status, 0, 'help should exit 0');
    assert.match(result.output, /schema[-\s]*drift-preflight/i);
    assert.match(result.output, /--json/i);
    assert.match(result.output, /--markdown/i);
    assert.match(result.output, /--output/i);
    assert.match(result.output, /--help/i);
  });

  it('emits JSON inventory with required feature/table/relation columns', () => {
    const result = runPreflight(['--json'], withNoDbEnv());
    assert.equal(result.status, 1, 'no-db mode should be non-zero');

    const payload = JSON.parse(result.output);
    assert.equal(payload.summary?.overall_status, 'blocked');

    const checksByFeatureTable = Object.fromEntries(
      payload.checks
        .filter((c) => c.table !== 'activity_availability_daily | activity_schedules')
        .map((c) => [`${c.feature_area}::${c.table}`, c]),
    );

    for (const expected of EXPECTED_CHECKS) {
      const key = `${expected.feature_area}::${expected.table}`;
      const actual = checksByFeatureTable[key];
      assert.ok(actual, `Missing expected check ${key}`);
      assert.equal(actual.relation || null, expected.relation);
      assert.deepEqual(actual.required_columns, expected.required_columns);
      assert.equal(actual.impacted_feature?.length > 0, true);
      assert.equal(actual.status, 'blocked');
      assert.equal(actual.error_classification, 'no_db_env');
      assert.equal(actual.missing_table ?? null, null);
      assert.equal(actual.missing_column ?? null, null);
      assert.equal(actual.missing_relation ?? null, null);
    }
  });

  it('includes markdown output and handles --output', () => {
    const outPath = path.join(os.tmpdir(), 'preflight-contract-output.md');
    const result = runPreflight(['--markdown', '--output', outPath], withNoDbEnv());
    assert.equal(result.status, 1);
    assert.match(result.output, /Production Schema Drift Preflight/i);
    assert.equal(fs.readFileSync(outPath, 'utf8').includes('Production Schema Drift Preflight'), true);
  });

  it('fails with explicit no_db_env classification when SUPABASE env is missing', () => {
    const result = runPreflight(['--json'], withNoDbEnv());
    assert.notEqual(result.status, 0, 'missing env must be a non-zero exit');

    const output = result.output;
    const payload = JSON.parse(output);

    assert.match(output, /no_db_env/i, 'classification must include no_db_env');
    assert.equal(payload.summary?.overall_status, 'blocked');
    assert.equal(payload.summary?.blocked > 0, true);
    for (const check of payload.checks) {
      assert.equal(check.status, 'blocked');
      assert.equal(check.error_classification, 'no_db_env');
      assert.equal(check.impacted_feature?.length > 0, true);
    }
  });
});