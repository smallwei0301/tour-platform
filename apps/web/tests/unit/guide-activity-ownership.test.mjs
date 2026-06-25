/**
 * assertActivityBelongsToGuide 單測（fake supabase client）。
 *
 * 確保導遊只能操作 guide_id 等於自己的行程；仿 assert-plan-belongs-to-guide.ts。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertActivityBelongsToGuide } from '../../src/lib/assert-activity-belongs-to-guide.ts';

// 最小 fake supabase：.from('activities').select(...).eq('id', x).single()
function fakeSupabase(row, { error = null } = {}) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                single: async () => ({ data: row, error }),
              };
            },
          };
        },
      };
    },
  };
}

test('行程屬於該導遊 → ok', async () => {
  const supabase = fakeSupabase({ id: 'a1', guide_id: 'g1' });
  const r = await assertActivityBelongsToGuide({ activityId: 'a1', guideId: 'g1', supabase });
  assert.deepEqual(r, { ok: true });
});

test('行程屬於別的導遊 → ACTIVITY_WRONG_GUIDE', async () => {
  const supabase = fakeSupabase({ id: 'a1', guide_id: 'g2' });
  const r = await assertActivityBelongsToGuide({ activityId: 'a1', guideId: 'g1', supabase });
  assert.deepEqual(r, { ok: false, code: 'ACTIVITY_WRONG_GUIDE' });
});

test('行程不存在 → ACTIVITY_NOT_FOUND', async () => {
  const supabase = fakeSupabase(null, { error: { message: 'no rows' } });
  const r = await assertActivityBelongsToGuide({ activityId: 'missing', guideId: 'g1', supabase });
  assert.deepEqual(r, { ok: false, code: 'ACTIVITY_NOT_FOUND' });
});

test('行程 guide_id 為 null（尚未指派）→ ACTIVITY_WRONG_GUIDE', async () => {
  const supabase = fakeSupabase({ id: 'a1', guide_id: null });
  const r = await assertActivityBelongsToGuide({ activityId: 'a1', guideId: 'g1', supabase });
  assert.deepEqual(r, { ok: false, code: 'ACTIVITY_WRONG_GUIDE' });
});
