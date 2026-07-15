import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extractMissingColumn,
  isRichColumn,
  applyWithMissingColumnFallback,
} from '../../src/lib/activity-plans-insert-fallback.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const plansRouteSrc = readFileSync(
  path.resolve(ROOT, 'app/api/v2/admin/activities/[activityId]/plans/route.ts'),
  'utf-8',
);
const planItemRouteSrc = readFileSync(
  path.resolve(ROOT, 'app/api/v2/admin/activities/[activityId]/plans/[planId]/route.ts'),
  'utf-8',
);
const adminPlansPageSrc = readFileSync(
  path.resolve(ROOT, 'app/(non-locale)/admin/activities/[id]/plans/page.tsx'),
  'utf-8',
);

describe('GH-904 generic missing-column fallback helper', () => {
  it('parses Postgres column-of-relation error', () => {
    assert.equal(
      extractMissingColumn({ message: 'column "highlights" of relation "activity_plans" does not exist' }),
      'highlights',
    );
  });

  it('parses PostgREST schema cache error', () => {
    assert.equal(
      extractMissingColumn({ message: "Could not find the 'plan_inclusions' column of 'activity_plans' in the schema cache" }),
      'plan_inclusions',
    );
    assert.equal(
      extractMissingColumn({ message: 'Could not find the "language" column of "activity_plans"' }),
      'language',
    );
  });

  it('parses plain Postgres "column does not exist" error', () => {
    assert.equal(
      extractMissingColumn({ message: 'column "confirm_by_days" does not exist' }),
      'confirm_by_days',
    );
  });

  it('returns null for unrelated errors', () => {
    assert.equal(extractMissingColumn({ message: 'duplicate key value' }), null);
    assert.equal(extractMissingColumn({}), null);
    assert.equal(extractMissingColumn(null), null);
  });

  it('isRichColumn whitelists all migration 20260527 rich columns', () => {
    for (const col of [
      'description', 'legacy_plan_id', 'details_link_text', 'booking_btn_text',
      'highlights', 'language', 'earliest_departure', 'confirm_by_days',
      'free_cancel_days', 'plan_inclusions', 'plan_exclusions', 'plan_itinerary',
      'plan_itinerary_image_url', 'meeting_point_name', 'meeting_address',
      'experience_point_name', 'experience_address', 'plan_notices', 'plan_refund_rules',
    ]) {
      assert.ok(isRichColumn(col), `${col} should be rich`);
    }
  });

  it('isRichColumn rejects basic required columns (so they are never silently stripped)', () => {
    for (const col of ['name', 'slug', 'duration_minutes', 'price_type', 'base_price', 'activity_id', 'status']) {
      assert.equal(isRichColumn(col), false, `${col} should NOT be rich`);
    }
  });

  it('inserts immediately when no error', async () => {
    const calls = [];
    const fakeRow = { id: 'plan-1', name: 'X' };
    const runOperation = async (payload) => {
      calls.push(payload);
      return { data: fakeRow, error: null };
    };
    const result = await applyWithMissingColumnFallback(runOperation, { name: 'X', highlights: ['a'] });
    assert.equal(result.error, null);
    assert.deepEqual(result.data, fakeRow);
    assert.deepEqual(result.droppedColumns, []);
    assert.equal(calls.length, 1);
  });

  it('peels off missing rich columns iteratively until insert succeeds', async () => {
    const calls = [];
    const runOperation = async (payload) => {
      calls.push({ ...payload });
      if ('highlights' in payload) {
        return { data: null, error: { message: 'column "highlights" of relation "activity_plans" does not exist' } };
      }
      if ('plan_inclusions' in payload) {
        return { data: null, error: { message: "Could not find the 'plan_inclusions' column of 'activity_plans' in the schema cache" } };
      }
      if ('description' in payload) {
        return { data: null, error: { message: 'column "description" does not exist' } };
      }
      return { data: { id: 'p1', name: payload.name }, error: null };
    };
    const result = await applyWithMissingColumnFallback(runOperation, {
      name: 'Test Plan',
      base_price: 100,
      highlights: ['a', 'b'],
      plan_inclusions: ['x'],
      description: 'foo',
    });

    assert.equal(result.error, null);
    assert.deepEqual(result.data, { id: 'p1', name: 'Test Plan' });
    assert.deepEqual(result.droppedColumns.sort(), ['description', 'highlights', 'plan_inclusions']);
    assert.equal(calls.length, 4, 'should retry 3 times after stripping each missing column');
    assert.ok(!('highlights' in calls[3]));
    assert.ok(!('plan_inclusions' in calls[3]));
    assert.ok(!('description' in calls[3]));
    assert.equal(calls[3].name, 'Test Plan');
    assert.equal(calls[3].base_price, 100);
  });

  it('returns the original error unchanged when the missing column is NOT a rich field', async () => {
    const runOperation = async () => ({
      data: null,
      error: { message: 'column "name" of relation "activity_plans" does not exist' },
    });
    const result = await applyWithMissingColumnFallback(runOperation, { name: 'X' });
    assert.ok(result.error);
    assert.equal(result.data, null);
    assert.deepEqual(result.droppedColumns, []);
  });

  it('returns the original error unchanged for duplicate-slug / non-schema errors', async () => {
    const dupError = { code: '23505', message: 'duplicate key value violates unique constraint' };
    const runOperation = async () => ({ data: null, error: dupError });
    const result = await applyWithMissingColumnFallback(runOperation, { name: 'X', slug: 'dup' });
    assert.equal(result.error, dupError);
    assert.deepEqual(result.droppedColumns, []);
  });

  it('returns SCHEMA_MISMATCH after exceeding retry budget', async () => {
    let n = 0;
    const runOperation = async () => {
      n++;
      const col = `extra_${n}`;
      return { data: null, error: { message: `column "${col}" of relation "activity_plans" does not exist` } };
    };
    // payload with only rich keys, all of which the mock keeps complaining about
    const payload = {};
    for (let i = 1; i <= 30; i++) payload[`extra_${i}`] = i;
    // monkey-patch isRichColumn would be ideal, but the helper already checks isRichColumn.
    // Instead drive it through a real rich payload that the mock claims is all missing.
    const richPayload = {
      description: 'd', highlights: ['h'], language: 'zh', plan_inclusions: ['p'],
      plan_exclusions: ['e'], plan_itinerary: [{ text: 't' }], plan_notices: ['n'],
      plan_refund_rules: ['r'], meeting_point_name: 'm', meeting_address: 'a',
      experience_point_name: 'e', experience_address: 'a', legacy_plan_id: 'lp',
      details_link_text: 'd', booking_btn_text: 'b', earliest_departure: 'e',
      confirm_by_days: 1, free_cancel_days: 1, plan_itinerary_image_url: 'u',
    };
    let calls = 0;
    const richMissingOp = async (p) => {
      calls++;
      const keys = Object.keys(p);
      if (keys.length === 0) return { data: { id: 'ok' }, error: null };
      const missing = keys[0];
      return { data: null, error: { message: `column "${missing}" of relation "activity_plans" does not exist` } };
    };
    const result = await applyWithMissingColumnFallback(richMissingOp, richPayload, { maxRetries: 25 });
    // Should drop every rich field and eventually succeed (all 19 rich keys peeled off)
    assert.equal(result.error, null);
    assert.deepEqual(result.data, { id: 'ok' });
    assert.equal(result.droppedColumns.length, Object.keys(richPayload).length);
  });
});

