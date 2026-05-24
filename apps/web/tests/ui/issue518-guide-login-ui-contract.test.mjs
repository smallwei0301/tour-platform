import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

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

test('guide login redirect sanitizer blocks path-normalization escapes and keeps safe guide routes', async () => {
  const src = await readSource('app/guide/login/page.tsx');

  const match = src.match(/function sanitizeGuideNext\(next: string \| null\): string \{([\s\S]*?)\n\}/);
  assert.ok(match, 'should define sanitizeGuideNext');

  const sanitizeGuideNext = new Function(
    'URL',
    `return function sanitizeGuideNext(next){${match[1]}\n}`
  )(URL);

  assert.equal(sanitizeGuideNext('/guide/orders?tab=today'), '/guide/orders?tab=today');
  assert.equal(sanitizeGuideNext('/guide/../admin'), '/guide/dashboard');
  assert.equal(sanitizeGuideNext('/guide/%2e%2e/admin'), '/guide/dashboard');
  assert.equal(sanitizeGuideNext('//evil.example/path'), '/guide/dashboard');
  assert.equal(sanitizeGuideNext('https://evil.example/guide/dashboard'), '/guide/dashboard');
});
