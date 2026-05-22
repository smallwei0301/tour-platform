/**
 * Contract test: activity detail sidebar shows accurate payment and refund copy
 * aligned with refund-policy-v2. Fixes #604.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pageSource = readFileSync(
  resolve(import.meta.dirname, '../../app/activities/[region]/[slug]/page.tsx'),
  'utf8'
);

describe('activity sidebar — payment and refund copy (#604)', () => {
  it('does NOT show LINE Pay in payment trust block', () => {
    // Find the trust block section
    const trustSection = pageSource.match(/kkd-booking-trust[\s\S]{0,500}/)?.[0] || '';
    assert.ok(!trustSection.includes('LINE Pay'), 'Trust block must not claim LINE Pay (not yet verified for soft-launch)');
  });

  it('does NOT show misleading 免費取消 copy', () => {
    assert.ok(!pageSource.includes('免費取消'), 'Must not show "免費取消" (free cancellation) — inaccurate per refund-policy-v2');
  });

  it('shows ECPay as the payment method', () => {
    const trustSection = pageSource.match(/kkd-booking-trust[\s\S]{0,500}/)?.[0] || '';
    assert.ok(trustSection.includes('ECPay'), 'Must show ECPay as payment method');
  });

  it('shows refund policy tiers in sidebar', () => {
    const trustSection = pageSource.match(/kkd-booking-trust[\s\S]{0,500}/)?.[0] || '';
    // Must mention refund tiers (7天/70%/72小時 or similar)
    const hasRefundInfo = trustSection.includes('退款') || trustSection.includes('取消時間');
    assert.ok(hasRefundInfo, 'Trust block must mention refund policy tiers, not just "依行程政策"');
  });

  it('links to /legal/refund', () => {
    const trustSection = pageSource.match(/kkd-booking-trust[\s\S]{0,500}/)?.[0] || '';
    assert.ok(trustSection.includes('/legal/refund'), 'Trust block must link to /legal/refund for full policy');
  });
});
