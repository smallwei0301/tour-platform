import { test, expect, type Page } from '@playwright/test';
import { setGuideSession } from './helpers';

const guide = {
  guideId: '99999999-9999-4999-8999-999999999999',
  guideName: 'Midao E2E Guide',
  email: 'midao-e2e@example.invalid',
  password: 'midao-e2e-only-password',
  expectedRedirect: '/midao' as const,
};

const activityId = '11111111-1111-4111-8111-111111111111';

function draftResponse(payload: Record<string, unknown>, revision = 1, publicationPreview = { valid: true, errors: [] }) {
  return {
    success: true,
    data: {
      draft: {
        activityId,
        guideId: guide.guideId,
        revision,
        status: 'active',
        payload,
        updatedAt: '2026-08-01T12:00:00.000Z',
      },
      publicationPreview,
    },
  };
}

async function installWizardRoutes(page: Page, options: { conflict?: boolean } = {}) {
  let revision = 0;
  let conflictTriggered = false;
  await page.route('**/api/guide/activities', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { id: activityId, title: '未命名服務', status: 'draft' } }),
    });
  });
  await page.route('**/api/v2/guide/service-drafts**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      const responseData = options.conflict && conflictTriggered
        ? { draft: { activityId, guideId: guide.guideId, revision: 2, status: 'active', payload: { name: '其他分頁的新內容' }, updatedAt: '2026-08-01T12:00:00.000Z' } }
        : { draft: null };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: responseData }) });
      return;
    }
    revision += 1;
    if (options.conflict && revision === 1) {
      conflictTriggered = true;
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { code: 'REVISION_CONFLICT', message: '草稿已被更新，請重新讀取最新版本' },
          currentRevision: 2,
          draft: { activityId, revision: 2, status: 'active', payload: { name: '其他分頁的新內容' } },
        }),
      });
      return;
    }
    const body = request.postDataJSON() as { patch?: Record<string, unknown> };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(draftResponse(body.patch ?? {}, revision)),
    });
  });
  await page.route(`**/api/v2/guide/service-drafts/${activityId}/commands/publish`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { published: true, publicUrl: `https://midao.com.tw/activities/${activityId}` } }),
    });
  });
}

async function login(page: Page) {
  await setGuideSession(page, guide.guideId);
}

test.describe('Midao services wizard', () => {
  test('新增服務 → auto-save → 問卷 → 預覽 → 發布成功', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await installWizardRoutes(page);
    await login(page);
    await page.goto('/midao/services/new', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: '新增服務' })).toBeVisible();
    await page.getByLabel('服務名稱').fill('山徑晨光體驗');
    await page.getByLabel('服務說明').fill('由熟悉山徑的在地引路人帶你慢慢走。');
    await page.getByLabel('第一個方案名稱').fill('晨光小團');
    await expect(page.getByTestId('service-save-status')).toHaveText('已儲存');

    await page.getByRole('button', { name: '下一步：設定問卷' }).click();
    await page.getByRole('button', { name: '新增題目' }).click();
    await page.getByLabel('題目名稱').fill('同行人數');
    await page.getByLabel('題目代碼').fill('party_size');
    await expect(page.getByTestId('service-save-status')).toHaveText('已儲存');
    await page.getByRole('button', { name: '下一步：預覽確認' }).click();
    await expect(page.getByRole('heading', { name: '預覽與發布' })).toBeVisible();
    await expect(page.getByText('山徑晨光體驗')).toBeVisible();
    await expect(page.getByRole('button', { name: '發布服務' })).toBeEnabled();

    await page.getByRole('button', { name: '發布服務' }).click();
    await expect(page.getByRole('status')).toContainText('已發布');
    await expect(page.getByRole('link', { name: /查看公開頁面/u })).toHaveAttribute('href', 'https://midao.com.tw/activities/11111111-1111-4111-8111-111111111111');

    const screenshotPath = testInfo.outputPath('midao-services-published.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach('midao-services-published', { path: screenshotPath, contentType: 'image/png' });
  });

  test('空白資料在預覽顯示明確未完成原因，發布按鈕停用', async ({ page }) => {
    test.setTimeout(180_000);
    await installWizardRoutes(page);
    await login(page);
    await page.goto('/midao/services/new', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: '下一步：設定問卷' }).click();
    await page.getByRole('button', { name: '下一步：預覽確認' }).click();
    await expect(page.getByRole('heading', { name: '預覽與發布' })).toBeVisible();
    await expect(page.getByText('活動名稱（name）為必填')).toBeVisible();
    await expect(page.getByText('至少需要一則說明文字')).toBeVisible();
    await expect(page.getByText('至少需要一個有效方案／時段')).toBeVisible();
    await expect(page.getByRole('button', { name: '發布服務' })).toBeDisabled();
  });

  test('auto-save 409 不覆蓋編輯內容，提供重新載入最新版本', async ({ page }) => {
    test.setTimeout(180_000);
    await installWizardRoutes(page, { conflict: true });
    await login(page);
    await page.goto('/midao/services/new', { waitUntil: 'domcontentloaded' });

    await page.getByLabel('服務名稱').fill('我正在編輯的內容');
    await expect(page.getByRole('alert')).toContainText('其他分頁更新了這份草稿');
    await expect(page.getByLabel('服務名稱')).toHaveValue('我正在編輯的內容');
    await expect(page.getByRole('button', { name: '載入最新版本' })).toBeVisible();

    await page.getByRole('button', { name: '載入最新版本' }).click();
    await expect(page.getByLabel('服務名稱')).toHaveValue('其他分頁的新內容');
  });
});

test('Midao services list renders status, price range, empty state and pagination controls', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.route('**/api/v2/guide/services**', async (route) => {
    const url = new URL(route.request().url());
    const isSecondPage = url.searchParams.get('page') === '2';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: isSecondPage
          ? { items: [{ activityId: '22222222-2222-4222-8222-222222222222', title: '溪谷觀察', slug: 'valley', status: 'published', hasUnpublishedChanges: false, minPrice: 1800, maxPrice: 1800, publishedVersion: 1, draftRevision: null, updatedAt: null }], page: 2, pageSize: 1, total: 2, totalPages: 2 }
          : { items: [{ activityId, title: '山徑晨光', slug: 'morning', status: 'draft', hasUnpublishedChanges: true, minPrice: 1200, maxPrice: 2400, publishedVersion: 1, draftRevision: 3, updatedAt: null }], page: 1, pageSize: 1, total: 2, totalPages: 2 },
      }),
    });
  });
  await loginMidaoGuideViaApi(page, guide);
  await page.goto('/midao/services', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: '我的服務' })).toBeVisible();
  await expect(page.getByText('山徑晨光')).toBeVisible();
  await expect(page.getByText('草稿')).toBeVisible();
  await expect(page.getByText('有未發布變更')).toBeVisible();
  await expect(page.getByText('NT$ 1,200 – 2,400')).toBeVisible();
  await page.getByRole('button', { name: '下一頁' }).click();
  await expect(page.getByText('溪谷觀察')).toBeVisible();
  await expect(page.getByText('已發布')).toBeVisible();

  const screenshotPath = testInfo.outputPath('midao-services-list.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach('midao-services-list', { path: screenshotPath, contentType: 'image/png' });
});
