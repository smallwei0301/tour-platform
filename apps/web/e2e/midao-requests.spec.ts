import { test, expect, loginMidaoGuideViaApi } from './helpers';

const guide = {
  guideId: '99999999-9999-4999-8999-999999999999',
  guideName: 'Midao E2E Guide',
  email: 'midao-e2e@example.invalid',
  password: 'midao-e2e-only-password',
  expectedRedirect: '/midao' as const,
};

const firstRequestRef = 'booking_11111111-1111-4111-8111-111111111111';
const secondRequestRef = 'booking_22222222-2222-4222-8222-222222222222';
const thirdRequestRef = 'booking_33333333-3333-4333-8333-333333333333';

function isRequestsListUrl(url: URL): boolean {
  return url.pathname === '/api/v2/guide/requests'
    && url.searchParams.has('bucket')
    && url.searchParams.has('sort')
    && url.searchParams.has('limit');
}

function bookingListItem(
  requestRef: string,
  bookingId: string,
  orderId: string,
  title: string,
  bucket: string,
  needsReply: boolean,
) {
  return {
    kind: 'booking',
    requestRef,
    bookingId,
    orderId,
    bookingNo: null,
    bookingStatus: bucket === 'new' ? 'draft' : 'draft',
    guideApprovalStatus: bucket === 'new' ? 'pending' : 'approved',
    orderStatus: 'pending_payment',
    bucket,
    secondaryState: bucket === 'new' ? 'pending_approval' : null,
    needsReply,
    traveler: { displayName: '匿名旅人', emailMasked: 'ma***@example.invalid' },
    service: {
      activityId: '44444444-4444-4444-8444-444444444444',
      activityPlanId: '55555555-5555-4555-8555-555555555555',
      title,
      planName: '日間小團',
      bookingType: 'request',
    },
    request: {
      startAt: '2026-08-12T02:00:00.000Z',
      endAt: '2026-08-12T05:00:00.000Z',
      timezone: 'Asia/Taipei',
      partySize: 2,
    },
    totalTwd: 3600,
    paymentDeadlineAt: null,
    receivedAt: '2026-07-28T01:00:00.000Z',
    updatedAt: '2026-07-28T02:00:00.000Z',
    lastMessageAt: null,
  };
}

