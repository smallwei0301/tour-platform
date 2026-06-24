/**
 * Contract test: activity detail sidebar shows accurate payment and refund copy
 * aligned with refund-policy-v2. Fixes #604.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pageSource = readFileSync(
  resolve(import.meta.dirname, '../../app/[locale]/activities/[region]/[slug]/page.tsx'),
  'utf8'
);

// #multilingual：sidebar trust block 的可見文案已抽進 messages 的 activityDetail
// namespace（trustPay / trustRefundPrefix / trustRefundLink…），頁面以 t() 取用。
// 付款方式與退款級距的「文字」改驗 catalog；連結與結構仍驗頁面 source。
const activityDetail = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../messages/zh-Hant.json'), 'utf8')
).activityDetail;

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
    // 結構：trust block 以 t('trustPay') 渲染付款方式；文字（ECPay）存於 catalog。
    assert.ok(trustSection.includes("t('trustPay')"), 'Trust block must render the payment line via t(\'trustPay\')');
    assert.ok(activityDetail.trustPay.includes('ECPay'), 'trustPay copy must show ECPay as payment method');
  });

  it('shows refund policy tiers in sidebar', () => {
    const trustSection = pageSource.match(/kkd-booking-trust[\s\S]{0,500}/)?.[0] || '';
    assert.ok(trustSection.includes("t('trustRefundPrefix')"), 'Trust block must render refund tiers via t(\'trustRefundPrefix\')');
    // Must mention refund tiers (7天/70%/72小時 or similar)
    const hasRefundInfo = activityDetail.trustRefundPrefix.includes('退款') || activityDetail.trustRefundPrefix.includes('取消時間');
    assert.ok(hasRefundInfo, 'trustRefundPrefix copy must mention refund policy tiers, not just "依行程政策"');
  });

  it('links to /legal/refund', () => {
    const trustSection = pageSource.match(/kkd-booking-trust[\s\S]{0,500}/)?.[0] || '';
    assert.ok(trustSection.includes('/legal/refund'), 'Trust block must link to /legal/refund for full policy');
  });
});
