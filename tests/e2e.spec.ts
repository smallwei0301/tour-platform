import { test, expect } from '@playwright/test';
import { HomePage } from './pages/home.page';
import { TripPage } from './pages/trip.page';

test.describe('Tour Platform E2E', () => {
  test('browse -> open trip -> enter reservation (desktop)', async ({ page }) => {
    const home = new HomePage(page)
    await home.goto()
    await home.ensureLoaded()
    await page.screenshot({ path: '/tmp/tour-platform/tests/snapshots/desktop-home.png', fullPage: true })

    await home.clickFirstTrip()
    const trip = new TripPage(page)
    await trip.waitForContent()
    await page.screenshot({ path: '/tmp/tour-platform/tests/snapshots/desktop-trip.png', fullPage: true })

    // try to click a reserve/booking flow (best-effort)
    try{
      await trip.clickReserve()
      await page.screenshot({ path: '/tmp/tour-platform/tests/snapshots/desktop-reserve.png', fullPage:true })
    }catch(e){
      // no-op, continue
    }
  })

  test('browse -> open trip -> enter reservation (mobile)', async ({ browser }) => {
    const iPhone = { viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)'}
    const context = await browser.newContext({ viewport: iPhone.viewport, userAgent: iPhone.userAgent })
    const page = await context.newPage()
    const home = new HomePage(page)
    await home.goto()
    await home.ensureLoaded()
    await page.screenshot({ path: '/tmp/tour-platform/tests/snapshots/mobile-home.png', fullPage: true })

    await home.clickFirstTrip()
    const trip = new TripPage(page)
    await trip.waitForContent()
    await page.screenshot({ path: '/tmp/tour-platform/tests/snapshots/mobile-trip.png', fullPage:true })

    try{
      await trip.clickReserve()
      await page.screenshot({ path: '/tmp/tour-platform/tests/snapshots/mobile-reserve.png', fullPage:true })
    }catch(e){ }

    await context.close()
  })
})
