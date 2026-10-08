import { test, expect } from './helpers';
import type { Route } from '@playwright/test';

/**
 * Admin 導遊詳情頁 → vibeaico 新後台代管入口。
 *
 * 這顆入口刻意做成純超連結（方案 A）：不帶 token、不帶簽章、不帶任何身分，
 * 只把「要看哪個導遊」的 id 傳過去；權限由 vibeaico 端自行判定。
 * 因此本 spec 只驗兩件事：
 *   1. 設了 NEXT_PUBLIC_VIBEAI_ADMIN_URL → 入口出現，且 href 正確組出。
 *   2. 沒設 → 入口完全不渲染（而不是連到 `undefined/tenant/impersonate?...`）。
 *
 * NEXT_PUBLIC_* 在 build/compile 時被內聯，同一個 server 無法在測試中切換，
 * 所以兩個案例各自 skip，要跑滿必須用「有設」與「沒設」各跑一次。
 */

test.describe.configure({ timeout: 90_000 });

const PROFILE_ID = 'c9999999-3333-4333-8333-333333333333';

const PROFILE_DETAIL = {
  ok: true,
  data: {
    kind: 'profile',
    id: PROFILE_ID,
    display_name: '王大明',
    slug: 'wang-da-ming',
    verification_status: 'approved',
    headline: '在地十年嚮導',
    region: '高雄',
    rating_avg: 4.8,
    guide_email: 'wang@example.com',
    profile_photo_url: null,
    bio: '專注山海行程。',
    specialty: '登山',
    created_at: '2026-05-01T08:00:00Z',
  },
};

const configured = String(process.env.NEXT_PUBLIC_VIBEAI_ADMIN_URL || '').trim();
const shotDir = process.env.MIDAO_SHOT_DIR || '';

async function openDetail(page: import('@playwright/test').Page) {
  await page.route(`**/api/admin/guides/${PROFILE_ID}`, (r: Route) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PROFILE_DETAIL) }),
  );
  await page.goto(`/admin/guides/${PROFILE_ID}`);
  await expect(page.getByText('王大明').first()).toBeVisible();
}

test('設定 NEXT_PUBLIC_VIBEAI_ADMIN_URL → 顯示 vibeaico 後台入口且 href 正確', async ({ authedPage: page }) => {
  test.skip(!configured, '未設定 NEXT_PUBLIC_VIBEAI_ADMIN_URL，本案例不適用');
  await openDetail(page);

  const link = page.getByTestId('admin-enter-vibeai-admin');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', `${configured}/tenant/impersonate?guide=${PROFILE_ID}`);
  await expect(link).toHaveAttribute('rel', /noopener/);

  if (shotDir) {
    await page.screenshot({ path: `${shotDir}/vibeai-entry-configured.png`, fullPage: false });
  }
});

test('未設定 NEXT_PUBLIC_VIBEAI_ADMIN_URL → 入口完全不渲染', async ({ authedPage: page }) => {
  test.skip(!!configured, '已設定 NEXT_PUBLIC_VIBEAI_ADMIN_URL，本案例不適用');
  await openDetail(page);

  // 既有的兩顆代登入按鈕仍在 → 證明我們看的是同一排、頁面沒壞。
  await expect(page.getByTestId('admin-enter-guide-backend')).toBeVisible();
  await expect(page.getByTestId('admin-enter-vibeai-admin')).toHaveCount(0);

  if (shotDir) {
    await page.screenshot({ path: `${shotDir}/vibeai-entry-unset.png`, fullPage: false });
  }
});
