/**
 * 行程編輯：地點可選擇全台縣市，並可複選（使用者需求）。
 *
 * 後台行程編輯頁的「主要地區」應涵蓋全台 18 縣市，並新增「附加地區（複選）」，
 * 讓行程在多個地區篩選中曝光。主要地區仍決定 URL/SEO，不重複出現在複選清單。
 *
 * AC1：主要地區下拉涵蓋全台縣市（過去只有 8 個）。
 * AC2：附加地區以 checkbox 複選呈現；載入時帶出既有 regions 勾選；主要地區不在複選清單。
 * AC3：勾選附加地區後儲存，PUT body 的 regions 含勾選項、排除主要地區。
 */
import { test, expect } from './helpers';

const ACTIVITY_ID = '33333333-3333-3333-3333-333333333333';

const MOCK_ACTIVITY = {
  ok: true,
  data: {
    id: ACTIVITY_ID,
    title: '多地區測試行程',
    slug: 'multi-region-test',
    guideSlug: 'test-guide',
    region: '高雄市',
    regionSlug: 'kaohsiung',
    regions: ['台北市'], // 既有附加地區
    category: 'mountain',
    priceTwd: 1800,
    durationMinutes: 240,
    minParticipants: 1,
    maxParticipants: 10,
    meetingPoint: '測試集合點',
    meetingPointMapUrl: '',
    coverImageUrl: '',
    imageUrls: [],
    description: '測試描述',
    shortDescription: '短描述',
    tagline: '標語',
    inclusions: [],
    exclusions: [],
    notices: [],
    refundRules: [],
    safetyNotice: '',
    goodFor: [],
    socialProofQuotes: [],
    faq: [],
    itinerary: [],
    status: 'draft',
    plans: [],
    ratingAvg: null,
    reviewCount: 0,
  },
};

async function stubPage(page: import('@playwright/test').Page, onPut?: (body: any) => void) {
  await page.route(`**/api/admin/activities/${ACTIVITY_ID}`, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACTIVITY) });
    } else if (method === 'PUT') {
      const body = route.request().postDataJSON();
      onPut?.(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { ...MOCK_ACTIVITY.data, ...body } }),
      });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
  });
  await page.route(`**/api/admin/activities/${ACTIVITY_ID}/schedules`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
  });
  await page.route(`**/api/v2/admin/activities/${ACTIVITY_ID}/plans`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { activity: { id: ACTIVITY_ID, title: '多地區測試行程' }, plans: [] } }),
    });
  });
  await page.route('**/api/admin/guides**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
  });
}

test('AC1 - 主要地區下拉涵蓋全台縣市（含過去缺少的屏東/宜蘭/台東等）', async ({ authedPage: page }) => {
  await stubPage(page);
  await page.goto(`/admin/activities/${ACTIVITY_ID}/edit`);
  await page.waitForLoadState('domcontentloaded');

  const primary = page.locator('select', { has: page.locator('option', { hasText: '選擇地區' }) }).first();
  await expect(primary).toBeVisible();
  for (const region of ['屏東縣', '宜蘭縣', '台東縣', '基隆市', '澎湖縣', '金門縣']) {
    await expect(primary.locator(`option:has-text("${region}")`)).toBeAttached();
  }
});

test('AC2 - 附加地區以 checkbox 複選；載入既有勾選；主要地區不在清單', async ({ authedPage: page }) => {
  await stubPage(page);
  await page.goto(`/admin/activities/${ACTIVITY_ID}/edit`);
  await page.waitForLoadState('domcontentloaded');

  const fieldset = page.locator('fieldset', { has: page.locator('legend:has-text("附加地區")') });
  await expect(fieldset).toBeVisible();

  // 既有 regions=['台北市'] → 勾選
  await expect(fieldset.locator('input[type="checkbox"][value="台北市"]')).toBeChecked();
  // 主要地區（高雄市）不應出現在複選清單
  await expect(fieldset.locator('input[type="checkbox"][value="高雄市"]')).toHaveCount(0);
  // 其他縣市存在但未勾
  await expect(fieldset.locator('input[type="checkbox"][value="花蓮縣"]')).not.toBeChecked();
});

test('AC3 - 勾選附加地區後儲存，PUT 的 regions 含勾選項、排除主要地區', async ({ authedPage: page }) => {
  let putBody: any = null;
  await stubPage(page, (body) => { putBody = body; });
  await page.goto(`/admin/activities/${ACTIVITY_ID}/edit`);
  await page.waitForLoadState('domcontentloaded');

  const fieldset = page.locator('fieldset', { has: page.locator('legend:has-text("附加地區")') });
  await fieldset.locator('input[type="checkbox"][value="花蓮縣"]').check();

  await page.locator('button:has-text("儲存變更")').first().click();
  await expect.poll(() => putBody).not.toBeNull();

  expect(putBody.region).toBe('高雄市');
  expect(putBody.regions).toContain('台北市');
  expect(putBody.regions).toContain('花蓮縣');
  expect(putBody.regions).not.toContain('高雄市');
});
