/**
 * 20260710121345_pin_payment_callback_search_path — migration source-contract
 * 靜態檢查（不需 live DB）：確認固定的是正確函式與正確 search_path，rollback 對稱。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIG = path.resolve(__dirname, '../../../../supabase/migrations/20260710121345_pin_payment_callback_search_path.sql');
const ROLLBACK = path.resolve(__dirname, '../../../../supabase/migrations/20260710121345_pin_payment_callback_search_path.rollback.sql');

describe('pin-payment-callback-search-path migration — source-contract', () => {
  const sql = fs.readFileSync(MIG, 'utf8');

  it('migration 與 rollback 檔存在', () => {
    assert.ok(fs.existsSync(MIG));
    assert.ok(fs.existsSync(ROLLBACK));
  });

  it('ALTER 正確函式（6-arg 簽章）並固定 search_path 為 pg_catalog,public,pg_temp', () => {
    assert.match(sql, /alter\s+function\s+public\.fn_process_payment_callback_atomic\s*\(\s*uuid\s*,\s*text\s*,\s*text\s*,\s*jsonb\s*,\s*text\s*,\s*text\s*\)/i);
    assert.match(sql, /set\s+search_path\s*=\s*pg_catalog\s*,\s*public\s*,\s*pg_temp/i);
  });

  it('只固定 search_path，不改函式定義（不得 create/drop function、不動資料）', () => {
    assert.ok(!/create\s+or\s+replace\s+function/i.test(sql), '不得重建函式');
    assert.ok(!/drop\s+function/i.test(sql), '不得 drop 函式');
    assert.ok(!/\b(insert\s+into|update\s+\w+\s+set|delete\s+from)\b/i.test(sql), '不得動資料');
  });

  it('rollback 對稱：RESET search_path', () => {
    const rb = fs.readFileSync(ROLLBACK, 'utf8');
    assert.match(rb, /alter\s+function\s+public\.fn_process_payment_callback_atomic/i);
    assert.match(rb, /reset\s+search_path/i);
  });
});
