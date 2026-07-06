/**
 * anon-rls-probe — 單元＋契約測試（不需 live Supabase）
 *
 * 核心是純分類函式 classifyProbe：把一次 anon SELECT 的結果判為 leak/exposed/denied。
 * 另做 source-contract：唯讀（無寫入動詞）、不列公開表、由 env 取 anon key、--help/env-missing 行為。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classifyProbe, isFail } from '../../../../scripts/security/anon-rls-probe.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '../../../../scripts/security/anon-rls-probe.mjs');

describe('anon-rls-probe classifyProbe（純函式）', () => {
  it('讀到 >=1 筆 → leak（FAIL）', () => {
    const v = classifyProbe({ error: null, data: [{ id: 1 }] });
    assert.equal(v.status, 'leak');
    assert.equal(v.rows, 1);
    assert.equal(isFail(v.status), true);
  });

  it('多筆 → leak，rows 反映筆數', () => {
    const v = classifyProbe({ error: null, data: [{}, {}, {}] });
    assert.equal(v.status, 'leak');
    assert.equal(v.rows, 3);
  });

  it('有 error（permission denied）→ denied（PASS）', () => {
    const v = classifyProbe({ error: { code: '42501', message: 'permission denied' }, data: null });
    assert.equal(v.status, 'denied');
    assert.equal(isFail(v.status), false);
  });

  it('無 error 但 0 筆 → exposed（FAIL，涵蓋 cold-start 空表仍被授權）', () => {
    const v = classifyProbe({ error: null, data: [] });
    assert.equal(v.status, 'exposed');
    assert.equal(isFail(v.status), true);
  });

  it('error 優先於空 data', () => {
    const v = classifyProbe({ error: { message: 'RLS' }, data: [] });
    assert.equal(v.status, 'denied');
  });
});

describe('anon-rls-probe source-contract', () => {
  const source = fs.readFileSync(SCRIPT_PATH, 'utf8');

  it('唯讀：腳本不得含寫入/DDL 動詞（insert/update/delete/upsert/rpc 寫入）', () => {
    // 只允許 .select(...)；不得出現 .insert(/.update(/.delete(/.upsert(
    assert.ok(!/\.insert\s*\(/.test(source), '不得有 .insert(');
    assert.ok(!/\.update\s*\(/.test(source), '不得有 .update(');
    assert.ok(!/\.delete\s*\(/.test(source), '不得有 .delete(');
    assert.ok(!/\.upsert\s*\(/.test(source), '不得有 .upsert(');
  });

  it('用 anon key（SUPABASE_ANON_KEY），不是 service key', () => {
    assert.match(source, /process\.env\.SUPABASE_ANON_KEY/, '必須讀 SUPABASE_ANON_KEY');
    assert.ok(!/SERVICE_ROLE_KEY/.test(source), '不得使用 service role key');
  });

  it('公開目錄表不得列入 SENSITIVE_TABLES（避免誤報）', () => {
    const m = source.match(/const\s+SENSITIVE_TABLES\s*=\s*\[([^\]]+)\]/s);
    assert.ok(m, 'SENSITIVE_TABLES 必須存在');
    const body = m[1];
    for (const publicTable of ['activities', 'guide_profiles', 'activity_plans', 'experiences']) {
      assert.ok(!body.includes(`'${publicTable}'`), `${publicTable} 是公開表，不得列入`);
    }
  });

  it('必含 #1563 外洩主角 users 與 orders', () => {
    const m = source.match(/const\s+SENSITIVE_TABLES\s*=\s*\[([^\]]+)\]/s);
    const body = m[1];
    for (const t of ['users', 'orders', 'refund_requests', 'payments']) {
      assert.ok(body.includes(`'${t}'`), `SENSITIVE_TABLES 必須含 ${t}`);
    }
  });

  it('不含硬編碼憑證', () => {
    assert.ok(!/https:\/\/[a-z]{20,}\.supabase\.co/i.test(source), '不得有真實 Supabase URL');
    assert.ok(!/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(source), '不得有 JWT');
  });

  it('--help exit 0 並提到 anon key', () => {
    const r = spawnSync(process.execPath, [SCRIPT_PATH, '--help'], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /SUPABASE_ANON_KEY/);
  });

  it('缺 env → exit 非 0', () => {
    const env = { ...process.env };
    delete env.SUPABASE_URL; delete env.SUPABASE_ANON_KEY;
    const r = spawnSync(process.execPath, [SCRIPT_PATH], { env, encoding: 'utf8', timeout: 10_000 });
    assert.notEqual(r.status, 0);
  });
});
