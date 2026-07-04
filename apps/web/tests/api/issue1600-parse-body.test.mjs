/**
 * Issue #1600 — parseBody（zod）行為測試＋redeem 導入 source-contract。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { parseBody } from '../../src/lib/validation/parse-body.ts';
import { RedeemBodySchema } from '../../src/lib/validation/payment-schemas.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function req(body) {
  return new Request('http://x/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const Schema = z.object({ token: z.string().min(1), qty: z.number().int().positive().optional() });

test('T1600.1 — 合法 body 通過並回收斂後 data', async () => {
  const r = await parseBody(req({ token: 'abc', qty: 2 }), Schema);
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, { token: 'abc', qty: 2 });
});

test('T1600.2 — 缺必填 → 400 INVALID_REQUEST，errorV2 shape', async () => {
  const r = await parseBody(req({ qty: 2 }), Schema);
  assert.equal(r.ok, false);
  assert.equal(r.response.status, 400);
  const body = await r.response.json();
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'INVALID_REQUEST');
});

test('T1600.3 — 型別錯（qty 為字串）→ 400', async () => {
  const r = await parseBody(req({ token: 'a', qty: 'x' }), Schema);
  assert.equal(r.ok, false);
  assert.equal(r.response.status, 400);
});

test('T1600.4 — 非 JSON body → 400 INVALID_REQUEST', async () => {
  const r = await parseBody(req('not-json{'), Schema);
  assert.equal(r.ok, false);
  const body = await r.response.json();
  assert.equal(body.error.code, 'INVALID_REQUEST');
});

test('T1600.5 — RedeemBodySchema 要求非空 token', () => {
  assert.equal(RedeemBodySchema.safeParse({ token: 'v1.x.y' }).success, true);
  assert.equal(RedeemBodySchema.safeParse({ token: '' }).success, false);
  assert.equal(RedeemBodySchema.safeParse({}).success, false);
});

test('T1600.6 — redeem route 用 parseBody＋RedeemBodySchema，且保留 voucher 驗簽/綁定', () => {
  const src = readFileSync(path.join(ROOT, 'app/api/v2/guide/orders/[orderId]/redeem/route.ts'), 'utf8');
  assert.match(src, /parseBody\(request, RedeemBodySchema\)/, 'redeem 應以 parseBody 驗 body');
  assert.match(src, /verifyVoucherToken/, '仍須驗簽');
  assert.match(src, /tokenOrderId\s*!==\s*orderId/, '仍須綁定同一 orderId');
});
