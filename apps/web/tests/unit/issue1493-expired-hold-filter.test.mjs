// #1493 讀取時過濾 helper 單測：逾時未付款 draft 佔位被濾掉，其餘保留。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropExpiredUnpaidHolds } from '../../src/lib/expired-hold-filter.mjs';

const NOW = '2030-07-07T00:00:00.000Z';

// 假 supabase：from('orders').select(...).in('id', ids) → 回傳預設的 orders。
function fakeSupabase(ordersById) {
  return {
    from() {
      return {
        select() {
          return {
            in(_col, ids) {
              const data = ids.map((id) => ordersById[id]).filter(Boolean);
              return Promise.resolve({ data, error: null });
            },
          };
        },
      };
    },
  };
}

test('濾掉「draft + pending_payment + 已逾時」的佔位', async () => {
  const bookings = [
    { id: 'b1', status: 'draft', order_id: 'o1' },        // 逾時未付款 → 濾掉
    { id: 'b2', status: 'draft', order_id: 'o2' },        // 未逾時 → 保留
    { id: 'b3', status: 'confirmed', order_id: 'o3' },    // 非 draft → 保留
    { id: 'b4', status: 'draft', order_id: 'o4' },        // 已付款(paid) → 保留
  ];
  const orders = {
    o1: { id: 'o1', status: 'pending_payment', payment_deadline_at: '2030-07-06T00:00:00Z' },
    o2: { id: 'o2', status: 'pending_payment', payment_deadline_at: '2030-07-08T00:00:00Z' },
    o3: { id: 'o3', status: 'paid', payment_deadline_at: null },
    o4: { id: 'o4', status: 'paid', payment_deadline_at: '2030-07-06T00:00:00Z' },
  };
  const out = await dropExpiredUnpaidHolds(fakeSupabase(orders), bookings, NOW);
  assert.deepEqual(out.map((b) => b.id), ['b2', 'b3', 'b4']);
});

test('沒有 draft 佔位 → 原樣回傳，不查 orders', async () => {
  const bookings = [{ id: 'b1', status: 'confirmed', order_id: 'o1' }];
  let queried = false;
  const supa = { from() { queried = true; return {}; } };
  const out = await dropExpiredUnpaidHolds(supa, bookings, NOW);
  assert.equal(queried, false);
  assert.deepEqual(out, bookings);
});

test('查 orders 失敗 → best-effort 原樣回傳（不擋讀取）', async () => {
  const bookings = [{ id: 'b1', status: 'draft', order_id: 'o1' }];
  const supa = { from() { return { select() { return { in() { return Promise.resolve({ data: null, error: { message: 'boom' } }); } }; } }; } };
  const out = await dropExpiredUnpaidHolds(supa, bookings, NOW);
  assert.deepEqual(out, bookings);
});

test('空陣列 → 原樣回傳', async () => {
  assert.deepEqual(await dropExpiredUnpaidHolds({}, [], NOW), []);
});
