/**
 * 20260708005545_revoke_anon_writes_and_default_privs — migration source-contract
 * 靜態檢查（不需 live DB）：確認收斂意圖正確、不誤傷 SELECT、rollback 存在。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIG = path.resolve(__dirname, '../../../../supabase/migrations/20260708005545_revoke_anon_writes_and_default_privs.sql');
const ROLLBACK = path.resolve(__dirname, '../../../../supabase/migrations/20260708005545_revoke_anon_writes_and_default_privs.rollback.sql');

describe('revoke-anon-writes migration — source-contract', () => {
  const sql = fs.readFileSync(MIG, 'utf8');

  it('migration 與 rollback 檔存在', () => {
    assert.ok(fs.existsSync(MIG));
    assert.ok(fs.existsSync(ROLLBACK));
  });

  it('撤 anon 的寫入權（INSERT/UPDATE/DELETE）', () => {
    assert.match(sql, /revoke\s+insert,\s*update,\s*delete[^;]*\bfrom\s+anon/i);
  });

  it('遍歷 public 全部 base table（DO loop + relkind=r）', () => {
    assert.match(sql, /relkind\s*=\s*'r'/i);
    assert.match(sql, /for\s+r\s+in/i);
  });

  it('修 default privileges 防未來新表回歸', () => {
    assert.match(sql, /alter\s+default\s+privileges[^;]*revoke[^;]*from\s+anon/i);
  });

  it('不得撤 anon 的 SELECT（避免誤傷公開目錄讀取）', () => {
    // 本 migration 只動寫入；不應出現 REVOKE SELECT ... FROM anon
    assert.ok(!/revoke\s+select\b[^;]*from\s+anon/i.test(sql), '不得撤 anon SELECT');
    // 也不應出現對業務表的資料寫入
    assert.ok(!/\b(insert\s+into|update\s+\w+\s+set|delete\s+from|truncate\s+table)\b/i.test(sql), '不得含資料寫入');
  });

  it('不含硬編碼憑證', () => {
    assert.ok(!/https:\/\/[a-z]{20,}\.supabase\.co/i.test(sql));
  });

  it('rollback 會把 anon 寫入權發回（對稱）', () => {
    const rb = fs.readFileSync(ROLLBACK, 'utf8');
    assert.match(rb, /grant\s+insert,\s*update,\s*delete[^;]*\bto\s+anon/i);
  });
});
