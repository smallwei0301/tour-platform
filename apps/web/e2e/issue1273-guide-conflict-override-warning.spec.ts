import { test, expect, setGuideSession } from './helpers';

/**
 * Issue #1273 — Browser E2E for GH-1257 slice D (PR #1270):
 * Guide booking views surface the admin conflict-override warning WITHOUT
 * leaking the override's internal admin note.
 *
 * Strategy (no Supabase seed, no real guide auth):
 *   - setGuideSession() drops a format-valid guide_token so edge middleware
 *     renders /guide/bookings; the real HMAC API is never hit.
 *   - page.route() mocks:
 *       GET /api/guide/auth/csrf      → token (layout fires this on mount)
 *       GET /api/guide/bookings       → one booking with hasConflictOverride
 *       GET /api/guide/bookings/:id   → detail carrying a guide-safe
 *           conflictOverride. We deliberately INJECT an `adminNote` sentinel
 *           into the override payload to prove the guide UI never renders it,
 *           even if a backend regression were to forward it.
 */

test.describe.configure({ timeout: 90_000 });

const GUIDE_ID = '44444444-4444-4444-8444-444444444444';
const BOOKING_ID = '55555555-5555-4555-8555-555555555555';
const INTERNAL_ADMIN_NOTE = '內部機密-請勿外洩-後台核准紀錄';
const GUIDE_NOTE = '導遊請提早 30 分鐘到場';
const REASON = 'VIP 客訴補救';

const LIST_RESPONSE = {
  ok: true,
  data: [
    {
      id: BOOKING_ID,
      guestName: '陳小明',
      maskedEmail: 'c***@example.com',
      scheduleDate: '2030-04-12',
      planId: '33333333-3333-4333-8333-333333333333',
      tourTitle: '衝浪體驗',
      partySize: 2,
      status: 'confirmed',
      paymentStatus: 'paid',
      totalTwd: 6400,
      createdAt: '2030-04-01T08:00:00+08:00',
      hasConflictOverride: true,
    },
  ],
};

const DETAIL_RESPONSE = {
  ok: true,
  data: {
    ...LIST_RESPONSE.data[0],
    guestPhone: '0912-345-678',
    paidAt: '2030-04-02T08:00:00+08:00',
    // Booking-level admin note intentionally null so the only admin-ish text in
    // the DOM would be a *leak* from the override, not the legitimate 管理員備註.
    adminNote: null,
    schedule: {
      date: '2030-04-12',
      endAt: '2030-04-12T12:00:00+08:00',
      planId: '33333333-3333-4333-8333-333333333333',
      capacity: 8,
      bookedCount: 2,
    },
    conflictOverride: {
      reason: REASON,
      requiresHelper: true,
      helperStatus: 'required',
      guideNote: GUIDE_NOTE,
      startAt: '2030-04-12T09:00:00+08:00',
      endAt: '2030-04-12T12:00:00+08:00',
      // Sentinel: must NEVER reach the guide-facing DOM.
      adminNote: INTERNAL_ADMIN_NOTE,
    },
  },
};

async function stubGuideBookings(page: import('@playwright/test').Page) {
  await page.route('**/api/guide/auth/csrf', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { csrfToken: 'test-csrf' } }),
    });
  });

  await page.route('**/api/guide/bookings', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(LIST_RESPONSE),
    });
  });

  await page.route(`**/api/guide/bookings/${BOOKING_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(DETAIL_RESPONSE),
    });
  });
}

test('GH-1257 slice D: guide booking detail shows admin conflict-override warning and hides internal admin note', async ({
  page,
}) => {
  await setGuideSession(page, GUIDE_ID);
  await stubGuideBookings(page);

  await page.goto('/guide/bookings');
  await page.waitForLoadState('domcontentloaded');

  // List renders with the compact conflict badge (proves we are not bounced to login).
  await expect(page.getByRole('heading', { name: '訂單查看' })).toBeVisible();
  await expect(page.getByLabel('管理者例外開放').first()).toBeVisible();

  // Open the detail modal.
  await page.getByRole('button', { name: '詳情' }).click();

  const warning = page.getByRole('note', { name: '管理者例外開放通知' });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('管理者例外開放');
  await expect(warning).toContainText(REASON);
  await expect(warning).toContainText('時間衝突');
  await expect(warning).toContainText('需要助手');
  await expect(warning).toContainText('是');
  await expect(warning).toContainText(GUIDE_NOTE);

  // Privacy guard: the override's internal admin note must not appear anywhere,
  // even though the mocked API forwarded it.
  await expect(page.getByText(INTERNAL_ADMIN_NOTE)).toHaveCount(0);
  await expect(page.getByText('管理員備註')).toHaveCount(0);
});
