import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const APP_ROOT = path.join(process.cwd(), 'apps', 'web');

async function readSource(relPath) {
  return readFile(path.join(APP_ROOT, relPath), 'utf8');
}

test('order pay page does not expose traveler-visible mock payment CTA', async () => {
  const src = await readSource('app/order/pay/page.tsx');

  assert.doesNotMatch(src, /data-testid="mock-pay-btn"/, 'must not render mock pay test id on order pay page');
  assert.doesNotMatch(src, /模擬付款（測試用）/, 'must not expose mock payment copy to travelers');
  assert.doesNotMatch(src, /handleMockPay\s*=\s*async/, 'must not keep mock payment handler in page client code');
});

test('mock confirm API remains server-gated by ALLOW_MOCK_PAYMENT=true', async () => {
  const src = await readSource('app/api/payments/mock-confirm/route.ts');

  assert.match(src, /process\.env\.ALLOW_MOCK_PAYMENT/, 'server endpoint must check ALLOW_MOCK_PAYMENT env');
  assert.match(src, /!==\s*['"]true['"]/, 'server endpoint must stay default-off unless env is true');
});
