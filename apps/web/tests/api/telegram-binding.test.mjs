import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTelegramBindCode,
  redeemTelegramBindCode,
  parseStartPayload,
  getTelegramChatForGuide,
  getTelegramChatForTraveler,
  setTelegramBlocked,
  markTelegramUpdateProcessed,
  __resetTelegramForTest,
} from '../../src/lib/telegram-binding.mjs';

// Runs without SUPABASE env → in-memory fallback.

test('telegram-binding: guide code + redeem binds guide ↔ chat', async () => {
  __resetTelegramForTest();
  const { code } = await createTelegramBindCode({ role: 'guide', subjectId: 'guide-1' });
  assert.match(code, /^[A-Za-z0-9_-]{6,64}$/);

  const res = await redeemTelegramBindCode(code, { chatId: '12345', displayName: 'Andy' });
  assert.equal(res.ok, true);
  assert.equal(res.role, 'guide');
  assert.equal(res.subjectId, 'guide-1');
  assert.equal(await getTelegramChatForGuide('guide-1'), '12345');
});

test('telegram-binding: traveler resolves by userId or contact_email', async () => {
  __resetTelegramForTest();
  const { code } = await createTelegramBindCode({ role: 'traveler', subjectId: 'user-9', contactEmail: 'T@Ex.com' });
  await redeemTelegramBindCode(code, { chatId: '777' });

  assert.equal(await getTelegramChatForTraveler({ userId: 'user-9' }), '777');
  assert.equal(await getTelegramChatForTraveler({ contactEmail: 'GUEST@x.com' }), null);
  assert.equal(await getTelegramChatForTraveler({ contactEmail: 't@ex.com' }), '777');
});

test('telegram-binding: unknown / expired / reused code', async () => {
  __resetTelegramForTest();
  assert.equal((await redeemTelegramBindCode('NOPE12', { chatId: '1' })).reason, 'invalid_code');

  const { code: expired } = await createTelegramBindCode({ role: 'guide', subjectId: 'g', ttlMs: -1 });
  assert.equal((await redeemTelegramBindCode(expired, { chatId: '1' })).reason, 'expired');

  const { code } = await createTelegramBindCode({ role: 'guide', subjectId: 'g2' });
  assert.equal((await redeemTelegramBindCode(code, { chatId: '1' })).ok, true);
  assert.equal((await redeemTelegramBindCode(code, { chatId: '2' })).reason, 'invalid_code'); // single-use
});

test('telegram-binding: blocked chat does not resolve', async () => {
  __resetTelegramForTest();
  await redeemTelegramBindCode((await createTelegramBindCode({ role: 'guide', subjectId: 'g3' })).code, { chatId: '55' });
  await setTelegramBlocked('55', true);
  assert.equal(await getTelegramChatForGuide('g3'), null);
  await setTelegramBlocked('55', false);
  assert.equal(await getTelegramChatForGuide('g3'), '55');
});

test('telegram-binding: parseStartPayload extracts code from /start', () => {
  assert.equal(parseStartPayload('/start AB12cd'), 'AB12cd');
  assert.equal(parseStartPayload('/start  XY_99-z '), 'XY_99-z');
  assert.equal(parseStartPayload('/start'), null);
  assert.equal(parseStartPayload('hello'), null);
});

test('telegram-binding: update_id idempotency', async () => {
  __resetTelegramForTest();
  assert.equal((await markTelegramUpdateProcessed(1001)).firstTime, true);
  assert.equal((await markTelegramUpdateProcessed(1001)).firstTime, false);
});
