import { test, expect, setGuideSession } from './helpers';
import type { Page } from '@playwright/test';

const GUIDE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INQUIRY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REQUEST_REF = `inquiry_${INQUIRY_ID}`;

const MIDAO_SUMMARY = {
  success: true,
  data: {
    guideName: '測試導遊',
    counts: { newRequests: 0, pendingReply: 0 },
    topRequest: null,
    recentRequests: [],
  },
};

const CANONICAL_INQUIRY_DETAIL = {
  kind: 'inquiry',
  requestRef: REQUEST_REF,
  inquiryId: INQUIRY_ID,
  inquiryNo: 'I-E2E-001',
  inquiryStatus: 'open',
  bucket: 'needs_reply',
  secondaryState: null,
  needsReply: true,
  traveler: { displayName: null, emailMasked: null },
  service: {
    activityId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    activityPlanId: null,
    title: '測試行程',
    planName: null,
    bookingType: 'request',
  },
  request: {
    preferredDate: '2026-09-01',
    backupDate: null,
    startTimeLocal: '09:00',
    partySize: 2,
    language: 'zh-TW',
    pickupRequired: false,
    travelerNote: '這是頁面可見的既有詢問內容，不會進入 LINE 文案。',
  },
  plan: null,
  convertedBookingId: null,
  lastRepliedAt: null,
  expiresAt: null,
  receivedAt: '2026-08-24T00:00:00.000Z',
  updatedAt: '2026-08-24T00:00:00.000Z',
  allowedActions: { approve: false, reject: false, markReplied: true, convertInquiry: false },
};

async function mockMidaoGuideSummary(page: Page): Promise<void> {
  await page.route('**/api/v2/guide/midao/summary', (route) =>
    route.fulfill({ json: MIDAO_SUMMARY }),
  );
}

test.setTimeout(60_000);

test('midao2 request list consumes canonical request projections', async ({ page }) => {
  await setGuideSession(page, GUIDE_ID);
  await mockMidaoGuideSummary(page);
  const reads: string[] = [];
  await page.route('**/api/v2/guide/requests**', async (route) => {
    reads.push(new URL(route.request().url()).pathname);
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          items: [{
            kind: 'booking', requestRef: `booking_${GUIDE_ID}`, bookingId: GUIDE_ID, bookingNo: 'B-E2E-001',
            bookingStatus: 'draft', guideApprovalStatus: 'pending', orderStatus: 'pending_payment',
            bucket: 'new', secondaryState: null, needsReply: true,
            traveler: { displayName: '測試旅人', emailMasked: 't***@example.com' },
            service: {
              activityId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
              activityPlanId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              title: '測試行程', planName: '測試方案', bookingType: 'request',
            },
            request: { startAt: '2026-09-01T01:00:00.000Z', endAt: '2026-09-01T04:00:00.000Z', timezone: 'Asia/Taipei', partySize: 2 },
            totalTwd: 3600, paymentDeadlineAt: null, receivedAt: '2026-08-24T00:00:00.000Z',
            updatedAt: '2026-08-24T00:00:00.000Z', lastMessageAt: null,
          }],
          nextCursor: null,
        },
      }),
    });
  });

  await page.goto('/midao2/requests');
  await expect(page.getByTestId('midao-request-list')).toBeVisible();
  await expect(page.getByRole('link', { name: /測試行程/ })).toHaveAttribute('href', `/midao2/requests/booking_${GUIDE_ID}`);
  expect(reads).toEqual(['/api/v2/guide/requests']);
});

test('midao2 LINE copy is manual, uses the safe template, and does not mutate CRM state', async ({ page }) => {
  await setGuideSession(page, GUIDE_ID);
  await mockMidaoGuideSummary(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('CLIPBOARD_UNAVAILABLE');
        },
      },
    });
  });
  await page.context().addCookies([
    { name: 'tp_csrf', value: 'midao2-e2e-csrf', url: 'http://127.0.0.1:3333' },
  ]);

  const writes: string[] = [];
  await page.route(`**/api/v2/guide/requests/${REQUEST_REF}`, async (route) => {
    if (route.request().method() !== 'GET') writes.push(new URL(route.request().url()).pathname);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: CANONICAL_INQUIRY_DETAIL }) });
  });
  await page.route(`**/api/v2/guide/requests/${REQUEST_REF}/reply-template`, async (route) => {
    writes.push(new URL(route.request().url()).pathname);
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers()['x-csrf-token']).toBe('midao2-e2e-csrf');
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          intent: 'acknowledge',
          text: '您好，\n\n我已收到您的需求。',
          shareUrl: 'https://line.me/R/share?text=%E6%82%A8%E5%A5%BD',
        },
      }),
    });
  });

  await page.goto(`/midao2/requests/${REQUEST_REF}`);
  await expect(page.getByTestId('midao2-manual-line-disclosure')).toHaveText('系統只準備文案或開啟 LINE；不保證送達，也不會自動重送。');
  await page.getByRole('button', { name: '產生文案' }).click();
  await expect(page.getByTestId('midao-line-reply-text')).toHaveValue('您好，\n\n我已收到您的需求。');
  await page.getByRole('button', { name: '複製文案' }).click();
  await expect(page.getByText('請手動複製上方文案後貼到 LINE')).toBeVisible();
  await expect(page.getByTestId('midao-line-share-link')).toHaveAttribute('href', 'https://line.me/R/share?text=%E6%82%A8%E5%A5%BD');
  expect(writes).toEqual([`/api/v2/guide/requests/${REQUEST_REF}/reply-template`]);
});