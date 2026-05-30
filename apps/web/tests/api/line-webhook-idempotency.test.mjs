import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

process.env.LINE_CHANNEL_SECRET = 'whsec_'.padEnd(40, 'y');

const { processLineWebhook } = await import('../../src/lib/line-webhook.mjs');
const {
  getLineMappingByLineUserId,
  __resetLineMappingsForTest,
  __resetWebhookEventsForTest,
} = await import('../../src/lib/line-binding.mjs');

function sign(raw) {
  return crypto.createHmac('sha256', process.env.LINE_CHANNEL_SECRET).update(raw).digest('base64');
}

function deliver(bodyObj) {
  const raw = JSON.stringify(bodyObj);
  return processLineWebhook(raw, sign(raw));
}

test('webhook: duplicate webhookEventId is processed only once', async () => {
  __resetLineMappingsForTest();
  __resetWebhookEventsForTest();

  // First delivery: follow binds Udup and is not blocked.
  await deliver({ events: [{ type: 'follow', webhookEventId: 'dup-1', source: { userId: 'Udup' } }] });
  // Meanwhile user unfollows (different event) — blocked.
  await deliver({ events: [{ type: 'unfollow', webhookEventId: 'dup-2', source: { userId: 'Udup' } }] });
  assert.equal((await getLineMappingByLineUserId('Udup')).isBlocked, true);

  // Redelivery of the original follow event (same webhookEventId) must be a no-op,
  // i.e. it must NOT re-bind / un-block the user.
  await deliver({ events: [{ type: 'follow', webhookEventId: 'dup-1', source: { userId: 'Udup' } }] });
  assert.equal((await getLineMappingByLineUserId('Udup')).isBlocked, true, 'replayed event must be ignored');
});
