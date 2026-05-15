import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

test('guide login submit flow uses bounded fetch timeout and timeout-specific error copy', async () => {
  const src = await readSource('app/guide/login/page.tsx');

  assert.match(src, /REQUEST_TIMEOUT_MS\s*=\s*\d+/, 'should define a bounded request timeout constant');
  assert.match(src, /new AbortController\(\)/, 'should use AbortController to bound request time');
  assert.match(src, /setTimeout\(\(\)\s*=>\s*controller\.abort\(\)/, 'should abort request when timeout is reached');
  assert.match(src, /AUTH_REQUEST_TIMEOUT/, 'should classify timeout failures with deterministic timeout code');
  assert.match(src, /連線逾時|服務暫時忙碌/, 'should show actionable timeout message');
});

test('guide login redirect only allows safe internal /guide path from next param', async () => {
  const src = await readSource('app/guide/login/page.tsx');

  assert.match(src, /params\.get\('next'\)/, 'should read next query parameter');
  assert.match(src, /sanitizeGuideNext|safeNext/, 'should sanitize next destination before redirect');
  assert.match(src, /startsWith\('\/guide'\)/, 'should only allow /guide internal routes');
  assert.match(src, /router\.push\(safeNext\)/, 'successful login should redirect to sanitized next path');
});
