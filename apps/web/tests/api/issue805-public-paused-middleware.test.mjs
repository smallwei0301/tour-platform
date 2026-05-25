/**
 * Contract tests for issue #805: Enforce public_paused soft-launch control at middleware entry
 *
 * Static analysis — verifies middleware.ts contains required guard patterns
 * without executing routes or hitting the DB.
 *
 * Acceptance Criteria:
 * 1. GIVEN public_paused=true AND whitelist_enabled=false,
 *    WHEN unauthenticated visitor requests public route,
 *    THEN receives maintenance/blocked response (not normal content)
 * 2. GIVEN public_paused=true AND whitelist_enabled=true,
 *    WHEN whitelisted traveler requests public route,
 *    THEN access allowed; non-whitelisted visitor blocked
 * 3. GIVEN getControls() throws/returns error fallback,
 *    WHEN guard evaluates,
 *    THEN fails open (public_paused treated as false)
 * 4. GIVEN public_paused=true,
 *    WHEN admin requests /admin/*,
 *    THEN NOT blocked (admin routes exempt)
 */

import { readFileSync } from 'fs';
import { strictEqual, ok } from 'assert';
import { describe, it } from 'node:test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, '../..');

const middlewareSrc = readFileSync(resolve(webRoot, 'middleware.ts'), 'utf-8');

describe('issue805 – public_paused middleware guard', () => {
  describe('imports and helpers', () => {
    it('imports getControls from soft-launch.mjs', () => {
      ok(
        middlewareSrc.includes('getControls') && middlewareSrc.includes('soft-launch.mjs'),
        'middleware should import getControls from soft-launch.mjs'
      );
    });

    it('imports isWhitelisted from soft-launch.mjs', () => {
      ok(
        middlewareSrc.includes('isWhitelisted'),
        'middleware should import isWhitelisted from soft-launch.mjs'
      );
    });
  });

  describe('AC1 – blocked when public_paused=true and whitelist_enabled=false', () => {
    it('checks public_paused flag', () => {
      ok(
        middlewareSrc.includes('public_paused'),
        'middleware should check controls.public_paused'
      );
    });

    it('returns 503 (or maintenance redirect) when public_paused and not whitelisted', () => {
      // Must return either 503 status OR redirect to /maintenance
      const has503 = middlewareSrc.includes('503');
      const hasMaintenance = middlewareSrc.includes('maintenance') || middlewareSrc.includes('/maintenance');
      ok(
        has503 || hasMaintenance,
        'middleware should return 503 or redirect to /maintenance when public_paused=true'
      );
    });

    it('returns PUBLIC_PAUSED error code or maintenance URL', () => {
      const hasPausedCode = middlewareSrc.includes('PUBLIC_PAUSED') || middlewareSrc.includes('SITE_PAUSED');
      const hasMaintenance = middlewareSrc.includes('maintenance');
      ok(
        hasPausedCode || hasMaintenance,
        'middleware should return PUBLIC_PAUSED/SITE_PAUSED error code or reference maintenance when blocking'
      );
    });
  });

  describe('AC2 – whitelist bypass when whitelist_enabled=true', () => {
    it('checks whitelist_enabled flag', () => {
      ok(
        middlewareSrc.includes('whitelist_enabled'),
        'middleware should check controls.whitelist_enabled'
      );
    });

    it('calls isWhitelisted when whitelist_enabled is true', () => {
      ok(
        middlewareSrc.includes('isWhitelisted') && middlewareSrc.includes('whitelist_enabled'),
        'middleware should call isWhitelisted when whitelist_enabled is true'
      );
    });
  });

  describe('AC3 – fail-open on getControls error', () => {
    it('wraps getControls in try/catch or uses error fallback', () => {
      // Either uses try/catch around getControls, or relies on soft-launch.mjs's built-in
      // error fallback (which returns { public_paused: false, ... } on error).
      // The middleware must not propagate errors that block public access.
      const hasTryCatch = middlewareSrc.includes('try {') || middlewareSrc.includes('try{');
      const hasErrorHandling = middlewareSrc.includes('catch') || middlewareSrc.includes('getControls');
      ok(
        hasTryCatch && hasErrorHandling,
        'middleware should use try/catch around getControls to fail open on errors'
      );
    });

    it('public_paused check is guarded so errors default to false (pass-through)', () => {
      // The guard block must have error handling — look for catch after getControls invocation
      const getControlsIdx = middlewareSrc.indexOf('getControls(');
      const catchAfterIdx = middlewareSrc.indexOf('catch', getControlsIdx);
      ok(
        getControlsIdx !== -1,
        'getControls must be called in middleware'
      );
      ok(
        catchAfterIdx !== -1,
        'a catch block must exist after getControls invocation'
      );
    });
  });

  describe('AC4 – admin routes are exempt', () => {
    it('public_paused guard skips /admin/* routes', () => {
      // The guard must check that the path is NOT an admin route before blocking
      const hasAdminExempt =
        middlewareSrc.includes('/admin') &&
        (middlewareSrc.includes('isAdminPage') || middlewareSrc.includes("startsWith('/admin')"));
      ok(
        hasAdminExempt,
        'middleware should exempt admin routes from public_paused block'
      );
    });

    it('public_paused guard skips /api/admin/* routes', () => {
      const hasApiAdminExempt =
        middlewareSrc.includes('/api/admin') &&
        (middlewareSrc.includes('isAdminApi') || middlewareSrc.includes("startsWith('/api/admin')"));
      ok(
        hasApiAdminExempt,
        'middleware should exempt /api/admin/* routes from public_paused block'
      );
    });

    it('public_paused guard skips auth routes', () => {
      const hasAuthExempt =
        middlewareSrc.includes('/auth') || middlewareSrc.includes('/api/auth');
      ok(
        hasAuthExempt,
        'middleware should exempt auth routes from public_paused block'
      );
    });
  });

  describe('guard placement', () => {
    it('public_paused guard is placed in the middleware function (not just helpers)', () => {
      // Guard logic should be inside the exported middleware function
      const middlewareFnIdx = middlewareSrc.indexOf('export async function middleware');
      const publicPausedIdx = middlewareSrc.indexOf('public_paused', middlewareFnIdx);
      ok(
        middlewareFnIdx !== -1,
        'middleware export function must exist'
      );
      ok(
        publicPausedIdx !== -1,
        'public_paused guard must appear inside (or after) the middleware function'
      );
    });

    it('public_paused guard runs before traveler route pass-through', () => {
      // The guard should appear before the line that returns NextResponse.next() for public paths
      const publicPausedIdx = middlewareSrc.indexOf('public_paused');
      const travelerPassthruIdx = middlewareSrc.indexOf('isTravelerPublicPath');
      ok(
        publicPausedIdx !== -1 && travelerPassthruIdx !== -1,
        'Both public_paused guard and isTravelerPublicPath must exist in middleware'
      );
      ok(
        publicPausedIdx < travelerPassthruIdx,
        'public_paused guard must appear before isTravelerPublicPath pass-through'
      );
    });
  });
});
