import { test, expect, loginMidaoGuideViaApi } from './helpers';

const guide = {
  guideId: '99999999-9999-4999-8999-999999999999',
  guideName: 'Midao E2E Guide',
  email: 'midao-e2e@example.invalid',
  password: 'midao-e2e-only-password',
  expectedRedirect: '/midao' as const,
};

const destinations = [
  ['/midao', '首頁'],
  ['/midao/requests', '需求'],
  ['/midao/calendar', '行事曆'],
  ['/midao/services', '服務'],
  ['/midao/me', '我的頁面'],
] as const;

const viewports = [
  { name: 'mobile 390x844', width: 390, height: 844, mobile: true },
  { name: 'desktop 1440x1000', width: 1440, height: 1000, mobile: false },
] as const;

for (const viewport of viewports) {
  test.describe(`Midao primary navigation — ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('five routes, active item, visibility, safe-area, overflow and keyboard focus pass real auth', async ({ page }) => {
      test.setTimeout(180_000);
      await loginMidaoGuideViaApi(page, guide);

      for (const [path, label] of destinations) {
        await page.goto(path, { waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}/?$`));
        await expect(page.getByRole('heading', { name: label })).toBeVisible();
        await expect(page.locator('main')).toBeVisible();
        await expect(page.getByTestId('midao-impersonation-banner')).toHaveCount(0);

        const bottomNav = page.locator('.midao-bottom-nav');
        const desktopSidebar = page.locator('.midao-desktop-sidebar');
        const visibleNav = viewport.mobile ? bottomNav : desktopSidebar;
        await expect(visibleNav).toBeVisible();
        await expect(viewport.mobile ? desktopSidebar : bottomNav).toBeHidden();
        await expect(visibleNav.locator('[aria-current="page"]')).toHaveAttribute('href', path);

        const layout = await page.evaluate(() => {
          const root = document.documentElement;
          const theme = document.querySelector<HTMLElement>('.midao-theme');
          const header = document.querySelector<HTMLElement>('.midao-page-header');
          const content = document.querySelector<HTMLElement>('.midao-shell__content');
          const bottom = document.querySelector<HTMLElement>('.midao-bottom-nav');
          if (!theme || !header || !content || !bottom) throw new Error('MIDAO_LAYOUT_MISSING');
          const px = (value: string) => Number.parseFloat(value) || 0;
          return {
            noHorizontalOverflow: root.scrollWidth <= root.clientWidth,
            themeLeft: px(getComputedStyle(theme).paddingLeft),
            themeRight: px(getComputedStyle(theme).paddingRight),
            headerTop: px(getComputedStyle(header).paddingTop),
            contentBottom: px(getComputedStyle(content).paddingBottom),
            bottomPadding: px(getComputedStyle(bottom).paddingBottom),
          };
        });
        expect(layout.noHorizontalOverflow).toBe(true);
        expect(layout.themeLeft).toBeGreaterThanOrEqual(0);
        expect(layout.themeRight).toBeGreaterThanOrEqual(0);
        expect(layout.headerTop).toBeGreaterThanOrEqual(viewport.mobile ? 18 : 28);
        expect(layout.contentBottom).toBeGreaterThanOrEqual(viewport.mobile ? 82 : 48);
        expect(layout.bottomPadding).toBeGreaterThanOrEqual(0);
      }

      const loadedCss = await page.evaluate(() => {
        const chunks: string[] = [];
        const visit = (rules: CSSRuleList) => {
          for (const rule of Array.from(rules)) {
            chunks.push(rule.cssText);
            const nested = (rule as CSSGroupingRule).cssRules;
            if (nested) visit(nested);
          }
        };
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            if (sheet.cssRules) visit(sheet.cssRules);
          } catch {
            // Cross-origin styles are irrelevant; Midao shell CSS is runner-owned.
          }
        }
        return chunks.join('\n');
      });
      for (const edge of ['top', 'right', 'bottom', 'left']) {
        expect(loadedCss).toMatch(new RegExp(`--midao-safe-area-${edge}:\\s*env\\(safe-area-inset-${edge},\\s*0px\\)`, 'i'));
      }
      for (const wiring of [
        /padding-left:\s*var\(--midao-safe-area-left\)/i,
        /padding-right:\s*var\(--midao-safe-area-right\)/i,
        /padding-bottom:\s*var\(--midao-safe-area-bottom\)/i,
        /calc\(82px \+ var\(--midao-safe-area-bottom\)\)/i,
        /calc\(18px \+ var\(--midao-safe-area-top\)\)/i,
        /calc\(28px \+ var\(--midao-safe-area-top\)\)/i,
        /calc\(48px \+ var\(--midao-safe-area-bottom\)\)/i,
      ]) expect(loadedCss).toMatch(wiring);

      await page.goto('/midao', { waitUntil: 'domcontentloaded' });
      const visibleNav = viewport.mobile
        ? page.locator('.midao-bottom-nav')
        : page.locator('.midao-desktop-sidebar');
      const runnerOrigin = new URL(page.url()).origin;
      const target = visibleNav.getByRole('link', { name: '需求' });
      const tabBudget = await page.locator([
        'a[href]:visible',
        'button:visible',
        'input:visible',
        'select:visible',
        'textarea:visible',
        '[tabindex]:visible',
      ].join(', ')).count() + 1;
      await page.evaluate(() => {
        document.body.tabIndex = -1;
        document.body.focus();
      });
      let reachedByTab = false;
      for (let attempt = 0; attempt < tabBudget; attempt += 1) {
        await page.keyboard.press('Tab');
        reachedByTab = await target.evaluate((element) => element === document.activeElement);
        if (reachedByTab) break;
      }
      expect(reachedByTab).toBe(true);
      await expect(target).toBeFocused();
      expect(await target.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
      const focusStyle = await target.evaluate((element) => {
        const style = getComputedStyle(element);
        return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) || 0 };
      });
      expect(focusStyle.outlineStyle).not.toBe('none');
      expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(3);
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/midao\/requests\/?$/, { timeout: 45_000 });
      await expect(page.getByRole('heading', { name: '需求' })).toBeVisible();
      expect(new URL(page.url()).origin).toBe(runnerOrigin);
    });
  });
}
