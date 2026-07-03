/**
 * Guide Shop 事件 allowlist 契約測試（source-contract）
 *
 * 背景：事件名稱有雙 allowlist——
 *   1. src/lib/events.ts 的 EventName union（型別層）
 *   2. app/api/events/route.ts 的 VALID_EVENTS 陣列（runtime 層）
 * 只加前者、漏加後者時，事件會被 route 以 `unknown event` 靜默丟棄，
 * 前端 track() 又永遠拿到 200，完全不會察覺。此測試鎖住三個 shop 事件
 * 在兩處都存在。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..', '..');

const eventsLibSource = readFileSync(path.join(webRoot, 'src/lib/events.ts'), 'utf8');
const eventsRouteSource = readFileSync(path.join(webRoot, 'app/api/events/route.ts'), 'utf8');

const SHOP_EVENTS = ['shop_view', 'shop_begin_booking', 'shop_share'];

test('events.ts EventName union 含三個 shop 事件', () => {
  for (const name of SHOP_EVENTS) {
    assert.match(
      eventsLibSource,
      new RegExp(`\\|\\s*'${name}'`),
      `EventName union 缺 '${name}'`
    );
  }
});

test('events.ts TrackEventPayload union 含三個 shop 事件 payload', () => {
  for (const name of SHOP_EVENTS) {
    assert.match(
      eventsLibSource,
      new RegExp(`event_name:\\s*'${name}'`),
      `TrackEventPayload union 缺 '${name}'`
    );
  }
});

test('api/events route 的 VALID_EVENTS 含三個 shop 事件（否則 runtime 靜默丟棄）', () => {
  const validEventsMatch = eventsRouteSource.match(
    /const VALID_EVENTS[^=]*=\s*\[([\s\S]*?)\]/
  );
  assert.ok(validEventsMatch, '找不到 VALID_EVENTS 陣列');
  const validEventsBlock = validEventsMatch[1];
  for (const name of SHOP_EVENTS) {
    assert.match(
      validEventsBlock,
      new RegExp(`'${name}'`),
      `VALID_EVENTS 缺 '${name}'——事件會被 unknown event 靜默丟棄`
    );
  }
});

test('shop 事件 properties 介面帶 guide_slug（看板依 guide 聚合的前提）', () => {
  assert.match(eventsLibSource, /ShopViewProperties[\s\S]*?guide_slug:\s*string/, 'ShopViewProperties 缺 guide_slug');
  assert.match(eventsLibSource, /ShopBeginBookingProperties[\s\S]*?guide_slug:\s*string/, 'ShopBeginBookingProperties 缺 guide_slug');
  assert.match(eventsLibSource, /ShopShareProperties[\s\S]*?guide_slug:\s*string/, 'ShopShareProperties 缺 guide_slug');
  assert.match(eventsLibSource, /ShopShareProperties[\s\S]*?method:\s*'copy'\s*\|\s*'line'\s*\|\s*'qr'/, 'ShopShareProperties.method 應為 copy|line|qr');
});
