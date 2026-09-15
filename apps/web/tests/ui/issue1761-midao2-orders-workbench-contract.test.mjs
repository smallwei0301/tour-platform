import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) => readFile(path.join(ROOT, relativePath), 'utf8');

test('Midao2 訂單入口在既有 shell 中維持 active navigation', async () => {
  const layout = await read('app/(non-locale)/midao2/layout.tsx');

  assert.match(layout, /\{ href: '\/midao2\/orders', label: '訂單', icon: 'file-text' \}/u);
  assert.match(layout, /pathname\.startsWith\(tab\.href\)/u);
});

test('Midao2 訂單工作台只讀取 canonical projection 並處理登入與讀取狀態', async () => {
  const page = await read('app/(non-locale)/midao2/orders/page.tsx');

  assert.match(page, /fetch\('\/api\/v2\/guide\/bookings', \{ cache: 'no-store' \}\)/u);
  assert.match(page, /value\.ok === true/u);
  assert.match(page, /Array\.isArray\(value\.data\)/u);
  assert.match(page, /response\.status === 401/u);
  assert.match(page, /window\.location\.assign\('\/guide\/login\?next=\/midao2\/orders'\)/u);
  assert.match(page, /Spinner/u);
  assert.match(page, /ErrorState/u);
  assert.match(page, /EmptyState/u);
  assert.match(page, /onRetry=\{\(\) => void load\(\)\}/u);
  assert.match(page, /data-testid="midao2-orders-list"/u);
  assert.match(page, /tourTitle|scheduleDate|partySize|status|paymentStatus|totalTwd|createdAt/u);

  assert.doesNotMatch(page, /guideId|supabase|guestName|guestPhone|maskedEmail|scheduleId|planId|hasConflictOverride|admin_note|contact|token|\.message/u);
  assert.doesNotMatch(page, /method:\s*['"](?:POST|PUT|PATCH|DELETE)/u);
  assert.doesNotMatch(page, /href=|router\.|onClick=\{[^}]*push/u);
});
