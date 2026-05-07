import test from 'node:test';
import assert from 'node:assert/strict';
import { isOrderOwner } from '../../src/lib/v2-order-authz.ts';

test('isOrderOwner returns true when order user_id matches auth user id', () => {
  const allowed = isOrderOwner(
    { user_id: 'user-123', contact_email: 'owner@example.com' },
    { id: 'user-123', email: 'other@example.com' }
  );

  assert.equal(allowed, true);
});

test('isOrderOwner returns true when contact_email matches auth user email case-insensitively', () => {
  const allowed = isOrderOwner(
    { user_id: 'user-aaa', contact_email: 'Owner@Example.com' },
    { id: 'user-bbb', email: 'owner@example.com' }
  );

  assert.equal(allowed, true);
});

test('isOrderOwner returns false when neither user_id nor contact_email matches', () => {
  const allowed = isOrderOwner(
    { user_id: 'user-aaa', contact_email: 'owner@example.com' },
    { id: 'user-bbb', email: 'intruder@example.com' }
  );

  assert.equal(allowed, false);
});

test('isOrderOwner returns false when auth identity is missing', () => {
  const allowed = isOrderOwner(
    { user_id: 'user-aaa', contact_email: 'owner@example.com' },
    { id: null, email: null }
  );

  assert.equal(allowed, false);
});
