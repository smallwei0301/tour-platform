import test from 'node:test';
import assert from 'node:assert/strict';

import { hasValidCsrf, shouldRequireScopedCsrf } from '../../src/lib/csrf-scope.mjs';

test('guide mutation route requires csrf when guide session cookie exists (negative)', () => {
  const required = shouldRequireScopedCsrf({
    pathname: '/api/guide/schedules/abc',
    method: 'PATCH',
    cookieHeader: 'guide_token=abc',
    hasTravelerAuthCookie: false,
  });

  assert.equal(required, true);

  const valid = hasValidCsrf({
    cookieHeader: 'guide_token=abc',
    csrfHeader: '',
  });
  assert.equal(valid, false);
});

test('guide mutation route passes csrf gate when cookie/header match (positive)', () => {
  const token = 'a'.repeat(64);
  const required = shouldRequireScopedCsrf({
    pathname: '/api/guide/schedules/abc',
    method: 'PATCH',
    cookieHeader: `guide_token=abc; tp_csrf=${token}`,
    hasTravelerAuthCookie: false,
  });

  assert.equal(required, true);

  const valid = hasValidCsrf({
    cookieHeader: `guide_token=abc; tp_csrf=${token}`,
    csrfHeader: token,
  });
  assert.equal(valid, true);
});

test('me mutation route requires csrf only when traveler session exists (negative)', () => {
  const required = shouldRequireScopedCsrf({
    pathname: '/api/me/orders/ord_1',
    method: 'PATCH',
    cookieHeader: 'sb-access-token=mock-user-session',
    hasTravelerAuthCookie: true,
  });

  assert.equal(required, true);

  const valid = hasValidCsrf({
    cookieHeader: 'sb-access-token=mock-user-session',
    csrfHeader: '',
  });
  assert.equal(valid, false);
});

test('me mutation route passes csrf gate with matching token (positive)', () => {
  const token = 'b'.repeat(64);
  const required = shouldRequireScopedCsrf({
    pathname: '/api/me/orders/ord_1',
    method: 'PATCH',
    cookieHeader: `sb-access-token=mock-user-session; tp_csrf=${token}`,
    hasTravelerAuthCookie: true,
  });

  assert.equal(required, true);

  const valid = hasValidCsrf({
    cookieHeader: `sb-access-token=mock-user-session; tp_csrf=${token}`,
    csrfHeader: token,
  });
  assert.equal(valid, true);
});

test('exempt admin login POST does not require csrf', () => {
  const required = shouldRequireScopedCsrf({
    pathname: '/api/admin/auth/session',
    method: 'POST',
    cookieHeader: '',
    hasTravelerAuthCookie: false,
  });
  assert.equal(required, false);
});
