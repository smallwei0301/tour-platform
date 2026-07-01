import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

describe('GH-851 admin plan create/import regression', () => {
  it('generates a non-empty safe fallback slug for Chinese-only plan names', async () => {
    const { generatePlanSlug } = await import(pathToFileURL(path.resolve(ROOT, 'src/lib/activity-plan-slugs.mjs')).href);

    const slug = generatePlanSlug({ name: '祕境半日遊', suffix: 'issue-851' });

    assert.equal(slug, 'plan-issue-851');
    assert.match(slug, /^[a-z0-9-]+$/);
  });

  it('returns an actionable duplicate slug message instead of a generic create failure', async () => {
    const { duplicatePlanSlugMessage, isDuplicatePlanSlugError } = await import(
      pathToFileURL(path.resolve(ROOT, 'src/lib/activity-plan-slugs.mjs')).href
    );

    assert.equal(isDuplicatePlanSlugError({ code: '23505', message: 'duplicate key value violates unique constraint' }), true);
    assert.match(duplicatePlanSlugMessage('plan-issue-851'), /plan-issue-851/);
    assert.match(duplicatePlanSlugMessage('plan-issue-851'), /choose a different slug|rename/i);
  });

  // #admin-plan-revert 後續：舊版 activities.plans → activity_plans 回寫已廢除。
  // 匯入改走 V2 activityPlans insert-only，覆蓋於 activityplans-v2-import-insert-only.test.mjs
  //（新增／既有 slug skip／schema-lag fallback／併發撞鍵）。此處僅保留 slug 與重複訊息契約。
});
