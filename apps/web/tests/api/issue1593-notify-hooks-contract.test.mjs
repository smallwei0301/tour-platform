/**
 * Issue #1593 — 站內通知事件掛點＋前端 UI 源碼契約測試。
 * 三處掛點（留言回覆/改期結果/訂單取消）須呼叫 createNotification（best-effort）；
 * 導覽鈴鐺、/me/notifications 頁、MemberTabs 分頁、nav i18n 須接線。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

test('T1593hook.1 — lookupOrderContext 帶出 travelerUserId（供站內通知）', () => {
  const src = read('src/lib/reschedule-notify.ts');
  assert.match(src, /travelerUserId/);
  assert.match(src, /select\([^)]*user_id/);
});

test('T1593hook.2 — 改期決定掛點 createNotification（reschedule_result）', () => {
  const src = read('src/lib/reschedule-notify.ts');
  assert.match(src, /import\s*\{\s*createNotification\s*\}\s*from\s*['"]\.\/db-notifications\.mjs['"]/);
  assert.match(src, /createNotification\(\{[\s\S]*?type:\s*'reschedule_result'/);
});

test('T1593hook.3 — 嚮導回覆訊息掛點 createNotification（message_reply）', () => {
  const src = read('src/lib/order-message-notify.ts');
  assert.match(src, /createNotification/);
  assert.match(src, /type:\s*'message_reply'/);
});

test('T1593hook.4 — 管理員取消訂單掛點 createNotification（order_status，非凍結區）', () => {
  const src = read('app/api/v2/admin/orders/[orderId]/cancel/route.ts');
  assert.match(src, /createNotification/);
  assert.match(src, /type:\s*'order_status'/);
});

test('T1593ui.5 — 導覽鈴鐺＋清單頁＋分頁＋nav i18n 接線', () => {
  const bell = read('src/components/layout/NotificationBell.tsx');
  assert.match(bell, /\/api\/me\/notifications/);
  assert.match(bell, /unreadCount/);
  const nav = read('src/components/layout/Navbar.tsx');
  assert.match(nav, /<NotificationBell\s*\/>/);
  const page = read('app/(non-locale)/me/notifications/page.tsx');
  assert.match(page, /\/api\/me\/notifications\/read/);
  assert.match(page, /csrfHeaders/);
  const tabs = read('src/components/me/MemberTabs.tsx');
  assert.match(tabs, /\/me\/notifications/);
  for (const f of ['messages/zh-Hant.json', 'messages/en.json']) {
    const j = read(f);
    assert.ok(/"notifications"/.test(j), `${f} 缺 notifications i18n`);
  }
});
