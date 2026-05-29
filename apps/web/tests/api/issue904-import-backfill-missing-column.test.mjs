import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  applyUpsertWithMissingColumnFallback,
} from '../../src/lib/activity-plans-insert-fallback.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

describe('GH-904 applyUpsertWithMissingColumnFallback (bulk-upsert array variant)', () => {
  it('succeeds immediately when no error', async () => {
    let calls = 0;
    const rows = [{ slug: 'a', highlights: ['x'] }, { slug: 'b', highlights: ['y'] }];
    const result = await applyUpsertWithMissingColumnFallback(async (r) => {
      calls++;
      return { data: r, error: null };
    }, rows);
    assert.equal(result.error, null);
    assert.deepEqual(result.droppedColumns, []);
    assert.equal(calls, 1);
  });

  it('strips a missing rich column from EVERY row and retries to success', async () => {
    const seen = [];
    const runOperation = async (r) => {
      seen.push(r.map((row) => ({ ...row })));
      if (r.some((row) => 'highlights' in row)) {
        return { data: null, error: { message: 'column "highlights" of relation "activity_plans" does not exist' } };
      }
      if (r.some((row) => 'plan_notices' in row)) {
        return { data: null, error: { message: "Could not find the 'plan_notices' column of 'activity_plans' in the schema cache" } };
      }
      return { data: r, error: null };
    };
    const rows = [
      { activity_id: 'a1', slug: 'half-day', name: 'P1', base_price: 100, highlights: ['h1'], plan_notices: ['n1'] },
      { activity_id: 'a1', slug: 'full-day', name: 'P2', base_price: 200, highlights: ['h2'], plan_notices: ['n2'] },
    ];
    const result = await applyUpsertWithMissingColumnFallback(runOperation, rows);

    assert.equal(result.error, null);
    assert.deepEqual(result.droppedColumns.sort(), ['highlights', 'plan_notices']);
    // 3 attempts: original, minus highlights, minus highlights+plan_notices
    assert.equal(seen.length, 3);
    // Final attempt: every row keeps basic fields, drops both rich columns
    for (const row of seen[2]) {
      assert.ok(!('highlights' in row));
      assert.ok(!('plan_notices' in row));
      assert.ok('slug' in row && 'name' in row && 'base_price' in row);
    }
  });

  it('does NOT mutate the caller-provided rows array', async () => {
    const rows = [{ slug: 'a', highlights: ['x'] }];
    const runOperation = async (r) =>
      r.some((row) => 'highlights' in row)
        ? { data: null, error: { message: 'column "highlights" does not exist' } }
        : { data: r, error: null };
    await applyUpsertWithMissingColumnFallback(runOperation, rows);
    assert.deepEqual(rows[0], { slug: 'a', highlights: ['x'] }, 'original rows must be untouched');
  });

  it('bails (returns original error) when the missing column is NOT rich (e.g. slug)', async () => {
    const slugError = { message: 'column "slug" of relation "activity_plans" does not exist' };
    const result = await applyUpsertWithMissingColumnFallback(
      async () => ({ data: null, error: slugError }),
      [{ slug: 'a', name: 'P' }],
    );
    assert.equal(result.error, slugError);
    assert.deepEqual(result.droppedColumns, []);
  });

  it('bails for unrelated DB errors (e.g. duplicate key)', async () => {
    const dupError = { code: '23505', message: 'duplicate key value violates unique constraint' };
    const result = await applyUpsertWithMissingColumnFallback(
      async () => ({ data: null, error: dupError }),
      [{ slug: 'a', highlights: ['x'] }],
    );
    assert.equal(result.error, dupError);
    assert.deepEqual(result.droppedColumns, []);
  });
});

// Mock supabase whose activity_plans upsert fails once with a missing rich column,
// then succeeds on retry — mirrors the issue851 mock shape.
function buildImportMockWithMissingColumn({ upsertCalls, missingColumn }) {
  const activityRow = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    slug: 'demo-activity',
    title: 'Demo',
    plans: [],
    status: 'draft',
    created_at: '2026-05-28T00:00:00.000Z',
    updated_at: '2026-05-28T00:00:00.000Z',
    guide_id: null,
  };

  function activityPlansUpsert(rows, options) {
    upsertCalls.push({ rows: rows.map((r) => ({ ...r })), options });
    // Fail while the missing rich column is still present; succeed once stripped.
    if (rows.some((r) => missingColumn in r)) {
      return Promise.resolve({
        error: { message: `column "${missingColumn}" of relation "activity_plans" does not exist` },
      });
    }
    return Promise.resolve({ error: null });
  }

  function chain(table, ctx = {}) {
    return {
      select() {
        return chain(table, ctx);
      },
      eq(column, value) {
        if (table === 'activity_plans' && ctx.mode === 'selectExisting' && column === 'activity_id') {
          return Promise.resolve({ data: [], error: null });
        }
        return chain(table, { ...ctx, [column]: value });
      },
      update() {
        return { eq: () => Promise.resolve({ error: null }) };
      },
      order() {
        return Promise.resolve({ data: [], error: null });
      },
      single() {
        if (table === 'activities') return Promise.resolve({ data: activityRow, error: null });
        return Promise.resolve({ data: null, error: { message: 'not found' } });
      },
      upsert(rows, options) {
        return activityPlansUpsert(rows, options);
      },
    };
  }

  return {
    from(table) {
      if (table === 'activity_plans') {
        return {
          select() {
            return chain(table, { mode: 'selectExisting' });
          },
          upsert(rows, options) {
            return activityPlansUpsert(rows, options);
          },
        };
      }
      return chain(table);
    },
  };
}

describe('GH-904 JSON-import backfill degrades gracefully when schema lacks rich columns', () => {
  it('syncImportedActivityPlansDb retries without the missing rich column instead of throwing', async () => {
    const dbMod = await import(pathToFileURL(path.resolve(ROOT, 'src/lib/db.mjs')).href);
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const upsertCalls = [];

    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    dbMod.__setSupabaseClientForTest(buildImportMockWithMissingColumn({ upsertCalls, missingColumn: 'highlights' }));

    try {
      // Must NOT throw even though the first upsert rejects on a missing rich column.
      await dbMod.updateActivityDb('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', {
        plans: [
          {
            id: 'half-day',
            label: '祕境半日遊',
            price: 3600,
            priceMultiplier: 1,
            minParticipants: 2,
            maxParticipants: 6,
            highlights: ['中文方案亮點'],
            planInclusions: ['導覽'],
          },
        ],
      });

      // First attempt includes highlights (fails), retry strips it (succeeds).
      assert.ok(upsertCalls.length >= 2, 'expected an initial attempt plus at least one retry');
      assert.ok('highlights' in upsertCalls[0].rows[0], 'first attempt should still carry highlights');
      const last = upsertCalls[upsertCalls.length - 1];
      assert.ok(!('highlights' in last.rows[0]), 'final retry should have stripped highlights');
      assert.equal(last.rows[0].name, '祕境半日遊', 'basic fields preserved on retry');
      assert.equal(last.rows[0].base_price, 3600);
      assert.deepEqual(last.options, { onConflict: 'activity_id,slug' });
    } finally {
      dbMod.__setSupabaseClientForTest(null);
      if (originalUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = originalUrl;
      if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
  });
});
