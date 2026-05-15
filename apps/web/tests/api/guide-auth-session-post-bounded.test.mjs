import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const routePath = resolve(__dirname, '../../app/api/guide/auth/session/route.ts');
const routeSrc = readFileSync(routePath, 'utf8');

test('POST route enforces CSRF validation before Supabase access', () => {
  const csrfIndex = routeSrc.indexOf('const csrfError = validateCsrf(req);');
  const supabaseIndex = routeSrc.indexOf('const supabase = await getSupabase();');
  assert.ok(csrfIndex !== -1, 'route must validate CSRF');
  assert.ok(supabaseIndex !== -1, 'route must initialize Supabase client');
  assert.ok(csrfIndex < supabaseIndex, 'CSRF check must happen before Supabase access');
});

test('POST route has bounded Supabase query timeout and explicit 503 fallback', () => {
  assert.match(routeSrc, /SUPABASE_QUERY_TIMEOUT_MS\s*=\s*Number\(/, 'route must define timeout config');
  assert.match(routeSrc, /Promise\.race\(/, 'route must bound async Supabase calls');
  assert.match(routeSrc, /AUTH_TEMPORARILY_UNAVAILABLE/, 'route must return bounded temporary-unavailable response on timeout');
  assert.match(routeSrc, /status:\s*503/, 'timeout path should map to HTTP 503');
});

test('POST route keeps deterministic BAD_REQUEST path for malformed/missing credentials', () => {
  assert.match(routeSrc, /req\.json\(\)\.catch\(\(\)\s*=>\s*\(\{\}\)\)/, 'route must safely parse malformed JSON body');
  assert.match(routeSrc, /fail\('BAD_REQUEST',\s*'請提供登入憑證'\)/, 'route must return deterministic BAD_REQUEST response for missing credentials');
});
