import { test, expect, setTravelerSession } from './helpers';
import type { Route } from '@playwright/test';

// Traveler account page: optional Telegram binding panel (LINE for travelers is
// via LIFF, not a console button). Backend mocked via page.route.

test('traveler profile shows Telegram binding and mints a deep link', async ({ page }) => {
  await setTravelerSession(page);

  await page.route('**/api/me/profile', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { email: 'trav@example.com', marketing_opt_in: false } }) });
  });
  await page.route('**/api/me/telegram-binding', async (route: Route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { code: 'TRAVTG1', deepLink: 'https://t.me/Midao2026bot?start=TRAVTG1', instruction: '按 START 即開啟通知。' } }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { bound: false } }) });
    }
  });

  await page.goto('/me/profile');

  await expect(page.getByTestId('me-notification-binding')).toBeVisible();
  await expect(page.getByTestId('binding-telegram-status')).toHaveText('未綁定');

  await page.getByTestId('binding-telegram-btn').click();
  await expect(page.getByTestId('binding-telegram-link')).toHaveAttribute('href', /t\.me\/Midao2026bot\?start=TRAVTG1/);
});
