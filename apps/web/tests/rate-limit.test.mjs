import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

async function importRateLimitModule() {
  const sourcePath = path.resolve('src/lib/rate-limit.ts');
  const compiledPath = path.resolve(
    'src/lib/.tmp-rate-limit.test.mjs'
  );

  const source = await readFile(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;

  await writeFile(compiledPath, compiled, 'utf8');

  try {
    return await import(
      `${pathToFileURL(compiledPath).href}?t=${Date.now()}`
    );
  } finally {
    await unlink(compiledPath).catch(() => {});
  }
}

test('createRateLimitResponse returns per-limiter header for /api/me/orders limiter', async () => {
  const { myOrdersLimiter, createRateLimitResponse } = await importRateLimitModule();

  let result;
  for (let i = 0; i < 21; i += 1) {
    result = myOrdersLimiter.check('me-orders-ip');
  }

  const response = createRateLimitResponse(result);
  assert.ok(response);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('X-RateLimit-Limit'), '20');
  assert.equal(response.headers.get('X-RateLimit-Remaining'), '0');
  assert.ok(response.headers.get('X-RateLimit-Reset'));
  assert.ok(response.headers.get('Retry-After'));
});

test('createRateLimitResponse keeps /api/orders limiter header at 10', async () => {
  const { ordersLimiter, createRateLimitResponse } = await importRateLimitModule();

  let result;
  for (let i = 0; i < 11; i += 1) {
    result = ordersLimiter.check('orders-ip');
  }

  const response = createRateLimitResponse(result);
  assert.ok(response);
  assert.equal(response.headers.get('X-RateLimit-Limit'), '10');
  assert.equal(response.headers.get('X-RateLimit-Remaining'), '0');
});

test('createRateLimitResponse keeps /api/payments/ecpay/callback limiter header at 30', async () => {
  const { ecpayCallbackLimiter, createRateLimitResponse } = await importRateLimitModule();

  let result;
  for (let i = 0; i < 31; i += 1) {
    result = ecpayCallbackLimiter.check('ecpay-ip');
  }

  const response = createRateLimitResponse(result);
  assert.ok(response);
  assert.equal(response.headers.get('X-RateLimit-Limit'), '30');
  assert.equal(response.headers.get('X-RateLimit-Remaining'), '0');
});

test('createRateLimitResponse returns null when request is allowed', async () => {
  const { myOrdersLimiter, createRateLimitResponse } = await importRateLimitModule();

  const result = myOrdersLimiter.check('allowed-ip');
  assert.equal(createRateLimitResponse(result), null);
});
