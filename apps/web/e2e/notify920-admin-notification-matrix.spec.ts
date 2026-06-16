/**
 * #920 — 後台通知設定矩陣
 *
 * 管理者後台 /admin/notifications：每個訂單事件 × (旅客/導遊/管理者) × (LINE/Telegram)
 * 都能勾選開/關。本 spec 用 authedPage admin fixture + page.route() mock
 * /api/admin/notification-settings（不依賴 Supabase），驗證：
 *   1. 矩陣渲染（事件列 + 通道/對象表頭 + checkbox）
 *   2. 取消勾選某格 → 觸發 PATCH，body 帶正確 cell + enabled:false
 */
import { test, expect } from './helpers';

const DIMENSIONS = {
  events: ['new_order', 'payment_received', 'order_cancelled', 'refund_requested', 'refund_executed'],
  recipients: ['traveler', 'guide', 'admin'],
  channels: ['line', 'telegram'],
};

function fullMatrix(overrides: Record<string, boolean> = {}) {
  const m: Record<string, Record<string, Record<string, boolean>>> = {};
  for (const ev of DIMENSIONS.events) {
    m[ev] = {};
    for (const rc of DIMENSIONS.recipients) {
      m[ev][rc] = {};
      for (const ch of DIMENSIONS.channels) {
        m[ev][rc][ch] = overrides[`${ev}:${rc}:${ch}`] ?? true;
      }
    }
  }
  return m;
}

test('通知矩陣渲染並可取消勾選某格觸發 PATCH', async ({ authedPage: page }) => {
  const patchBodies: any[] = [];

  await page.route('**/api/admin/notification-settings', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { matrix: fullMatrix(), dimensions: DIMENSIONS } }),
      });
      return;
    }
    if (method === 'PATCH') {
      const body = route.request().postDataJSON();
      patchBodies.push(body);
      const cell = body.cells[0];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: {
            matrix: fullMatrix({ [`${cell.event}:${cell.recipient}:${cell.channel}`]: cell.enabled }),
            dimensions: DIMENSIONS,
          },
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/admin/notifications');

  // 標題與事件列
  await expect(page.getByRole('heading', { name: '通知設定' })).toBeVisible();
  await expect(page.getByText('新訂單建立')).toBeVisible();
  await expect(page.getByText('退款完成')).toBeVisible();

  // 6 通道×對象欄 × 5 事件列 = 30 個 checkbox，預設全勾
  const checkboxes = page.locator('input[type="checkbox"]');
  await expect(checkboxes).toHaveCount(30);

  // 取消「新訂單建立 / LINE / 旅客」這一格
  const cell = page.getByLabel('新訂單建立 / LINE / 旅客');
  await expect(cell).toBeChecked();
  await cell.uncheck();

  // PATCH 應帶正確 cell + enabled:false
  await expect.poll(() => patchBodies.length).toBeGreaterThan(0);
  expect(patchBodies[0].cells[0]).toMatchObject({
    event: 'new_order',
    recipient: 'traveler',
    channel: 'line',
    enabled: false,
  });
  await expect(cell).not.toBeChecked();
});
