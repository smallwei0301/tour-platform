import test from 'node:test';
import assert from 'node:assert/strict';
import { isAdminAuthorized, parseAllowlist } from '../src/lib/admin-auth.mjs';

test('parseAllowlist trims and lowercases', () => {
  const list = parseAllowlist(' A@X.COM , b@y.com ,, ');
  assert.deepEqual(list, ['a@x.com', 'b@y.com']);
});

test('admin auth requires token', () => {
  const r = isAdminAuthorized({ token: '', requiredToken: 'abc', allowlistRaw: '' });
  assert.equal(r.ok, false);
});

test('admin auth passes with token and no allowlist', () => {
  const r = isAdminAuthorized({ token: 'abc', requiredToken: 'abc', allowlistRaw: '' });
  assert.equal(r.ok, true);
});

test('admin auth enforces allowlist when configured', () => {
  const fail = isAdminAuthorized({ token: 'abc', requiredToken: 'abc', email: 'x@x.com', allowlistRaw: 'a@x.com,b@y.com' });
  assert.equal(fail.ok, false);

  const pass = isAdminAuthorized({ token: 'abc', requiredToken: 'abc', email: 'a@x.com', allowlistRaw: 'a@x.com,b@y.com' });
  assert.equal(pass.ok, true);
});
