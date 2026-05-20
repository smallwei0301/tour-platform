import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderDb, listAdminOrdersDb, __setSupabaseClientForTest } from '../../src/lib/db.mjs';
import { listAdminOrdersFallback } from '../../src/lib/admin.mjs';

test('admin orders includes margin fields', async () => {
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalSupabaseRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    await createOrderDb({
      experienceSlug: 'kaohsiung-chaishan-cave-experience',
      scheduleId: 'sch_chaishan_0410',
      peopleCount: 1,
      contactName: 'Wei',
      contactPhone: '0912345678',
      contactEmail: 'wei@example.com'
    });

    const rows = listAdminOrdersFallback();
    assert.ok(rows.length >= 1);
    assert.equal(typeof rows[0].marginTwd, 'number');
    assert.equal(rows[0].totalTwd - rows[0].costTwd, rows[0].marginTwd);
  } finally {
    if (originalSupabaseUrl === undefined) {
      delete process.env.SUPABASE_URL;
    } else {
      process.env.SUPABASE_URL = originalSupabaseUrl;
    }

    if (originalSupabaseRoleKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseRoleKey;
    }
  }
});

test('listAdminOrdersDb falls back when orders.trade_no column is missing', async () => {
  const rows = [
    {
      id: 'ord_1',
      status: 'paid',
      total_twd: 2000,
      activity_id: 'act_1',
      schedule_id: 'sch_1',
      people_count: 1,
      contact_name: 'Wei',
      contact_phone: '0912',
      contact_email: 'wei@example.com',
      created_at: '2026-05-19T00:00:00.000Z',
      paid_at: '2026-05-19T01:00:00.000Z',
      admin_note: null,
      updated_at: '2026-05-19T01:00:00.000Z',
    },
  ];

  let ordersSelectCount = 0;

  const supabase = {
    from(table) {
      if (table === 'orders') {
        return {
          select(selectClause) {
            ordersSelectCount += 1;
            const isWithTradeNo = String(selectClause).includes('trade_no');
            return {
              order() {
                return {
                  then(resolve) {
                    if (isWithTradeNo) {
                      resolve({ data: null, error: { message: 'column orders.trade_no does not exist' } });
                    } else {
                      resolve({ data: rows, error: null });
                    }
                  },
                };
              },
            };
          },
        };
      }

      if (table === 'kpi_config') {
        return {
          select() {
            return {
              order() {
                return {
                  limit() {
                    return {
                      then(resolve) {
                        resolve({ data: [{ guide_payout_rate: 0.85 }], error: null });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === 'activities') {
        return {
          select() {
            return {
              in() {
                return {
                  then(resolve) {
                    resolve({ data: [{ id: 'act_1', title: 'Test Activity', slug: 'test-activity' }], error: null });
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  process.env.SUPABASE_URL = 'http://example.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  __setSupabaseClientForTest(supabase);

  try {
    const result = await listAdminOrdersDb({});
    assert.equal(ordersSelectCount, 2);
    assert.equal(result.length, 1);
    assert.equal(result[0].trade_no, null);
    assert.equal(result[0].id, 'ord_1');
  } finally {
    __setSupabaseClientForTest(null);
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
});
