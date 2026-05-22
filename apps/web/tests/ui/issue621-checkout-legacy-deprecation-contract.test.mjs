import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

test('issue621 checkout page shows explicit legacy/deprecation banner and points to V2 booking route', async () => {
  const rel = 'app/checkout/page.tsx';
  const src = await readFile(path.join(ROOT, rel), 'utf8');

  assert.match(
    src,
    /Legacy 舊版預約流程|舊版預約流程（Legacy）|舊版結帳入口/,
    'checkout should clearly label itself as legacy/deprecation path instead of normal primary traveler path'
  );

  assert.match(
    src,
    /\/booking\/\$\{encodeURIComponent\(slug\)\}/,
    'checkout should provide a visible CTA that routes users back to V2 /booking/[slug] entry'
  );

  assert.match(
    src,
    /legacy|deprecated|備援|fallback/i,
    'checkout deprecation copy should explicitly communicate legacy/fallback semantics'
  );
});
