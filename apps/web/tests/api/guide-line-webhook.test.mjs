import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.LINE_CHANNEL_SECRET = 'whsec_'.padEnd(40, 'g');

const { processLineWebhook } = await import('../../src/lib/line-webhook.mjs');
const {
  createGuideBindCode,
  getLineUserIdForGuide,
  __resetGuideLineForTest,
} = await import('../../src/lib/guide-line-binding.mjs');
const { __resetLineMappingsForTest, __resetWebhookEventsForTest } = await import('../../src/lib/line-binding.mjs');

function sign(raw) {
  return crypto.createHmac('sha256', process.env.LINE_CHANNEL_SECRET).update(raw).digest('base64');
}
function deliver(bodyObj) {
  const raw = JSON.stringify(bodyObj);
  return processLineWebhook(raw, sign(raw));
}

test('webhook: a guide sending their BIND code binds guide ↔ line_user_id', async () => {
  __resetGuideLineForTest();
  __resetLineMappingsForTest();
  __resetWebhookEventsForTest();

  const { code } = await createGuideBindCode('guide-77');

  const res = await deliver({
    events: [{
      type: 'message',
      webhookEventId: 'gw-1',
      source: { userId: 'UguideLine' },
      message: { type: 'text', text: code },
    }],
  });
  assert.equal(res.verified, true);
  assert.equal(await getLineUserIdForGuide('guide-77'), 'UguideLine');
});

test('webhook: guide unfollow blocks the guide binding (no more push)', async () => {
  __resetGuideLineForTest();
  __resetLineMappingsForTest();
  __resetWebhookEventsForTest();

  const { code } = await createGuideBindCode('guide-88');
  await deliver({
    events: [{ type: 'message', webhookEventId: 'gw-2', source: { userId: 'Ublk' }, message: { type: 'text', text: code } }],
  });
  assert.equal(await getLineUserIdForGuide('guide-88'), 'Ublk');

  await deliver({ events: [{ type: 'unfollow', webhookEventId: 'gw-3', source: { userId: 'Ublk' } }] });
  assert.equal(await getLineUserIdForGuide('guide-88'), null);
});

test('webhook: a non-code message does NOT create a guide binding', async () => {
  __resetGuideLineForTest();
  __resetLineMappingsForTest();
  __resetWebhookEventsForTest();

  await createGuideBindCode('guide-99');
  await deliver({
    events: [{ type: 'message', webhookEventId: 'gw-4', source: { userId: 'Uchat' }, message: { type: 'text', text: 'hello' } }],
  });
  assert.equal(await getLineUserIdForGuide('guide-99'), null);
});
