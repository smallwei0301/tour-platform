import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const editPageSrc = readFileSync(
  path.resolve(ROOT, 'app/admin/activities/[id]/edit/page.tsx'),
  'utf-8',
);

// GH-917 後續（#admin-plan-revert）：舊版 activities.plans 回寫已廢除。行程編輯不再
// 送 legacy `plans`；改由 JSON 匯入帶入 V2 `activityPlans`，儲存時 insert-only 建立。
describe('admin activity editor no longer round-trips legacy plans', () => {
  it('does NOT send legacy `plans` in the save body', () => {
    assert.doesNotMatch(editPageSrc, /\.\.\.\(plansTouched\s*\?\s*\{\s*plans\s*\}/);
    assert.doesNotMatch(editPageSrc, /const\s+\[plansTouched/);
    assert.doesNotMatch(editPageSrc, /const\s+DEFAULT_PLANS/);
    assert.doesNotMatch(editPageSrc, /interface\s+PlanConfig/);
  });

  it('sends V2 `activityPlans` only when a JSON import carried them (insert-only)', () => {
    assert.match(editPageSrc, /const\s+\[importedPlans,\s*setImportedPlans\]/);
    assert.match(editPageSrc, /\.\.\.\(importedPlans\s*&&\s*importedPlans\.length\s*\?\s*\{\s*activityPlans:\s*importedPlans\s*\}/);
  });

  it('import populates importedPlans from d.activityPlans and clears after save', () => {
    assert.match(editPageSrc, /setImportedPlans\(\s*Array\.isArray\(d\.activityPlans\)/);
    assert.match(editPageSrc, /setImportedPlans\(null\)/);
  });

  it('no longer renders the legacy plan-count / 備援 itinerary editor', () => {
    assert.doesNotMatch(editPageSrc, /legacy plans 筆數/);
    assert.doesNotMatch(editPageSrc, /詳細行程時間表（備援區/);
    assert.doesNotMatch(editPageSrc, /儲存行程時間表/);
  });
});

describe('save-body guard logic (V2 insert-only)', () => {
  function buildSaveBody({ importedPlans }) {
    return {
      title: 'x',
      ...(importedPlans && importedPlans.length ? { activityPlans: importedPlans } : {}),
    };
  }

  it('includes activityPlans only when an import carried plans', () => {
    const real = [{ name: 'A', priceType: 'per_group', basePrice: 1800 }];
    assert.deepEqual(buildSaveBody({ importedPlans: real }).activityPlans, real);
  });

  it('omits activityPlans entirely when nothing was imported', () => {
    const body = buildSaveBody({ importedPlans: null });
    assert.ok(!('activityPlans' in body), 'no plans → no activityPlans field');
    assert.ok(!('plans' in body), 'legacy plans field must never be sent');
  });
});
