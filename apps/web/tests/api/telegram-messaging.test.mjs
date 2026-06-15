import test from 'node:test';
import assert from 'node:assert/strict';

import { sendTelegramMessage, sendTelegramTransactional, pushTelegramToAdmin } from '../../src/lib/telegram-messaging.ts';
import { buildOrderEventTelegramText } from '../../src/lib/telegram-messages.ts';

const KEYS = ['TELEGRAM_NOTIFY_ENABLED', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_ORDER_CHAT_ID'];
async function withEnv(overrides, fn) {
  const saved = {};
  for (const k of KEYS) saved[k] = process.env[k];
  const savedFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => { calls.push({ url: String(url), init }); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  try {
    for (const k of KEYS) delete process.env[k];
    for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
    return await fn(calls);
  } finally {
    global.fetch = savedFetch;
    for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

test('sendTelegramMessage: flag OFF → skipped, no network', async () => {
  await withEnv({ TELEGRAM_BOT_TOKEN: 'tok', }, async (calls) => {
    const r = await sendTelegramMessage('123', 'hi');
    assert.equal(r.status, 'skipped');
    assert.equal(r.reason, 'telegram_disabled');
    assert.equal(calls.length, 0);
  });
});

test('sendTelegramMessage: flag ON without token → skipped', async () => {
  await withEnv({ TELEGRAM_NOTIFY_ENABLED: '1' }, async (calls) => {
    const r = await sendTelegramMessage('123', 'hi');
    assert.equal(r.status, 'skipped');
    assert.equal(r.reason, 'no_bot_token');
    assert.equal(calls.length, 0);
  });
});

test('sendTelegramMessage: flag ON + token → posts to Bot API sendMessage', async () => {
  await withEnv({ TELEGRAM_NOTIFY_ENABLED: '1', TELEGRAM_BOT_TOKEN: 'BOTTOKEN' }, async (calls) => {
    const r = await sendTelegramMessage('999', 'hello world');
    assert.equal(r.status, 'sent');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /api\.telegram\.org\/botBOTTOKEN\/sendMessage/);
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.chat_id, '999');
    assert.equal(body.text, 'hello world');
  });
});

test('sendTelegramMessage: empty chatId → skipped(no_recipient)', async () => {
  await withEnv({ TELEGRAM_NOTIFY_ENABLED: '1', TELEGRAM_BOT_TOKEN: 'BOTTOKEN' }, async (calls) => {
    const r = await sendTelegramMessage('', 'x');
    assert.equal(r.reason, 'no_recipient');
    assert.equal(calls.length, 0);
  });
});

test('pushTelegramToAdmin: no order chat id → skipped(no_admin_chat)', async () => {
  await withEnv({ TELEGRAM_NOTIFY_ENABLED: '1', TELEGRAM_BOT_TOKEN: 'BOTTOKEN' }, async (calls) => {
    const r = await pushTelegramToAdmin('ops msg');
    assert.equal(r.reason, 'no_admin_chat');
    assert.equal(calls.length, 0);
  });
});

test('pushTelegramToAdmin: sends to TELEGRAM_ORDER_CHAT_ID', async () => {
  await withEnv({ TELEGRAM_NOTIFY_ENABLED: '1', TELEGRAM_BOT_TOKEN: 'BOTTOKEN', TELEGRAM_ORDER_CHAT_ID: '-100777' }, async (calls) => {
    const r = await pushTelegramToAdmin('ops msg');
    assert.equal(r.status, 'sent');
    assert.equal(JSON.parse(calls[0].init.body).chat_id, '-100777');
  });
});

test('sendTelegramTransactional: kill-switch OFF + token → still sends (transactional)', async () => {
  await withEnv({ TELEGRAM_BOT_TOKEN: 'BOTTOKEN' }, async (calls) => {
    const r = await sendTelegramTransactional('555', 'binding ack');
    assert.equal(r.status, 'sent');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /api\.telegram\.org\/botBOTTOKEN\/sendMessage/);
    assert.equal(JSON.parse(calls[0].init.body).chat_id, '555');
  });
});

test('sendTelegramTransactional: no bot token → skipped(no_bot_token), no network', async () => {
  await withEnv({}, async (calls) => {
    const r = await sendTelegramTransactional('555', 'binding ack');
    assert.equal(r.status, 'skipped');
    assert.equal(r.reason, 'no_bot_token');
    assert.equal(calls.length, 0);
  });
});

test('buildOrderEventTelegramText covers all kinds and audiences', () => {
  for (const kind of ['new_order', 'payment_received', 'order_cancelled', 'refund_requested', 'refund_executed']) {
    for (const audience of ['traveler', 'guide', 'admin']) {
      const text = buildOrderEventTelegramText(kind, { orderId: 'ord12345678', activityTitle: '柴山', totalTwd: 4000 }, audience);
      assert.match(text, /ORD12345/);
      assert.ok(text.length > 0);
    }
  }
});
