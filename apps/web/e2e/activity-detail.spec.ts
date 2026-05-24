import { test, expect } from '@playwright/test';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3333';

test.describe('Activities - DB Integration', () => {
  test('1. /activities 頁面從 DB 讀取行程資料', async ({ page }) => {
    const res = await page.request.get(`${BASE_URL}/api/activities`);
    expect(res.ok()).toBeTruthy();

    const data = await res.json();
    const items = Array.isArray(data) ? data : data.data || [];
    expect(items.length).toBeGreaterThan(0);

    // 確認 priceTwd 是數字而非 NaN
    for (const item of items) {
      expect(typeof item.priceTwd).toBe('number');
      expect(isNaN(item.priceTwd)).toBeFalsy();
    }
  });

  test('2. /activities 前台頁面正常載入', async ({ page }) => {
    await page.goto(`${BASE_URL}/activities`);
    await expect(page).toHaveTitle(/Midao|祕島/);

    // 等待行程卡片出現（client component hydration）
    await page.waitForTimeout(2000);

    // 頁面至少應含有文字（不全空白）
    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(100);
  });
});

test.describe('Activity Detail - DatePlanSection', () => {
  let activitySlug: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/activities`);
    const data = await res.json();
    const items = Array.isArray(data) ? data : data.data || [];
    activitySlug = items[0]?.slug || 'kaohsiung-chaishan-cave-experience';
  });

  test('3. 行程詳情頁 DatePlanSection 存在', async ({ page }) => {
    await page.goto(`${BASE_URL}/activities/kaohsiung/${activitySlug}`);
    await page.waitForTimeout(2000);

    // kkd-plan-card 存在（方案選擇）
    const planCards = await page.locator('.kkd-plan-card').count();
    expect(planCards).toBeGreaterThan(0);
  });

  test('4. 價格顯示為有效數字（不是 NaN/undefined）', async ({ page }) => {
    await page.goto(`${BASE_URL}/activities/kaohsiung/${activitySlug}`);
    await page.waitForTimeout(2000);

    const priceText = await page.locator('.kkd-plan-price').first().textContent();
    expect(priceText).toBeTruthy();
    // NT$1,234 格式，應含數字
    expect(priceText).toMatch(/NT\$[\d,]+/);
    expect(priceText).not.toContain('NaN');
    expect(priceText).not.toContain('undefined');
  });

  test('5. 旅客評價 section 存在', async ({ page }) => {
    await page.goto(`${BASE_URL}/activities/kaohsiung/${activitySlug}`);
    await page.waitForTimeout(2000);

    const reviewSection = await page.locator('#section-reviews').count();
    expect(reviewSection).toBeGreaterThan(0);
  });
});

test.describe('Admin CRUD → 前台驗證', () => {
  const ADMIN_TOKEN = process.env.ADMIN_ACCESS_TOKEN || '';
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'smallwei0301@gmail.com';
  const SESSION_V = '1';
  const headers = {
    'Content-Type': 'application/json',
    'x-admin-token': ADMIN_TOKEN,
    'x-admin-email': ADMIN_EMAIL,
  };
  const qs = `?admin_session_version=${SESSION_V}`;
  let createdId: string;

  test('6. Admin 新增行程 (draft)', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/admin/activities${qs}`, {
      headers,
      data: {
        title: 'Playwright E2E 測試行程',
        slug: `playwright-e2e-${Date.now()}`,
        region: '台北',
        category: 'city-walk',
        priceTwd: 888,
        status: 'draft',
        guideSlug: 'andy-lee',
        durationMinutes: 90,
        minParticipants: 1,
        maxParticipants: 6,
      },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.ok).toBeTruthy();
    createdId = data.data?.id;
    expect(createdId).toBeTruthy();
  });

  test('7. Admin 發佈行程 → 前台出現', async ({ request }) => {
    // 先確認 createdId
    if (!createdId) test.skip();

    // PATCH status to published
    const patchRes = await request.patch(
      `${BASE_URL}/api/admin/activities/${createdId}/status${qs}`,
      { headers, data: { status: 'published' } }
    );
    expect(patchRes.ok()).toBeTruthy();

    // 前台 /api/activities 應該出現這筆
    const publicRes = await request.get(`${BASE_URL}/api/activities`);
    const publicData = await publicRes.json();
    const items = Array.isArray(publicData) ? publicData : publicData.data || [];
    const found = items.find((a: any) => a.id === createdId || a.title?.includes('Playwright'));
    expect(found).toBeTruthy();
  });
});
