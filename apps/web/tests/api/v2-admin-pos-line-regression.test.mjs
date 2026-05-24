import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DRAFT_ROUTE = path.join(ROOT, 'app/api/v2/bookings/draft/route.ts');

async function readDraftRoute() {
  return readFile(DRAFT_ROUTE, 'utf8');
}

async function runDraftCheckoutFlow({ transport, sourceChannel }) {
  const draftPayload = {
    activityId: '550e8400-e29b-41d4-a716-446655440000',
    planId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    startAt: '2026-05-01T09:00:00+08:00',
    timezone: 'Asia/Taipei',
    participants: 2,
    sourceChannel,
    contactName: '測試旅客',
    contactPhone: '0912345678',
    contactEmail: 'qa@example.com',
  };

  const draftRes = await transport('/api/v2/bookings/draft', {
    method: 'POST',
    body: JSON.stringify(draftPayload),
  });
  const draftJson = await draftRes.json();
  if (!draftRes.ok || !draftJson?.success || !draftJson?.data?.bookingId) {
    throw new Error('draft failed');
  }

  const checkoutRes = await transport(`/api/v2/bookings/${draftJson.data.bookingId}/checkout`, {
    method: 'POST',
    body: JSON.stringify({ provider: 'ecpay' }),
  });
  const checkoutJson = await checkoutRes.json();

  if (!checkoutRes.ok || !checkoutJson?.success) {
    throw new Error('checkout failed');
  }

  return {
    draft: draftJson,
    checkout: checkoutJson,
  };
}

test('route contract keeps web/line/admin_pos channels (regression guard)', async () => {
  const src = await readDraftRoute();
  assert.match(src, /const VALID_CHANNELS = \['web', 'line', 'admin_pos'\]/);
  assert.match(src, /source_channel:\s*data\.sourceChannel/);
});

test('Admin POS draft flow keeps create-order envelope shape', async () => {
  const calls = [];

  const transport = async (url, init) => {
    calls.push({ url, init });

    if (url === '/api/v2/bookings/draft') {
      const payload = JSON.parse(init.body);
      assert.equal(payload.sourceChannel, 'admin_pos');
      return {
        ok: true,
        async json() {
          return {
            success: true,
            data: {
              bookingId: 'b1',
              bookingNo: 'BK-001',
              bookingStatus: 'draft',
              orderId: 'o1',
              orderStatus: 'pending_payment',
              amount: 4800,
              currency: 'TWD',
            },
          };
        },
      };
    }

    return {
      ok: true,
      async json() {
        return {
          success: true,
          data: {
            provider: 'ecpay',
            paymentId: 'p1',
            merchantTradeNo: 'TP000000000000000001',
            paymentFormHtml: '<form></form>',
          },
        };
      },
    };
  };

  const result = await runDraftCheckoutFlow({ transport, sourceChannel: 'admin_pos' });

  assert.equal(result.draft.data.orderStatus, 'pending_payment');
  assert.equal(result.checkout.data.provider, 'ecpay');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, '/api/v2/bookings/draft');
  assert.match(calls[1].url, /\/api\/v2\/bookings\/b1\/checkout/);
});

test('LINE draft flow regression stays mockable without real LINE API', async () => {
  const calls = [];

  const transport = async (url, init) => {
    calls.push({ url, init: init ?? null });

    if (url === '/api/v2/bookings/draft') {
      const payload = JSON.parse(init.body);
      assert.equal(payload.sourceChannel, 'line');
      return {
        ok: true,
        async json() {
          return {
            success: true,
            data: {
              bookingId: 'line-bk-1',
              bookingNo: 'BK-LINE-001',
              bookingStatus: 'draft',
              orderId: 'line-ord-1',
              orderStatus: 'pending_payment',
              amount: 3200,
              currency: 'TWD',
            },
          };
        },
      };
    }

    return {
      ok: true,
      async json() {
        return {
          success: true,
          data: {
            provider: 'ecpay',
            paymentId: 'pay-line-1',
            merchantTradeNo: 'TP000000000000000002',
            paymentFormHtml: '<form></form>',
          },
        };
      },
    };
  };

  const result = await runDraftCheckoutFlow({ transport, sourceChannel: 'line' });

  assert.equal(result.draft.data.bookingStatus, 'draft');
  assert.equal(result.draft.data.orderStatus, 'pending_payment');
  assert.equal(result.checkout.data.paymentId, 'pay-line-1');
  assert.equal(calls.length, 2);
});
