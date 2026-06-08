import test from 'node:test';
import assert from 'node:assert/strict';

import { pushMessage, pushToOps } from '../../src/lib/line-messaging.ts';

const TOKEN_KEYS = ['LINE_MESSAGING_ENABLED', 'LINE_CHANNEL_ACCESS_TOKEN', 'LINE_OPS_GROUP_ID'];

function withEnv(overrides, fn) {
  const saved = {};
  for (const k of TOKEN_KEYS) saved[k] = process.env[k];
  const savedFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return overrides.__response ?? { ok: true, status: 200, statusText: 'OK', json: async () => ({}) };
  };
  try {
    for (const k of TOKEN_KEYS) delete process.env[k];
    for (const [k, v] of Object.entries(overrides)) {
      if (k.startsWith('__')) continue;
      process.env[k] = v;
    }
    return fn(calls);
  } finally {
    global.fetch = savedFetch;
    for (const k of TOKEN_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test('pushMessage: messaging flag OFF → skipped, no fetch', async () => {
  await withEnv({ LINE_CHANNEL_ACCESS_TOKEN: 'x'.repeat(40) }, async (calls) => {
    const res = await pushMessage('U1', { type: 'text', text: 'hi' });
    assert.equal(res.status, 'skipped');
    assert.equal(calls.length, 0);
  });
});

test('pushMessage: flag ON but no access token → skipped, no fetch', async () => {
  await withEnv({ LINE_MESSAGING_ENABLED: '1' }, async (calls) => {
    const res = await pushMessage('U1', { type: 'text', text: 'hi' });
    assert.equal(res.status, 'skipped');
    assert.equal(calls.length, 0);
  });
});

test('pushMessage: flag ON + token → POST push API with bearer + JSON body', async () => {
  await withEnv({ LINE_MESSAGING_ENABLED: '1', LINE_CHANNEL_ACCESS_TOKEN: 'tok'.repeat(12) }, async (calls) => {
    const res = await pushMessage('U123', { type: 'text', text: 'hello' });
    assert.equal(res.status, 'sent');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.line.me/v2/bot/message/push');
    assert.equal(calls[0].init.method, 'POST');
    assert.match(calls[0].init.headers['Authorization'], /^Bearer tok/);
    assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.to, 'U123');
    assert.deepEqual(body.messages, [{ type: 'text', text: 'hello' }]);
  });
});

test('pushToOps: sends text to ops group', async () => {
  await withEnv(
    { LINE_MESSAGING_ENABLED: '1', LINE_CHANNEL_ACCESS_TOKEN: 'tok'.repeat(12), LINE_OPS_GROUP_ID: 'Gops' },
    async (calls) => {
      const res = await pushToOps('系統通知');
      assert.equal(res.status, 'sent');
      const body = JSON.parse(calls[0].init.body);
      assert.equal(body.to, 'Gops');
      assert.equal(body.messages[0].type, 'text');
      assert.equal(body.messages[0].text, '系統通知');
    }
  );
});

test('pushToOps: no ops group configured → skipped, no fetch', async () => {
  await withEnv({ LINE_MESSAGING_ENABLED: '1', LINE_CHANNEL_ACCESS_TOKEN: 'tok'.repeat(12) }, async (calls) => {
    const res = await pushToOps('系統通知');
    assert.equal(res.status, 'skipped');
    assert.equal(calls.length, 0);
  });
});

test('pushMessage: 403 (user blocked bot) → skipped, not failed', async () => {
  await withEnv(
    {
      LINE_MESSAGING_ENABLED: '1',
      LINE_CHANNEL_ACCESS_TOKEN: 'tok'.repeat(12),
      __response: { ok: false, status: 403, statusText: 'Forbidden', json: async () => ({}) },
    },
    async () => {
      const res = await pushMessage('Ublocked', { type: 'text', text: 'hi' });
      assert.equal(res.status, 'skipped');
    }
  );
});

test('pushMessage: 500 → failed', async () => {
  await withEnv(
    {
      LINE_MESSAGING_ENABLED: '1',
      LINE_CHANNEL_ACCESS_TOKEN: 'tok'.repeat(12),
      __response: { ok: false, status: 500, statusText: 'Server Error', json: async () => ({}) },
    },
    async () => {
      const res = await pushMessage('U1', { type: 'text', text: 'hi' });
      assert.equal(res.status, 'failed');
    }
  );
});
