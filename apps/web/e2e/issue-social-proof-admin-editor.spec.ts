import { test, expect } from './helpers';

/**
 * 後台社群口碑語錄結構化編輯器。
 *
 * 驗證：
 * - 後台可編輯每則口碑語錄的「人名 / 星數 / 評價內容」（取代舊的純文字 textarea）。
 * - 載入舊純文字資料時，正規化為可編輯列（人名留空）。
 * - 移除手動「初始評論數」輸入，改為自動對齊顯示。
 * - 儲存時送出結構化 socialProofQuotes，且 payload 不含手動 reviewCount。
 */

const ACTIVITY_ID = '33333333-3333-3333-3333-333333333333';

const MOCK_ACTIVITY = {
  ok: true,
  data: {
    id: ACTIVITY_ID,
    title: '測試行程（口碑編輯）',
    slug: 'test-social-proof',
    guideSlug: 'test-guide',
    region: '台北市',
    category: 'outdoor',
    priceTwd: 1800,
    durationMinutes: 240,
    minParticipants: 1,
    maxParticipants: 10,
    meetingPoint: '集合點',
    meetingPointMapUrl: '',
    coverImageUrl: '',
    imageUrls: [],
    description: '描述',
    shortDescription: '短描述',
    tagline: '標語',
    inclusions: [],
    exclusions: [],
    notices: [],
    refundRules: [],
    safetyNotice: '',
    goodFor: [],
    // 混合：結構化 + 舊純文字
    socialProofQuotes: [
      { author: '王先生', rating: 4, text: '很值得' },
      '純文字舊資料',
    ],
    faq: [],
    itinerary: [],
    status: 'draft',
    plans: [],
    ratingAvg: 4.5,
    reviewCount: 7,
  },
};

async function stubPage(page: import('@playwright/test').Page) {
  let capturedPutBody: string | null = null;

  await page.route(`**/api/admin/activities/${ACTIVITY_ID}`, async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACTIVITY) });
    } else if (req.method() === 'PUT') {
      capturedPutBody = req.postData();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: MOCK_ACTIVITY.data }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
  });
  await page.route(`**/api/admin/activities/${ACTIVITY_ID}/schedules`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
  });
  await page.route('**/api/admin/guides**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
  });
  await page.route(`**/api/v2/admin/activities/${ACTIVITY_ID}/plans`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { activity: { id: ACTIVITY_ID }, plans: [] } }) });
  });

  return () => capturedPutBody;
}

test('後台口碑語錄：載入結構化＋舊資料，新增/編輯，移除手動評論數，儲存送出結構化 payload', async ({ authedPage: page }) => {
  const getPutBody = await stubPage(page);

  await page.goto(`/admin/activities/${ACTIVITY_ID}/edit`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('text=社群口碑語錄', { timeout: 10000 });

  // 既有結構化資料載入為可編輯列
  const authorInputs = page.locator('input[aria-label="評論人名"]');
  await expect(authorInputs).toHaveCount(2);
  await expect(authorInputs.nth(0)).toHaveValue('王先生');
  // 舊純文字 → 人名留空（前台 fallback 旅客回饋）
  await expect(authorInputs.nth(1)).toHaveValue('');

  // 移除手動「初始評論數」輸入，改為自動對齊顯示
  await expect(page.locator('text=自動對齊')).toBeVisible();

  // 新增一則並填寫
  await page.locator('button:has-text("新增一則口碑")').click();
  await expect(authorInputs).toHaveCount(3);
  await authorInputs.nth(2).fill('李小姐');
  await page.locator('select[aria-label="評論星數"]').nth(2).selectOption('5');
  await page.locator('textarea[aria-label="評價內容"]').nth(2).fill('超推薦這個行程');

  // 儲存
  await page.locator('button:has-text("儲存變更")').click();
  await expect(page.locator('text=儲存成功')).toBeVisible({ timeout: 10000 });

  // 驗證送出的 payload：結構化 socialProofQuotes、且不含手動 reviewCount
  const body = getPutBody();
  expect(body, 'PUT body should be captured').toBeTruthy();
  const parsed = JSON.parse(body as string);
  expect(Array.isArray(parsed.socialProofQuotes)).toBe(true);
  expect(parsed.socialProofQuotes).toContainEqual({ author: '王先生', rating: 4, text: '很值得' });
  expect(parsed.socialProofQuotes).toContainEqual({ author: '李小姐', rating: 5, text: '超推薦這個行程' });
  // 舊純文字載入後以結構化送出（人名空字串）
  expect(parsed.socialProofQuotes).toContainEqual({ author: '', rating: 5, text: '純文字舊資料' });
  // 手動評論數已移除
  expect('reviewCount' in parsed).toBe(false);
});
