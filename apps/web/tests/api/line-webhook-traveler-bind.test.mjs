import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Force in-memory binding path.
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

process.env.LINE_CHANNEL_SECRET = 'whsec_'.padEnd(40, 'x');

const { processLineWebhook } = await import('../../src/lib/line-webhook.mjs');
const {
  createTravelerLineBindCode,
  getLineUserIdForOrder,
  __resetLineMappingsForTest,
  __resetLineBindCodesForTest,
  __resetWebhookEventsForTest,
} = await import('../../src/lib/line-binding.mjs');

function sign(rawBody) {
  return crypto.createHmac('sha256', process.env.LINE_CHANNEL_SECRET).update(rawBody).digest('base64');
}
function deliver(bodyObj) {
  const raw = JSON.stringify(bodyObj);
  return processLineWebhook(raw, sign(raw));
}

test('webhook: a TBIND message binds the traveler → order resolves to their LINE id', async () => {
  __resetLineMappingsForTest();
  __resetLineBindCodesForTest();
  __resetWebhookEventsForTest();

  const { code } = await createTravelerLineBindCode({ userId: 'u-wh-1', contactEmail: 'wh@example.com' });

  const res = await deliver({
    events: [{
      type: 'message',
      webhookEventId: 'evt-tbind-1',
      source: { type: 'user', userId: 'UtravWebhook' },
      message: { type: 'text', text: `綁定 ${code}` },
      replyToken: 'rt-1',
    }],
  });
  assert.equal(res.verified, true);
  assert.equal(res.processed, 1);

  assert.equal(await getLineUserIdForOrder({ userId: 'u-wh-1' }), 'UtravWebhook');
  assert.equal(await getLineUserIdForOrder({ contact_email: 'wh@example.com' }), 'UtravWebhook');
});
