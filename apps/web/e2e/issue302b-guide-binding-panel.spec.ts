import { test, expect, setGuideSession } from './helpers';
import type { Route } from '@playwright/test';

// Guide notification-binding panel: LINE + Telegram bind buttons that mint a
// code + deep link. Backend mocked via page.route so no Supabase/LINE needed.

const GUIDE_ID = 'd1111111-1111-4111-8111-111111111111';

function mockProfile(page: import('@playwright/test').Page) {
  return page.route('**/api/guide/profile', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { display_name: 'Andy', gallery_urls: [], is_published: true } }),
    });
  });
}

test('guide profile shows LINE + Telegram binding, and minting renders a deep link', async ({ page }) => {
  await setGuideSession(page, GUIDE_ID);
  await mockProfile(page);
  await page.route('**/api/guide/auth/csrf', async (r: Route) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));

  // status: unbound; POST mints a deep link
  await page.route('**/api/guide/line-binding', async (route: Route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { code: 'BINDLINE1', deepLink: 'https://line.me/R/oaMessage/@midao/?BINDLINE1', instruction: '於 LINE 送出即可。' } }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { bound: false } }) });
    }
  });
  await page.route('**/api/guide/telegram-binding', async (route: Route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { code: 'TGCODE1', deepLink: 'https://t.me/Midao2026bot?start=TGCODE1', instruction: '按 START 即完成。' } }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { bound: false } }) });
    }
  });

  await page.goto('/guide/profile');

  const panel = page.getByTestId('guide-notification-binding');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('binding-line-status')).toHaveText('未綁定');
  await expect(page.getByTestId('binding-telegram-status')).toHaveText('未綁定');

  await page.getByTestId('binding-line-btn').click();
  await expect(page.getByTestId('binding-line-link')).toHaveAttribute('href', /line\.me\/R\/oaMessage/);

  await page.getByTestId('binding-telegram-btn').click();
  await expect(page.getByTestId('binding-telegram-link')).toHaveAttribute('href', /t\.me\/Midao2026bot\?start=TGCODE1/);
});

test('recheck after minting flips status to bound and collapses the code', async ({ page }) => {
  await setGuideSession(page, GUIDE_ID);
  await mockProfile(page);
  await page.route('**/api/guide/auth/csrf', async (r: Route) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
  await page.route('**/api/guide/line-binding', async (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { bound: false } }) }));

  // First GET (on mount) unbound; POST mints; subsequent GETs report bound — the
  // user has finished inside Telegram and taps the recheck button.
  let minted = false;
  await page.route('**/api/guide/telegram-binding', async (route: Route) => {
    const method = route.request().method();
    if (method === 'POST') {
      minted = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { code: 'TGCODE2', deepLink: 'https://t.me/Midao2026bot?start=TGCODE2', instruction: '按 START 即完成。' } }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { bound: minted } }) });
    }
  });

  await page.goto('/guide/profile');
  await expect(page.getByTestId('binding-telegram-status')).toHaveText('未綁定');

  await page.getByTestId('binding-telegram-btn').click();
  await expect(page.getByTestId('binding-telegram-link')).toBeVisible();

  await page.getByTestId('binding-telegram-recheck').click();
  await expect(page.getByTestId('binding-telegram-status')).toHaveText('已綁定 ✓');
  // single-use code/link collapses once confirmed bound
  await expect(page.getByTestId('binding-telegram-result')).toHaveCount(0);
});
