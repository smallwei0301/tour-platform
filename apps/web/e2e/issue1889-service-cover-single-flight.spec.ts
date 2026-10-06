// #1889：封面採 single-flight；A 的 upload＋PATCH 結束後，才允許選 B。
// 全部 API 與封面圖片均為本機 stub，未知 API／外部請求一律 fail closed。
// 不呼叫真實 auth、資料庫、寄信或付款；不修改既有受保護 spec。
import type { Page } from '@playwright/test';
import { test, expect, setGuideSession } from './helpers';

test.describe.configure({ timeout: 120_000 });

const ACTIVITY_ID = 'act-cover-1889';
const SERVICE_PATH = `/api/v2/guide/midao/services/${ACTIVITY_ID}`;
const UPLOAD_PATH = `/api/guide/activities/${ACTIVITY_ID}/upload-image`;
const COVER_OLD = '/__e2e_mock__/issue1889/cover-old.png';
const COVER_A = '/__e2e_mock__/issue1889/cover-a.png';
const COVER_B = '/__e2e_mock__/issue1889/cover-b.png';
// RootDocument 的既有預設 telemetry，僅辨識精確 GET script 並封鎖，不載入或送資料。
const BLOCKED_ANALYTICS_SCRIPTS = new Set([
  'https://www.googletagmanager.com/gtag/js?id=G-26EYTQJ9RC',
  'https://va.vercel-scripts.com/v1/script.debug.js',
  'https://va.vercel-scripts.com/v1/speed-insights/script.debug.js',
]);
// 可解碼的 1×1 PNG：走真實 Image／canvas compressImage，不用假影像字串。
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWP4z8DwHwAFAAH/e+m+7wAAAABJRU5ErkJggg==',
  'base64',
);
const file = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG });

const SERVICE = {
  activityId: ACTIVITY_ID,
  title: '模擬封面測試服務',
  tagline: '純模擬單一上傳流程',
  coverImageUrl: COVER_OLD,
  durationMinutes: 300,
  minParticipants: 2,
  maxParticipants: 6,
  region: '高雄',
  languages: ['中文'],
  priceTwd: 2800,
  dealMode: 'confirm_first',
  questions: [],
  showcasePublished: true,
  mainSiteStatus: 'draft',
  midaoSortOrder: null,
};

function deferred() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  return { wait, release };
}

type JsonBody = Record<string, unknown>;
type MockOptions = {
  deferFirstUpload?: ReturnType<typeof deferred>;
  deferFirstPatch?: ReturnType<typeof deferred>;
  failFirst?: 'upload' | 'patch';
};

