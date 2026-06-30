/**
 * #1532 — 行程管理「下載 JSON 樣板」應匯出「當前編輯中行程」的文案設定，而非固定柴山樣本。
 *
 * 既有行為：downloadTemplate() 永遠輸出寫死的柴山秘境範例。
 * 期望行為：下載的 JSON = 目前頁面上正在編輯的行程（含尚未儲存的修改）。
 *
 * 驗證策略：mock `/api/admin/activities/[id]` GET 回傳「阿里山之旅」，載入編輯頁，
 * 在標題欄追加修改字串後按下載按鈕，攔截 download，讀回檔案內容，
 * 斷言 JSON 的 title 等於「我們在頁面上看到／改過的標題」，且不含柴山樣本字樣。
 */
import { test, expect } from './helpers';
import { readFileSync } from 'fs';

const ACTIVITY_ID = 'act-alishan-e2e';

const MOCK_ACTIVITY = {
  id: ACTIVITY_ID,
  slug: 'alishan-forest-walk',
  title: '阿里山森林漫步輕旅行｜高雄出發一日專車',
  guideSlug: 'guide-alishan',
  region: '嘉義縣',
  category: 'mountain',
  priceTwd: 2680,
  durationMinutes: 600,
  meetingPoint: '高雄火車站東口',
  meetingPointMapUrl: 'https://maps.example.com/kaohsiung-station',
  // next/image 只允許 next.config 的 remotePatterns 主機，故用 images.unsplash.com 避免 render 失敗
  coverImageUrl: 'https://images.unsplash.com/photo-alishan-cover?w=1200',
  imageUrls: ['https://images.unsplash.com/photo-alishan-1?w=1200', 'https://images.unsplash.com/photo-alishan-2?w=1200'],
  tagline: '搭專車直奔雲海與神木，輕鬆走進阿里山森林',
  shortDescription: '從高雄出發的阿里山一日行程，免開車免轉乘。',
  description: '完整描述：阿里山日出、神木群與森林步道。',
  inclusions: ['來回專車', '專業導遊', '森林步道導覽'],
  exclusions: ['個人餐費', '個人保險升級'],
  notices: ['請穿著舒適步行鞋', '山區早晚溫差大請備外套'],
  refundRules: ['出發 7 天前取消全額退款'],
  safetyNotice: '山區步道濕滑，請依導遊指示行進。',
  goodFor: ['親子', '攝影愛好者'],
  socialProofQuotes: [{ author: '王小明', rating: 5, text: '雲海超美，導遊很專業！', photos: [] }],
  faq: [{ q: '需要自備午餐嗎？', a: '不用，行程含在地風味餐。' }],
  itinerary: [
    { step: 1, title: '高雄出發', description: '專車直達阿里山', duration: '180 分', icon: '🚌' },
    { step: 2, title: '神木群步道', description: '漫步千年神木林', duration: '120 分', icon: '🌲' },
  ],
  plans: [
    {
      id: 'alishan-standard',
      label: '標準一日團',
      duration: '約 10 小時',
      priceMultiplier: 1,
      price: 2680,
      highlights: ['雲海觀景', '神木群導覽'],
      detailsLinkText: '查看方案詳情 ›',
      bookingBtnText: '立即預約',
      language: '中文',
      earliestDeparture: '2026-07-10',
      confirmByDays: 2,
      freeCancelDays: 7,
      planInclusions: ['來回專車', '導遊'],
      planExclusions: ['個人餐費'],
      planItinerary: [{ text: '08:00 高雄出發' }],
      meetingPointName: '高雄火車站東口',
      meetingAddress: '高雄市三民區建國二路',
      experiencePointName: '阿里山國家森林遊樂區',
      experienceAddress: '嘉義縣阿里山鄉',
      planNotices: ['請準時集合'],
      planRefundRules: ['出發 7 天前取消全額退款'],
    },
  ],
  status: 'published',
  ratingAvg: 4.9,
};

test('下載 JSON 匯出當前編輯中的行程，而非固定柴山樣本', async ({ authedPage: page }) => {
  // mock 編輯頁載入用的 GET（精準匹配此活動，避免攔到其他 admin API）
  await page.route(`**/api/admin/activities/${ACTIVITY_ID}`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: MOCK_ACTIVITY }),
    });
  });

  // 編輯頁同時掛載導遊搜尋、方案與場次等子元件，會打真實 API；
  // 無 Supabase 時這些端點回 400 會讓子元件 render 失敗 → 觸發 admin error boundary。
  // 一律 mock 成合法空資料，讓頁面穩定 hydrate。
  await page.route('**/api/admin/guides/search**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [{ slug: MOCK_ACTIVITY.guideSlug, displayName: '阿里山嚮導' }] }) });
  });
  await page.route(`**/api/v2/admin/activities/${ACTIVITY_ID}/plans`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { plans: [] } }) });
  });
  await page.route(`**/api/admin/activities/${ACTIVITY_ID}/schedules`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
  });

  await page.goto(`/admin/activities/${ACTIVITY_ID}/edit`);

  // 等表單以 mock 資料 hydrate（標題欄出現阿里山資料）
  const titleInput = page.locator('#activity-edit-title');
  await expect(titleInput).toHaveValue(MOCK_ACTIVITY.title, { timeout: 15000 });

  // 模擬操作者「改完阿里山之旅」：在標題後追加一段尚未儲存的修改
  const editedTitle = `${MOCK_ACTIVITY.title}（已調整）`;
  await titleInput.fill(editedTitle);

  // 觸發下載並攔截檔案
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /下載.*JSON|下載目前行程/ }).click();
  const download = await downloadPromise;

  const path = await download.path();
  expect(path).toBeTruthy();
  const exported = JSON.parse(readFileSync(path!, 'utf-8'));

  // 1) title = 當前頁面上（含未儲存修改）的值，而不是柴山樣本
  expect(exported.title).toBe(editedTitle);
  expect(JSON.stringify(exported)).not.toContain('柴山');

  // 2) 其餘文案欄位反映當前行程設定
  expect(exported.region).toBe(MOCK_ACTIVITY.region);
  expect(exported.priceTwd).toBe(MOCK_ACTIVITY.priceTwd);
  expect(exported.inclusions).toEqual(MOCK_ACTIVITY.inclusions);
  expect(exported.itinerary).toEqual(MOCK_ACTIVITY.itinerary);
  expect(exported.plans[0].id).toBe('alishan-standard');
  expect(exported.faq).toEqual(MOCK_ACTIVITY.faq);

  // 3) 檔名帶上當前行程 slug，不再固定為 chaishan
  expect(download.suggestedFilename()).toBe('activity-alishan-forest-walk.json');
});
