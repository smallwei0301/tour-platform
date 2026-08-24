import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const bridgeRoute = new URL('../../app/api/v2/me/midao/request-claims/bridge/route.ts', import.meta.url);

test('missing or mismatched CSRF is wired to the same unavailable response as every request-claim bridge denial', async () => {
  const source = await readFile(bridgeRoute, 'utf8');
  assert.match(source, /const csrf = validateCsrf\(request\);\s*if \(csrf\) return unavailable\(\);/u);
  assert.doesNotMatch(source, /if \(csrf\) return csrf;/u);
});
