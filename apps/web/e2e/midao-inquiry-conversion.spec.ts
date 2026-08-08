import { test, expect, loginMidaoGuideViaApi } from './helpers';

const guide = {
  guideId: '99999999-9999-4999-8999-999999999999',
  guideName: 'Midao E2E Guide',
  email: 'midao-e2e@example.invalid',
  password: 'midao-e2e-only-password',
  expectedRedirect: '/midao' as const,
};

const INQUIRY_ID = '77777777-7777-4777-8777-777777777777';
const PLAN_ID = '88888888-8888-4888-8888-888888888888';
const ACTIVITY_ID = '66666666-6666-4666-8666-666666666666';
const requestRef = `inquiry_${INQUIRY_ID}`;
const detailPath = `/midao/requests/${requestRef}`;

function inquiryDetail(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'inquiry',
    requestRef,
    inquiryId: INQUIRY_ID,
    inquiryNo: 'INQ-E2E-0001',
    inquiryStatus: 'replied',
    bucket: 'replied',
    secondaryState: null,
    needsReply: false,
    traveler: { displayName: null, emailMasked: null },
    service: {
      activityId: ACTIVITY_ID,
      activityPlanId: PLAN_ID,
      title: '山徑晨光小旅行',
      planName: '日間小團',
      bookingType: 'request',
    },
    request: {
      preferredDate: '2026-09-01',
      backupDate: null,
      startTimeLocal: '09:00',
      partySize: 2,
      language: 'zh-TW',
      pickupRequired: false,
      travelerNote: '希望安排適合初次健行的路線',
    },
    plan: {
      activityPlanId: PLAN_ID,
      name: '日間小團',
      bookingType: 'request',
      status: 'active',
      minParticipants: 1,
      maxParticipants: 6,
      basePrice: 1800,
    },
    convertedBookingId: null,
    lastRepliedAt: '2026-08-08T02:00:00.000Z',
    expiresAt: null,
    receivedAt: '2026-08-08T01:00:00.000Z',
    updatedAt: '2026-08-08T02:00:00.000Z',
    allowedActions: { approve: false, reject: false, markReplied: false, convertInquiry: true },
    ...overrides,
  };
}

const replyTemplate = {
  success: true,
  data: {
    intent: 'acknowledge',
    text: '您好，已經收到您的詢問，我會盡快回覆您。',
    shareUrl: `https://line.me/R/share?text=${encodeURIComponent('您好，已經收到您的詢問，我會盡快回覆您。')}`,
  },
};

type Counters = { markReplied: number; convert: number; convertBodies: unknown[]; convertHeaders: Record<string, string>[] };

async function installRoutes(
  page: import('@playwright/test').Page,
  options: {
    detail?: Record<string, unknown>;
    convertStatus?: number;
    convertBody?: unknown;
  } = {},
): Promise<Counters> {
  const counters: Counters = { markReplied: 0, convert: 0, convertBodies: [], convertHeaders: [] };

  await page.route('**/api/v2/guide/inquiries/*/commands/mark-replied', async (route) => {
    counters.markReplied += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { marked: true } }),
    });
  });

  await page.route('**/api/v2/guide/inquiries/*/commands/convert', async (route) => {
    counters.convert += 1;
    counters.convertBodies.push(JSON.parse(route.request().postData() || '{}'));
    counters.convertHeaders.push(route.request().headers());
    await route.fulfill({
      status: options.convertStatus ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(options.convertBody ?? {
        success: true,
        data: {
          created: true,
          replayed: false,
          inquiryId: INQUIRY_ID,
          bookingId: '11111111-1111-4111-8111-111111111111',
          orderId: '22222222-2222-4222-8222-222222222222',
          bookingNo: 'BK-E2E',
          bookingStatus: 'draft',
          travelerConfirmationStatus: 'pending',
          travelerConfirmationExpiresAt: '2026-08-09T02:00:00.000Z',
          confirmationToken: null,
          confirmationUrl: 'https://midao.example.test/api/v2/me/booking-confirmations/e2e-token/accept',
          confirmationTokenNote: null,
        },
      }),
    });
  });

  await page.route('**/api/v2/guide/requests/*/reply-template', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(replyTemplate) });
  });

  await page.route('**/api/v2/guide/requests/*', async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.endsWith(requestRef)) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: options.detail ?? inquiryDetail() }),
    });
  });

  return counters;
}

