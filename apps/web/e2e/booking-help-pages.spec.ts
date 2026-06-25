/**
 * Browser smoke for the booking-type help page (guide realm). The page is a
 * static server component (no API), reached from the 預約方式 selector's
 * 「📖 說明」link. Uses a format-valid guide session so middleware lets the
 * /guide/** route render.
 */
import { test, expect, setGuideSession } from './helpers';

test('guide booking-types help page renders all three modes', async ({ page }) => {
  await setGuideSession(page, 'guide-help-e2e');
  await page.goto('/guide/help/booking-types', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: '預約方式說明' })).toBeVisible({ timeout: 15_000 });
  // The shared guide content covers all three booking modes.
  await expect(page.getByText('即時預約(instant)')).toBeVisible();
  await expect(page.getByText('申請預約(request)')).toBeVisible();
  await expect(page.getByText('排程預約(scheduled)')).toBeVisible();
  // Key behavioural facts surfaced to the operator.
  await expect(page.getByText('先審核後付款')).toBeVisible();
  await expect(page.getByText(/一定要先建立「場次」/)).toBeVisible();
});
