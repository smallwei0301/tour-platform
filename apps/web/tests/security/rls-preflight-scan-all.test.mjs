/**
 * rls-preflight 全表掃描（scan_all）— 單元＋契約測試（不需 live Supabase）
 *
 * 核心是純函式 classifyScanRow：把 rls_preflight_scan 的一列判成違規。
 * 另做 migration source-contract：RPC 為 SECURITY DEFINER、固定 search_path、
 * EXECUTE 只給 service_role；rollback 存在。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyScanRow } from '../../../../scripts/security/rls-grants-preflight.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIG = path.resolve(__dirname, '../../../../supabase/migrations/20260707081500_rls_preflight_scan_rpc.sql');
const ROLLBACK = path.resolve(__dirname, '../../../../supabase/migrations/20260707081500_rls_preflight_scan_rpc.rollback.sql');

describe('classifyScanRow（純函式）', () => {
  it('RLS 未啟用 → rls_disabled', () => {
    const v = classifyScanRow({ table_name: 'orders', rls_enabled: false, forbidden_write_grantees: [] });
    assert.equal(v.length, 1);
    assert.equal(v[0].violation, 'rls_disabled');
    assert.equal(v[0].table, 'orders');
  });

  it('有 anon 寫入權 → broad_write_grant', () => {
    const v = classifyScanRow({ table_name: 'orders', rls_enabled: true, forbidden_write_grantees: ['anon'] });
    assert.equal(v.length, 1);
    assert.equal(v[0].violation, 'broad_write_grant');
    assert.deepEqual(v[0].grantees, ['anon']);
  });

  it('RLS 開啟且無 anon 寫入 → 無違規', () => {
    const v = classifyScanRow({ table_name: 'orders', rls_enabled: true, forbidden_write_grantees: [] });
    assert.equal(v.length, 0);
  });

  it('兩個問題同時 → 兩個違規', () => {
    const v = classifyScanRow({ table_name: 'x', rls_enabled: false, forbidden_write_grantees: ['anon', 'PUBLIC'] });
    assert.equal(v.length, 2);
    assert.deepEqual(v.map((x) => x.violation).sort(), ['broad_write_grant', 'rls_disabled']);
  });

  it('容錯：forbidden_write_grantees 非陣列不炸', () => {
    const v = classifyScanRow({ table_name: 'x', rls_enabled: true, forbidden_write_grantees: null });
    assert.equal(v.length, 0);
  });
});

describe('rls_preflight_scan migration — source-contract', () => {
  it('migration 與 rollback 檔存在', () => {
    assert.ok(fs.existsSync(MIG), `缺 migration: ${MIG}`);
    assert.ok(fs.existsSync(ROLLBACK), `缺 rollback: ${ROLLBACK}`);
  });

  it('RPC 為 SECURITY DEFINER 且固定 search_path', () => {
    const sql = fs.readFileSync(MIG, 'utf8');
    assert.match(sql, /create\s+or\s+replace\s+function\s+public\.rls_preflight_scan/i);
    assert.match(sql, /security\s+definer/i);
    assert.match(sql, /set\s+search_path\s*=\s*pg_catalog\s*,\s*public\s*,\s*pg_temp/i);
  });

  it('EXECUTE 從 public/anon/authenticated 撤除、只給 service_role', () => {
    const sql = fs.readFileSync(MIG, 'utf8');
    assert.match(sql, /revoke\s+execute\s+on\s+function\s+public\.rls_preflight_scan\(\)\s+from\s+public,\s*anon,\s*authenticated/i);
    assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.rls_preflight_scan\(\)\s+to\s+service_role/i);
  });

  it('唯讀：不含寫入/DDL 對資料表的動作（只讀系統目錄）', () => {
    const sql = fs.readFileSync(MIG, 'utf8').toLowerCase();
    // 不得對業務表 insert/update/delete/alter/drop（drop function 在 rollback，不在此檔）
    assert.ok(!/\b(insert\s+into|update\s+\w+\s+set|delete\s+from|truncate)\b/.test(sql), '不得含資料寫入');
  });

  it('rollback 只 drop function', () => {
    const sql = fs.readFileSync(ROLLBACK, 'utf8');
    assert.match(sql, /drop\s+function\s+if\s+exists\s+public\.rls_preflight_scan/i);
  });
});
