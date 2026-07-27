import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const mapperMod = path.resolve(ROOT, 'src/lib/activity-plans-rich-mapper.mjs');

// 後台方案列表的「啟用／停用」按鈕只送 PUT {status}。舊實作把全量語意的
// normalizeRichPlanPayload 直接 Object.assign 進 UPDATE payload，導致未提供的
// plan_itinerary／highlights／集合點等 rich 欄位全部被洗成 null（方案詳情消失 bug）。
// 修法：UPDATE 路徑改用部分更新語意的 normalizeRichPlanPatch。
describe('plan status toggle preserves rich fields (admin PUT partial update)', () => {
  it('normalizeRichPlanPatch returns no rich keys for a status-only body', async () => {
    const { normalizeRichPlanPatch } = await import(pathToFileURL(mapperMod).href);
    const patch = normalizeRichPlanPatch({ status: 'active' });
    assert.deepEqual(patch, {}, 'status-only body 不得產生任何 rich 欄位覆蓋');
  });

  it('normalizeRichPlanPatch only includes fields present in the body', async () => {
    const { normalizeRichPlanPatch } = await import(pathToFileURL(mapperMod).href);
    const patch = normalizeRichPlanPatch({
      status: 'inactive',
      highlights: ['亮點 A', '  '],
      meeting_point_name: ' 南澳火車站 ',
    });
    assert.deepEqual(patch, {
      highlights: ['亮點 A'],
      meeting_point_name: '南澳火車站',
    });
    assert.equal('plan_itinerary' in patch, false, '未提供 plan_itinerary 不得出現在 patch');
    assert.equal('plan_refund_rules' in patch, false);
  });

  it('normalizeRichPlanPatch still normalizes camelCase aliases when provided', async () => {
    const { normalizeRichPlanPatch } = await import(pathToFileURL(mapperMod).href);
    const patch = normalizeRichPlanPatch({
      planItinerary: [{ title: '09:00', description: '集合整裝', imageUrl: 'https://example.com/a.jpg' }],
      confirmByDays: '7',
    });
    assert.deepEqual(patch.plan_itinerary, [
      { title: '09:00', description: '集合整裝', imageUrl: 'https://example.com/a.jpg' },
    ]);
    assert.equal(patch.confirm_by_days, 7);
  });

  it('explicitly provided empty plan_itinerary still clears (intentional clear preserved)', async () => {
    const { normalizeRichPlanPatch } = await import(pathToFileURL(mapperMod).href);
    const patch = normalizeRichPlanPatch({ plan_itinerary: [] });
    assert.deepEqual(patch.plan_itinerary, []);
  });

  it('admin plan PUT route uses the partial-update mapper, not the full-payload one', () => {
    const source = read('app/api/v2/admin/activities/[activityId]/plans/[planId]/route.ts');
    assert.match(source, /normalizeRichPlanPatch\(body\)/, 'PUT 必須用部分更新語意的 normalizeRichPlanPatch');
    assert.doesNotMatch(
      source,
      /Object\.assign\(updateData,\s*normalizeRichPlanPayload\(/,
      '禁止把全量語意 normalizeRichPlanPayload 直接 assign 進 UPDATE payload（會洗掉方案詳情）',
    );
  });

  it('admin plans page status toggle sends status-only PUT (repro contract)', () => {
    const source = read('app/(non-locale)/admin/activities/[id]/plans/page.tsx');
    assert.match(source, /JSON\.stringify\(\{\s*status:\s*newStatus\s*\}\)/, '啟用/停用按鈕為 status-only PUT，是本測試守護的觸發路徑');
  });
});
