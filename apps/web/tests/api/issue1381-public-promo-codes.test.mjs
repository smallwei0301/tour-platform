/**
 * Issue #1381 — Promo code 旅客端曝光
 *
 * AC1: admin 可標記 is_public（+ 公開文案 public_label）
 * AC2: 公開 API 只回有效碼；非公開碼/內部統計不洩漏
 * AC4: 過期/用罄自動排除
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { selectPublicPromoCodes } from '../../src/lib/public-promo-codes.mjs';

// cwd 無關的路徑基準（run-checks.sh 從 repo root 跑、npm test 從 apps/web 跑皆可）
const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const NOW = '2026-06-11T00:00:00.000Z';

function row(overrides = {}) {
  return {
    code: 'WELCOME10',
    discount_type: 'percentage',
    discount_value: 10,
    max_uses: 100,
    used_count: 0,
    expires_at: '2026-12-31T00:00:00.000Z',
    active: true,
    is_public: true,
    public_label: '新客 9 折',
    ...overrides,
  };
}

test('AC2: 只回公開+active 的碼，輸出不含內部統計欄位', () => {
  const out = selectPublicPromoCodes(
    [row(), row({ code: 'SECRET', is_public: false }), row({ code: 'OFF', active: false })],
    NOW
  );
  assert.equal(out.length, 1);
  const item = out[0];
  assert.equal(item.code, 'WELCOME10');
  assert.equal(item.discountType, 'percentage');
  assert.equal(item.discountValue, 10);
  assert.equal(item.label, '新客 9 折');
  for (const leaked of ['used_count', 'usedCount', 'max_uses', 'maxUses', 'per_user_limit']) {
    assert.ok(!(leaked in item), `不得洩漏 ${leaked}`);
  }
});

test('AC4: 過期碼排除（expires_at <= now）；無期限碼保留', () => {
  const out = selectPublicPromoCodes(
    [
      row({ code: 'EXPIRED', expires_at: '2026-06-10T00:00:00.000Z' }),
      row({ code: 'FOREVER', expires_at: null }),
    ],
    NOW
  );
  assert.deepEqual(out.map((c) => c.code), ['FOREVER']);
});

test('AC4: 用罄碼排除（used_count >= max_uses）；max_uses<=0 視為不限量', () => {
  const out = selectPublicPromoCodes(
    [
      row({ code: 'SOLDOUT', max_uses: 5, used_count: 5 }),
      row({ code: 'ALMOST', max_uses: 5, used_count: 4 }),
      row({ code: 'UNLIMITED', max_uses: 0, used_count: 999 }),
    ],
    NOW
  );
  assert.deepEqual(out.map((c) => c.code), ['ALMOST', 'UNLIMITED']);
});

test('label fallback：無 public_label 時以折扣內容組預設文案', () => {
  const out = selectPublicPromoCodes([row({ public_label: null })], NOW);
  assert.ok(out[0].label, '應有 fallback 文案');
});

// ── source-contract ─────────────────────────────────────────────────────────

test('AC1: migration 新增 is_public / public_label（timestamp 命名）', () => {
  const dir = path.resolve(WEB_ROOT, '../../supabase/migrations');
  const fname = '20260611_issue1381_promo_public_exposure.sql';
  assert.ok(existsSync(path.join(dir, fname)), `${fname} 應存在`);
  const sql = readFileSync(path.join(dir, fname), 'utf8');
  assert.match(sql, /is_public/);
  assert.match(sql, /public_label/);
  assert.match(sql, /IF NOT EXISTS/i, '應為 idempotent DDL');
});

test('AC1: admin create/update route 支援 is_public 與 public_label', () => {
  const createSrc = readFileSync(path.resolve(WEB_ROOT, 'app/api/admin/promo-codes/route.ts'), 'utf8');
  const updateSrc = readFileSync(path.resolve(WEB_ROOT, 'app/api/admin/promo-codes/[id]/route.ts'), 'utf8');
  assert.match(createSrc, /is_public/, 'POST 應寫入 is_public');
  assert.match(createSrc, /public_label/, 'POST 應寫入 public_label');
  assert.match(updateSrc, /is_public/, 'PATCH 應可更新 is_public');
  assert.match(updateSrc, /public_label/, 'PATCH 應可更新 public_label');
});

test('AC2: public route 存在、用 helper、無 Supabase env 時回空清單', () => {
  const routePath = path.resolve(WEB_ROOT, 'app/api/promo-codes/public/route.ts');
  assert.ok(existsSync(routePath), 'GET /api/promo-codes/public route 應存在');
  const src = readFileSync(routePath, 'utf8');
  assert.match(src, /selectPublicPromoCodes/, '應用統一 helper 過濾');
  assert.match(src, /hasSupabaseEnv/, '無 env 應走 fallback（空清單）');
  assert.ok(!/used_count[^,)]*ok\(/.test(src), '回應不得帶內部統計');
});
