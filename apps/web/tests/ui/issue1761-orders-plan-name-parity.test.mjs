import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) => readFile(path.join(ROOT, relativePath), 'utf8');

const PLAN_FALLBACK = '尚未指定方案';

test('#1761 5C bookings 投影以第二次查詢取得 planName，planId 優先取 bookings.activity_plan_id', async () => {
  const route = await read('app/api/v2/guide/bookings/route.ts');

  assert.match(route, /\.select\('id, conflict_override_snapshot, activity_plan_id'\)/u);
  assert.match(route, /\.from\('activity_plans'\)\s*\.select\('id, name, activity_id'\)\s*\.in\('id', planIds\)/u);
  assert.match(route, /activityIdSet\.has\(plan\.activity_id\)/u, '只採用屬於本導遊 activity 的 plan');
  assert.match(route, /planName:/u);
  assert.match(route, /bookingPlanIdMap\[o\.booking_id\] : undefined\) \?\? schedule\?\.plan_id/u, 'bookings.activity_plan_id 優先，其次 schedule.plan_id');
  assert.match(route, /candidatePlan\.activity_id === o\.activity_id/u, '單筆訂單的 plan 必須屬於該訂單的 activity');
  assert.doesNotMatch(route, /bookings!|activity_plans\(/u, '不使用 embed，避免 PGRST201 歧義');
});

for (const [label, file] of [
  ['midao2', 'app/(non-locale)/midao2/orders/page.tsx'],
  ['legacy midao', 'src/features/midao/orders/OrderListScreen.tsx'],
]) {
  test(`#1761 5C ${label} 訂單列表顯示方案名稱與一致 fallback`, async () => {
    const src = await read(file);
    assert.match(src, /planName: string \| null/u);
    assert.match(src, /value\.planName === null \|\| typeof value\.planName === 'string'/u);
    assert.match(src, /<dt>方案<\/dt>|>方案<\/dt>/u);
    assert.ok(src.includes(`.planName || '${PLAN_FALLBACK}'`), 'fallback 文案必須與需求單一致');
  });
}

test('#1761 5C midao2 projectOrder 安全欄位加入 planName 且無 PII', async () => {
  const page = await read('app/(non-locale)/midao2/orders/page.tsx');
  assert.match(
    page,
    /function projectOrder\(value: OrderProjection\): OrderProjection \{\s*return \{[^}]*planName: value\.planName,[^}]*\};\s*\}/u,
  );
  assert.doesNotMatch(page, /guestName|guestPhone|maskedEmail|planId|contact/u);
});

test('#1761 5C 需求單方案 fallback 文案在 RequestCard 與 RequestSummaryCard 一致', async () => {
  const card = await read('src/features/midao/requests/RequestCard.tsx');
  const summary = await read('src/features/midao/requests/RequestSummaryCard.tsx');
  assert.ok(card.includes(`planName || '${PLAN_FALLBACK}'`));
  const matches = summary.match(/planName \|\| '([^']+)'/gu) ?? [];
  assert.equal(matches.length, 2);
  for (const m of matches) assert.ok(m.includes(PLAN_FALLBACK), m);
});
