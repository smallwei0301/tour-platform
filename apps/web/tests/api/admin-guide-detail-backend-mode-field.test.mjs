import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const route = readFileSync(
  resolve(here, '../../app/api/admin/guides/[guideId]/route.ts'),
  'utf8'
);
const getBody = route.split('export async function PATCH')[0];

test('admin guide detail projects backend_mode from both rich and base profile selects', () => {
  const rich = getBody.match(/const profileRichSelect = '([^']+)'/u)?.[1] ?? '';
  const base = getBody.match(/const profileBaseSelect = '([^']+)'/u)?.[1] ?? '';

  assert.match(rich, /(?:^|, )backend_mode(?:,|$)/u);
  assert.match(base, /(?:^|, )backend_mode(?:,|$)/u);
});

test('admin guide detail preserves a legacy-schema fallback when backend_mode is absent', () => {
  assert.match(getBody, /const profileLegacySelect = '([^']+)'/u);
  const legacy = getBody.match(/const profileLegacySelect = '([^']+)'/u)?.[1] ?? '';
  assert.doesNotMatch(legacy, /(?:^|, )backend_mode(?:,|$)/u);
  assert.match(getBody, /select\(profileLegacySelect\)/u);
});
