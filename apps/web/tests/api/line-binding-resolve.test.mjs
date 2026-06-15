import test from 'node:test';
import assert from 'node:assert/strict';

import {
  upsertLineMapping,
  getLineUserIdForOrder,
  getLineMappingByLineUserId,
  setLineBlocked,
  __resetLineMappingsForTest,
} from '../../src/lib/line-binding.mjs';

// These tests run without SUPABASE_URL/SERVICE_ROLE_KEY, so line-binding
// falls back to the in-memory store (store.mjs lineUserMappings).

test('line-binding: resolve order by user_id', async () => {
  __resetLineMappingsForTest();
  await upsertLineMapping({ lineUserId: 'Uaaa', userId: 'user-1', displayName: 'Amy' });

  const lineUserId = await getLineUserIdForOrder({ userId: 'user-1', contactEmail: 'amy@example.com' });
  assert.equal(lineUserId, 'Uaaa');
});

test('line-binding: resolve order by contact_email fallback (guest order, no user_id)', async () => {
  __resetLineMappingsForTest();
  await upsertLineMapping({ lineUserId: 'Ubbb', contactEmail: 'guest@example.com' });

  // snake_case (DB shape) and camelCase (in-memory shape) must both resolve
  assert.equal(await getLineUserIdForOrder({ contact_email: 'guest@example.com' }), 'Ubbb');
  assert.equal(await getLineUserIdForOrder({ contactEmail: 'GUEST@example.com' }), 'Ubbb');
});

test('line-binding: unbound order resolves to null', async () => {
  __resetLineMappingsForTest();
  await upsertLineMapping({ lineUserId: 'Uccc', userId: 'user-9' });

  assert.equal(await getLineUserIdForOrder({ userId: 'nobody', contactEmail: 'nobody@example.com' }), null);
  assert.equal(await getLineUserIdForOrder({}), null);
});

test('line-binding: upsert is idempotent on lineUserId and updates fields', async () => {
  __resetLineMappingsForTest();
  await upsertLineMapping({ lineUserId: 'Uddd', userId: 'user-1' });
  await upsertLineMapping({ lineUserId: 'Uddd', userId: 'user-2', displayName: 'Ben' });

  const mapping = await getLineMappingByLineUserId('Uddd');
  assert.equal(mapping.userId, 'user-2');
  assert.equal(mapping.displayName, 'Ben');
  // resolving by the new user_id works; the old one no longer resolves to this line user
  assert.equal(await getLineUserIdForOrder({ userId: 'user-2' }), 'Uddd');
});

test('line-binding: blocked mapping does not resolve for push', async () => {
  __resetLineMappingsForTest();
  await upsertLineMapping({ lineUserId: 'Ueee', userId: 'user-block' });
  await setLineBlocked('Ueee', true);

  assert.equal(await getLineUserIdForOrder({ userId: 'user-block' }), null);

  await setLineBlocked('Ueee', false);
  assert.equal(await getLineUserIdForOrder({ userId: 'user-block' }), 'Ueee');
});
