/**
 * Issue #430 — QA Seed Script: seed-qa-test-orders
 *
 * Static-analysis contract test — reads the seed script source and asserts:
 * AC3 - file exists, exports async main, references required env vars,
 *       contains idempotency check, references both 'paid' and 'completed' status.
 * AC4 - references all three required env vars (checked by inspecting source literals).
 *
 * No live DB required.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/web root
const WEB_ROOT = path.resolve(__dirname, '../..');
// repo root (two levels above apps/web)
const REPO_ROOT = path.resolve(WEB_ROOT, '../..');

const SEED_SCRIPT = path.join(REPO_ROOT, 'scripts/qa/seed-qa-test-orders.mjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function readScript() {
  assert.ok(fs.existsSync(SEED_SCRIPT), `Seed script must exist: ${SEED_SCRIPT}`);
  return fs.readFileSync(SEED_SCRIPT, 'utf8');
}

// ---------------------------------------------------------------------------
// AC3 — Script structure
// ---------------------------------------------------------------------------
describe('Issue 430 QA Seed — script exists and structure', () => {
  it('AC3: seed script file exists at scripts/qa/seed-qa-test-orders.mjs', () => {
    assert.ok(fs.existsSync(SEED_SCRIPT), `File must exist: ${SEED_SCRIPT}`);
  });

  it('AC3: script exports an async main function', () => {
    const src = readScript();
    const hasMainExport =
      /export\s+async\s+function\s+main\b/.test(src) ||
      /export\s*\{\s*main\s*\}/.test(src) ||
      /exports\.main\s*=/.test(src);
    assert.ok(hasMainExport, 'Must export an async main function');
  });

  it('AC3: script references SUPABASE_URL', () => {
    const src = readScript();
    assert.match(src, /SUPABASE_URL/, 'Must reference SUPABASE_URL env var');
  });

  it('AC3: script references SUPABASE_SERVICE_ROLE_KEY', () => {
    const src = readScript();
    assert.match(src, /SUPABASE_SERVICE_ROLE_KEY/, 'Must reference SUPABASE_SERVICE_ROLE_KEY env var');
  });

  it('AC3: script references TOUR_PLATFORM_TRAVELER_EMAIL', () => {
    const src = readScript();
    assert.match(src, /TOUR_PLATFORM_TRAVELER_EMAIL/, 'Must reference TOUR_PLATFORM_TRAVELER_EMAIL env var');
  });

  it('AC3: script contains idempotency check using admin_note and qa-seed marker', () => {
    const src = readScript();
    const hasAdminNoteCheck = /admin_note/.test(src);
    const hasQaSeedMarker = /qa-seed/.test(src);
    assert.ok(hasAdminNoteCheck, 'Must reference admin_note column in idempotency check');
    assert.ok(hasQaSeedMarker, 'Must reference qa-seed marker string for idempotency');
  });

  it('AC3: script references status paid', () => {
    const src = readScript();
    assert.match(src, /'paid'/, "Must reference 'paid' status literal");
  });

  it('AC3: script references status completed', () => {
    const src = readScript();
    assert.match(src, /'completed'/, "Must reference 'completed' status literal");
  });
});

// ---------------------------------------------------------------------------
// AC4 — Missing env vars result in error path
// ---------------------------------------------------------------------------
describe('Issue 430 QA Seed — env var validation (AC4)', () => {
  it('AC4: script checks for missing SUPABASE_URL and exits with non-zero code', () => {
    const src = readScript();
    // Must have explicit env check + exit/process.exit before any DB write
    const hasEnvCheck =
      /if\s*\(.*!SUPABASE_URL/.test(src) ||
      /!SUPABASE_URL/.test(src);
    assert.ok(hasEnvCheck, 'Must check for missing SUPABASE_URL and guard early exit');
  });

  it('AC4: script checks for missing SUPABASE_SERVICE_ROLE_KEY', () => {
    const src = readScript();
    const hasKeyCheck =
      /!SUPABASE_SERVICE_ROLE_KEY/.test(src);
    assert.ok(hasKeyCheck, 'Must check for missing SUPABASE_SERVICE_ROLE_KEY');
  });

  it('AC4: script checks for missing TOUR_PLATFORM_TRAVELER_EMAIL', () => {
    const src = readScript();
    const hasEmailCheck =
      /!TOUR_PLATFORM_TRAVELER_EMAIL/.test(src) ||
      /!travelerEmail/.test(src) ||
      /!email/.test(src);
    assert.ok(hasEmailCheck, 'Must check for missing TOUR_PLATFORM_TRAVELER_EMAIL');
  });

  it('AC4: script calls process.exit(1) on missing env', () => {
    const src = readScript();
    assert.match(src, /process\.exit\(1\)/, 'Must call process.exit(1) on missing env vars');
  });

  it('AC4: script prints to stderr on missing env', () => {
    const src = readScript();
    assert.match(src, /console\.error/, 'Must print error to stderr (console.error) for missing env');
  });
});

// ---------------------------------------------------------------------------
// AC1 — Output URL format
// ---------------------------------------------------------------------------
describe('Issue 430 QA Seed — output URL format (AC1)', () => {
  it('AC1: script references the production base URL', () => {
    const src = readScript();
    assert.match(
      src,
      /tour-platform-nine\.vercel\.app\/me\/orders/,
      'Must include production order URL pattern: https://tour-platform-nine.vercel.app/me/orders/<id>'
    );
  });
});
