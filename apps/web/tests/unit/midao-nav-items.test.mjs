import assert from 'node:assert/strict';
import test from 'node:test';

const { MIDAO_NAV_ITEMS, activeMidaoNavId } = await import('../../src/features/midao/shell/nav-items.ts');

test('mobile and desktop share exactly the approved six primary destinations', () => {
  assert.deepEqual(
    MIDAO_NAV_ITEMS.map(({ id, label, href }) => ({ id, label, href })),
    [
      { id: 'home', label: '首頁', href: '/midao' },
      { id: 'requests', label: '需求', href: '/midao/requests' },
      { id: 'orders', label: '訂單', href: '/midao/orders' },
      { id: 'calendar', label: '行事曆', href: '/midao/calendar' },
      { id: 'services', label: '服務', href: '/midao/services' },
      { id: 'me', label: '我的頁面', href: '/midao/me' },
    ],
  );
  assert.equal(new Set(MIDAO_NAV_ITEMS.map((item) => item.id)).size, 6);
  assert.equal(MIDAO_NAV_ITEMS.some((item) => /message|redeem|review|payout/iu.test(`${item.id} ${item.href}`)), false);
});

test('nested matching produces at most one active primary destination', () => {
  const cases = new Map([
    ['/midao', 'home'],
    ['/midao/', 'home'],
    ['/midao/requests', 'requests'],
    ['/midao/requests/booking_123', 'requests'],
    ['/midao/orders', 'orders'],
    ['/midao/orders/order_123', 'orders'],
    ['/midao/calendar/settings', 'calendar'],
    ['/midao/services/new', 'services'],
    ['/midao/me/public-page', 'me'],
    ['/midao-evil', null],
    ['/guide/dashboard', null],
  ]);
  for (const [pathname, expected] of cases) {
    const active = activeMidaoNavId(pathname);
    assert.equal(active, expected, pathname);
    assert.ok(MIDAO_NAV_ITEMS.filter((item) => item.id === active).length <= 1);
  }
});
