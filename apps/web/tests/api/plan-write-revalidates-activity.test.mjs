import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, '../../');

// 後台「方案管理」改完，前台詳情頁（ISR revalidate=60）與商店／預約頁邊緣快取
// （stale-while-revalidate）原本不會被失效，導致變更要等數十秒～數分鐘才反映，
// 操作者誤以為「修改被還原」。本測試鎖定：所有方案／季節寫入路由都要在成功寫入後
// 呼叫 revalidateActivityById（與 admin 行程編輯路由相同的 on-demand 失效模式）。
const PLANS = 'app/api/v2/admin/activities/[activityId]/plans';
const ROUTES = [
  `${PLANS}/route.ts`,
  `${PLANS}/[planId]/route.ts`,
  `${PLANS}/[planId]/seasons/route.ts`,
  `${PLANS}/[planId]/seasons/[seasonId]/route.ts`,
];

for (const rel of ROUTES) {
  test(`${rel} imports + calls revalidateActivityById`, () => {
    const src = readFileSync(path.join(appDir, rel), 'utf8');
    assert.match(
      src,
      /import\s*\{\s*revalidateActivityById\s*\}\s*from\s*['"][^'"]*revalidate-activity-by-id\.mjs['"]/,
      'route must import revalidateActivityById',
    );
    assert.match(src, /revalidateActivityById\s*\(/, 'route must call revalidateActivityById after the write');
  });
}

test('plan PUT and DELETE both invalidate the activity cache', () => {
  const src = readFileSync(path.join(appDir, `${PLANS}/[planId]/route.ts`), 'utf8');
  // 兩個 mutation handler 各自要有一次失效呼叫（PUT 更新、DELETE 封存）。
  const occurrences = (src.match(/revalidateActivityById\s*\(/g) || []).length;
  assert.ok(occurrences >= 2, `expected >=2 revalidate calls, got ${occurrences}`);
});

test('seasons single-item route invalidates on both PUT and DELETE', () => {
  const src = readFileSync(path.join(appDir, `${PLANS}/[planId]/seasons/[seasonId]/route.ts`), 'utf8');
  const occurrences = (src.match(/revalidateActivityById\s*\(/g) || []).length;
  assert.ok(occurrences >= 2, `expected >=2 revalidate calls, got ${occurrences}`);
});
