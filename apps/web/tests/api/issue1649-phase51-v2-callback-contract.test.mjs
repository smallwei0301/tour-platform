/**
 * #1649 Phase 5.1 — v2 ECPay callback 接線 source-contract。
 *
 * 鎖定：
 * 1. `POST /api/v2/payments/ecpay/callback` 存在且 re-export 凍結區 legacy handler
 *    （單一實作——冪等三防線／驗簽／金額比對／1|OK ack 零複製零分岔）。
 * 2. v2 checkout 的 ReturnURL 預設指向 v2 callback；ECPAY_CALLBACK_URL env 覆寫保留
 *    （部署協調 escape hatch）。
 * 3. legacy callback route 保留相容期（ECPay 站方設定＋in-flight 交易安全網）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (rel) => readFile(path.join(ROOT, rel), 'utf8');

test('v2 callback 殼：re-export 凍結區 legacy handler（單一實作、零業務碼）', async () => {
  const src = await read('app/api/v2/payments/ecpay/callback/route.ts');
  assert.match(src, /export \{ POST \} from '[.\/]+payments\/ecpay\/callback\/route';/);
  assert.ok(!/try\s*\{|supabase|processPaymentCallbackDb/.test(src), '殼不得自帶實作（單一實作原則）');
});

test('v2 checkout ReturnURL：預設 v2 callback＋env 覆寫保留', async () => {
  const src = await read('app/api/v2/bookings/[bookingId]/checkout/route.ts');
  assert.match(src, /process\.env\.ECPAY_CALLBACK_URL \|\|/, 'ECPAY_CALLBACK_URL 覆寫必須保留');
  assert.match(src, /\/api\/v2\/payments\/ecpay\/callback`/, 'ReturnURL 預設需指向 v2 callback');
  assert.ok(!src.includes('/api/payments/ecpay/callback`'), '預設不得再指向 legacy 路徑');
});

test('legacy callback route 相容期保留（退役屬 Phase 6 另案）', async () => {
  const src = await read('app/api/payments/ecpay/callback/route.ts');
  assert.match(src, /export async function POST/);
  assert.match(src, /processPaymentCallbackDb/);
});
