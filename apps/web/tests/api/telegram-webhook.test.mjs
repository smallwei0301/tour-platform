import test from 'node:test';
import assert from 'node:assert/strict';

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.TELEGRAM_WEBHOOK_SECRET = 'whsec_telegram_strong_secret_value';

const { processTelegramUpdate } = await import('../../src/lib/telegram-webhook.mjs');
const {
  createTelegramBindCode,
  getTelegramChatForGuide,
  __resetTelegramForTest,
} = await import('../../src/lib/telegram-binding.mjs');

const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

function update(obj) {
  return JSON.stringify(obj);
}

test('telegram webhook: /start <code> with valid secret binds the guide', async () => {
  __resetTelegramForTest();
  const { code } = await createTelegramBindCode({ role: 'guide', subjectId: 'guide-tg-1' });
  const res = await processTelegramUpdate(
    update({ update_id: 1, message: { text: `/start ${code}`, chat: { id: 6001 } } }),
    SECRET,
  );
  assert.equal(res.verified, true);
  assert.equal(String(await getTelegramChatForGuide('guide-tg-1')), '6001');
});

test('telegram webhook: wrong secret → not verified, no binding', async () => {
  __resetTelegramForTest();
  const { code } = await createTelegramBindCode({ role: 'guide', subjectId: 'guide-tg-2' });
  const res = await processTelegramUpdate(
    update({ update_id: 2, message: { text: `/start ${code}`, chat: { id: 6002 } } }),
    'wrong-secret',
  );
  assert.equal(res.verified, false);
  assert.equal(await getTelegramChatForGuide('guide-tg-2'), null);
});

test('telegram webhook: duplicate update_id is processed once', async () => {
  __resetTelegramForTest();
  const { code } = await createTelegramBindCode({ role: 'guide', subjectId: 'guide-tg-3' });
  const body = update({ update_id: 3, message: { text: `/start ${code}`, chat: { id: 6003 } } });
  await processTelegramUpdate(body, SECRET);
  assert.equal(String(await getTelegramChatForGuide('guide-tg-3')), '6003');
  // replay: code already consumed; idempotency guard prevents re-processing
  const res = await processTelegramUpdate(body, SECRET);
  assert.equal(res.processed, 0);
});

test('telegram webhook: user blocking the bot (my_chat_member kicked) blocks the binding', async () => {
  __resetTelegramForTest();
  const { code } = await createTelegramBindCode({ role: 'guide', subjectId: 'guide-tg-4' });
  await processTelegramUpdate(update({ update_id: 10, message: { text: `/start ${code}`, chat: { id: 6004 } } }), SECRET);
  assert.equal(String(await getTelegramChatForGuide('guide-tg-4')), '6004');

  await processTelegramUpdate(update({ update_id: 11, my_chat_member: { chat: { id: 6004 }, new_chat_member: { status: 'kicked' } } }), SECRET);
  assert.equal(await getTelegramChatForGuide('guide-tg-4'), null);
});

test('telegram webhook: successful bind sends the ack even with TELEGRAM_NOTIFY_ENABLED off', async () => {
  __resetTelegramForTest();
  const savedToken = process.env.TELEGRAM_BOT_TOKEN;
  const savedNotify = process.env.TELEGRAM_NOTIFY_ENABLED;
  const savedFetch = global.fetch;
  const calls = [];
  process.env.TELEGRAM_BOT_TOKEN = 'BOTTOKEN';
  delete process.env.TELEGRAM_NOTIFY_ENABLED; // order-notify kill-switch OFF
  global.fetch = async (url, init) => { calls.push({ url: String(url), init }); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  try {
    const { code } = await createTelegramBindCode({ role: 'guide', subjectId: 'guide-tg-ack' });
    await processTelegramUpdate(update({ update_id: 30, message: { text: `/start ${code}`, chat: { id: 6030 } } }), SECRET);
    assert.equal(String(await getTelegramChatForGuide('guide-tg-ack')), '6030');
    const ack = calls.find((c) => c.url.includes('/sendMessage'));
    assert.ok(ack, 'expected the binding ack to be delivered despite the kill-switch');
    const body = JSON.parse(ack.init.body);
    assert.equal(body.chat_id, '6030');
    assert.match(body.text, /綁定成功/);
  } finally {
    global.fetch = savedFetch;
    if (savedToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = savedToken;
    if (savedNotify === undefined) delete process.env.TELEGRAM_NOTIFY_ENABLED; else process.env.TELEGRAM_NOTIFY_ENABLED = savedNotify;
  }
});

test('telegram webhook: a plain message is not a binding', async () => {
  __resetTelegramForTest();
  await createTelegramBindCode({ role: 'guide', subjectId: 'guide-tg-5' });
  const res = await processTelegramUpdate(update({ update_id: 20, message: { text: 'hello', chat: { id: 6005 } } }), SECRET);
  assert.equal(res.verified, true);
  assert.equal(await getTelegramChatForGuide('guide-tg-5'), null);
});
