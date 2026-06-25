import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');

async function readSource(relPath) {
  return readFile(path.join(WEB_ROOT, relPath), 'utf8');
}

test('GH-1237 RED: client-api declares UUID/slug booking activity lookup helper', async () => {
  const src = await readSource('src/lib/client-api.ts');

  assert.match(src, /export\s+async\s+function\s+fetchActivityByIdOrSlug\s*\(/);
});

test('GH-1237 RED: client-api UUID fallback flow is wired through public activity list to canonical slug refetch', async () => {
  const src = await readSource('src/lib/client-api.ts');

  assert.match(src, /\/api\/activities\/\$\{encodeURIComponent\(activityIdOrSlug\)\}/);
  assert.match(src, /\/api\/activities`?,\s*\{ cache: 'no-store' \}/);
  assert.match(src, /canonicalSlug/);
  assert.match(src, /activity\.slug/);
  assert.match(src, /activityIdOrSlug/);
});

test('GH-1237 RED: booking page uses canonical activity lookup helper and rewrites UUID URLs to slug booking path', async () => {
  const src = await readSource('app/booking/[activityId]/page.tsx');

  assert.match(src, /fetchActivityByIdOrSlug\(/);
  assert.match(src, /window\.history\.replaceState\(/);
  assert.match(src, /router\.replace\(/);
  assert.match(src, /\/booking\/\$\{encodeURIComponent\(resolved\.canonicalSlug\)\}/);
});

test('GH-1237 RED: booking page maps raw missing-plan English errors to traveler-safe Traditional Chinese recovery copy', async () => {
  const src = await readSource('app/booking/[activityId]/page.tsx');

  assert.match(src, /function\s+getBookingV2RecoveryMessage\s*\(/);
  assert.match(src, /Activity plan not found/);
  // #multilingual: 繁中 recovery 文案移到 bookingFlow.v2PlanRecovery / v2RecoveryLink；
  // 頁面用 m.<key> 引用。內容類斷言改讀繁中 catalog + 驗 m.<key> 引用。
  const zh = JSON.parse(await readSource('messages/zh-Hant.json'));
  assert.match(zh.bookingFlow.v2PlanRecovery, /找不到此方案，請回到行程頁重新選擇。/);
  assert.match(src, /planRecovery: m\.v2PlanRecovery/);
  assert.match(src, /setV2Error\(getBookingV2RecoveryMessage\(/);
  assert.match(src, /data-testid="booking-v2-recovery-link"/);
  assert.match(zh.bookingFlow.v2RecoveryLink, /回到行程頁重新選擇方案/);
  assert.match(src, /\{m\.v2RecoveryLink\}/);
  assert.match(src, /#section-plan/);
  assert.doesNotMatch(src, />\s*Activity plan not found\s*</);
});

test('GH-1237 RED: Playwright close-gate spec covers raw English missing-plan payload and installs route mocks before warmup', async () => {
  const src = await readSource('e2e/issue1237-booking-v2-entry-and-recovery.spec.ts');

  assert.match(src, /message:\s*'Activity plan not found'/);
  assert.doesNotMatch(src, /messageZh:\s*'找不到此方案，請回到行程頁重新選擇。'/);
  assert.match(src, /await installBookingRoutes\(page\);[\s\S]*await warmBookingRoute\(page\s*,/);
});
