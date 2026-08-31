import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) => readFile(path.join(ROOT, relativePath), 'utf8');

test('Midao 訂單入口與路由只新增 read-only workbench', async () => {
  const nav = await read('src/features/midao/shell/nav-items.ts');
  const page = await read('app/(non-locale)/midao/orders/page.tsx');

  assert.match(nav, /\{ id: 'orders', label: '訂單', href: '\/midao\/orders', icon: 'briefcase' \}/u);
  assert.match(page, /OrderListScreen/u);
  assert.match(page, /aria-label="訂單"/u);
  assert.doesNotMatch(page, /guideId|supabase|api\/guide\/bookings/u);
});

test('Midao 訂單畫面只消費 canonical guide booking projection 並保留 read retry', async () => {
  const screen = await read('src/features/midao/orders/OrderListScreen.tsx');

  assert.match(screen, /fetch\('\/api\/v2\/guide\/bookings'/u);
  assert.match(
    screen,
    /useEffect\(\(\) => \{\s*mountedRef\.current = true;\s*return \(\) => \{\s*mountedRef\.current = false;/u,
    'client navigation and React Strict Mode remount must reactivate mountedRef before accepting the response',
  );
  assert.match(screen, /cache: 'no-store'/u);
  assert.match(screen, /response\.ok/u);
  assert.match(screen, /value\.ok === true/u);
  assert.match(screen, /InlineError/u);
  assert.match(screen, /onRetry/u);
  assert.match(screen, /midao-orders-empty/u);
  assert.match(screen, /midao-orders-list/u);
  assert.match(screen, /tourTitle|scheduleDate|partySize|paymentStatus|totalTwd/u);
  assert.doesNotMatch(screen, /fetch\([^)]*method:\s*['"](?:POST|PUT|PATCH|DELETE)/u);
  assert.doesNotMatch(screen, /guideId|supabase|adminNote|admin_note|guestPhone|contactEmail|contactPhone|maskedEmail|token/u);
});
