// #1493 部署順序安全：缺欄位 fallback（insert 剝除 / select 退版）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  applyWithOptionalColumnFallback,
  selectWithOptionalColumnFallback,
} from '../../src/lib/optional-column-fallback.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = join(__dirname, '../..');
const read = (rel) => readFileSync(join(APP, rel), 'utf8');

const missingColErr = (col) => ({ message: `column "${col}" of relation "orders" does not exist` });

test('insert：缺 allowlist 欄位 → 剝除後成功', async () => {
  let seen = null;
  const run = async (p) => {
    seen = p;
    if ('payment_deadline_at' in p) return { data: null, error: missingColErr('payment_deadline_at') };
    return { data: { id: 'o1' }, error: null };
  };
  const res = await applyWithOptionalColumnFallback(run, { id: 'o1', payment_deadline_at: 'x', status: 'pending_payment' }, ['payment_deadline_at']);
  assert.equal(res.error, null);
  assert.deepEqual(res.droppedColumns, ['payment_deadline_at']);
  assert.ok(!('payment_deadline_at' in seen));
  assert.equal(seen.status, 'pending_payment'); // 必要欄位保留
});

test('insert：缺的是非 allowlist 欄位 → 不剝除、原樣回傳錯誤', async () => {
  const run = async () => ({ data: null, error: missingColErr('total_twd') });
  const res = await applyWithOptionalColumnFallback(run, { total_twd: 1, payment_deadline_at: 'x' }, ['payment_deadline_at']);
  assert.ok(res.error);
  assert.equal(res.data, null);
  assert.deepEqual(res.droppedColumns, []);
});

test('select：第一版缺欄位 → 退到下一版成功', async () => {
  const run = async (sel) => {
    if (sel.includes('payment_deadline_at')) return { data: null, error: missingColErr('payment_deadline_at') };
    return { data: [{ id: 'o1' }], error: null };
  };
  const res = await selectWithOptionalColumnFallback(run, ['a, payment_deadline_at', 'a']);
  assert.equal(res.error, null);
  assert.equal(res.usedSelect, 'a');
});

test('select：非缺欄位錯誤 → 立即回傳，不再退版', async () => {
  let calls = 0;
  const run = async () => { calls++; return { data: null, error: { message: 'permission denied' } }; };
  const res = await selectWithOptionalColumnFallback(run, ['a, payment_deadline_at', 'a']);
  assert.ok(res.error);
  assert.equal(calls, 1);
});

test('wiring：draft insert / 兩個訂單列表 / checkout 都接上 fallback', () => {
  assert.match(read('app/api/v2/bookings/draft/route.ts'), /applyWithOptionalColumnFallback/);
  assert.match(read('src/lib/db.mjs'), /selectWithOptionalColumnFallback/);
  assert.match(read('app/api/v2/bookings/[bookingId]/checkout/route.ts'), /selectWithOptionalColumnFallback/);
});
