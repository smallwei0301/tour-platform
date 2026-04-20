import test from 'node:test';
import assert from 'node:assert/strict';
import { isAdminAuthorized, parseAllowlist } from '../src/lib/admin-auth.mjs';

test('parseAllowlist trims and lowercases', () => {
  const list = parseAllowlist(' A@X.COM , b@y.com ,, ');
  assert.deepEqual(list, ['a@x.com', 'b@y.com']);
});

test('admin auth requires token', () => {
  const r = isAdminAuthorized({
    token: '',
    requiredToken: 'abc',
    allowlistRaw: '',
    expectedSessionVersion: 1,
    sessionVersion: 1,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  assert.equal(r.ok, false);
});

test('admin auth passes with token, future expiry and no allowlist', () => {
  const r = isAdminAuthorized({
    token: 'abc',
    requiredToken: 'abc',
    allowlistRaw: '',
    expectedSessionVersion: 1,
    sessionVersion: 1,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  assert.equal(r.ok, true);
});

test('admin auth rejects expired session cookie', () => {
  const r = isAdminAuthorized({
    token: 'abc',
    requiredToken: 'abc',
    allowlistRaw: '',
    expectedSessionVersion: 1,
    sessionVersion: 1,
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'session expired');
});

test('admin auth rejects boundary expiry (expiresAt == now)', () => {
  const r = isAdminAuthorized({
    token: 'abc',
    requiredToken: 'abc',
    allowlistRaw: '',
    expectedSessionVersion: 1,
    sessionVersion: 1,
    expiresAt: new Date(Date.now()).toISOString(),
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'session expired');
});

test('admin auth enforces allowlist when configured', () => {
  const fail = isAdminAuthorized({
    token: 'abc',
    requiredToken: 'abc',
    email: 'x@x.com',
    allowlistRaw: 'a@x.com,b@y.com',
    expectedSessionVersion: 1,
    sessionVersion: 1,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  assert.equal(fail.ok, false);

  const pass = isAdminAuthorized({
    token: 'abc',
    requiredToken: 'abc',
    email: 'a@x.com',
    allowlistRaw: 'a@x.com,b@y.com',
    expectedSessionVersion: 1,
    sessionVersion: 1,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  assert.equal(pass.ok, true);
});
