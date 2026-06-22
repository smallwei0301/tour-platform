import { test, expect } from './helpers';
import type { Route } from '@playwright/test';

// #1475 — 未登入進入導遊商店預約 wizard 會被導向 /login?next=...

const SLUG = 'wu-luo-qing';

test('未登入 → /guides/[slug]/shop/book 導向 /login', async ({ page }) => {
  // 沒有 setTravelerSession：讓 supabase.auth.getUser() 取不到 user。
  await page.route('**/auth/v1/user**', (route: Route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ msg: 'no session' }) })
  );
  await page.goto(`/guides/${SLUG}/shop/book`);
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(decodeURIComponent(new URL(page.url()).searchParams.get('next') || '')).toContain(`/guides/${SLUG}/shop/book`);
});
