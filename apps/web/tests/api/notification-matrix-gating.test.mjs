import test from 'node:test';
import assert from 'node:assert/strict';

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { pushTravelerOrderEvent } = await import('../../src/lib/line-traveler-push.mjs');
const { pushGuideOrderEvent } = await import('../../src/lib/line-guide-push.mjs');
const { dispatchOrderEventTelegram } = await import('../../src/lib/order-telegram-notify.mjs');
const { upsertLineMapping, __resetLineMappingsForTest } = await import('../../src/lib/line-binding.mjs');
const { createGuideBindCode, redeemGuideBindCode, __resetGuideLineForTest } = await import('../../src/lib/guide-line-binding.mjs');
const { createTelegramBindCode, redeemTelegramBindCode, __resetTelegramForTest } = await import('../../src/lib/telegram-binding.mjs');
const { setNotificationCells, __resetNotificationSettingsForTest } = await import('../../src/lib/notification-settings.mjs');

async function bindTelegram(role, subjectId, chatId) {
  const { code } = await createTelegramBindCode({ role, subjectId });
  await redeemTelegramBindCode(code, { chatId });
}

const ENV_KEYS = [
  'LINE_PUSH_ENABLED', 'LINE_GUIDE_PUSH_ENABLED', 'LINE_MESSAGING_ENABLED', 'LINE_CHANNEL_ACCESS_TOKEN', 'LINE_OPS_GROUP_ID',
  'TELEGRAM_NOTIFY_ENABLED', 'TELEGRAM_GUIDE_NOTIFY_ENABLED', 'TELEGRAM_TRAVELER_NOTIFY_ENABLED',
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_ORDER_CHAT_ID',
];

function withEnv(overrides, fn) {
  const saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  const savedFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({ ok: true, result: {} }) };
  };
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
  return Promise.resolve(fn(calls)).finally(() => {
    global.fetch = savedFetch;
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
}

const LINE_ON = {
  LINE_PUSH_ENABLED: '1',
  LINE_GUIDE_PUSH_ENABLED: '1',
  LINE_MESSAGING_ENABLED: '1',
  LINE_CHANNEL_ACCESS_TOKEN: 'tok'.repeat(12),
  LINE_OPS_GROUP_ID: 'Cops',
};
const TG_ON = {
  TELEGRAM_NOTIFY_ENABLED: '1',
  TELEGRAM_GUIDE_NOTIFY_ENABLED: '1',
  TELEGRAM_TRAVELER_NOTIFY_ENABLED: '1',
  TELEGRAM_BOT_TOKEN: '123:abc',
  TELEGRAM_ORDER_CHAT_ID: '-1001',
};

test('matrix off (traveler/line) → traveler LINE push skipped matrix_disabled, no fetch', async () => {
  __resetLineMappingsForTest();
  __resetNotificationSettingsForTest();
  await upsertLineMapping({ lineUserId: 'Utrav', userId: 'u-1' });
  await setNotificationCells([{ event: 'order_cancelled', recipient: 'traveler', channel: 'line', enabled: false }]);

  await withEnv(LINE_ON, async (calls) => {
    const res = await pushTravelerOrderEvent({ kind: 'order_cancelled', orderId: 'o1', userId: 'u-1', activityTitle: 'X' });
    assert.equal(res.status, 'skipped');
    assert.equal(res.reason, 'matrix_disabled');
    assert.equal(calls.length, 0);
  });
});

test('matrix off (new_order/traveler/line) suppresses booking_confirmed push', async () => {
  // The booking-confirmation message uses kind 'booking_confirmed' but must be
  // gated by the 'new_order' matrix cell.
  __resetLineMappingsForTest();
  __resetNotificationSettingsForTest();
  await upsertLineMapping({ lineUserId: 'Utrav', userId: 'u-1' });
  await setNotificationCells([{ event: 'new_order', recipient: 'traveler', channel: 'line', enabled: false }]);
  await withEnv(LINE_ON, async (calls) => {
    const res = await pushTravelerOrderEvent({ kind: 'booking_confirmed', orderId: 'o1', userId: 'u-1', activityTitle: 'X' });
    assert.equal(res.status, 'skipped');
    assert.equal(res.reason, 'matrix_disabled');
    assert.equal(calls.length, 0);
  });
});

test('matrix on (traveler/line) → traveler LINE push still fires', async () => {
  __resetLineMappingsForTest();
  __resetNotificationSettingsForTest();
  await upsertLineMapping({ lineUserId: 'Utrav', userId: 'u-1' });
  await withEnv(LINE_ON, async (calls) => {
    const res = await pushTravelerOrderEvent({ kind: 'order_cancelled', orderId: 'o1', userId: 'u-1', activityTitle: 'X' });
    assert.equal(res.status, 'sent');
    assert.equal(calls.length, 1);
  });
});

test('matrix off (guide/line) → guide LINE push skipped matrix_disabled', async () => {
  __resetGuideLineForTest();
  __resetNotificationSettingsForTest();
  // bind a guide by slug used in the in-memory experiences store
  const { code } = await createGuideBindCode('andy-lee');
  await redeemGuideBindCode(code, { lineUserId: 'Uguide' });
  await setNotificationCells([{ event: 'new_order', recipient: 'guide', channel: 'line', enabled: false }]);

  await withEnv(LINE_ON, async (calls) => {
    const res = await pushGuideOrderEvent({ kind: 'new_order', orderId: 'o1', activityId: 'exp_chaishan_001', activityTitle: 'X' });
    assert.equal(res.status, 'skipped');
    assert.equal(res.reason, 'matrix_disabled');
    assert.equal(calls.length, 0);
  });
});

test('matrix off (admin/telegram) → telegram admin leg suppressed, guide+traveler still send', async () => {
  __resetTelegramForTest();
  __resetNotificationSettingsForTest();
  await bindTelegram('guide', 'andy-lee', 'g-chat');
  await bindTelegram('traveler', 'u-1', 't-chat');
  await setNotificationCells([{ event: 'new_order', recipient: 'admin', channel: 'telegram', enabled: false }]);

  await withEnv(TG_ON, async (calls) => {
    await dispatchOrderEventTelegram({
      kind: 'new_order', orderId: 'o1', activityId: 'exp_chaishan_001',
      userId: 'u-1', activityTitle: 'X',
    });
    const chatIds = calls.map((c) => JSON.parse(c.init.body).chat_id);
    assert.ok(!chatIds.includes('-1001'), 'admin group chat should be suppressed');
    assert.ok(chatIds.includes('g-chat'), 'guide telegram should still send');
    assert.ok(chatIds.includes('t-chat'), 'traveler telegram should still send');
  });
});
