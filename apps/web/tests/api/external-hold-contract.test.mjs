import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(__dirname, '../../../..');

async function readWeb(relPath) {
  return readFile(path.join(WEB_ROOT, relPath), 'utf8');
}
async function readRepo(relPath) {
  return readFile(path.join(REPO_ROOT, relPath), 'utf8');
}

const MIGRATION = 'supabase/migrations/20260624140000_external_hold_source_and_rpc.sql';

test('capacity-hold 狀態集合納入 external_hold，但不算 formed', async () => {
  const src = await readWeb('src/lib/availability-v2/group-booking-rule.ts');
  // external_hold 必須計入 capacity hold（佔名額）
  assert.match(src, /CAPACITY_HOLD_BOOKING_STATUSES[\s\S]*'external_hold'/);
  // 但 FORMED_GROUP_BOOKING_STATUSES 不得包含 external_hold（外部佔位不算成團）
  const formedBlock = src.match(/FORMED_GROUP_BOOKING_STATUSES = \[([\s\S]*?)\]/);
  assert.ok(formedBlock, 'FORMED_GROUP_BOOKING_STATUSES block present');
  assert.doesNotMatch(formedBlock[1], /external_hold/);
});

test('migration：放寬 source_channel / status 約束並新增 schedule_id', async () => {
  const sql = await readRepo(MIGRATION);
  assert.match(sql, /bookings_source_channel_check[\s\S]*'web', 'line', 'admin_pos', 'external'/);
  assert.match(sql, /orders_source_channel_check[\s\S]*'web', 'line', 'admin_pos', 'external'/);
  assert.match(sql, /bookings_status_check[\s\S]*'external_hold'/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES activity_schedules\(id\)/);
});

test('migration：fn_create_external_hold 原子扣量 + 建 booking（重用 fn_book_schedule）', async () => {
  const sql = await readRepo(MIGRATION);
  assert.match(sql, /CREATE OR REPLACE FUNCTION fn_create_external_hold/);
  // 鎖定場次 + ownership 驗證
  assert.match(sql, /FROM activity_schedules\s+WHERE id = p_schedule_id\s+FOR UPDATE/);
  assert.match(sql, /v_activity_guide_id <> p_guide_id[\s\S]*'forbidden'/);
  // 透過既有原子函式扣量
  assert.match(sql, /fn_book_schedule\(p_schedule_id, p_count\)/);
  // 扣量失敗則直接回傳、不建立 booking（避免孤兒佔位的另一面）
  assert.match(sql, /NOT COALESCE\(\(v_book_result->>'ok'\)::boolean, false\)[\s\S]*RETURN v_book_result/);
  // 建 external_hold booking，含 schedule_id 以利釋放
  assert.match(sql, /source_channel[\s\S]*'external'[\s\S]*'external_hold'/);
  assert.match(sql, /INSERT INTO booking_status_logs/);
});

test('migration：fn_release_external_hold 退量 + 標記 cancelled，僅限自己的 external_hold', async () => {
  const sql = await readRepo(MIGRATION);
  assert.match(sql, /CREATE OR REPLACE FUNCTION fn_release_external_hold/);
  assert.match(sql, /status <> 'external_hold' OR v_booking\.source_channel <> 'external'[\s\S]*'not_external_hold'/);
  assert.match(sql, /v_booking\.guide_id <> p_guide_id[\s\S]*'forbidden'/);
  assert.match(sql, /fn_cancel_booking\(v_booking\.schedule_id, v_booking\.participants\)/);
  assert.match(sql, /SET status = 'cancelled', cancelled_at = now\(\)/);
});

test('POST route：CSRF + guide session + ownership + 容量預檢 + 原子 RPC', async () => {
  const src = await readWeb('app/api/guide/schedules/[scheduleId]/external-holds/route.ts');
  assert.match(src, /export\s+async\s+function\s+POST\s*\(/);
  assert.match(src, /validateCsrf\(req\)/);
  assert.match(src, /verifyGuideSession\(req\)/);
  // ownership：activity.guide_id 必須等於 session.guideId
  assert.match(src, /activity\.guide_id !== session\.guideId/);
  // 容量預檢用純函式（鏡像 SQL）
  assert.match(src, /evaluateExternalHoldRequest\(/);
  // 解析 activity_plans uuid 使外部佔位落在同一群組容量池
  assert.match(src, /resolveBookingPlan\(/);
  // 原子 RPC
  assert.match(src, /\.rpc\('fn_create_external_hold'/);
  assert.match(src, /status:\s*201/);
});

test('DELETE route：CSRF + guide session + 原子釋放 RPC', async () => {
  const src = await readWeb('app/api/guide/schedules/[scheduleId]/external-holds/[holdId]/route.ts');
  assert.match(src, /export\s+async\s+function\s+DELETE\s*\(/);
  assert.match(src, /validateCsrf\(req\)/);
  assert.match(src, /verifyGuideSession\(req\)/);
  assert.match(src, /\.rpc\('fn_release_external_hold'/);
});

test('GET schedules route：帶出 externalHoldCount / externalHolds 供後台呈現與釋放', async () => {
  const src = await readWeb('app/api/guide/schedules/route.ts');
  assert.match(src, /\.eq\('status', 'external_hold'\)/);
  assert.match(src, /externalHoldCount/);
  assert.match(src, /externalHolds/);
});

test('guide schedules page：提供登記/釋放外部佔位的操作', async () => {
  const src = await readWeb('app/(non-locale)/guide/schedules/page.tsx');
  assert.match(src, /addExternalHold/);
  assert.match(src, /releaseExternalHold/);
  assert.match(src, /\/external-holds/);
  assert.match(src, /method: 'POST'/);
  assert.match(src, /method: 'DELETE'/);
});
