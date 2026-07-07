import { test, expect, setTravelerSession, setGuideSession } from './helpers';
import type { Route } from '@playwright/test';

/**
 * Issue #1411 — 站內訊息第一期（真實瀏覽器，backend 以 page.route mock）。
 * traveler：訂單頁留言區 → 發言 → 出現在串中；唯讀狀態提示；pending_payment 隱藏。
 * guide：/guide/messages 清單（待回覆排前）→ 展開串 → 回覆。
 */

const ORDER_ID = '14110000-aaaa-4bbb-8ccc-000000000001';

function orderBody(status: string) {
  return {
    ok: true,
    data: {
      id: ORDER_ID,
      status,
      totalTwd: 4000,
      peopleCount: 2,
      contactName: '訊息旅客',
      contactEmail: 'traveler-e2e@example.com',
      title: '高雄柴山探洞體驗',
      scheduleStartAt: '2026-07-01T09:00:00+08:00',
      createdAt: '2026-06-01T00:00:00Z',
    },
  };
}

const GUIDE_MSG = { id: 'msg-g1', orderId: ORDER_ID, senderRole: 'guide', senderId: 'andy-lee', body: '哈囉，期待見面！', createdAt: '2026-06-10T10:00:00Z' };

function threadBody({ canPost, messages }: { canPost: boolean; messages: unknown[] }) {
  return {
    ok: true,
    data: {
      orderId: ORDER_ID,
      orderStatus: 'paid',
      activityTitle: '高雄柴山探洞體驗',
      canView: true,
      canPost,
      messages,
    },
  };
}

test.describe('issue1411 order messages', () => {
  test('traveler：paid 訂單發言 → 留言出現在串中、輸入框清空', async ({ page }) => {
    await setTravelerSession(page);

    const messages: unknown[] = [GUIDE_MSG];
    let postedBody: string | null = null;

    await page.route(`**/api/v2/orders/${ORDER_ID}`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(orderBody('paid')) });
    });
    await page.route(`**/api/v2/orders/${ORDER_ID}/messages`, async (route: Route) => {
      if (route.request().method() === 'POST') {
        postedBody = (route.request().postDataJSON() as { body?: string })?.body ?? null;
        const newMsg = { id: 'msg-t1', orderId: ORDER_ID, senderRole: 'traveler', senderId: 'traveler-e2e', body: postedBody, createdAt: '2026-06-11T08:00:00Z' };
        messages.push(newMsg);
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, data: newMsg }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(threadBody({ canPost: true, messages })) });
    });

    await page.goto(`/me/orders/${ORDER_ID}`);

    const section = page.locator('[data-testid="order-messages-section"]');
    await expect(section).toBeVisible({ timeout: 10_000 });
    await expect(section).toContainText('哈囉，期待見面！');

    const input = page.locator('[data-testid="order-message-input"]');
    await input.fill('請問當天要準備什麼裝備？');
    await page.locator('[data-testid="order-message-send"]').click();

    await expect(page.locator('[data-testid="order-message-item"]')).toHaveCount(2);
    await expect(section).toContainText('請問當天要準備什麼裝備？');
    await expect(input).toHaveValue('');
    expect(postedBody).toBe('請問當天要準備什麼裝備？');
  });

  test('traveler：窗口關閉（completed >14 天）→ 唯讀提示、無輸入框', async ({ page }) => {
    await setTravelerSession(page);

    await page.route(`**/api/v2/orders/${ORDER_ID}`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(orderBody('completed')) });
    });
    await page.route(`**/api/v2/orders/${ORDER_ID}/messages`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(threadBody({ canPost: false, messages: [GUIDE_MSG] })) });
    });

    await page.goto(`/me/orders/${ORDER_ID}`);

    await expect(page.locator('[data-testid="order-messages-section"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="order-messages-readonly"]')).toBeVisible();
    await expect(page.locator('[data-testid="order-message-input"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="order-message-item"]')).toHaveCount(1);
  });

  test('traveler：pending_payment（canView false）→ 留言區整個隱藏', async ({ page }) => {
    await setTravelerSession(page);

    await page.route(`**/api/v2/orders/${ORDER_ID}`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(orderBody('pending_payment')) });
    });
    await page.route(`**/api/v2/orders/${ORDER_ID}/messages`, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { orderId: ORDER_ID, orderStatus: 'pending_payment', canView: false, canPost: false, messages: [] } }),
      });
    });

    await page.goto(`/me/orders/${ORDER_ID}`);

    await expect(page.getByText('前往付款')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="order-messages-section"]')).toHaveCount(0);
  });

  test('guide：清單待回覆排前 → 展開串 → 回覆 → 旗標更新', async ({ page }) => {
    await setGuideSession(page, 'guide-1411');

    let replied = false;
    let postedBody: string | null = null;
    const travelerMsg = { id: 'msg-t1', orderId: ORDER_ID, senderRole: 'traveler', senderId: 'wang', body: '請問有雨備方案嗎？', createdAt: '2026-06-11T08:00:00Z' };
    const guideReply = { id: 'msg-g2', orderId: ORDER_ID, senderRole: 'guide', senderId: 'guide-1411', body: '有的，雨天改走室內路線。', createdAt: '2026-06-11T09:00:00Z' };

    await page.route('**/api/v2/guide/messages', async (route: Route) => {
      const last = replied ? guideReply : travelerMsg;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: [{
            orderId: ORDER_ID,
            orderStatus: 'paid',
            activityTitle: '高雄柴山探洞體驗',
            contactName: '訊息旅客',
            scheduleStartAt: '2026-07-01T09:00:00+08:00',
            lastMessage: last,
            messageCount: replied ? 2 : 1,
            needsReply: !replied,
            canPost: true,
          }],
        }),
      });
    });
    await page.route(`**/api/v2/guide/orders/${ORDER_ID}/messages`, async (route: Route) => {
      if (route.request().method() === 'POST') {
        postedBody = (route.request().postDataJSON() as { body?: string })?.body ?? null;
        replied = true;
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, data: guideReply }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: { orderId: ORDER_ID, orderStatus: 'paid', canView: true, canPost: true, messages: replied ? [travelerMsg, guideReply] : [travelerMsg] },
        }),
      });
    });
    await page.route('**/api/me/csrf**', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });

    await page.goto('/guide/messages');

    const thread = page.locator(`[data-testid="message-thread-${ORDER_ID}"]`);
    await expect(thread).toBeVisible({ timeout: 10_000 });
    await expect(thread).toContainText('待回覆');
    await expect(thread).toContainText('請問有雨備方案嗎？');

    await page.locator(`[data-testid="message-thread-open-${ORDER_ID}"]`).click();
    await expect(page.locator('[data-testid="guide-message-item"]')).toHaveCount(1);

    await page.locator('[data-testid="guide-message-input"]').fill('有的，雨天改走室內路線。');
    await page.locator('[data-testid="guide-message-send"]').click();

    await expect(page.locator('[data-testid="guide-message-item"]')).toHaveCount(2);
    expect(postedBody).toBe('有的，雨天改走室內路線。');
    // 回覆後清單旗標翻轉 → 待回覆區清空
    await expect(page.locator('[data-testid="messages-empty"]')).toBeVisible();
  });
});
