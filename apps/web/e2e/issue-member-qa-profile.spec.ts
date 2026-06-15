import { test, expect, setTravelerSession } from './helpers';
import type { Route } from '@playwright/test';

/**
 * 會員中心新增「問答回覆」收件匣（/me/qa）＋ 個人資料新增「區域」下拉並統一深綠主題。
 * 以 setTravelerSession 過登入 gate、page.route mock backend（不碰真實 Supabase）。
 */

const QA = [
  { id: 'q1', question: '有停車場嗎？', answer: '有，現場免費停車。', status: 'approved', statusLabel: '已回覆', answered: true, targetKind: 'activity', targetTitle: '柴山秘境之旅', targetHref: '/activities/chaishan-cave', createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-05T00:00:00Z' },
  { id: 'q2', question: '可以客製行程嗎？', answer: null, status: 'pending_moderation', statusLabel: '審核中', answered: false, targetKind: 'guide', targetTitle: '阿美（導遊）', targetHref: '/guides/amei', createdAt: '2026-06-03T00:00:00Z', updatedAt: '2026-06-03T00:00:00Z' },
];

test.describe('會員中心：問答回覆 + 個人資料區域', () => {
  test('我的行程 › 問答回覆：列出我問過的問題＋導遊回覆，深綠主題、分頁 active', async ({ page }) => {
    await setTravelerSession(page);
    await page.route('**/api/me/qa**', (r: Route) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: QA }) }),
    );

    await page.goto('/me/qa');

    const title = page.getByTestId('my-qa-title');
    await expect(title).toBeVisible({ timeout: 10_000 });
    // 深綠主題：標題用淺色文字 rgb(239,233,211)
    const color = await title.evaluate((el) => getComputedStyle(el).color.replace(/\s/g, ''));
    expect(color).toBe('rgb(239,233,211)');

    // 分頁 active
    await expect(page.getByTestId('member-tab-qa')).toHaveAttribute('aria-current', 'page');

    // 兩筆問答；已回覆者顯示答覆區塊
    const items = page.getByTestId('qa-item');
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText('有停車場嗎？');
    await expect(items.first().getByTestId('qa-answer')).toContainText('免費停車');
    await expect(items.first()).toContainText('已回覆');
    // 審核中者顯示等待提示、無答覆區塊
    const pending = items.nth(1);
    await expect(pending).toContainText('審核中');
    await expect(pending.getByTestId('qa-answer')).toHaveCount(0);
  });

  test('問答回覆：空狀態顯示 CTA', async ({ page }) => {
    await setTravelerSession(page);
    await page.route('**/api/me/qa**', (r: Route) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }),
    );
    await page.goto('/me/qa');
    await expect(page.getByTestId('qa-empty')).toBeVisible({ timeout: 10_000 });
  });

  test('個人資料：區域下拉回填、深綠主題、分頁 active', async ({ page }) => {
    await setTravelerSession(page);
    await page.route('**/api/me/profile', (r: Route) => {
      if (r.request().method() === 'GET') {
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { email: 'trav@example.com', displayName: '小明', phone: '0912345678', region: 'taipei', marketingEmailOptIn: true } }) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { displayName: '小明', phone: '0912345678', region: 'taipei', marketingEmailOptIn: true } }) });
    });
    await page.route('**/api/me/csrf**', (r: Route) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

    await page.goto('/me/profile');

    const region = page.getByTestId('profile-region');
    await expect(region).toBeVisible({ timeout: 10_000 });
    await expect(region).toHaveValue('taipei');
    // 暱稱回填
    await expect(page.getByTestId('profile-display-name')).toHaveValue('小明');
    // 分頁 active
    await expect(page.getByTestId('member-tab-profile')).toHaveAttribute('aria-current', 'page');
    // 深綠主題：個人資料卡片在深色容器內（標題淺色）
    const color = await page.locator('h1').first().evaluate((el) => getComputedStyle(el).color.replace(/\s/g, ''));
    expect(color).toBe('rgb(239,233,211)');
  });
});
