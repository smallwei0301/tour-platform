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

// ---------------------------------------------------------------------------
// #1759 Package 4 / Task 43b：旅客確認頁 `/booking/confirm/[token]`（append only）
//
// 契約來源（唯一權威）：
// docs/operations/session-handoffs/2026-08-08-issue1759-task43-traveler-confirm-page-plan.md
// §4.4（六態狀態機與 accept 分支）／§5.3 T1–T9（本區塊的案例表）。
//
// 本區塊是**旅客**視角，故用 `setTravelerSession`（F27）而非 `loginMidaoGuideViaApi`。
// 檔案上方的 file-scope `test.beforeEach` 仍會先鋪一份導遊 session；那不影響本頁，
// 因為本頁的唯一授權真值來源是被 mock 的 GET preview API 回應碼（計畫 §2 D7）。
// 以獨立 import 追加而非改寫第 1 行，是為了守住「既有測試一行不得改」的 append-only 約束。
// ---------------------------------------------------------------------------
import { setTravelerSession } from './helpers';

const CONFIRM_TOKEN = 'a'.repeat(64);
const CONFIRM_PATH = `/booking/confirm/${CONFIRM_TOKEN}`;
const CONFIRM_BOOKING_ID = '33333333-3333-4333-8333-333333333333';
const CONFIRM_ORDER_ID = '44444444-4444-4444-8444-444444444444';

function confirmPreview(overrides: Record<string, unknown> = {}) {
  return {
    status: 'pending',
    bookingId: CONFIRM_BOOKING_ID,
    orderId: CONFIRM_ORDER_ID,
    service: {
      activityId: ACTIVITY_ID,
      activityPlanId: PLAN_ID,
      title: '山徑晨光小旅行',
      planName: '日間小團',
    },
    schedule: {
      startAt: '2026-09-01T01:00:00.000Z',
      endAt: '2026-09-01T05:00:00.000Z',
    },
    partySize: 2,
    price: { quotedTotalTwd: 3600, currency: 'TWD' },
    expiresAt: '2026-08-09T02:00:00.000Z',
    ...overrides,
  };
}

type ConfirmCounters = {
  preview: number;
  accept: number;
  acceptHeaders: Record<string, string>[];
  acceptBodies: string[];
};

async function installConfirmRoutes(
  page: import('@playwright/test').Page,
  options: {
    previewStatus?: number;
    previewBody?: unknown;
    acceptStatus?: number;
    acceptBody?: unknown;
  } = {},
): Promise<ConfirmCounters> {
  const counters: ConfirmCounters = { preview: 0, accept: 0, acceptHeaders: [], acceptBodies: [] };

  // accept 必須先註冊：Playwright 後註冊者優先，若順序顛倒 preview 的 glob 會先吃掉 accept。
  await page.route('**/api/v2/me/booking-confirmations/*/accept', async (route) => {
    counters.accept += 1;
    counters.acceptHeaders.push(route.request().headers());
    counters.acceptBodies.push(route.request().postData() || '');
    await route.fulfill({
      status: options.acceptStatus ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(options.acceptBody ?? {
        success: true,
        data: {
          accepted: true,
          replayed: false,
          bookingId: CONFIRM_BOOKING_ID,
          orderId: CONFIRM_ORDER_ID,
          bookingStatus: 'confirmed',
          travelerConfirmationStatus: 'confirmed',
          paymentDeadlineAt: '2026-08-10T02:00:00.000Z',
        },
      }),
    });
  });

  await page.route('**/api/v2/me/booking-confirmations/*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    counters.preview += 1;
    const status = options.previewStatus ?? 200;
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(
        options.previewBody
          ?? (status === 200
            ? { success: true, data: confirmPreview() }
            : { success: false, error: { code: 'NOT_FOUND', message: 'Resource not found' } }),
      ),
    });
  });

  // 導向目標是既有付款頁；本區塊只驗導向，不驗付款頁內容，故把它的資料呼叫短路掉。
  await page.route('**/api/v2/orders/*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { id: CONFIRM_ORDER_ID, status: 'pending_payment', totalTwd: 3600, peopleCount: 2 },
      }),
    });
  });

  return counters;
}