test.beforeEach(async ({ page }) => {
  await loginMidaoGuideViaApi(page, guide);
});

test('E1: clipboard 不可用時 fallback 成唯讀文案與可用的 LINE 連結', async ({ page }) => {
  test.setTimeout(180_000);
  await installRoutes(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  });

  await page.goto(detailPath, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '產生文案' }).click();

  const textarea = page.getByTestId('midao-line-reply-text');
  await expect(textarea).toBeVisible();
  await expect(textarea).toHaveAttribute('readonly', '');

  await page.getByRole('button', { name: '複製文案' }).click();
  await expect(page.getByText('請手動複製上方文案後貼到 LINE')).toBeVisible();

  const shareLink = page.getByTestId('midao-line-share-link');
  await expect(shareLink).toBeVisible();
  const href = await shareLink.getAttribute('href');
  expect(href?.startsWith('https://line.me/R/share?text=')).toBe(true);
});

test('E2: 產生文案／複製／開 LINE 都不得呼叫 mark-replied', async ({ page }) => {
  test.setTimeout(180_000);
  const counters = await installRoutes(page);

  await page.goto(detailPath, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '產生文案' }).click();
  await expect(page.getByTestId('midao-line-reply-text')).toBeVisible();
  await page.getByRole('button', { name: '複製文案' }).click();
  await page.getByTestId('midao-line-share-link').evaluate((node) => node.getAttribute('href'));

  await page.waitForTimeout(300);
  expect(counters.markReplied).toBe(0);
});

