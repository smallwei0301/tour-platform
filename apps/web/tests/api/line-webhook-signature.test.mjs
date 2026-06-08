import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Force in-memory binding path.
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

process.env.LINE_CHANNEL_SECRET = 'whsec_'.padEnd(40, 'x');

const { processLineWebhook } = await import('../../src/lib/line-webhook.mjs');
const { getLineMappingByLineUserId, __resetLineMappingsForTest, __resetWebhookEventsForTest } =
  await import('../../src/lib/line-binding.mjs');

function sign(rawBody) {
  return crypto.createHmac('sha256', process.env.LINE_CHANNEL_SECRET).update(rawBody).digest('base64');
}

function deliver(bodyObj, signature) {
  const raw = JSON.stringify(bodyObj);
  return processLineWebhook(raw, signature ?? sign(raw));
}

test('webhook: valid signature → follow event binds lineUserId', async () => {
  __resetLineMappingsForTest();
  __resetWebhookEventsForTest();
  const res = await deliver({
    events: [{ type: 'follow', webhookEventId: 'evt-follow-1', source: { type: 'user', userId: 'Ufollow' } }],
  });
  assert.equal(res.verified, true);

  const mapping = await getLineMappingByLineUserId('Ufollow');
  assert.ok(mapping, 'follow event should create a mapping');
  assert.equal(mapping.isBlocked, false);
});

test('webhook: tampered body / bad signature → not verified, no binding', async () => {
  __resetLineMappingsForTest();
  __resetWebhookEventsForTest();
  const res = await deliver(
    { events: [{ type: 'follow', webhookEventId: 'evt-follow-2', source: { type: 'user', userId: 'Uattacker' } }] },
    'deadbeefnotvalidsignature==',
  );
  assert.equal(res.verified, false);

  const mapping = await getLineMappingByLineUserId('Uattacker');
  assert.equal(mapping, null, 'invalid signature must not bind anything');
});

test('webhook: unfollow event marks mapping blocked', async () => {
  __resetLineMappingsForTest();
  __resetWebhookEventsForTest();
  await deliver({ events: [{ type: 'follow', webhookEventId: 'e1', source: { userId: 'Ublk' } }] });
  await deliver({ events: [{ type: 'unfollow', webhookEventId: 'e2', source: { userId: 'Ublk' } }] });

  const mapping = await getLineMappingByLineUserId('Ublk');
  assert.ok(mapping);
  assert.equal(mapping.isBlocked, true);
});

// Route contract: the thin wrapper must rate-limit, verify, and always 200.
test('webhook route: rate-limits, delegates to processLineWebhook, always 200', async () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const src = await fs.readFile(path.resolve(__dirname, '../../app/api/line/webhook/route.ts'), 'utf8');
  assert.match(src, /limiters\.lineWebhook\.check/);
  assert.match(src, /processLineWebhook/);
  assert.match(src, /status:\s*200/);
});
