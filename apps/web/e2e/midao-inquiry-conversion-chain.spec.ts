import { test, expect } from './helpers';

const ids = {
  guide: '99999999-9999-4999-8999-999999999999',
  activity: '66666666-6666-4666-8666-666666666666',
  plan: '88888888-8888-4888-8888-888888888888',
};
const guide = {
  email: 'midao-e2e@example.invalid',
  password: 'midao-e2e-only-password',
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`MIDAO_E2E_ENV_REQUIRED:${name}`);
  return value;
}

async function loginTraveler(page: import('@playwright/test').Page) {
  const response = await page.request.post(`${requireEnv('SUPABASE_URL')}/auth/v1/token?grant_type=password`, {
    headers: { apikey: requireEnv('SUPABASE_ANON_KEY') },
    data: {
      email: requireEnv('MIDAO_E2E_TRAVELER_EMAIL'),
      password: requireEnv('MIDAO_E2E_TRAVELER_PASSWORD'),
    },
    failOnStatusCode: false,
  });
  expect(response.status()).toBe(200);
  const session = await response.json();
  expect(session.user?.id).toBe('55555555-5555-4555-8555-555555555555');
  await page.context().addCookies([
    { name: 'sb-127-auth-token', value: encodeURIComponent(JSON.stringify(session)), url: requireEnv('NEXT_PUBLIC_BASE_URL') },
    { name: 'tp_csrf', value: 'midao-real-auth-chain-csrf', url: requireEnv('NEXT_PUBLIC_BASE_URL') },
  ]);
}

async function loginGuide(page: import('@playwright/test').Page) {
  const csrf = await page.request.get('/api/guide/auth/csrf');
  expect(csrf.status()).toBe(200);
  const csrfToken = (await csrf.json()).data.csrfToken as string;
  const login = await page.request.post('/api/guide/auth/session', {
    headers: { 'x-csrf-token': csrfToken },
    data: guide,
    failOnStatusCode: false,
  });
  expect(login.status()).toBe(200);
  const cookies = await page.context().cookies(requireEnv('NEXT_PUBLIC_BASE_URL'));
  const sessionCsrf = cookies.find((cookie) => cookie.name === 'tp_csrf');
  if (!sessionCsrf?.value) throw new Error('MIDAO_E2E_GUIDE_CSRF_MISSING');
  return sessionCsrf.value;
}

test('real-auth inquiry → guide conversion → traveler confirmation → transfer checkout', async ({ page }) => {
  test.setTimeout(240_000);
  await loginTraveler(page);
  const travelerCsrf = 'midao-real-auth-chain-csrf';
  const inquiryResponse = await page.request.post('/api/v2/public/guides/midao-e2e-guide/inquiries', {
    headers: { 'x-csrf-token': travelerCsrf },
    data: {
      activity_id: ids.activity,
      preferred_date: '2030-09-01',
      plan_selector: { slug: 'midao-e2e-request' },
      questionnaire_version: 1,
      answers: [{ question_id: 'experience_level', value: 'beginner' }],
      party_size: 2,
      language: 'zh-TW',
    },
    failOnStatusCode: false,
  });
  expect(inquiryResponse.status()).toBe(201);
  const inquiry = await inquiryResponse.json();
  const inquiryId = inquiry.data.inquiry_id as string;
  expect(inquiryId).toMatch(/^[0-9a-f-]{36}$/u);

  const guideCsrf = await loginGuide(page);
  const reply = await page.request.post(`/api/v2/guide/inquiries/${inquiryId}/commands/mark-replied`, {
    headers: { 'x-csrf-token': guideCsrf, 'idempotency-key': `real-auth-reply-${inquiryId}` },
    data: {},
    failOnStatusCode: false,
  });
  expect(reply.status()).toBe(200);

  const conversion = await page.request.post(`/api/v2/guide/inquiries/${inquiryId}/commands/convert`, {
    headers: { 'x-csrf-token': guideCsrf, 'idempotency-key': `real-auth-convert-${inquiryId}` },
    data: {
      activityPlanId: ids.plan,
      startAt: '2030-09-01T01:00:00.000Z',
      endAt: '2030-09-01T05:00:00.000Z',
      participants: 2,
      quotedTotalTwd: 3600,
      confirmationTtlHours: 24,
    },
    failOnStatusCode: false,
  });
  expect(conversion.status()).toBe(200);
  const converted = await conversion.json();
  const confirmationToken = converted.data.confirmationToken as string;
  const bookingId = converted.data.bookingId as string;
  expect(confirmationToken).toMatch(/^[0-9a-f]{64}$/u);
  expect(bookingId).toMatch(/^[0-9a-f-]{36}$/u);

  await loginTraveler(page);
  const beforeConfirmationCheckout = await page.request.post(`/api/v2/bookings/${bookingId}/checkout`, {
    headers: { 'x-csrf-token': travelerCsrf, 'idempotency-key': `real-auth-checkout-before-${bookingId}` },
    data: { provider: 'transfer' },
    failOnStatusCode: false,
  });
  expect(beforeConfirmationCheckout.status()).toBe(409);
  expect((await beforeConfirmationCheckout.json()).error.code).toBe('TRAVELER_CONFIRMATION_REQUIRED');

  await page.goto(`/booking/confirm/${confirmationToken}`);
  await expect(page.getByTestId('booking-confirm-card')).toBeVisible();
  await expect(page.getByTestId('booking-confirm-service')).toBeVisible();
  const acceptResponse = page.waitForResponse((response) =>
    response.request().method() === 'POST'
      && response.url().includes(`/api/v2/me/booking-confirmations/${confirmationToken}/accept`),
  );
  await page.getByTestId('booking-confirm-accept').click();
  expect((await acceptResponse).status()).toBe(200);
  await page.waitForURL(/\/order\/pay\?orderId=/u);

  const checkout = await page.request.post(`/api/v2/bookings/${bookingId}/checkout`, {
    headers: { 'x-csrf-token': travelerCsrf, 'idempotency-key': `real-auth-checkout-${bookingId}` },
    data: { provider: 'transfer' },
    failOnStatusCode: false,
  });
  expect(checkout.status()).toBe(200);
  expect((await checkout.json()).success).toBe(true);
});