/** 沿用 midao2-service-plans 的 services／summary／plans envelope。 */
async function stubCoverApis(page: Page, options: MockOptions = {}) {
  const rec = {
    uploads: [] as { contentType: string; multipart: string }[],
    coverPatches: [] as JsonBody[],
    fullSaves: [] as JsonBody[],
    blockedAnalytics: [] as string[],
    unexpected: [] as string[],
  };
  let service = { ...SERVICE };
  const baseURL = String(test.info().project.use.baseURL);
  const origin = new URL(baseURL).origin;

  await page.context().route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    // 不讓外部 auth／Storage／分析或任何未知第三方請求漏到網路。
    if (url.origin !== origin) {
      if (BLOCKED_ANALYTICS_SCRIPTS.has(url.href) && method === 'GET' && request.resourceType() === 'script') {
        rec.blockedAnalytics.push(url.href);
      } else {
        rec.unexpected.push(`${method} ${url.origin}${path}`);
      }
      await route.abort('blockedbyclient');
      return;
    }
    if (method === 'GET' && [COVER_OLD, COVER_A, COVER_B].includes(path)) {
      await route.fulfill({ contentType: 'image/png', body: PNG });
      return;
    }
    if (method === 'GET' && path === '/api/guide/auth/csrf') {
      await route.fulfill({ json: { ok: true } });
      return;
    }
    if (method === 'GET' && path === '/api/v2/guide/midao/summary') {
      await route.fulfill({ json: {
        success: true,
        data: {
          guideName: '模擬嚮導', counts: { newRequests: 0, pendingReply: 0 },
          topRequest: null, recentRequests: [],
        },
      } });
      return;
    }
    if (method === 'GET' && path === '/api/v2/guide/midao/services') {
      await route.fulfill({ json: { success: true, data: { items: [service] } } });
      return;
    }
    if (method === 'GET' && path === `${SERVICE_PATH}/plans`) {
      await route.fulfill({ json: { success: true, data: { plans: [] } } });
      return;
    }
    if (method === 'POST' && path === UPLOAD_PATH) {
      const index = rec.uploads.length;
      rec.uploads.push({
        contentType: request.headers()['content-type'] ?? '',
        multipart: request.postDataBuffer()?.toString('latin1') ?? '',
      });
      if (index === 0) await options.deferFirstUpload?.wait;
      if (index === 0 && options.failFirst === 'upload') {
        await route.fulfill({ status: 500, json: {
          ok: false, error: { message: '模擬封面上傳失敗' },
        } });
        return;
      }
      await route.fulfill({ json: { ok: true, data: { url: index === 0 ? COVER_A : COVER_B } } });
      return;
    }
    if (method === 'PATCH' && path === SERVICE_PATH) {
      const body: JsonBody = request.postDataJSON();
      // cover-only PATCH 和完整服務儲存走同一端點，必須分開計數。
      if (Object.keys(body).length === 1 && typeof body.coverImageUrl === 'string') {
        const index = rec.coverPatches.length;
        rec.coverPatches.push(body);
        if (index === 0) await options.deferFirstPatch?.wait;
        if (index === 0 && options.failFirst === 'patch') {
          await route.fulfill({ status: 500, json: {
            success: false, error: { code: 'MOCK_SAVE_FAILED', message: '模擬封面儲存失敗' },
          } });
          return;
        }
      } else if (typeof body.title === 'string' && typeof body.coverImageUrl === 'string') {
        rec.fullSaves.push(body);
      } else {
        rec.unexpected.push(`${method} ${path} unexpected body`);
        await route.fulfill({ status: 400, json: { success: false, error: { message: '未預期的模擬寫入' } } });
        return;
      }
      service = { ...service, ...body };
      await route.fulfill({ json: { success: true, data: { service } } });
      return;
    }
    if (path.startsWith('/api/') || path.startsWith('/auth/')) {
      rec.unexpected.push(`${method} ${path}`);
      await route.fulfill({ status: 501, json: { success: false, error: { message: 'API 未建立 stub' } } });
      return;
    }
    // 只放行同源頁面與 Next 靜態資源；所有 API 已在上方攔截。
    await route.continue();
  });
  return rec;
}

