import { test, expect, setGuideSession } from './helpers';

const GUIDE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REQUEST_ID = 'mreq-canonical-e2e';
const INQUIRY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PLAN_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

test('midao2 request conversion uses only the server-projected canonical command', async ({ page }) => {
  test.setTimeout(60_000);
  await setGuideSession(page, GUIDE_ID);
  await page.context().addCookies([
    { name: 'tp_csrf', value: 'midao2-e2e-csrf', url: 'http://127.0.0.1:3333' },
  ]);

  const writes: string[] = [];
  await page.route(`**/api/v2/guide/midao/requests/${REQUEST_ID}`, async (route) => {
    if (route.request().method() !== 'GET') writes.push(new URL(route.request().url()).pathname);
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          request: {
            id: REQUEST_ID, requestNo: 'R-E2E-001', travelerName: '測試旅人', travelerLineId: null,
            travelerEmail: null, activityTitle: '測試行程', planTitle: '測試方案', preferredDate: '2026-09-01',
            backupDate: null, preferredPeriod: 'morning', startTime: '09:00', endTime: '12:00',
            participantsCount: 2, participantsNote: null, language: 'zh-TW', needPickup: false,
            specialNote: null, answers: [], status: 'replied', createdAt: '2026-08-24T00:00:00.000Z',
          },
          canonicalInquiry: {
            inquiryId: INQUIRY_ID, status: 'replied', convertedBookingId: null,
            plan: {
              activityPlanId: PLAN_ID, name: '測試方案', bookingType: 'request', status: 'active',
              minParticipants: 1, maxParticipants: 6, basePrice: 1800,
            },
            defaults: { preferredDate: '2026-09-01', startTimeLocal: '09:00', participants: 2 },
            canConvert: true,
          },
        },
      }),
    });
  });
  await page.route(`**/api/v2/guide/inquiries/${INQUIRY_ID}/commands/convert`, async (route) => {
    writes.push(new URL(route.request().url()).pathname);
    const headers = route.request().headers();
    expect(headers['x-csrf-token']).toBe('midao2-e2e-csrf');
    expect(headers['idempotency-key']).toBeTruthy();
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          created: false, replayed: true, inquiryId: INQUIRY_ID,
          bookingId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          orderId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', bookingNo: null, bookingStatus: 'draft',
          travelerConfirmationStatus: 'pending', travelerConfirmationExpiresAt: null,
          confirmationToken: null, confirmationUrl: null, confirmationTokenNote: 'replay',
        },
      }),
    });
  });

  await page.goto(`/midao2/requests/${REQUEST_ID}`);
  await page.getByTestId('midao-conversion-start-at').fill('2026-09-01T09:00');
  await page.getByTestId('midao-conversion-end-at').fill('2026-09-01T12:00');
  await page.getByTestId('midao-conversion-quoted-total').fill('3600');
  await page.getByTestId('midao-conversion-submit').click();

  await expect(page.getByTestId('midao-confirmation-url-unavailable')).toBeVisible();
  expect(writes).toEqual([`/api/v2/guide/inquiries/${INQUIRY_ID}/commands/convert`]);
});
