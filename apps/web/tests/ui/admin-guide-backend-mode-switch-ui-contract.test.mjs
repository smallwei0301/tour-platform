import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(
  resolve(here, '../../app/(non-locale)/admin/guides/[guideId]/page.tsx'),
  'utf8'
);

test('admin guide detail exposes backend mode badge and directional switch copy', () => {
  assert.match(page, /data-testid="admin-guide-backend-mode-badge"/u);
  assert.match(page, /data-testid="admin-guide-backend-mode-switch"/u);
  assert.match(page, /切換到新後台/u);
  assert.match(page, /切回舊後台/u);
});

test('admin backend mode switch posts an authenticated idempotent command', () => {
  assert.match(page, /\/api\/v2\/admin\/guides\/\$\{guide\.id\}\/backend-mode/u);
  assert.match(page, /ensureCsrfToken\(\)/u);
  assert.match(page, /\.\.\.csrfHeaders\(\)/u);
  assert.match(page, /['"]Idempotency-Key['"]\s*:\s*crypto\.randomUUID\(\)/u);
  assert.match(page, /JSON\.stringify\(\{\s*backendMode:\s*targetMode,\s*reason\s*\}\)/u);
});

test('admin backend mode switch rejects cancelled, blank, and oversized reasons before fetch', () => {
  assert.match(page, /window\.prompt\(/u);
  assert.match(page, /reasonInput\s*===\s*null/u);
  assert.match(page, /reasonInput\.trim\(\)/u);
  assert.match(page, /reason\.length\s*>\s*500/u);
});

test('admin backend mode switch updates local mode only from a successful v2 response', () => {
  assert.match(page, /json\?\.success\s*!==\s*true/u);
  assert.match(page, /backend_mode:\s*json\.data\.backendMode/u);
});
