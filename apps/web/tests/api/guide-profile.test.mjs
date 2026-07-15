import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = process.cwd();

test('guide profile API route exists and exports GET and PATCH', () => {
  const src = readFileSync(resolve(ROOT, 'app/api/guide/profile/route.ts'), 'utf8');
  assert.match(src, /export async function GET/, 'GET handler must exist');
  assert.match(src, /export async function PATCH/, 'PATCH handler must exist');
});

test('guide profile PATCH validates CSRF', () => {
  const src = readFileSync(resolve(ROOT, 'app/api/guide/profile/route.ts'), 'utf8');
  assert.match(src, /validateCsrf/, 'PATCH must validate CSRF');
});

test('guide profile PATCH only allows safe editable fields (no verification_status, slug, KYC fields)', () => {
  const src = readFileSync(resolve(ROOT, 'app/api/guide/profile/route.ts'), 'utf8');
  assert.match(src, /EDITABLE_FIELDS/, 'must use allowlist');
  assert.doesNotMatch(src, /verification_status/, 'must not touch verification_status');
  assert.doesNotMatch(src, /id_verified/, 'must not touch id_verified');
  assert.doesNotMatch(src, /guide_license_verified/, 'must not touch guide_license_verified');
  assert.doesNotMatch(src, /payout/, 'must not touch payout fields');
});

test('guide profile GET requires session', () => {
  const src = readFileSync(resolve(ROOT, 'app/api/guide/profile/route.ts'), 'utf8');
  assert.match(src, /verifyGuideSession/, 'must verify guide session');
  assert.match(src, /UNAUTHORIZED/, 'must return UNAUTHORIZED if no session');
});

test('guide profile edit page component exists', () => {
  const src = readFileSync(resolve(ROOT, 'app/(non-locale)/guide/profile/page.tsx'), 'utf8');
  assert.match(src, /use client/, 'must be client component');
  assert.match(src, /\/api\/guide\/profile/, 'must call guide profile API');
});
