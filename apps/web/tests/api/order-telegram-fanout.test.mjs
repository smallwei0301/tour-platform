import test from 'node:test';
import assert from 'node:assert/strict';

import { dispatchOrderEventTelegram } from '../../src/lib/order-telegram-notify.mjs';
import {
  createTelegramBindCode,
  redeemTelegramBindCode,
  __resetTelegramForTest,
} from '../../src/lib/telegram-binding.mjs';

// In-memory store: experience 'exp_chaishan_001' is owned by guide slug 'andy-lee'.
const CHAISHAN = 'exp_chaishan_001';
const ANDY = 'andy-lee';

const KEYS = ['TELEGRAM_NOTIFY_ENABLED', 'TELEGRAM_GUIDE_NOTIFY_ENABLED', 'TELEGRAM_TRAVELER_NOTIFY_ENABLED',
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_ORDER_CHAT_ID'];

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

async function bind(role, subjectId, chatId, contactEmail) {
  const { code } = await createTelegramBindCode({ role, subjectId, contactEmail });
  await redeemTelegramBindCode(code, { chatId });
}

const chatIdsOf = (calls) => calls.map((c) => JSON.parse(c.init.body).chat_id);

test('telegram fan-out: notify flag OFF → nothing sent', async () => {
  __resetTelegramForTest();
  await withEnv({}, async (calls) => {
    await dispatchOrderEventTelegram({ orderId: 'o1', kind: 'payment_received', activityId: CHAISHAN });
    assert.equal(calls.length, 0);
  });
});

test('telegram fan-out: admin group gets every event when notify enabled', async () => {
  __resetTelegramForTest();
  await withEnv({ TELEGRAM_NOTIFY_ENABLED: '1', TELEGRAM_BOT_TOKEN: 'BOT', TELEGRAM_ORDER_CHAT_ID: '-100500' }, async (calls) => {
    await dispatchOrderEventTelegram({ orderId: 'ord12345678', kind: 'payment_received', activityId: CHAISHAN, activityTitle: '柴山' });
    assert.deepEqual(chatIdsOf(calls), ['-100500']);
  });
});

test('telegram fan-out: bound guide + traveler each receive when their flag is on', async () => {
  __resetTelegramForTest();
  await bind('guide', ANDY, 'G900');
  await bind('traveler', 'user-1', 'T800', 'trav@example.com');
  await withEnv({
    TELEGRAM_NOTIFY_ENABLED: '1', TELEGRAM_GUIDE_NOTIFY_ENABLED: '1', TELEGRAM_TRAVELER_NOTIFY_ENABLED: '1',
    TELEGRAM_BOT_TOKEN: 'BOT', TELEGRAM_ORDER_CHAT_ID: '-100500',
  }, async (calls) => {
    await dispatchOrderEventTelegram({
      orderId: 'ord12345678', kind: 'payment_received', activityId: CHAISHAN,
      activityTitle: '柴山', userId: 'user-1', contactEmail: 'trav@example.com',
    });
    const chats = chatIdsOf(calls).sort();
    assert.deepEqual(chats, ['-100500', 'G900', 'T800']);
  });
});

test('telegram fan-out: guide flag on but guide unbound → only admin', async () => {
  __resetTelegramForTest();
  await withEnv({
    TELEGRAM_NOTIFY_ENABLED: '1', TELEGRAM_GUIDE_NOTIFY_ENABLED: '1',
    TELEGRAM_BOT_TOKEN: 'BOT', TELEGRAM_ORDER_CHAT_ID: '-100500',
  }, async (calls) => {
    await dispatchOrderEventTelegram({ orderId: 'o', kind: 'order_cancelled', activityId: CHAISHAN, activityTitle: '柴山' });
    assert.deepEqual(chatIdsOf(calls), ['-100500']);
  });
});
