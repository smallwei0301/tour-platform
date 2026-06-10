import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnNodeEsm } from '../helpers/spawn-node.mjs';

const middlewarePath = new URL('../../middleware.ts', import.meta.url).pathname;

function runMiddleware({ url, method = 'PATCH', cookie = '', csrfHeader = '' }) {
  const script = `
    const { NextRequest } = await import('next/server.js');
    const { middleware } = await import(${JSON.stringify(middlewarePath)});

    const headers = new Headers();
    if (${JSON.stringify(cookie)}) headers.set('cookie', ${JSON.stringify(cookie)});
    if (${JSON.stringify(csrfHeader)}) headers.set('x-csrf-token', ${JSON.stringify(csrfHeader)});

    const req = new NextRequest(${JSON.stringify('http://localhost')} + ${JSON.stringify(url)}, {
      method: ${JSON.stringify(method)},
      headers,
    });

    const res = await middleware(req);
    console.log(res.status);
  `;

  return spawnNodeEsm(script, { env: { ...process.env, ADMIN_ACCESS_TOKEN: 'test-token' } });
}

test('guide mutation route rejects missing csrf token (negative)', () => {
  const result = runMiddleware({
    url: '/api/guide/schedules/abc',
    method: 'PATCH',
    cookie: 'guide_token=abc',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(Number(result.stdout.trim()), 403);
});

test('guide mutation route passes csrf gate and continues to auth layer (positive gate)', () => {
  const token = 'a'.repeat(64);
  const result = runMiddleware({
    url: '/api/guide/schedules/abc',
    method: 'PATCH',
    cookie: `guide_token=abc; tp_csrf=${token}`,
    csrfHeader: token,
  });

  assert.equal(result.status, 0, result.stderr);
  // With CSRF passed, middleware should continue and fail later on guide session format check.
  assert.equal(Number(result.stdout.trim()), 401);
});

test('me mutation route rejects missing csrf token (negative)', () => {
  const result = runMiddleware({
    url: '/api/me/orders/ord_1',
    method: 'PATCH',
    cookie: 'sb-access-token=mock-user-session',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(Number(result.stdout.trim()), 403);
});

test('me mutation route with csrf token passes csrf gate (positive gate)', () => {
  const token = 'b'.repeat(64);
  const result = runMiddleware({
    url: '/api/me/orders/ord_1',
    method: 'PATCH',
    cookie: `sb-access-token=mock-user-session; tp_csrf=${token}`,
    csrfHeader: token,
  });

  assert.equal(result.status, 0, result.stderr);
  // Expected to pass middleware CSRF gate and continue as NextResponse.next().
  assert.equal(Number(result.stdout.trim()), 200);
});

test('reviews route without csrf token is blocked (mutation route)', () => {
  const result = runMiddleware({
    url: '/api/reviews',
    method: 'POST',
    cookie: 'sb-access-token=mock-user-session',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(Number(result.stdout.trim()), 403);
});

test('reviews route with csrf token passes csrf gate (positive gate)', () => {
  const token = 'c'.repeat(64);
  const result = runMiddleware({
    url: '/api/reviews',
    method: 'POST',
    cookie: `sb-access-token=mock-user-session; tp_csrf=${token}`,
    csrfHeader: token,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(Number(result.stdout.trim()), 200);
});
