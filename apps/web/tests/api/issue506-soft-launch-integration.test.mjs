/**
 * Static contract / cross-reference tests for issue #555 — soft-launch controls
 *
 * Verifies that:
 *   1. The migration file defines all 4 expected controls as columns
 *   2. The admin soft-launch route file exists and references soft-launch lib
 *   3. The admin route exports GET and POST handlers
 *   4. The booking draft route has a new_booking_paused guard
 *   5. The checkout route has a new_booking_paused guard
 *   6. The refund-callback route has a refund_manual_only guard
 *
 * Run: node --test tests/api/issue506-soft-launch-integration.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(webRoot, '../..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFile(relPath) {
  const full = path.resolve(repoRoot, relPath);
  assert.ok(existsSync(full), `Expected file to exist: ${relPath}`);
  return readFileSync(full, 'utf8');
}

function fileExists(relPath) {
  return existsSync(path.resolve(repoRoot, relPath));
}

// ---------------------------------------------------------------------------
// Test group 1: Migration defines all 4 controls
// ---------------------------------------------------------------------------

describe('Migration — soft_launch_controls columns', () => {
  const MIGRATION_PATH = 'supabase/migrations/20260516_issue549_soft_launch_controls.sql';

  it('TC1.1: migration file exists', () => {
    assert.ok(fileExists(MIGRATION_PATH), 'Migration file must exist');
  });

  const EXPECTED_CONTROLS = [
    'public_paused',
    'new_booking_paused',
    'refund_manual_only',
    'whitelist_enabled',
  ];

  for (const control of EXPECTED_CONTROLS) {
    it(`TC1.2: migration defines column "${control}"`, () => {
      const sql = readFile(MIGRATION_PATH);
      assert.ok(
        sql.includes(control),
        `Migration must define column "${control}" in soft_launch_controls`
      );
    });
  }

  it('TC1.3: migration creates soft_launch_control_audit table', () => {
    const sql = readFile(MIGRATION_PATH);
    assert.ok(
      sql.includes('soft_launch_control_audit'),
      'Migration must create soft_launch_control_audit table'
    );
  });

  it('TC1.4: migration creates soft_launch_whitelist table', () => {
    const sql = readFile(MIGRATION_PATH);
    assert.ok(
      sql.includes('soft_launch_whitelist'),
      'Migration must create soft_launch_whitelist table'
    );
  });

  it('TC1.5: whitelist entry_type CHECK constraint covers traveler_user_id, activity_id, guide_id', () => {
    const sql = readFile(MIGRATION_PATH);
    assert.ok(sql.includes('traveler_user_id'), 'whitelist CHECK must include traveler_user_id');
    assert.ok(sql.includes('activity_id'), 'whitelist CHECK must include activity_id');
    assert.ok(sql.includes('guide_id'), 'whitelist CHECK must include guide_id');
  });
});

// ---------------------------------------------------------------------------
// Test group 2: Admin soft-launch route
// ---------------------------------------------------------------------------

describe('Admin route — /api/admin/soft-launch', () => {
  const ROUTE_PATH = 'apps/web/app/api/admin/soft-launch/route.ts';

  it('TC2.1: admin soft-launch route file exists', () => {
    assert.ok(fileExists(ROUTE_PATH), 'Admin soft-launch route must exist');
  });

  it('TC2.2: route imports getControls and setControl from soft-launch lib', () => {
    const src = readFile(ROUTE_PATH);
    assert.ok(
      src.includes('getControls') && src.includes('setControl'),
      'Route must import getControls and setControl'
    );
    assert.ok(
      src.includes('soft-launch'),
      'Route must import from soft-launch.mjs'
    );
  });

  it('TC2.3: route exports GET handler', () => {
    const src = readFile(ROUTE_PATH);
    assert.ok(
      src.includes('export async function GET') || src.includes('export function GET'),
      'Route must export a GET handler'
    );
  });

  it('TC2.4: route exports POST handler', () => {
    const src = readFile(ROUTE_PATH);
    assert.ok(
      src.includes('export async function POST') || src.includes('export function POST'),
      'Route must export a POST handler'
    );
  });

  it('TC2.5: route validates all 4 VALID_CONTROL_KEYS', () => {
    const src = readFile(ROUTE_PATH);
    assert.ok(src.includes('public_paused'), 'Route must validate public_paused key');
    assert.ok(src.includes('new_booking_paused'), 'Route must validate new_booking_paused key');
    assert.ok(src.includes('refund_manual_only'), 'Route must validate refund_manual_only key');
    assert.ok(src.includes('whitelist_enabled'), 'Route must validate whitelist_enabled key');
  });
});

// ---------------------------------------------------------------------------
// Test group 3: Booking draft route has new_booking_paused guard
// ---------------------------------------------------------------------------

describe('Booking draft route — new_booking_paused guard', () => {
  const DRAFT_ROUTE = 'apps/web/app/api/v2/bookings/draft/route.ts';

  it('TC3.1: draft route file exists', () => {
    assert.ok(fileExists(DRAFT_ROUTE), 'Booking draft route must exist');
  });

  it('TC3.2: draft route references new_booking_paused', () => {
    const src = readFile(DRAFT_ROUTE);
    assert.ok(
      src.includes('new_booking_paused'),
      'Draft route must guard on new_booking_paused'
    );
  });
});

// ---------------------------------------------------------------------------
// Test group 4: Checkout route has new_booking_paused guard
// ---------------------------------------------------------------------------

describe('Checkout route — new_booking_paused guard', () => {
  const CHECKOUT_ROUTE = 'apps/web/app/api/v2/bookings/[bookingId]/checkout/route.ts';

  it('TC4.1: checkout route file exists', () => {
    assert.ok(fileExists(CHECKOUT_ROUTE), 'Checkout route must exist');
  });

  it('TC4.2: checkout route references new_booking_paused', () => {
    const src = readFile(CHECKOUT_ROUTE);
    assert.ok(
      src.includes('new_booking_paused'),
      'Checkout route must guard on new_booking_paused'
    );
  });
});

// ---------------------------------------------------------------------------
// Test group 5: Refund callback route has refund_manual_only guard
// ---------------------------------------------------------------------------

describe('Refund callback route — refund_manual_only guard', () => {
  const REFUND_ROUTE = 'apps/web/app/api/payments/ecpay/refund-callback/route.ts';

  it('TC5.1: refund-callback route file exists', () => {
    assert.ok(fileExists(REFUND_ROUTE), 'Refund callback route must exist');
  });

  it('TC5.2: refund-callback route references refund_manual_only', () => {
    const src = readFile(REFUND_ROUTE);
    assert.ok(
      src.includes('refund_manual_only'),
      'Refund callback route must guard on refund_manual_only'
    );
  });
});

// ---------------------------------------------------------------------------
// Test group 6: soft-launch.mjs lib — function exports
// ---------------------------------------------------------------------------

describe('soft-launch.mjs — exported function surface', () => {
  it('TC6.1: getControls is exported', async () => {
    const mod = await import('../../src/lib/soft-launch.mjs');
    assert.ok(typeof mod.getControls === 'function', 'getControls must be exported');
  });

  it('TC6.2: setControl is exported', async () => {
    const mod = await import('../../src/lib/soft-launch.mjs');
    assert.ok(typeof mod.setControl === 'function', 'setControl must be exported');
  });

  it('TC6.3: isWhitelisted is exported', async () => {
    const mod = await import('../../src/lib/soft-launch.mjs');
    assert.ok(typeof mod.isWhitelisted === 'function', 'isWhitelisted must be exported');
  });
});
