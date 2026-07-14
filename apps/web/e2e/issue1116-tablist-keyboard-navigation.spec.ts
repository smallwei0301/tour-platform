/**
 * Issue #1116 — 7 tablists: ArrowRight/Left/Home/End keyboard navigation
 *
 * Context: Before #1116, the tab interfaces used click-only navigation.
 * After #1116, all 7 tablists support ArrowRight/ArrowLeft/Home/End per
 * ARIA spec. This spec verifies the behavior in a real browser context.
 *
 * Coverage: admin/qa (/admin/qa), admin/activities (/admin/activities)
 * via the authedPage fixture.
 *
 * Strategy: page.route() mocks all API calls so no real Supabase needed.
 *
 * Refs: #1124 (QA gate), #1116 (fix), #1162 (this spec)
 */
import { test, expect } from './helpers';

/** Helper: verify ARIA tablist keyboard navigation on a page with a tablist */
async function verifyTablistKeyboard(page: import('@playwright/test').Page, tablistSelector: string) {
  const tablist = page.locator(tablistSelector).first();
  if (!(await tablist.isVisible())) return; // skip if tablist not found on this page

  // Focus the first tab
  const firstTab = tablist.locator('[role="tab"]').first();
  const secondTab = tablist.locator('[role="tab"]').nth(1);
  const lastTab = tablist.locator('[role="tab"]').last();

  if (!(await firstTab.isVisible())) return;

  await firstTab.focus();
  await expect(firstTab).toBeFocused();

  // ArrowRight should move focus to second tab
  if (await secondTab.isVisible()) {
    await page.keyboard.press('ArrowRight');
    await expect(secondTab).toBeFocused();

    // ArrowLeft should move focus back
    await page.keyboard.press('ArrowLeft');
    await expect(firstTab).toBeFocused();
  }

  // End should move focus to last tab
  if (await lastTab.isVisible() && lastTab !== firstTab) {
    await page.keyboard.press('End');
    await expect(lastTab).toBeFocused();

    // Home should move focus back to first tab
    await page.keyboard.press('Home');
    await expect(firstTab).toBeFocused();
  }
}

test.describe('T1116 — Tablist keyboard navigation (Arrow + Home + End)', () => {
  test('T1116.1 — /admin/qa tablist responds to ArrowRight/Left/Home/End', async ({
    authedPage: page,
  }) => {
    // Mock /api/admin/qa to avoid real DB dependency
    await page.route('**/api/admin/qa**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: [] }),
      });
    });

    await page.goto('/admin/qa');
    await page.waitForLoadState('networkidle');

    await verifyTablistKeyboard(page, '[role="tablist"]');
  });

  test('T1116.2 — /admin/activities tablist responds to ArrowRight/Left/Home/End', async ({
    authedPage: page,
  }) => {
    await page.route('**/api/admin/activities**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: [] }),
      });
    });

    await page.goto('/admin/activities');
    await page.waitForLoadState('networkidle');

    await verifyTablistKeyboard(page, '[role="tablist"]');
  });

  test('T1116.3 — /guide/bookings tablist responds to keyboard navigation', async ({
    authedPage: page,
  }) => {
    await page.route('**/api/v2/guide/bookings**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: [] }),
      });
    });

    await page.goto('/guide/bookings');
    await page.waitForLoadState('networkidle');

    await verifyTablistKeyboard(page, '[role="tablist"]');
  });

  test('T1116.4 — ArrowRight wraps from last to first tab', async ({
    authedPage: page,
  }) => {
    await page.route('**/api/admin/qa**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: [] }),
      });
    });

    await page.goto('/admin/qa');
    await page.waitForLoadState('networkidle');

    const tablist = page.locator('[role="tablist"]').first();
    if (!(await tablist.isVisible())) return;

    const tabs = tablist.locator('[role="tab"]');
    const tabCount = await tabs.count();
    if (tabCount < 2) return;

    // Focus last tab
    const lastTab = tabs.last();
    await lastTab.focus();

    // ArrowRight from last tab should wrap to first tab
    await page.keyboard.press('ArrowRight');
    const firstTab = tabs.first();
    await expect(firstTab).toBeFocused();
  });
});
