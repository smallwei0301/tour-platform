/**
 * Contract tests for issue #551: Soft-launch checkout and refund guards
 *
 * Static analysis — verifies source files contain required guard patterns
 * without executing routes or hitting the DB.
 */

import { readFileSync } from 'fs';
import { strictEqual, ok } from 'assert';
import { describe, it } from 'node:test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, '../..');

function readRoute(relPath) {
  return readFileSync(resolve(webRoot, relPath), 'utf-8');
}

const draftSrc = readRoute('app/api/v2/bookings/draft/route.ts');
const checkoutSrc = readRoute('app/api/v2/bookings/[bookingId]/checkout/route.ts');
const refundCallbackSrc = readRoute('app/api/payments/ecpay/refund-callback/route.ts');

describe('issue551 – soft-launch guards', () => {
  describe('draft route', () => {
    it('imports getControls from soft-launch.mjs', () => {
      ok(
        draftSrc.includes('getControls') && draftSrc.includes('soft-launch.mjs'),
        'draft route should import getControls from soft-launch.mjs'
      );
    });

    it('checks new_booking_paused flag', () => {
      ok(
        draftSrc.includes('new_booking_paused'),
        'draft route should check controls.new_booking_paused'
      );
    });

    it('returns 423 when booking is paused', () => {
      ok(
        draftSrc.includes('423'),
        'draft route should return HTTP 423 when booking is paused'
      );
    });

    it('returns BOOKING_PAUSED error code', () => {
      ok(
        draftSrc.includes('BOOKING_PAUSED'),
        'draft route should return BOOKING_PAUSED error code'
      );
    });

    it('checks isWhitelisted when whitelist_enabled', () => {
      ok(
        draftSrc.includes('isWhitelisted') && draftSrc.includes('whitelist_enabled'),
        'draft route should check isWhitelisted when whitelist_enabled is true'
      );
    });
  });

  describe('checkout route', () => {
    it('imports getControls from soft-launch.mjs', () => {
      ok(
        checkoutSrc.includes('getControls') && checkoutSrc.includes('soft-launch.mjs'),
        'checkout route should import getControls from soft-launch.mjs'
      );
    });

    it('checks new_booking_paused flag', () => {
      ok(
        checkoutSrc.includes('new_booking_paused'),
        'checkout route should check controls.new_booking_paused'
      );
    });

    it('returns 423 when booking is paused', () => {
      ok(
        checkoutSrc.includes('423'),
        'checkout route should return HTTP 423 when booking is paused'
      );
    });

    it('returns BOOKING_PAUSED error code', () => {
      ok(
        checkoutSrc.includes('BOOKING_PAUSED'),
        'checkout route should return BOOKING_PAUSED error code'
      );
    });

    it('checks isWhitelisted when whitelist_enabled', () => {
      ok(
        checkoutSrc.includes('isWhitelisted') && checkoutSrc.includes('whitelist_enabled'),
        'checkout route should check isWhitelisted when whitelist_enabled is true'
      );
    });
  });

  describe('refund-callback route', () => {
    it('imports getControls from soft-launch.mjs', () => {
      ok(
        refundCallbackSrc.includes('getControls') && refundCallbackSrc.includes('soft-launch.mjs'),
        'refund-callback route should import getControls from soft-launch.mjs'
      );
    });

    it('checks refund_manual_only flag', () => {
      ok(
        refundCallbackSrc.includes('refund_manual_only'),
        'refund-callback route should check controls.refund_manual_only'
      );
    });

    it('skips processRefundCallbackDb when refund_manual_only is set', () => {
      // Guard must appear BEFORE the processRefundCallbackDb invocation (not the import)
      // Search for the actual call `processRefundCallbackDb(` rather than the import line
      const guardIdx = refundCallbackSrc.indexOf('refund_manual_only');
      const dbCallIdx = refundCallbackSrc.indexOf('processRefundCallbackDb(');
      ok(guardIdx !== -1, 'refund_manual_only guard must exist');
      ok(dbCallIdx !== -1, 'processRefundCallbackDb call must exist');
      ok(
        guardIdx < dbCallIdx,
        'refund_manual_only guard must appear before processRefundCallbackDb invocation'
      );
    });

    it('returns 1|OK to ECPay in manual-only mode', () => {
      ok(
        refundCallbackSrc.includes('1|OK (refund_manual_only mode)'),
        'refund-callback route should return 1|OK (refund_manual_only mode) to ECPay'
      );
    });
  });
});
