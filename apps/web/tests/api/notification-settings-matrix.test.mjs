import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  NOTIFY_EVENTS,
  NOTIFY_RECIPIENTS,
  NOTIFY_CHANNELS,
  getNotificationMatrix,
  isNotifyEnabled,
  setNotificationCells,
  __resetNotificationSettingsForTest,
} from '../../src/lib/notification-settings.mjs';

// 後台通知矩陣 gateway 契約（#920 後台勾選需求）。
// 維度：事件 × 對象(traveler/guide/admin) × 通道(line/telegram)。
// 預設全開（保留現有派送行為）；後台關閉某格 → isNotifyEnabled 該格 false。
// 不帶 SUPABASE_URL 時走 in-memory fallback（store.mjs notificationSettings）。

test('矩陣維度常數涵蓋 5 事件 × 3 對象 × 2 通道', () => {
  assert.deepEqual(NOTIFY_EVENTS, [
    'new_order',
    'payment_received',
    'order_cancelled',
    'refund_requested',
    'refund_executed',
  ]);
  assert.deepEqual(NOTIFY_RECIPIENTS, ['traveler', 'guide', 'admin']);
  assert.deepEqual(NOTIFY_CHANNELS, ['line', 'telegram']);
});

test('預設全開：未設定時每一格都回 true', async () => {
  __resetNotificationSettingsForTest();
  for (const event of NOTIFY_EVENTS) {
    for (const recipient of NOTIFY_RECIPIENTS) {
      for (const channel of NOTIFY_CHANNELS) {
        assert.equal(
          await isNotifyEnabled(event, recipient, channel),
          true,
          `${event}/${recipient}/${channel} 預設應為 true`,
        );
      }
    }
  }
});

test('getNotificationMatrix：回傳完整矩陣（預設全 true）', async () => {
  __resetNotificationSettingsForTest();
  const matrix = await getNotificationMatrix();
  assert.equal(matrix.new_order.traveler.line, true);
  assert.equal(matrix.refund_executed.admin.telegram, true);
});

test('setNotificationCells：關閉某格 → 只有該格變 false，其他維持 true', async () => {
  __resetNotificationSettingsForTest();
  await setNotificationCells(
    [{ event: 'order_cancelled', recipient: 'traveler', channel: 'line', enabled: false }],
    { actor: 'admin-test' },
  );

  assert.equal(await isNotifyEnabled('order_cancelled', 'traveler', 'line'), false);
  // 同事件其他通道 / 對象不受影響
  assert.equal(await isNotifyEnabled('order_cancelled', 'traveler', 'telegram'), true);
  assert.equal(await isNotifyEnabled('order_cancelled', 'guide', 'line'), true);
  // 其他事件不受影響
  assert.equal(await isNotifyEnabled('new_order', 'traveler', 'line'), true);
});

test('setNotificationCells：可一次更新多格，且可重新開啟', async () => {
  __resetNotificationSettingsForTest();
  await setNotificationCells([
    { event: 'new_order', recipient: 'guide', channel: 'telegram', enabled: false },
    { event: 'new_order', recipient: 'admin', channel: 'line', enabled: false },
  ], { actor: 'admin-test' });
  assert.equal(await isNotifyEnabled('new_order', 'guide', 'telegram'), false);
  assert.equal(await isNotifyEnabled('new_order', 'admin', 'line'), false);

  await setNotificationCells([
    { event: 'new_order', recipient: 'guide', channel: 'telegram', enabled: true },
  ], { actor: 'admin-test' });
  assert.equal(await isNotifyEnabled('new_order', 'guide', 'telegram'), true);
  assert.equal(await isNotifyEnabled('new_order', 'admin', 'line'), false);
});

test('未知事件/對象/通道 → 預設放行（true，不誤擋未建模的派送）', async () => {
  __resetNotificationSettingsForTest();
  assert.equal(await isNotifyEnabled('unknown_event', 'traveler', 'line'), true);
  assert.equal(await isNotifyEnabled('new_order', 'unknown_recipient', 'line'), true);
});

test('setNotificationCells：忽略不在維度內的格（不寫入垃圾）', async () => {
  __resetNotificationSettingsForTest();
  await setNotificationCells([
    { event: 'not_an_event', recipient: 'traveler', channel: 'line', enabled: false },
  ], { actor: 'admin-test' });
  const matrix = await getNotificationMatrix();
  assert.ok(!matrix.not_an_event, '不應寫入未知事件');
});

test('Supabase 分支：db.mjs 讀寫 notification_event_settings singleton（source-contract）', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const dbSrc = readFileSync(join(here, '..', '..', 'src', 'lib', 'db-messaging-bindings.mjs'), 'utf8'); // #1613 strangler 後實作所在
  assert.match(dbSrc, /getNotificationOverridesDb/, 'db.mjs 應 export getNotificationOverridesDb');
  assert.match(dbSrc, /setNotificationCellsDb/, 'db.mjs 應 export setNotificationCellsDb');
  assert.match(dbSrc, /from\('notification_event_settings'\)/, '應讀寫 notification_event_settings 表');
});
