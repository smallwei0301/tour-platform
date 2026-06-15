import test from 'node:test';
import assert from 'node:assert/strict';

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const {
  createTravelerLineBindCode,
  parseTravelerLineBindCode,
  redeemTravelerLineBindCode,
  getLineUserIdForOrder,
  __resetLineMappingsForTest,
  __resetLineBindCodesForTest,
} = await import('../../src/lib/line-binding.mjs');

// Traveler LINE binding by one-time code (mirrors the guide BIND-XXXXXX flow):
// the /me console mints a code, the traveler sends it to the bot, the webhook
// redeems it → binds line_user_id ↔ this traveler's user_id/contact_email so
// order pushes can resolve a recipient (the LIFF path only works in-app).

test('parseTravelerLineBindCode extracts a TBIND code from message text', () => {
  assert.equal(parseTravelerLineBindCode('hello TBIND-ABC234 please'), 'TBIND-ABC234');
  assert.equal(parseTravelerLineBindCode('no code here'), null);
});

test('redeem binds line_user_id to the traveler user_id → order resolves', async () => {
  __resetLineMappingsForTest();
  __resetLineBindCodesForTest();
  const { code } = await createTravelerLineBindCode({ userId: 'u-trav-1', contactEmail: 'trav@example.com' });
  const result = await redeemTravelerLineBindCode(code, { lineUserId: 'UtravLine' });
  assert.equal(result.ok, true);

  assert.equal(await getLineUserIdForOrder({ userId: 'u-trav-1' }), 'UtravLine');
  // contact_email fallback also resolves (guest order)
  assert.equal(await getLineUserIdForOrder({ contact_email: 'trav@example.com' }), 'UtravLine');
});

test('redeem is single-use; replay of the same code fails', async () => {
  __resetLineMappingsForTest();
  __resetLineBindCodesForTest();
  const { code } = await createTravelerLineBindCode({ userId: 'u-trav-2' });
  assert.equal((await redeemTravelerLineBindCode(code, { lineUserId: 'U2' })).ok, true);
  const replay = await redeemTravelerLineBindCode(code, { lineUserId: 'U2' });
  assert.equal(replay.ok, false);
  assert.equal(replay.reason, 'invalid_code');
});

test('expired code is rejected', async () => {
  __resetLineMappingsForTest();
  __resetLineBindCodesForTest();
  const { code } = await createTravelerLineBindCode({ userId: 'u-trav-3' }, { ttlMs: -1 });
  const res = await redeemTravelerLineBindCode(code, { lineUserId: 'U3' });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'expired');
});

test('invalid code shape rejected without binding', async () => {
  __resetLineMappingsForTest();
  __resetLineBindCodesForTest();
  const res = await redeemTravelerLineBindCode('not-a-code', { lineUserId: 'U9' });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'invalid_code');
});
