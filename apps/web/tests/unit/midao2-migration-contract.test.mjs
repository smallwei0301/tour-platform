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
