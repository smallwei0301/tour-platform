import test from 'node:test';
import assert from 'node:assert/strict';
import { createCsrfCookie, validateCsrf } from '../../src/lib/csrf.mjs';

test('validateCsrf passes when cookie/header match', () => {
  const token = 'a'.repeat(64);
  const request = new Request('http://localhost/api/guide/availability-rules', {
    method: 'POST',
    headers: {
      cookie: createCsrfCookie(token),
      'x-csrf-token': token,
    },
  });

  const result = validateCsrf(request);
  assert.equal(result, null);
});

test('validateCsrf rejects when token missing', async () => {
  const request = new Request('http://localhost/api/guide/availability-rules', { method: 'POST' });
  const response = validateCsrf(request);
  assert.ok(response);
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error.code, 'CSRF_REQUIRED');
});

test('validateCsrf rejects when token mismatch', async () => {
  const request = new Request('http://localhost/api/guide/availability-rules', {
    method: 'POST',
    headers: {
      cookie: createCsrfCookie('a'.repeat(64)),
      'x-csrf-token': 'b'.repeat(64),
    },
  });
  const response = validateCsrf(request);
  assert.ok(response);
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error.code, 'CSRF_INVALID');
});
