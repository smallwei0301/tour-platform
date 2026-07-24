import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => readFile(path.join(ROOT, p), 'utf8');

test('公開接案頁 route：統一 404、不 import 私人欄位', async () => {
  const src = await read('app/api/v2/public/midao/guides/[slug]/route.ts');
  assert.match(src, /jsonError\('NOT_FOUND', '找不到此接案頁', 404\)/);
  assert.match(src, /getPublicMidaoPageDb\(slug\)/);
  assert.doesNotMatch(src, /guide_email|bank|transfer|line_user_id/);
});

test('公開可選日期 route：month 驗證＋只回 openPeriods', async () => {
  const src = await read('app/api/v2/public/midao/guides/[slug]/availability/route.ts');
  assert.match(src, /jsonError\('INVALID_MONTH'/);
  assert.match(src, /openPeriods/);
  assert.match(src, /getMonthEffectiveDb\(/);
});

test('公開送單 route：rate-limit＋honeypot＋activity 歸屬＋LINE fire-and-forget', async () => {
  const src = await read('app/api/v2/public/midao/guides/[slug]/requests/route.ts');
  assert.match(src, /new RateLimiter\(5, 60 \* 1000\)/);
  assert.match(src, /jsonError\('RATE_LIMITED'/);
  assert.match(src, /body\.website/);                       // honeypot
  assert.match(src, /jsonError\('INVALID_ACTIVITY'/);       // 歸屬檢查
  assert.match(src, /normalizeRequestInput\(body\)/);
  assert.match(src, /source: 'public_page'/);
  assert.match(src, /notifyGuideNewMidaoRequest\(/);
  assert.match(src, /\.catch\(\(\) => \{\}\)/);             // fire-and-forget
});

test('公開送單 route：planId 選填驗證＋不信任 client 傳的方案名稱', async () => {
  const src = await read('app/api/v2/public/midao/guides/[slug]/requests/route.ts');
  assert.match(src, /planOptions/);
  assert.match(src, /jsonError\('INVALID_PLAN', '請選擇有效的方案', 400\)/); // planId 給了但不在 planOptions → INVALID_PLAN
  assert.match(src, /matched\.name/);                       // server 端方案名為準，不信任 client title
  assert.match(src, /body\.planTitle = matched\.name/);
});