test('E3: 轉單表單只送出白名單欄位並帶 CSRF 與 idempotency-key', async ({ page }) => {
  test.setTimeout(180_000);
  const counters = await installRoutes(page);

  await page.goto(detailPath, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('midao-conversion-start-at').fill('2026-09-01T09:00');
  await page.getByTestId('midao-conversion-end-at').fill('2026-09-01T13:00');
  await page.getByTestId('midao-conversion-participants').fill('2');
  await page.getByTestId('midao-conversion-quoted-total').fill('3600');
  await page.getByTestId('midao-conversion-ttl').fill('24');
  await page.getByTestId('midao-conversion-submit').click();

  await expect(page.getByTestId('midao-conversion-result')).toBeVisible();
  expect(counters.convert).toBe(1);

  const body = counters.convertBodies[0] as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual([
    'activityPlanId', 'confirmationTtlHours', 'endAt', 'participants', 'quotedTotalTwd', 'startAt',
  ]);
  expect(body.activityPlanId).toBe(PLAN_ID);
  expect(body.participants).toBe(2);
  expect(body.quotedTotalTwd).toBe(3600);
  expect(body.confirmationTtlHours).toBe(24);

  const headers = counters.convertHeaders[0];
  expect(typeof headers['idempotency-key']).toBe('string');
  expect(headers['idempotency-key'].length).toBeGreaterThan(0);
  expect(Object.hasOwn(headers, 'x-csrf-token')).toBe(true);
});

test('E4: created 顯示 confirmation URL；replayed 不得假造連結', async ({ page }) => {
  test.setTimeout(180_000);
  await installRoutes(page);
  await page.goto(detailPath, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('midao-conversion-start-at').fill('2026-09-01T09:00');
  await page.getByTestId('midao-conversion-end-at').fill('2026-09-01T13:00');
  await page.getByTestId('midao-conversion-participants').fill('2');
  await page.getByTestId('midao-conversion-quoted-total').fill('3600');
  await page.getByTestId('midao-conversion-ttl').fill('24');
  await page.getByTestId('midao-conversion-submit').click();

  const url = page.getByTestId('midao-confirmation-url');
  await expect(url).toContainText('/api/v2/me/booking-confirmations/');
  await expect(page.getByTestId('midao-copy-confirmation-url')).toBeVisible();

  const replayedPage = await page.context().newPage();
  await installRoutes(replayedPage, {
    convertBody: {
      success: true,
      data: {
        created: false,
        replayed: true,
        inquiryId: INQUIRY_ID,
        bookingId: '11111111-1111-4111-8111-111111111111',
        orderId: '22222222-2222-4222-8222-222222222222',
        bookingNo: 'BK-E2E',
        bookingStatus: 'draft',
        travelerConfirmationStatus: 'pending',
        travelerConfirmationExpiresAt: '2026-08-09T02:00:00.000Z',
        confirmationToken: null,
        confirmationUrl: null,
        confirmationTokenNote: '確認連結只在第一次轉單時產生',
      },
    },
  });
  await replayedPage.goto(detailPath, { waitUntil: 'domcontentloaded' });
  await replayedPage.getByTestId('midao-conversion-start-at').fill('2026-09-01T09:00');
  await replayedPage.getByTestId('midao-conversion-end-at').fill('2026-09-01T13:00');
  await replayedPage.getByTestId('midao-conversion-participants').fill('2');
  await replayedPage.getByTestId('midao-conversion-quoted-total').fill('3600');
  await replayedPage.getByTestId('midao-conversion-ttl').fill('24');
  await replayedPage.getByTestId('midao-conversion-submit').click();

  await expect(replayedPage.getByTestId('midao-confirmation-url-unavailable')).toBeVisible();
  await expect(replayedPage.getByTestId('midao-confirmation-url')).toHaveCount(0);
  await replayedPage.close();
});

test('E5: 409 錯誤依 code 顯示繁中文案並保留表單值或提供重新載入', async ({ page }) => {
  test.setTimeout(180_000);
  await installRoutes(page, {
    convertStatus: 409,
    convertBody: { success: false, error: { code: 'CAPACITY_EXCEEDED', message: 'capacity' } },
  });

  await page.goto(detailPath, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('midao-conversion-start-at').fill('2026-09-01T09:00');
  await page.getByTestId('midao-conversion-end-at').fill('2026-09-01T13:00');
  await page.getByTestId('midao-conversion-participants').fill('2');
  await page.getByTestId('midao-conversion-quoted-total').fill('3600');
  await page.getByTestId('midao-conversion-ttl').fill('24');
  await page.getByTestId('midao-conversion-submit').click();

  await expect(page.getByTestId('midao-conversion-error')).toHaveText('當天名額不足，請調整人數或日期後再試。');
  await expect(page.getByTestId('midao-conversion-participants')).toHaveValue('2');
  await expect(page.getByTestId('midao-conversion-submit')).toBeEnabled();

  const alreadyPage = await page.context().newPage();
  await installRoutes(alreadyPage, {
    convertStatus: 409,
    convertBody: { success: false, error: { code: 'INQUIRY_ALREADY_CONVERTED', message: 'converted' } },
  });
  await alreadyPage.goto(detailPath, { waitUntil: 'domcontentloaded' });
  await alreadyPage.getByTestId('midao-conversion-start-at').fill('2026-09-01T09:00');
  await alreadyPage.getByTestId('midao-conversion-end-at').fill('2026-09-01T13:00');
  await alreadyPage.getByTestId('midao-conversion-participants').fill('2');
  await alreadyPage.getByTestId('midao-conversion-quoted-total').fill('3600');
  await alreadyPage.getByTestId('midao-conversion-ttl').fill('24');
  await alreadyPage.getByTestId('midao-conversion-submit').click();

  await expect(alreadyPage.getByTestId('midao-conversion-error')).toHaveText('這筆詢問單已經轉成訂單了。');
  await expect(alreadyPage.getByTestId('midao-conversion-reload')).toBeVisible();
  await alreadyPage.close();
});

test('activityPlanId 為 null 時停用整個轉單區塊', async ({ page }) => {
  test.setTimeout(180_000);
  await installRoutes(page, {
    detail: inquiryDetail({
      service: {
        activityId: ACTIVITY_ID,
        activityPlanId: null,
        title: '山徑晨光小旅行',
        planName: null,
        bookingType: null,
      },
      plan: null,
      allowedActions: { approve: false, reject: false, markReplied: false, convertInquiry: false },
    }),
  });

  await page.goto(detailPath, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('midao-conversion-disabled')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('midao-conversion-submit')).toHaveCount(0);
});
