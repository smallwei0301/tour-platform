/**
 * Issue #1593 — 站內通知 db 層（in-memory fallback）＋route source-contract。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createNotification, listNotificationsDb, markNotificationsReadDb, __resetMemNotifications,
} from '../../src/lib/db-notifications.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

test('T1593.1 — createNotification 寫入、list 回未讀數', async () => {
  __resetMemNotifications();
  assert.equal(await createNotification({ userId: 'u1', type: 'order_status', title: '訂單已確認' }), true);
  assert.equal(await createNotification({ userId: 'u1', type: 'message_reply', title: '導遊回覆了你' }), true);
  assert.equal(await createNotification({ userId: 'u2', type: 'order_status', title: '別人的' }), true);
  const r = await listNotificationsDb({ userId: 'u1' });
  assert.equal(r.items.length, 2);
  assert.equal(r.unreadCount, 2);
  // 使用者隔離
  assert.equal((await listNotificationsDb({ userId: 'u2' })).items.length, 1);
});

test('T1593.2 — 非法 type/缺 title/缺 userId → 不寫入且不拋（掛點安全）', async () => {
  __resetMemNotifications();
  assert.equal(await createNotification({ userId: 'u1', type: 'bogus', title: 'x' }), false);
  assert.equal(await createNotification({ userId: 'u1', type: 'order_status', title: '' }), false);
  assert.equal(await createNotification({ type: 'order_status', title: 'x' }), false);
  assert.equal((await listNotificationsDb({ userId: 'u1' })).items.length, 0);
});

test('T1593.3 — markRead 全部＋指定 ids，冪等', async () => {
  __resetMemNotifications();
  await createNotification({ userId: 'u1', type: 'order_status', title: 'a' });
  await createNotification({ userId: 'u1', type: 'order_status', title: 'b' });
  const before = await listNotificationsDb({ userId: 'u1' });
  const firstId = before.items[0].id;
  // 標一筆
  assert.equal((await markNotificationsReadDb({ userId: 'u1', ids: [firstId] })).updated, 1);
  assert.equal((await listNotificationsDb({ userId: 'u1' })).unreadCount, 1);
  // 全部標
  assert.equal((await markNotificationsReadDb({ userId: 'u1' })).updated, 1);
  assert.equal((await listNotificationsDb({ userId: 'u1' })).unreadCount, 0);
  // 冪等：再標 0 筆
  assert.equal((await markNotificationsReadDb({ userId: 'u1' })).updated, 0);
});

test('T1593.4 — route source-contract：GET 列表/未讀、POST 標已讀、strangler 不進 db.mjs', () => {
  const listRoute = read('app/api/me/notifications/route.ts');
  const readRoute = read('app/api/me/notifications/read/route.ts');
  assert.match(listRoute, /listNotificationsDb/);
  assert.match(readRoute, /markNotificationsReadDb/);
  assert.match(readRoute, /validateCsrf/, 'read 應驗 CSRF');
  const dbSrc = read('src/lib/db.mjs');
  assert.ok(!/createNotification|listNotificationsDb/.test(dbSrc), '通知邏輯不得寫進 db.mjs');
});