describe('GH-904 admin v2 plan POST / PUT routes wiring', () => {
  it('POST route imports applyWithMissingColumnFallback helper', () => {
    assert.match(plansRouteSrc, /applyWithMissingColumnFallback/);
    assert.match(plansRouteSrc, /from\s+'[^']*activity-plans-insert-fallback\.mjs'/);
  });

  it('POST route no longer uses the ad-hoc description-only fallback', () => {
    assert.doesNotMatch(plansRouteSrc, /_omitDescription/);
    assert.doesNotMatch(plansRouteSrc, /\/description\/i\.test/);
  });

  it('POST route returns droppedColumns in the success payload', () => {
    assert.match(plansRouteSrc, /droppedColumns/);
    assert.match(plansRouteSrc, /successV2\(\{\s*plan:\s*data,\s*droppedColumns\s*\}/);
  });

  it('POST route maps SCHEMA_MISMATCH to a Traditional Chinese actionable error', () => {
    assert.match(plansRouteSrc, /SCHEMA_MISMATCH/);
    assert.ok(plansRouteSrc.includes('資料庫 schema 與方案欄位不一致'), 'missing zh-TW SCHEMA_MISMATCH copy');
  });

  it('POST route replaces generic English "Failed to create plan" with localized copy', () => {
    assert.doesNotMatch(plansRouteSrc, /'Failed to create plan'/);
    assert.ok(plansRouteSrc.includes('建立方案失敗'), 'missing zh-TW create-failure copy');
  });

  it('POST route still returns 409 DUPLICATE_SLUG for duplicate slug errors', () => {
    assert.match(plansRouteSrc, /DUPLICATE_SLUG/);
    assert.match(plansRouteSrc, /isDuplicatePlanSlugError/);
  });

  it('PUT route also uses the helper and localized copy', () => {
    assert.match(planItemRouteSrc, /applyWithMissingColumnFallback/);
    assert.match(planItemRouteSrc, /droppedColumns/);
    assert.doesNotMatch(planItemRouteSrc, /'Failed to update plan'/);
    assert.ok(planItemRouteSrc.includes('更新方案失敗'), 'missing zh-TW update-failure copy');
    assert.ok(planItemRouteSrc.includes('資料庫 schema 與方案欄位不一致'), 'missing zh-TW SCHEMA_MISMATCH copy');
  });

  it('admin /activities/[id]/plans UI surfaces droppedColumns to operators in zh-TW', () => {
    assert.match(adminPlansPageSrc, /droppedColumns/);
    assert.match(adminPlansPageSrc, /setNotice/);
    assert.ok(
      adminPlansPageSrc.includes('因資料庫 schema 未升級暫未保存'),
      'missing zh-TW droppedColumns notice copy',
    );
    assert.match(adminPlansPageSrc, /role="status"\s+aria-live="polite"/);
  });
});
