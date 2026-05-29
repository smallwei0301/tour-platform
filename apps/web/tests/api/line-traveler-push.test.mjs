import test from 'node:test';
import assert from 'node:assert/strict';

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { pushTravelerOrderEvent } = await import('../../src/lib/line-traveler-push.mjs');
const { upsertLineMapping, __resetLineMappingsForTest } = await import('../../src/lib/line-binding.mjs');

const FLAGS = ['LINE_PUSH_ENABLED', 'LINE_MESSAGING_ENABLED', 'LINE_CHANNEL_ACCESS_TOKEN'];

function withEnv(overrides, fn) {
  const saved = {};
  for (const k of FLAGS) saved[k] = process.env[k];
  const savedFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({}) };
  };
  for (const k of FLAGS) delete process.env[k];
  for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
  return Promise.resolve(fn(calls)).finally(() => {
    global.fetch = savedFetch;
    for (const k of FLAGS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
}

const SAMPLE = {
  kind: 'payment_received',
  orderId: 'ord-1',
  activityTitle: '柴山探洞',
  scheduleDate: '2026-06-01',
  peopleCount: 2,
  totalTwd: 4000,
  userId: 'user-push-1',
  contactEmail: 'p@example.com',
};

test('pushTravelerOrderEvent: push flag OFF → skipped, no fetch', async () => {
  __resetLineMappingsForTest();
  await upsertLineMapping({ lineUserId: 'Upush', userId: 'user-push-1' });
  await withEnv({}, async (calls) => {
    const res = await pushTravelerOrderEvent(SAMPLE);
    assert.equal(res.status, 'skipped');
    assert.equal(res.reason, 'push_disabled');
    assert.equal(calls.length, 0);
  });
});

test('pushTravelerOrderEvent: enabled but no binding → skipped no_line_binding, no fetch', async () => {
  __resetLineMappingsForTest();
  await withEnv({ LINE_PUSH_ENABLED: '1', LINE_MESSAGING_ENABLED: '1', LINE_CHANNEL_ACCESS_TOKEN: 'tok'.repeat(12) }, async (calls) => {
    const res = await pushTravelerOrderEvent(SAMPLE);
    assert.equal(res.status, 'skipped');
    assert.equal(res.reason, 'no_line_binding');
    assert.equal(calls.length, 0);
  });
});

test('pushTravelerOrderEvent: enabled + binding → pushes to traveler lineUserId', async () => {
  __resetLineMappingsForTest();
  await upsertLineMapping({ lineUserId: 'Upush', userId: 'user-push-1' });
  await withEnv({ LINE_PUSH_ENABLED: '1', LINE_MESSAGING_ENABLED: '1', LINE_CHANNEL_ACCESS_TOKEN: 'tok'.repeat(12) }, async (calls) => {
    const res = await pushTravelerOrderEvent(SAMPLE);
    assert.equal(res.status, 'sent');
    assert.equal(calls.length, 1);
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.to, 'Upush');
    assert.ok(Array.isArray(body.messages) && body.messages.length >= 1);
    // message references the activity so it is a real traveler-facing notice
    assert.match(JSON.stringify(body.messages), /柴山探洞/);
  });
});

test('pushTravelerOrderEvent: resolves binding by contact_email fallback', async () => {
  __resetLineMappingsForTest();
  await upsertLineMapping({ lineUserId: 'Uemail', contactEmail: 'guest@example.com' });
  await withEnv({ LINE_PUSH_ENABLED: '1', LINE_MESSAGING_ENABLED: '1', LINE_CHANNEL_ACCESS_TOKEN: 'tok'.repeat(12) }, async (calls) => {
    const res = await pushTravelerOrderEvent({ ...SAMPLE, userId: undefined, contactEmail: 'guest@example.com' });
    assert.equal(res.status, 'sent');
    assert.equal(JSON.parse(calls[0].init.body).to, 'Uemail');
  });
});
