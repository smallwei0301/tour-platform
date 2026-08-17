import assert from 'node:assert/strict';
import test from 'node:test';

import { getMaterializedOrderDetailForPayment } from '../../src/lib/payment/db-payment-detail.mjs';

function ordersClient(result) {
  return {
    from(table) {
      assert.equal(table, 'orders');
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => result,
      };
      return query;
    },
  };
}

test('#1815 payment aggregate lookup distinguishes an absent order from a temporary database error', async () => {
  assert.equal(
    await getMaterializedOrderDetailForPayment('order-1815-missing', ordersClient({ data: null, error: null })),
    null,
  );

  await assert.rejects(
    () => getMaterializedOrderDetailForPayment('order-1815-transient', ordersClient({
      data: null,
      error: { code: '08006', message: 'connection failure' },
    })),
    /connection failure/,
  );
});
