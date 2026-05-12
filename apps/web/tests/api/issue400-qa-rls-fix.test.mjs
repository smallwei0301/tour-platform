/**
 * Issue #400 — QA traveler submit RLS fix
 * TDD contract tests: verify POST /api/qa uses service-role client for INSERT
 * after verifying user identity, mirroring the /api/reviews pattern.
 *
 * Root cause: anonClientWithToken passes apikey=anon in the PostgREST apikey header,
 * so PostgREST resolves role=anon, not authenticated → RLS TO authenticated fails → HTTP 500.
 * Fix: verify user with bearer client, then INSERT with service-role client (bypasses RLS role check),
 * writing user_id: user.id and status: 'pending_moderation' explicitly.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function readRoute(relPath) {
  const full = path.join(ROOT, relPath);
  assert.ok(fs.existsSync(full), `Route file must exist: ${full}`);
  return fs.readFileSync(full, 'utf8');
}

describe('Issue 400 — POST /api/qa RLS fix: service-role INSERT pattern', () => {
  it('route file exists at app/api/qa/route.ts', () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'app/api/qa/route.ts')),
      'app/api/qa/route.ts must exist'
    );
  });

  it('exports POST function', () => {
    const src = readRoute('app/api/qa/route.ts');
    assert.match(src, /export\s+async\s+function\s+POST\s*\(/, 'Must export POST handler');
  });

  it('has getServiceClient() helper for service-role INSERT', () => {
    const src = readRoute('app/api/qa/route.ts');
    assert.match(
      src,
      /function\s+getServiceClient\s*\(\)/,
      'Must define getServiceClient() helper (mirrors /api/reviews pattern)'
    );
  });

  it('POST verifies user identity via bearer client before INSERT', () => {
    const src = readRoute('app/api/qa/route.ts');
    assert.match(src, /auth\.getUser\(\)/, 'Must call auth.getUser() to verify identity');
    assert.match(src, /UNAUTHORIZED/i, 'Must return UNAUTHORIZED if no user');
    assert.match(src, /status:\s*401/, 'Must return HTTP 401 when unauthenticated');
  });

  it('POST uses service-role client for activity_qa INSERT (not anon bearer client)', () => {
    const src = readRoute('app/api/qa/route.ts');
    // Must define and use getServiceClient for the INSERT
    assert.match(
      src,
      /getServiceClient\(\)/,
      'Must call getServiceClient() for INSERT (mirrors /api/reviews)'
    );
    // The service client must be used to call .from('activity_qa')
    const serviceClientPattern = /getServiceClient\(\)[\s\S]{0,300}\.from\('activity_qa'\)/;
    const assignThenUsePattern = /=\s*getServiceClient\(\)[\s\S]{0,500}\.from\('activity_qa'\)/;
    assert.ok(
      serviceClientPattern.test(src) || assignThenUsePattern.test(src),
      'Service-role client must be used for .from(\'activity_qa\') INSERT'
    );
  });

  it('POST inserts user_id: user.id explicitly when using service-role client', () => {
    const src = readRoute('app/api/qa/route.ts');
    assert.match(
      src,
      /user_id\s*:\s*user\.id/,
      'Must write user_id: user.id explicitly (no auth.uid() in service-role context)'
    );
  });

  it("POST inserts status: 'pending_moderation' explicitly", () => {
    const src = readRoute('app/api/qa/route.ts');
    assert.match(
      src,
      /status\s*:\s*['"]pending_moderation['"]/,
      "Must insert status: 'pending_moderation' explicitly"
    );
  });

  it('POST does NOT pass anon bearer token to INSERT (anonClientWithToken not used for activity_qa INSERT)', () => {
    const src = readRoute('app/api/qa/route.ts');
    // anonClientWithToken should NOT be used to INSERT into activity_qa
    const anonInsertPattern = /anonClientWithToken[\s\S]{0,50}\.from\('activity_qa'\)/;
    assert.ok(
      !anonInsertPattern.test(src),
      'anonClientWithToken must NOT be used for activity_qa INSERT — use service-role client instead'
    );
  });

  it('POST returns 201 on success', () => {
    const src = readRoute('app/api/qa/route.ts');
    assert.match(src, /status:\s*201/, 'Must return HTTP 201 on success');
  });
});
