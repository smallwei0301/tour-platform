import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGuideBindCode,
  redeemGuideBindCode,
  parseGuideBindCode,
  getLineUserIdForGuide,
  getGuideBinding,
  setGuideLineBlocked,
  __resetGuideLineForTest,
} from '../../src/lib/guide-line-binding.mjs';

// Runs without SUPABASE env → in-memory store fallback.

test('guide-line-binding: code + redeem binds guide ↔ line_user_id', async () => {
  __resetGuideLineForTest();
  const { code } = await createGuideBindCode('guide-1');
  assert.match(code, /^BIND-[A-Z0-9]{6}$/);

  const res = await redeemGuideBindCode(code, { lineUserId: 'Uguide', displayName: 'Andy' });
  assert.equal(res.ok, true);
  assert.equal(res.guideId, 'guide-1');

  assert.equal(await getLineUserIdForGuide('guide-1'), 'Uguide');
  const binding = await getGuideBinding('guide-1');
  assert.equal(binding.lineUserId, 'Uguide');
  assert.equal(binding.displayName, 'Andy');
});

test('guide-line-binding: unknown code → invalid_code', async () => {
  __resetGuideLineForTest();
  const res = await redeemGuideBindCode('BIND-ZZZZZZ', { lineUserId: 'Ux' });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'invalid_code');
});

test('guide-line-binding: expired code → expired', async () => {
  __resetGuideLineForTest();
  const { code } = await createGuideBindCode('guide-2', { ttlMs: -1 });
  const res = await redeemGuideBindCode(code, { lineUserId: 'Uy' });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'expired');
});

test('guide-line-binding: code is single-use (consumed on redeem)', async () => {
  __resetGuideLineForTest();
  const { code } = await createGuideBindCode('guide-3');
  assert.equal((await redeemGuideBindCode(code, { lineUserId: 'Uz' })).ok, true);
  const second = await redeemGuideBindCode(code, { lineUserId: 'Uz2' });
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'invalid_code');
});

test('guide-line-binding: re-binding a guide updates the line_user_id', async () => {
  __resetGuideLineForTest();
  await redeemGuideBindCode((await createGuideBindCode('guide-4')).code, { lineUserId: 'Uold' });
  await redeemGuideBindCode((await createGuideBindCode('guide-4')).code, { lineUserId: 'Unew' });
  assert.equal(await getLineUserIdForGuide('guide-4'), 'Unew');
});

test('guide-line-binding: blocked guide mapping does not resolve', async () => {
  __resetGuideLineForTest();
  await redeemGuideBindCode((await createGuideBindCode('guide-5')).code, { lineUserId: 'Ublk' });
  await setGuideLineBlocked('Ublk', true);
  assert.equal(await getLineUserIdForGuide('guide-5'), null);
  await setGuideLineBlocked('Ublk', false);
  assert.equal(await getLineUserIdForGuide('guide-5'), 'Ublk');
});

test('guide-line-binding: parseGuideBindCode extracts code from message text', () => {
  assert.equal(parseGuideBindCode('BIND-AB12CD'), 'BIND-AB12CD');
  assert.equal(parseGuideBindCode('  bind-ab12cd  '), 'BIND-AB12CD'); // case-insensitive + trim
  assert.equal(parseGuideBindCode('請綁定 BIND-XY99ZZ 謝謝'), 'BIND-XY99ZZ');
  assert.equal(parseGuideBindCode('hello world'), null);
  assert.equal(parseGuideBindCode(''), null);
});
