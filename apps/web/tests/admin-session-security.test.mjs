import test from 'node:test';
import assert from 'node:assert/strict';
import { getAdminSecurityState, rotateAdminToken, forceLogoutAllSessions, getRequiredAdminToken } from '../src/lib/admin-session.mjs';

test('rotate token updates override and sessionVersion', () => {
  const before = getAdminSecurityState();
  const envToken = 'base-token-123';
  const required = getRequiredAdminToken(envToken);

  const nextToken = `${required}-next`;
  const after = rotateAdminToken({ currentToken: required, newToken: nextToken, envToken });

  assert.equal(after.tokenOverride, nextToken);
  assert.ok(after.sessionVersion > before.sessionVersion);
});

test('force logout all increments sessionVersion', () => {
  const before = getAdminSecurityState();
  const after = forceLogoutAllSessions();
  assert.ok(after.sessionVersion > before.sessionVersion);
});
