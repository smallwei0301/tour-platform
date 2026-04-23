import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'app/api/payments/ecpay/callback/route.ts');

test('ecpay callback mapping contract: V2 CustomField2=orderId + legacy fallback', async () => {
  const src = await fs.readFile(ROOT, 'utf8');

  // canonical mapping
  assert.match(src, /V2 canonical:\s*CustomField2\s*=\s*orderId/);
  assert.match(src, /const customField2 = payload\?\.CustomField2/);

  // legacy compatibility
  assert.match(src, /Legacy fallback:\s*CustomField1\s*=\s*orderId/);
  assert.match(src, /const customField1 = payload\?\.CustomField1/);

  // safety guard: do not use MerchantTradeNo as order id
  assert.match(src, /不接受 MerchantTradeNo 當作 orderId/);
});
