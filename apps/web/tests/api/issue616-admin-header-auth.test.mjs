/**
 * Static contract tests for issue #616:
 * Verify that admin API routes accept x-admin-token + x-admin-email headers
 * via the pickAdminCredentials helper in admin-auth.mjs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '../..');
const libDir = path.join(webRoot, 'src/lib');
const adminAuthPath = path.join(libDir, 'admin-auth.mjs');

// ── Helper: import admin-auth module ──────────────────────────────────────────

const adminAuth = await import(adminAuthPath);

describe('issue #616 — admin header auth', () => {
  // 1. admin-auth.mjs exports pickAdminCredentials
  it('admin-auth.mjs exports pickAdminCredentials', () => {
    assert.strictEqual(
      typeof adminAuth.pickAdminCredentials,
      'function',
      'pickAdminCredentials must be exported from admin-auth.mjs'
    );
  });

  // 2. pickAdminCredentials reads x-admin-token header when present
  it('pickAdminCredentials returns header credentials when x-admin-token and x-admin-email are set', () => {
    const fakeReq = {
      headers: {
        get(key) {
          const map = {
            'x-admin-token': 'secret-token',
            'x-admin-email': 'admin@example.com',
            cookie: '',
          };
          return map[key] ?? null;
        },
      },
    };
    const creds = adminAuth.pickAdminCredentials(fakeReq);
    assert.strictEqual(creds.token, 'secret-token', 'token must come from x-admin-token header');
    assert.strictEqual(creds.email, 'admin@example.com', 'email must come from x-admin-email header');
    assert.strictEqual(creds.requireSession, false, 'requireSession must be false for header auth');
    assert.strictEqual(creds.sessionVersion, null, 'sessionVersion must be null for header auth');
    assert.strictEqual(creds.expiresAt, null, 'expiresAt must be null for header auth');
  });

  // 3. pickAdminCredentials falls back to cookie when headers are absent
  it('pickAdminCredentials falls back to cookies when no x-admin-token header', () => {
    const fakeReq = {
      headers: {
        get(key) {
          const map = {
            'x-admin-token': null,
            'x-admin-email': null,
            cookie: 'admin_token=cookie-token; admin_email=cookie%40example.com; admin_session_version=1; admin_session_expires_at=2099-01-01T00%3A00%3A00.000Z',
          };
          return map[key] ?? null;
        },
      },
    };
    const creds = adminAuth.pickAdminCredentials(fakeReq);
    assert.strictEqual(creds.token, 'cookie-token', 'token must come from admin_token cookie');
    assert.strictEqual(creds.email, 'cookie@example.com', 'email must come from admin_email cookie');
    assert.strictEqual(creds.requireSession, true, 'requireSession must be true for cookie fallback');
    assert.strictEqual(creds.sessionVersion, '1', 'sessionVersion must be read from cookie');
  });

  // ── Source-text checks for each route ─────────────────────────────────────

  function readRoute(relPath) {
    return readFileSync(path.join(webRoot, 'app/api/admin', relPath), 'utf8');
  }

  it('qa/route.ts uses pickAdminCredentials (not raw parseCookie for token)', () => {
    const src = readRoute('qa/route.ts');
    assert.ok(src.includes('pickAdminCredentials'), 'qa/route.ts must import/use pickAdminCredentials');
    assert.ok(!src.includes("parseCookie(request, 'admin_token')"), "qa/route.ts must not call parseCookie for admin_token");
  });

  it('qa/[id]/route.ts uses pickAdminCredentials', () => {
    const src = readRoute('qa/[id]/route.ts');
    assert.ok(src.includes('pickAdminCredentials'), 'qa/[id]/route.ts must use pickAdminCredentials');
    assert.ok(!src.includes("parseCookie(request, 'admin_token')"), "qa/[id]/route.ts must not call parseCookie for admin_token");
  });

  it('reviews/route.ts uses pickAdminCredentials', () => {
    const src = readRoute('reviews/route.ts');
    assert.ok(src.includes('pickAdminCredentials'), 'reviews/route.ts must use pickAdminCredentials');
    assert.ok(!src.includes("parseCookie(request, 'admin_token')"), "reviews/route.ts must not call parseCookie for admin_token");
  });

  it('reviews/[id]/route.ts uses pickAdminCredentials', () => {
    const src = readRoute('reviews/[id]/route.ts');
    assert.ok(src.includes('pickAdminCredentials'), 'reviews/[id]/route.ts must use pickAdminCredentials');
    assert.ok(!src.includes("parseCookie(request, 'admin_token')"), "reviews/[id]/route.ts must not call parseCookie for admin_token");
  });

  it('promo-codes/route.ts uses pickAdminCredentials', () => {
    const src = readRoute('promo-codes/route.ts');
    assert.ok(src.includes('pickAdminCredentials'), 'promo-codes/route.ts must use pickAdminCredentials');
    assert.ok(!src.includes("parseCookie(req, 'admin_token')"), "promo-codes/route.ts must not call parseCookie for admin_token");
  });

  it('promo-codes/[id]/route.ts uses pickAdminCredentials', () => {
    const src = readRoute('promo-codes/[id]/route.ts');
    assert.ok(src.includes('pickAdminCredentials'), 'promo-codes/[id]/route.ts must use pickAdminCredentials');
    assert.ok(!src.includes("parseCookie(req, 'admin_token')"), "promo-codes/[id]/route.ts must not call parseCookie for admin_token");
  });

  it('soft-launch/route.ts uses pickAdminCredentials', () => {
    const src = readRoute('soft-launch/route.ts');
    assert.ok(src.includes('pickAdminCredentials'), 'soft-launch/route.ts must use pickAdminCredentials');
    assert.ok(!src.includes("parseCookie(req, 'admin_token')"), "soft-launch/route.ts must not call parseCookie for admin_token");
  });

  it('orders/[orderId]/refund-execute/route.ts uses pickAdminCredentials', () => {
    const src = readRoute('../v2/admin/orders/[orderId]/refund-execute/route.ts');
    assert.ok(src.includes('pickAdminCredentials'), 'refund-execute/route.ts must use pickAdminCredentials');
    assert.ok(!src.includes("parseCookie(request, 'admin_token')"), "refund-execute/route.ts must not call parseCookie for admin_token");
  });
});