test.describe('Task 43 traveler confirmation page', () => {
  test('T1: pending 顯示卡片與服務／日期／人數／價格／期限五項', async ({ page }) => {
    test.setTimeout(180_000);
    await setTravelerSession(page);
    await installConfirmRoutes(page);

    await page.goto(CONFIRM_PATH, { waitUntil: 'domcontentloaded' });

    const card = page.getByTestId('booking-confirm-card');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('booking-confirm-service')).toContainText('山徑晨光小旅行');
    await expect(page.getByTestId('booking-confirm-schedule')).toContainText('2026');
    await expect(page.getByTestId('booking-confirm-party-size')).toContainText('2');
    await expect(page.getByTestId('booking-confirm-price')).toContainText('3,600');
    await expect(page.getByTestId('booking-confirm-expires-at')).toContainText('2026');
    await expect(page.getByTestId('booking-confirm-accept')).toBeEnabled();
  });

  test('T2: GET 401 顯示登入提示，連結帶 safe next', async ({ page }) => {
    test.setTimeout(180_000);
    await setTravelerSession(page);
    await installConfirmRoutes(page, {
      previewStatus: 401,
      previewBody: { success: false, error: { code: 'UNAUTHORIZED', message: 'Please login first' } },
    });

    await page.goto(CONFIRM_PATH, { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('booking-confirm-login-required')).toBeVisible({ timeout: 30_000 });
    const link = page.getByTestId('booking-confirm-login-link');
    await expect(link).toHaveAttribute('href', `/login?next=%2Fbooking%2Fconfirm%2F${CONFIRM_TOKEN}`);
    await expect(page.getByTestId('booking-confirm-accept')).toHaveCount(0);
  });

  test('T3: GET 404 顯示連結無效或不屬於此帳號', async ({ page }) => {
    test.setTimeout(180_000);
    await setTravelerSession(page);
    await installConfirmRoutes(page, { previewStatus: 404 });

    await page.goto(CONFIRM_PATH, { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('booking-confirm-invalid')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('booking-confirm-accept')).toHaveCount(0);
  });

  test('T4: status=expired 顯示過期且無確認鈕', async ({ page }) => {
    test.setTimeout(180_000);
    await setTravelerSession(page);
    await installConfirmRoutes(page, {
      previewBody: { success: true, data: confirmPreview({ status: 'expired' }) },
    });

    await page.goto(CONFIRM_PATH, { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('booking-confirm-expired')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('booking-confirm-accept')).toHaveCount(0);
  });

  test('T5: status=used 顯示已確認並提供前往付款', async ({ page }) => {
    test.setTimeout(180_000);
    await setTravelerSession(page);
    await installConfirmRoutes(page, {
      previewBody: { success: true, data: confirmPreview({ status: 'used' }) },
    });

    await page.goto(CONFIRM_PATH, { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('booking-confirm-used')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('booking-confirm-pay-link')).toHaveAttribute(
      'href',
      `/order/pay?orderId=${CONFIRM_ORDER_ID}`,
    );
    await expect(page.getByTestId('booking-confirm-accept')).toHaveCount(0);
  });

  test('T6: accept 200 帶 CSRF 與 idempotency-key 並導向付款頁', async ({ page }) => {
    test.setTimeout(180_000);
    await setTravelerSession(page);
    const counters = await installConfirmRoutes(page);

    await page.goto(CONFIRM_PATH, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('booking-confirm-card')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('booking-confirm-accept').click();

    await page.waitForURL(`**/order/pay?orderId=${CONFIRM_ORDER_ID}`, { timeout: 30_000 });
    expect(counters.accept).toBe(1);
    const headers = counters.acceptHeaders[0];
    expect(Object.hasOwn(headers, 'x-csrf-token')).toBe(true);
    expect(typeof headers['idempotency-key']).toBe('string');
    expect(headers['idempotency-key'].length).toBeGreaterThan(0);
    expect(counters.acceptBodies[0]).toBe('{}');
  });

  test('T7: accept 410 切換到過期狀態', async ({ page }) => {
    test.setTimeout(180_000);
    await setTravelerSession(page);
    await installConfirmRoutes(page, {
      acceptStatus: 410,
      acceptBody: { success: false, error: { code: 'CONFIRMATION_TOKEN_EXPIRED', message: 'expired' } },
    });

    await page.goto(CONFIRM_PATH, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('booking-confirm-card')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('booking-confirm-accept').click();

    await expect(page.getByTestId('booking-confirm-expired')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('booking-confirm-card')).toHaveCount(0);
  });

  test('T8: accept 409 CAPACITY_EXCEEDED 停在卡片並顯示名額已滿', async ({ page }) => {
    test.setTimeout(180_000);
    await setTravelerSession(page);
    await installConfirmRoutes(page, {
      acceptStatus: 409,
      acceptBody: { success: false, error: { code: 'CAPACITY_EXCEEDED', message: 'capacity' } },
    });

    await page.goto(CONFIRM_PATH, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('booking-confirm-card')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('booking-confirm-accept').click();

    await expect(page.getByTestId('booking-confirm-error')).toContainText('名額已滿');
    await expect(page.getByTestId('booking-confirm-card')).toBeVisible();
    expect(page.url()).toContain('/booking/confirm/');
  });

  test('T9: 連按兩次確認只送出一次且重放同一把 idempotency-key', async ({ page }) => {
    test.setTimeout(180_000);
    await setTravelerSession(page);
    const counters = await installConfirmRoutes(page, {
      acceptStatus: 409,
      acceptBody: { success: false, error: { code: 'IDEMPOTENCY_IN_PROGRESS', message: 'in progress' } },
    });

    await page.goto(CONFIRM_PATH, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('booking-confirm-card')).toBeVisible({ timeout: 30_000 });

    const accept = page.getByTestId('booking-confirm-accept');
    await accept.click();
    await expect(page.getByTestId('booking-confirm-error')).toBeVisible({ timeout: 30_000 });
    await accept.click();
    await expect.poll(() => counters.accept, { timeout: 30_000 }).toBe(2);

    // 重試同一次確認必須重放同一把鑰匙，否則會撞 IDEMPOTENCY_CONFLICT／製造第二筆紀錄。
    expect(counters.acceptHeaders[1]['idempotency-key']).toBe(counters.acceptHeaders[0]['idempotency-key']);
  });

  test('T10: GET 404 保留 invalid testid 並顯示連結無效主文案', async ({ page }) => {
    test.setTimeout(180_000);
    await setTravelerSession(page);
    await installConfirmRoutes(page, { previewStatus: 404 });

    await page.goto(CONFIRM_PATH, { waitUntil: 'domcontentloaded' });

    const invalid = page.getByTestId('booking-confirm-invalid');
    const expectedCopy = '此確認連結無效，或不屬於目前登入的帳號。';
    await expect(invalid).toBeVisible({ timeout: 30_000 });
    await expect(invalid).toContainText(expectedCopy);
    await expect(invalid.getByText(expectedCopy, { exact: true })).toHaveCount(1);
  });

  test('T11: GET 503 與 500 保留 invalid testid，但各自只顯示服務錯誤主文案', async ({ page }) => {
    test.setTimeout(180_000);
    await setTravelerSession(page);
    await installConfirmRoutes(page, { previewStatus: 503 });

    await page.goto(CONFIRM_PATH, { waitUntil: 'domcontentloaded' });

    const unavailableCopy = '服務暫時無法使用，請稍後再試。';
    const invalidCopy = '此確認連結無效';
    const unavailable = page.getByTestId('booking-confirm-invalid');
    await expect(unavailable).toBeVisible({ timeout: 30_000 });
    await expect(unavailable).toContainText(unavailableCopy);
    await expect(unavailable.getByText(unavailableCopy, { exact: true })).toHaveCount(1);
    await expect(unavailable).not.toContainText(invalidCopy);

    const genericPage = await page.context().newPage();
    await setTravelerSession(genericPage);
    await installConfirmRoutes(genericPage, { previewStatus: 500 });
    await genericPage.goto(CONFIRM_PATH, { waitUntil: 'domcontentloaded' });

    const genericCopy = '暫時無法完成確認，請稍後再試。';
    const generic = genericPage.getByTestId('booking-confirm-invalid');
    await expect(generic).toBeVisible({ timeout: 30_000 });
    await expect(generic).toContainText(genericCopy);
    await expect(generic.getByText(genericCopy, { exact: true })).toHaveCount(1);
    await expect(generic).not.toContainText(invalidCopy);
    await genericPage.close();
  });
});
