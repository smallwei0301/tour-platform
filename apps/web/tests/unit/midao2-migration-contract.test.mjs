import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.resolve(__dirname, '../../../../supabase/migrations');

test('midao2 migration A：三張新表＋索引＋RLS 齊備', async () => {
  const sql = await readFile(
    path.join(MIGRATIONS, '20260722100000_midao2_requests_availability.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS midao_requests/);
  assert.match(sql, /request_no\s+text\s+UNIQUE NOT NULL/);
  assert.match(sql, /CHECK \(status IN \('new','pending_reply','replied','closed_won','closed_done'\)\)/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS midao_availability_defaults/);
  assert.match(sql, /UNIQUE \(guide_id, weekday, period\)/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS midao_day_overrides/);
  assert.match(sql, /WHERE period <> 'custom'/);
  assert.match(sql, /ALTER TABLE midao_requests\s+ENABLE ROW LEVEL SECURITY/);
});

test('midao2 migration B：activities/guide_profiles 加欄齊備', async () => {
  const sql = await readFile(
    path.join(MIGRATIONS, '20260722100500_midao2_activity_showcase_columns.sql'), 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS midao_status text/);
  assert.match(sql, /CHECK \(midao_deal_mode IN \('instant_booking','confirm_first','line_inquiry'\)\)/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS midao_questions jsonb NOT NULL DEFAULT '\[\]'/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS languages jsonb/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS midao_sort_order integer/);
  assert.match(sql, /ALTER TABLE guide_profiles ADD COLUMN IF NOT EXISTS experience_years integer/);
});

test('midao2 migration C：midao_requests 方案欄位齊備', async () => {
  const sql = await readFile(
    path.join(MIGRATIONS, '20260723090000_midao2_request_plan_columns.sql'), 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES activity_plans\(id\)/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS plan_title_snapshot text/);
});