async function openEditor(page: Page) {
  await page.goto(`/midao2/services/${ACTIVITY_ID}/edit`);
  await expect(page.getByRole('heading', { name: '編輯服務' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('midao2-plan-loading')).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toBeEnabled();
  await expect(page.getByAltText('封面預覽')).toHaveAttribute('src', COVER_OLD);
}

async function goToPreview(page: Page) {
  await page.getByTestId('midao2-form-next1').click();
  await page.getByTestId('midao2-form-next2').click();
  await expect(page.getByTestId('midao2-form-save-edit')).toBeVisible();
}

async function backToCover(page: Page) {
  await page.getByRole('button', { name: '上一步', exact: true }).click();
  await page.getByRole('button', { name: '上一步', exact: true }).click();
}

async function saveWithCover(page: Page, rec: Awaited<ReturnType<typeof stubCoverApis>>) {
  await expect(page.getByAltText(SERVICE.title)).toHaveAttribute('src', COVER_B);
  await expect(page.getByTestId('midao2-form-save-edit')).toBeEnabled();
  await page.getByTestId('midao2-form-save-edit').click();
  await expect.poll(() => rec.fullSaves.length).toBe(1);
  await expect(page).toHaveURL(/\/midao2\/services$/);
  expect(rec.fullSaves[0]).toMatchObject({ title: SERVICE.title, coverImageUrl: COVER_B });
  expect(rec.fullSaves[0]).not.toHaveProperty('plans');
  expect(rec.fullSaves[0]).not.toHaveProperty('planOptions');
  expect(rec.blockedAnalytics.every((url) => BLOCKED_ANALYTICS_SCRIPTS.has(url))).toBe(true);
  expect(rec.unexpected).toEqual([]);
  for (const upload of rec.uploads) {
    expect(upload.contentType).toContain('multipart/form-data; boundary=');
    expect(upload.multipart).toContain('filename="gallery.webp"');
    expect(upload.multipart).toContain('Content-Type: image/webp');
  }
}

test.beforeEach(async ({ page }) => {
  await setGuideSession(page, 'guide-e2e-1889');
});

test('A upload 與 cover PATCH 各自 pending 時阻擋 B 與完整儲存，完成後 B 勝出', async ({ page }) => {
  const uploadA = deferred();
  const patchA = deferred();
  const rec = await stubCoverApis(page, { deferFirstUpload: uploadA, deferFirstPatch: patchA });
  const input = page.locator('input[type="file"]');

  try {
    await openEditor(page);
    await input.setInputFiles(file('cover-a.png'));
    await expect.poll(() => rec.uploads.length).toBe(1);
    await expect(input).toBeDisabled();
    // setInputFiles 刻意送 change 給 disabled input，驗證 ref guard 也阻擋選 B。
    await input.setInputFiles(file('cover-b-blocked-upload.png'));
    await goToPreview(page);
    const save = page.getByTestId('midao2-form-save-edit');
    await expect(save).toBeDisabled();
    await save.dispatchEvent('click');
    expect(rec.uploads).toHaveLength(1);
    expect(rec.coverPatches).toHaveLength(0);
    expect(rec.fullSaves).toHaveLength(0);
    await expect(page.getByAltText(SERVICE.title)).toHaveAttribute('src', COVER_OLD);

    uploadA.release();
    await expect.poll(() => rec.coverPatches.length).toBe(1);
    await expect(save).toBeDisabled();
    await save.dispatchEvent('click');
    await backToCover(page);
    await expect(input).toBeDisabled();
    await input.setInputFiles(file('cover-b-blocked-patch.png'));
    await goToPreview(page);
    await expect(save).toBeDisabled();
    await save.dispatchEvent('click');
    expect(rec.uploads).toHaveLength(1);
    expect(rec.coverPatches).toEqual([{ coverImageUrl: COVER_A }]);
    expect(rec.fullSaves).toHaveLength(0);
    await expect(page.getByAltText(SERVICE.title)).toHaveAttribute('src', COVER_OLD);

    patchA.release();
    await expect(save).toBeEnabled();
    await expect(page.getByAltText(SERVICE.title)).toHaveAttribute('src', COVER_A);
    await backToCover(page);
    await expect(input).toBeEnabled();
    await input.setInputFiles(file('cover-b.png'));
    await expect.poll(() => rec.coverPatches.length).toBe(2);
    await expect(input).toBeEnabled();
    await expect(page.getByAltText('封面預覽')).toHaveAttribute('src', COVER_B);
    await goToPreview(page);
    await saveWithCover(page, rec);
    expect(rec.uploads).toHaveLength(2);
    expect(rec.coverPatches).toEqual([{ coverImageUrl: COVER_A }, { coverImageUrl: COVER_B }]);
  } finally {
    // assertion 失敗也解除 stub 等待，不把未完成請求留到下一個測試。
    uploadA.release();
    patchA.release();
  }
});

for (const failure of ['upload', 'patch'] as const) {
  test(`${failure} 失敗保留舊封面並解除鎖，重試 B 後完整儲存使用 B`, async ({ page }) => {
    const rec = await stubCoverApis(page, { failFirst: failure });
    const input = page.locator('input[type="file"]');
    await openEditor(page);
    await input.setInputFiles(file('cover-a.png'));
    await expect(page.getByText(
      failure === 'upload' ? '模擬封面上傳失敗' : '封面已上傳但儲存失敗，請再試一次',
      { exact: true },
    )).toBeVisible();
    await expect(input).toBeEnabled();
    await expect(page.getByAltText('封面預覽')).toHaveAttribute('src', COVER_OLD);
    expect(rec.uploads).toHaveLength(1);
    expect(rec.coverPatches).toHaveLength(failure === 'upload' ? 0 : 1);
    expect(rec.fullSaves).toHaveLength(0);

    await input.setInputFiles(file('cover-b-retry.png'));
    await expect(page.getByAltText('封面預覽')).toHaveAttribute('src', COVER_B);
    await expect(input).toBeEnabled();
    await expect(page.getByText('封面已上傳但儲存失敗，請再試一次', { exact: true })).toHaveCount(0);
    await expect(page.getByText('模擬封面上傳失敗', { exact: true })).toHaveCount(0);
    await goToPreview(page);
    await saveWithCover(page, rec);
    expect(rec.uploads).toHaveLength(2);
    expect(rec.coverPatches).toEqual(failure === 'upload'
      ? [{ coverImageUrl: COVER_B }]
      : [{ coverImageUrl: COVER_A }, { coverImageUrl: COVER_B }]);
  });
}
