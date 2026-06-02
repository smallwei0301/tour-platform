import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const routePath = join(ROOT, 'app/api/v2/admin/orders/[orderId]/send-review-invitation/route.ts');

describe('SEND_REVIEW_INVITATION admin endpoint source contracts', () => {
  let src;

  it('route file exists', () => {
    src = readFileSync(routePath, 'utf-8');
    assert.ok(src.length > 0, 'route.ts should not be empty');
  });

  it('exports POST handler', () => {
    assert.ok(/export\s+async\s+function\s+POST/.test(src), 'should export async function POST');
  });

  it('imports isReviewInvitationEligible from post-trip-eligibility', () => {
    assert.ok(
      /isReviewInvitationEligible/.test(src) && /post-trip-eligibility/.test(src),
      'should import isReviewInvitationEligible from post-trip-eligibility.mjs'
    );
  });

  it('imports sendReviewInvitation from email lib', () => {
    assert.ok(
      /sendReviewInvitation/.test(src) && /['"].*email['"]/.test(src),
      'should import sendReviewInvitation from email lib'
    );
  });

  it('validates orderId is UUID format', () => {
    assert.ok(
      /UUID_RE/.test(src) || /[0-9a-f]{8}.*[0-9a-f]{4}.*[0-9a-f]{4}/.test(src),
      'should validate UUID format for orderId'
    );
  });

  it('returns 422 when ineligible order (source shows eligibility check)', () => {
    assert.ok(
      /NOT_ELIGIBLE|isReviewInvitationEligible/.test(src) && /422/.test(src),
      'should return 422 when order is not eligible for review invitation'
    );
  });

  it('is NOT read-only (calls sendReviewInvitation mutation)', () => {
    assert.ok(
      /await\s+sendReviewInvitation\s*\(/.test(src),
      'should call sendReviewInvitation (not just check eligibility)'
    );
  });
});
