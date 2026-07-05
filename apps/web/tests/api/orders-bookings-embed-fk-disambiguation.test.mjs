/**
 * settlement-sweep 2026-07-03 production 500 —
 * orders↔bookings 雙 FK 造成 PostgREST PGRST201 embed 歧義。
 *
 * 背景：#1560 後 orders↔bookings 之間有兩條 FK
 *   - fk_bookings_order_id：bookings.order_id → orders.id（legacy 起即存在）
 *   - orders_booking_id_fkey / fk_orders_booking_id：orders.booking_id → bookings.id（V2）
 * 未指名 FK 的 `bookings(...)` / `orders(...)` 嵌入在 production 會回
 * 「Could not embed because more than one relationship was found for 'orders'
 * and 'bookings'」→ 500。#1554 已修 db-auto-complete.mjs，本檔鎖定其餘四處
 * 同病的 select（settlement sweep、pre-tour reminder sweep、guide trip-report、
 * db.mjs listGuidePendingApprovalsDb），一律指名 fk_bookings_order_id
 * （與加第二條 FK 前 PostgREST 的唯一解相同，行為不變）。
 *
 * in-memory fallback 測不到 PostgREST 解析，故用 source-contract 鎖定。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// 未指名 FK 的 orders→bookings 嵌入：前一字元不是 `!`、字母或 `_`（排除
// `bookings!fk_…`、`existingBookings(` 之類識別字），後面直接開括號。
// 允許 `bookings (` 這種 select 模板字串裡帶空白的寫法。
const UNNAMED_BOOKINGS_EMBED = /[^!\w.]bookings\s*\(/;

describe('orders↔bookings 嵌入必須指名 FK（防 PGRST201 歧義 500）', () => {
  it('settlement sweep：bookings 嵌入指名 fk_bookings_order_id', () => {
    const src = read('app/api/internal/settlement/sweep/route.ts');
    assert.match(
      src,
      /bookings!fk_bookings_order_id\(/,
      'settlement sweep 的 orders select 必須用 bookings!fk_bookings_order_id(…)',
    );
    assert.ok(
      !UNNAMED_BOOKINGS_EMBED.test(src),
      '不得殘留未指名 FK 的 bookings(...) 嵌入（production PGRST201 → sweep 全掛）',
    );
  });

  it('pre-tour reminder sweep：bookings 嵌入指名 fk_bookings_order_id', () => {
    const src = read('app/api/internal/reminders/pre-tour-sweep/route.ts');
    assert.match(
      src,
      /bookings!fk_bookings_order_id\s*\(/,
      'pre-tour sweep 的 orders select 必須用 bookings!fk_bookings_order_id(…)',
    );
    assert.ok(
      !UNNAMED_BOOKINGS_EMBED.test(src),
      '不得殘留未指名 FK 的 bookings(...) 嵌入（查詢錯誤會被 continue 吃掉、提醒靜默漏發）',
    );
  });

  it('guide trip-report：bookings 嵌入指名 fk_bookings_order_id', () => {
    const src = read('app/api/v2/guide/orders/[orderId]/trip-report/route.ts');
    assert.match(
      src,
      /bookings!fk_bookings_order_id\(/,
      'trip-report 的 orders select 必須用 bookings!fk_bookings_order_id(…)',
    );
    assert.ok(
      !UNNAMED_BOOKINGS_EMBED.test(src),
      '不得殘留未指名 FK 的 bookings(...) 嵌入（PGRST201 會讓回報一律 404）',
    );
  });

  it('db.mjs listGuidePendingApprovalsDb：orders 嵌入指名 fk_bookings_order_id', () => {
    const src = ['src/lib/db.mjs','src/lib/db-reschedule.mjs','src/lib/db-order-messages.mjs','src/lib/db-booking-approvals.mjs','src/lib/db-settlement-ops.mjs'].map(read).join('\n'); // #1613：嵌入掃描涵蓋拆出的領域檔
    assert.match(
      src,
      /orders!fk_bookings_order_id\(contact_name, total_twd\)/,
      'bookings select 的 orders 嵌入必須用 orders!fk_bookings_order_id(…)',
    );
    assert.ok(
      !/'orders\(contact_name, total_twd\)'/.test(src),
      '不得殘留未指名 FK 的 orders(contact_name, total_twd) 嵌入',
    );
  });
});
