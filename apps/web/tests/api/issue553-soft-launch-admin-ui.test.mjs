/**
 * Contract tests for issue #553: Soft-launch admin UI
 *
 * Static file-inspection tests — no runtime server required.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

function read(rel) {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

// ── 1. soft-launch API route exports GET and POST ────────────────────────────

describe('soft-launch API route', () => {
  const routeSource = read('app/api/admin/soft-launch/route.ts');

  it('exports GET handler', () => {
    assert.match(routeSource, /export async function GET/);
  });

  it('exports POST handler', () => {
    assert.match(routeSource, /export async function POST/);
  });

  it('requires admin auth (uses isAdminAuthorized)', () => {
    assert.match(routeSource, /isAdminAuthorized/);
  });

  it('uses setControl for POST', () => {
    assert.match(routeSource, /setControl/);
  });

  it('uses getControls to read current state', () => {
    assert.match(routeSource, /getControls/);
  });

  it('returns 401 when auth fails', () => {
    assert.match(routeSource, /UNAUTHORIZED/);
    assert.match(routeSource, /status: 401/);
  });
});

// ── 2. go-no-go route includes soft_launch_controls ──────────────────────────

describe('go-no-go API route', () => {
  const source = read('app/api/admin/go-no-go/route.ts');

  it('imports getControls from soft-launch lib', () => {
    assert.match(source, /getControls/);
    assert.match(source, /soft-launch/);
  });

  it('references soft_launch_controls in response', () => {
    assert.match(source, /soft_launch_controls/);
  });
});

// ── 3. admin page has toggle UI for all 4 controls ───────────────────────────

describe('soft-launch admin page', () => {
  const pageSource = read('app/admin/soft-launch/page.tsx');

  it('has public_paused toggle', () => {
    assert.match(pageSource, /public_paused/);
  });

  it('has new_booking_paused toggle', () => {
    assert.match(pageSource, /new_booking_paused/);
  });

  it('has refund_manual_only toggle', () => {
    assert.match(pageSource, /refund_manual_only/);
  });

  it('has whitelist_enabled toggle', () => {
    assert.match(pageSource, /whitelist_enabled/);
  });

  it('fetches from /api/admin/soft-launch', () => {
    assert.match(pageSource, /\/api\/admin\/soft-launch/);
  });

  it('POSTs controlKey + toValue + reason', () => {
    assert.match(pageSource, /controlKey/);
    assert.match(pageSource, /toValue/);
    assert.match(pageSource, /reason/);
  });

  it('shows whitelist entry count', () => {
    assert.match(pageSource, /whitelistCount/);
  });

  it('has reason textarea for change confirmation', () => {
    assert.match(pageSource, /textarea/);
  });
});

// ── 4. AdminShell NAV_ITEMS contains soft-launch link ────────────────────────

describe('AdminShell nav', () => {
  const shellSource = read('src/components/admin/AdminShell.tsx');

  it('NAV_ITEMS contains /admin/soft-launch', () => {
    assert.match(shellSource, /\/admin\/soft-launch/);
  });

  it('nav label is 軟啟動控制', () => {
    assert.match(shellSource, /軟啟動控制/);
  });
});
