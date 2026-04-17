import { test, expect } from '@playwright/test';

const ADMIN_TOKEN = process.env.ADMIN_ACCESS_TOKEN || 'test-token-123';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@tour-platform.com';

const ADMIN_HEADERS = {
  'Content-Type': 'application/json',
  'x-admin-token': ADMIN_TOKEN,
  'x-admin-email': ADMIN_EMAIL,
};

test.describe('KPI guidePayoutRate persist + revert regression', () => {
  test('save guidePayoutRate persists, then revert restores original value', async ({ request }) => {
    // 1) Read current config + history head
    const cfgRes = await request.get('/api/admin/settings/kpi', { headers: ADMIN_HEADERS });
    expect(cfgRes.ok()).toBeTruthy();
    const cfgJson = await cfgRes.json();
    const original = cfgJson?.data;
    expect(typeof original?.guidePayoutRate).toBe('number');

    const historyRes = await request.get('/api/admin/settings/kpi/history', { headers: ADMIN_HEADERS });
    expect(historyRes.ok()).toBeTruthy();
    const historyJson = await historyRes.json();
    const history = historyJson?.data || [];
    const revertVersionId = history?.[0]?.versionId;
    expect(typeof revertVersionId).toBe('string');

    const originalRate = Number(original.guidePayoutRate);
    const mutatedRate = originalRate === 0.65 ? 0.7 : 0.65;

    // 2) Save new guidePayoutRate
    const patchRes = await request.patch('/api/admin/settings/kpi', {
      headers: ADMIN_HEADERS,
      data: {
        commissionRate: original.commissionRate,
        paymentFeeRate: original.paymentFeeRate,
        guidePayoutRate: mutatedRate,
        healthyMinContributionTwd: original.healthyMinContributionTwd,
        healthyAllowException: original.healthyAllowException,
        actor: 'e2e',
        note: 'e2e regression save',
      },
    });
    expect(patchRes.ok()).toBeTruthy();

    const afterSaveRes = await request.get('/api/admin/settings/kpi', { headers: ADMIN_HEADERS });
    expect(afterSaveRes.ok()).toBeTruthy();
    const afterSaveJson = await afterSaveRes.json();
    expect(Number(afterSaveJson?.data?.guidePayoutRate)).toBe(mutatedRate);

    // 3) Revert to previous version
    const revertRes = await request.post('/api/admin/settings/kpi/revert', {
      headers: ADMIN_HEADERS,
      data: { versionId: revertVersionId, actor: 'e2e' },
    });
    expect(revertRes.ok()).toBeTruthy();

    const afterRevertRes = await request.get('/api/admin/settings/kpi', { headers: ADMIN_HEADERS });
    expect(afterRevertRes.ok()).toBeTruthy();
    const afterRevertJson = await afterRevertRes.json();
    expect(Number(afterRevertJson?.data?.guidePayoutRate)).toBe(originalRate);
  });
});
