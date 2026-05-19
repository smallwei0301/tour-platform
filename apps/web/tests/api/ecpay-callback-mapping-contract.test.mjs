import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../app/api/payments/ecpay/callback/route.ts');

test('ecpay callback mapping contract: V2 CustomField2=orderId + CustomField4=email + legacy fallback', async () => {
  const src = await fs.readFile(ROOT, 'utf8');

  // canonical mapping
  assert.match(src, /V2 canonical:\s*CustomField2\s*=\s*orderId/);
  assert.match(src, /const customField2 = payload\?\.CustomField2/);
  assert.match(src, /CustomField4/);

  // legacy compatibility
  assert.match(src, /Legacy fallback:\s*CustomField1\s*=\s*orderId/);
  assert.match(src, /const customField1 = payload\?\.CustomField1/);
  assert.match(src, /舊流程把 email 放在 CustomField2/);

  // safety guard: do not use MerchantTradeNo as order id
  assert.match(src, /不接受 MerchantTradeNo 當作 orderId/);
});
