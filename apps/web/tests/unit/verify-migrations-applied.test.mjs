// 通用 migration-applied 檢查：SQL 解析 + 涵蓋已知 migration 物件。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMigrationObjects,
  collectExpectedObjects,
} from '../../../../scripts/verify-migrations-applied.mjs';

test('parseMigrationObjects：解析多欄位 ADD COLUMN + CREATE TABLE，略過非 public', () => {
  const sql = `
    -- comment with ADD COLUMN fake_col 不應被當真
    CREATE TABLE IF NOT EXISTS public.foo ( id uuid );
    ALTER TABLE public.orders
      ADD COLUMN IF NOT EXISTS payment_deadline_at timestamptz,
      ADD COLUMN IF NOT EXISTS another_col text;
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS should_skip text;
  `;
  const { tables, columns } = parseMigrationObjects(sql);
  assert.ok(tables.has('foo'));
  const keys = columns.map((c) => `${c.table}.${c.column}`);
  assert.ok(keys.includes('orders.payment_deadline_at'));
  assert.ok(keys.includes('orders.another_col'));
  // 非 public schema 的 alter 不納入
  assert.ok(!keys.some((k) => k.startsWith('users.')));
  // 註解內的字不應被解析成欄位
  assert.ok(!keys.some((k) => k.includes('fake_col')));
});

test('collectExpectedObjects：涵蓋本輪新增的關鍵欄位/表', () => {
  const { tables, columns } = collectExpectedObjects();
  const keys = new Set(columns.map((c) => `${c.table}.${c.column}`));
  assert.ok(keys.has('orders.payment_deadline_at'), '應掃到 #1493 的 payment_deadline_at');
  assert.ok(keys.has('bookings.guide_approval_status'), '應掃到 booking_type 的 guide_approval_status');
  assert.ok(tables.includes('guide_slot_conflict_overrides'), '應掃到 conflict overrides 表');
});
