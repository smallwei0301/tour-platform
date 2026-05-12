import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listAdminOrdersDb,
  getAdminOrderDetailDb,
  __setSupabaseClientForTest,
} from '../../src/lib/db.mjs';

function createThenableQuery(result) {
  return {
    eq() {
      return this;
    },
    order() {
      return this;
    },
    in() {
      return Promise.resolve(result);
    },
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
}

test('issue371: admin order mapper returns trade_no used by refund UI (behavioral)', async () => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  process.env.SUPABASE_URL = 'http://example.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

  let ordersSelectColumns = '';

  const fakeSupabase = {
    from(table) {
      if (table === 'orders') {
        return {
          select(columns) {
            ordersSelectColumns = columns;
            return createThenableQuery({
              data: [
                {
                  id: 'ord_1',
                  status: 'refund_pending',
                  total_twd: 1000,
                  activity_id: 'act_1',
                  schedule_id: 'sch_1',
                  people_count: 2,
                  contact_name: 'Wei',
                  contact_phone: '0912',
                  contact_email: 'wei@example.com',
                  trade_no: 'TN1234567890',
                  created_at: '2026-01-01T00:00:00.000Z',
                  paid_at: '2026-01-01T00:10:00.000Z',
                  admin_note: null,
                  updated_at: '2026-01-01T00:20:00.000Z',
                },
              ],
              error: null,
            });
          },
        };
      }

      if (table === 'activities') {
        return {
          select() {
            return createThenableQuery({
              data: [{ id: 'act_1', title: 'Demo Activity', slug: 'demo-activity' }],
              error: null,
            });
          },
        };
      }

      throw new Error(`unexpected table: ${table}`);
    },
  };

  __setSupabaseClientForTest(fakeSupabase);

  try {
    const rows = await listAdminOrdersDb({ status: 'refund_pending' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].trade_no, 'TN1234567890', 'trade_no must be mapped for admin UI cash-vs-ECPay guard');

    const detail = await getAdminOrderDetailDb({ orderId: 'ord_1' });
    assert.equal(detail.trade_no, 'TN1234567890', 'order detail must keep trade_no from admin mapper');

    assert.match(
      ordersSelectColumns,
      /\btrade_no\b/,
      'orders query must select trade_no; removing it should fail this contract',
    );
  } finally {
    __setSupabaseClientForTest(null);

    if (oldUrl == null) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;

    if (oldKey == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});
