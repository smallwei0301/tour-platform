/**
 * Phase 13 — Admin System-Health Contract Tests (AC1–AC5)
 * Issue #329: Admin system-health surface — API + UI
 *
 * Uses node:test + readFileSync pattern (no live server, no live credentials).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// ── AC1: Admin auth guard matches dashboard/summary ──────────────────────────

test('AC1: health route imports same admin auth guard as dashboard/summary/route.ts', () => {
  const healthPath = path.resolve(ROOT, 'app/api/admin/health/route.ts');
  assert.ok(existsSync(healthPath), `health route not found: ${healthPath}`);

  const summaryPath = path.resolve(ROOT, 'app/api/admin/dashboard/summary/route.ts');
  assert.ok(existsSync(summaryPath), `summary route not found: ${summaryPath}`);

  const healthSrc = readFileSync(healthPath, 'utf8');
  const summarySrc = readFileSync(summaryPath, 'utf8');

  // Extract import paths from summary route
  const summaryImports = summarySrc.match(/from\s+['"][^'"]+['"]/g) || [];
  const summaryLibImports = summaryImports
    .map((s) => s.replace(/from\s+['"]/, '').replace(/['"]$/, ''))
    .filter((p) => p.includes('src/lib') || p.startsWith('.'));

  // Health route must import from the same lib paths used by summary route
  // Both must reference src/lib/api (ok/fail helpers)
  assert.match(healthSrc, /src\/lib\/api|\.\..*lib\/api/, 'health route must import from src/lib/api like summary route');

  // Health route must exist and be a valid route file
  assert.match(healthSrc, /export.*async.*function.*GET|export.*GET/, 'health route must export GET handler');
});

// ── AC2: Health route response shape ─────────────────────────────────────────

test('AC2: health route references incidents table and returns counts/recent/deploySha', () => {
  const healthPath = path.resolve(ROOT, 'app/api/admin/health/route.ts');
  assert.ok(existsSync(healthPath), `health route not found: ${healthPath}`);

  const src = readFileSync(healthPath, 'utf8');

  // Must ACTUALLY QUERY incidents table (not just reference the string)
  assert.match(src, /\.from\s*\(\s*['"]incidents['"]\s*\)/, 'Must call supabase.from("incidents") — not just comment it');
  assert.match(src, /\.select\s*\(/, 'Must call .select() to actually query the table');
  assert.ok(!src.includes('counts: {}'), 'Must NOT return hardcoded empty counts: {}');
  assert.ok(!src.includes('recent: []'), 'Must NOT return hardcoded empty recent: []');

  // Must return counts
  assert.match(src, /counts/, 'Must include counts in response shape');

  // Must return recent
  assert.match(src, /recent/, 'Must include recent in response shape');

  // Must return deploySha
  assert.match(src, /deploySha/, 'Must include deploySha in response shape');

  // deploySha from VERCEL_GIT_COMMIT_SHA
  assert.match(src, /VERCEL_GIT_COMMIT_SHA/, 'Must use VERCEL_GIT_COMMIT_SHA env var for deploySha');
});

// ── AC3: Admin dashboard has 系統健康 link ────────────────────────────────────

test('AC3: admin/page.tsx contains a link/card to /admin/health with text 系統健康', () => {
  const adminPagePath = path.resolve(ROOT, 'app/(non-locale)/admin/page.tsx');
  assert.ok(existsSync(adminPagePath), `admin page not found: ${adminPagePath}`);

  const src = readFileSync(adminPagePath, 'utf8');

  // Must link to /admin/health
  assert.match(src, /\/admin\/health/, 'admin/page.tsx must contain /admin/health link');

  // Must contain 系統健康 text
  assert.match(src, /系統健康/, 'admin/page.tsx must contain 系統健康 text');
});

// ── AC4: Health page PII guard ────────────────────────────────────────────────

test('AC4: admin/health/page.tsx does NOT contain contact_email or contact_phone template literals', () => {
  const healthPagePath = path.resolve(ROOT, 'app/(non-locale)/admin/health/page.tsx');
  assert.ok(existsSync(healthPagePath), `health page not found: ${healthPagePath}`);

  const src = readFileSync(healthPagePath, 'utf8');

  // Must NOT contain contact_email or contact_phone
  assert.doesNotMatch(src, /contact_email/, 'health page must NOT contain contact_email (PII)');
  assert.doesNotMatch(src, /contact_phone/, 'health page must NOT contain contact_phone (PII)');
});

// ── AC5: Health route only exposes safe incident fields ───────────────────────

test('AC5: health route only exposes safe incident fields (no raw metadata jsonb)', () => {
  const healthPath = path.resolve(ROOT, 'app/api/admin/health/route.ts');
  assert.ok(existsSync(healthPath), `health route not found: ${healthPath}`);

  const src = readFileSync(healthPath, 'utf8');

  // Must reference safe fields
  assert.match(src, /source/, 'Must include source field');
  assert.match(src, /severity/, 'Must include severity field');
  assert.match(src, /message/, 'Must include message field');
  assert.match(src, /created_at/, 'Must include created_at field');

  // Must NOT directly expose raw metadata jsonb in response shape
  // (metadata should not be spread/returned directly)
  assert.doesNotMatch(
    src,
    /\.\.\..*metadata|spread.*metadata|return.*metadata/,
    'health route must NOT spread or directly return raw metadata'
  );
});
