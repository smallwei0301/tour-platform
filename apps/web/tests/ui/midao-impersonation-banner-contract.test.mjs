import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(resolve(root, 'src/features/midao/shell/MidaoImpersonationBanner.tsx'), 'utf8');

test('Midao banner is gated by verified impersonation state and supports ending it', () => {
  assert.match(source, /VerifiedImpersonation/u);
  assert.match(source, /if \(!impersonation\) return null/u);
  assert.match(source, /guideName/u);
  assert.match(source, /管理員代入模式/u);
  assert.match(source, /結束代入/u);
  assert.match(source, /DELETE/u);
  assert.match(source, /data-testid="midao-impersonation-banner"/u);
});

test('banner source never renders admin identity or raw credentials', () => {
  assert.doesNotMatch(source, /actorId|adminEmail|ADMIN_ACCESS_TOKEN|token=/u);
});