const firstPage = {
  success: true,
  data: {
    items: [
      bookingListItem(firstRequestRef, '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '山徑晨光小旅行', 'new', false),
      bookingListItem(secondRequestRef, '22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '溪谷觀察半日行', 'needs_reply', true),
    ],
    nextCursor: 'cursor-page-2',
  },
};

const secondPage = {
  success: true,
  data: {
    items: [
      bookingListItem(thirdRequestRef, '33333333-3333-4333-8333-333333333333', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '部落文化走讀', 'replied', false),
    ],
    nextCursor: null,
  },
};

const needsReplyPage = {
  success: true,
  data: {
    items: [firstPage.data.items[1]],
    nextCursor: null,
  },
};

const emptyPage = {
  success: true,
  data: { items: [], nextCursor: null },
};

const detailData = {
  kind: 'booking',
  requestRef: firstRequestRef,
  bookingId: '11111111-1111-4111-8111-111111111111',
  orderId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  bookingNo: 'BK-1111',
  bookingStatus: 'draft',
  guideApprovalStatus: 'pending',
  orderStatus: 'pending_payment',
  bucket: 'new',
  secondaryState: 'pending_approval',
  needsReply: false,
  traveler: {
    displayName: '匿名旅人',
    emailMasked: 'ma***@example.invalid',
    contactEmail: 'traveler-detail@example.invalid',
    contactPhone: '+886 900 000 000',
  },
  service: {
    activityId: '44444444-4444-4444-8444-444444444444',
    activityPlanId: '55555555-5555-4555-8555-555555555555',
    title: '山徑晨光小旅行',
    planName: '日間小團',
    bookingType: 'request',
  },
  request: {
    startAt: '2026-08-12T02:00:00.000Z',
    endAt: '2026-08-12T05:00:00.000Z',
    timezone: 'Asia/Taipei',
    partySize: 2,
    customerNote: '希望安排適合初次健行的路線',
  },
  totalTwd: 3600,
  paymentDeadlineAt: null,
  receivedAt: '2026-07-28T01:00:00.000Z',
  updatedAt: '2026-07-28T02:00:00.000Z',
  lastMessageAt: null,
  status: {
    bookingStatus: 'draft',
    guideApprovalStatus: 'pending',
    orderStatus: 'pending_payment',
    guideApprovalDecidedAt: null,
    guideApprovalNote: null,
  },
  allowedActions: {
    approve: true,
    reject: true,
    markReplied: false,
    convertInquiry: false,
  },
};

test.describe('Midao requests list', () => {
  test('renders masked cards and appends the server cursor page without changing canonical refs', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const calls: Array<{ bucket: string | null; sort: string | null; limit: string | null; cursor: string | null }> = [];
    await page.route(isRequestsListUrl, async (route) => {
      const url = new URL(route.request().url());
      calls.push({
        bucket: url.searchParams.get('bucket'),
        sort: url.searchParams.get('sort'),
        limit: url.searchParams.get('limit'),
        cursor: url.searchParams.get('cursor'),
      });
      const payload = url.searchParams.get('cursor') === 'cursor-page-2' ? secondPage : firstPage;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });

    await loginMidaoGuideViaApi(page, guide);
    await page.goto('/midao/requests', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: '需求' })).toBeVisible();
    await expect(page.getByText('山徑晨光小旅行')).toBeVisible();
    await expect(page.getByText('溪谷觀察半日行')).toBeVisible();
    await expect(page.getByRole('link', { name: /山徑晨光小旅行/u })).toHaveAttribute(
      'href',
      `/midao/requests/${firstRequestRef}`,
    );
    const initialBody = await page.locator('body').innerText();
    expect(initialBody).not.toContain('ma***@example.invalid');
    expect(initialBody).not.toContain('orderId');

    const screenshotPath = testInfo.outputPath('requests-populated-desktop.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach('requests-populated-desktop', { path: screenshotPath, contentType: 'image/png' });

    await page.getByRole('button', { name: '載入更多需求' }).click();
    await expect(page.getByText('部落文化走讀')).toBeVisible();
    await expect(page.getByRole('link', { name: /部落文化走讀/u })).toHaveAttribute(
      'href',
      `/midao/requests/${thirdRequestRef}`,
    );
    await expect(page.getByRole('button', { name: '載入更多需求' })).toHaveCount(0);
    expect(calls).toEqual([
      { bucket: 'all', sort: 'priority', limit: '20', cursor: null },
      { bucket: 'all', sort: 'priority', limit: '20', cursor: 'cursor-page-2' },
    ]);
  });

  test('tabs reset the cursor and stale responses cannot replace the selected bucket', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    const calls: string[] = [];
    await page.route(isRequestsListUrl, async (route) => {
      const url = new URL(route.request().url());
      const requestedBucket = url.searchParams.get('bucket') || 'all';
      calls.push(requestedBucket);
      if (requestedBucket === 'all') {
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      const payload = requestedBucket === 'needs_reply' ? needsReplyPage : firstPage;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });

    await loginMidaoGuideViaApi(page, guide);
    await page.goto('/midao/requests', { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: '待回覆' }).click();

    await expect(page.getByRole('tab', { name: '待回覆' })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/midao\/requests\?bucket=needs_reply$/u);
    await expect(page.getByText('溪谷觀察半日行')).toBeVisible();
    await expect(page.getByText('山徑晨光小旅行')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '載入更多需求' })).toHaveCount(0);

    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
    expect(calls).toEqual(['all', 'needs_reply']);

    const screenshotPath = testInfo.outputPath('requests-mobile-bucket.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach('requests-mobile-bucket', { path: screenshotPath, contentType: 'image/png' });
  });

  test('renders a true empty state only for a successful empty envelope', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await page.route(isRequestsListUrl, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(emptyPage) });
    });

    await loginMidaoGuideViaApi(page, guide);
    await page.goto('/midao/requests?bucket=completed', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('midao-request-empty')).toHaveText('這個分頁目前沒有需求');
    await expect(page.locator('.midao-request-panel .midao-inline-error')).toHaveCount(0);
    await expect(page.getByTestId('midao-request-list')).toHaveCount(0);

    const screenshotPath = testInfo.outputPath('requests-empty.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach('requests-empty', { path: screenshotPath, contentType: 'image/png' });
  });

  test('uses the same non-mutating retry for a 409 envelope and never substitutes fake data', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    let attempts = 0;
    await page.route(isRequestsListUrl, async (route) => {
      attempts += 1;
      if (attempts === 1) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: { code: 'BACKEND_MODE_MISMATCH', message: 'bounded' } }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(emptyPage) });
    });

    await loginMidaoGuideViaApi(page, guide);
    await page.goto('/midao/requests', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.midao-request-panel .midao-inline-error')).toBeVisible();
    await expect(page.locator('.midao-request-panel .midao-inline-error')).toContainText('目前無法載入需求清單');
    await expect(page.getByTestId('midao-request-empty')).toHaveCount(0);
    await expect(page.getByTestId('midao-request-list')).toHaveCount(0);

    const screenshotPath = testInfo.outputPath('requests-409-recovery.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach('requests-409-recovery', { path: screenshotPath, contentType: 'image/png' });

    await page.getByRole('button', { name: '再試一次' }).click();
    await expect(page.getByTestId('midao-request-empty')).toHaveText('這個分頁目前沒有需求');
    await expect(page.locator('.midao-request-panel .midao-inline-error')).toHaveCount(0);
    expect(attempts).toBe(2);
  });

  test('opens the canonical requestRef detail and reveals contact fields only on detail success', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const calls: string[] = [];
    await page.route('**/api/v2/guide/requests/*', async (route) => {
      calls.push(new URL(route.request().url()).pathname);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: detailData }),
      });
    });

    await loginMidaoGuideViaApi(page, guide);
    await page.goto(`/midao/requests/${firstRequestRef}`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: '需求詳情' })).toBeVisible();
    await expect(page.getByText('山徑晨光小旅行')).toBeVisible();
    await expect(page.getByText('traveler-detail@example.invalid')).toBeVisible();
    await expect(page.getByText('+886 900 000 000')).toBeVisible();
    await expect(page.getByText('希望安排適合初次健行的路線')).toBeVisible();
    await expect(page.getByText('目前僅顯示待確認狀態')).toBeVisible();
    await expect(page.getByRole('button', { name: /核准|婉拒|批准|拒絕/u })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '返回需求列表' })).toHaveAttribute('href', '/midao/requests');
    expect(await page.locator('body').innerText()).not.toContain('orderId');
    expect(calls).toEqual([`/api/v2/guide/requests/${firstRequestRef}`]);

    const screenshotPath = testInfo.outputPath('requests-detail.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach('requests-detail', { path: screenshotPath, contentType: 'image/png' });
  });
});
