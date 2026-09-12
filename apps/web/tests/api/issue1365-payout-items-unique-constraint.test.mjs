import { readFileSync, existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Issue #1365 — payout_items.order_id UNIQUE 約束補正 migration source-contract。
 *
 * Live workflow_dispatch settlement-sweep（修掉 raw-subquery 後）回 500：
 *   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
 * 根因：#447 把 UNIQUE(order_id) 寫在 CREATE TABLE IF NOT EXISTS 內部，production
 * 表先前已存在使其變 no-op，約束從未加上，sweep 的 upsert(onConflict:'order_id') 失敗。
 *
 * 鎖定補正 migration：冪等（IF NOT EXISTS 約束守門）、去重保險、ADD CONSTRAINT
 * 名稱與 route 期望（payout_items_order_unique / order_id）一致。
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const MIGRATION = path.resolve(
  REPO_ROOT,
  'supabase/migrations/20260611_issue1365_payout_items_order_unique.sql',
);
const SWEEP_ROUTE = path.resolve(
  __dirname,
  '../../app/api/internal/settlement/sweep/route.ts',
);

describe('#1365 payout_items order_id UNIQUE 補正 migration', () => {
  it('migration 檔存在', () => {
    assert.ok(existsSync(MIGRATION), '預期補正 migration 存在');
  });

  it('冪等補上 UNIQUE(order_id)，且有不存在才 ADD 的守門', () => {
    const src = readFileSync(MIGRATION, 'utf-8');
    assert.match(src, /pg_constraint/, '以 pg_constraint 檢查約束是否已存在');
    assert.match(src, /IF NOT EXISTS/i, '約束已存在時必須是 no-op');
    assert.match(
      src,
      /ADD CONSTRAINT\s+payout_items_order_unique\s+UNIQUE\s*\(\s*order_id\s*\)/i,
      '補上的約束名稱／欄位必須與 route 的 onConflict 期望一致',
    );
  });

  it('ADD CONSTRAINT 前先去重，避免殘列導致補正失敗', () => {
    const src = readFileSync(MIGRATION, 'utf-8');
    const dedupIdx = src.search(/DELETE FROM public\.payout_items/i);
    const addIdx = src.search(/ADD CONSTRAINT\s+payout_items_order_unique/i);
    assert.ok(dedupIdx !== -1, '需有去重保險步驟');
    assert.ok(dedupIdx < addIdx, '去重必須在 ADD CONSTRAINT 之前');
  });

  it('route 的 upsert onConflict 仍指向 order_id（約束名／欄位對齊）', () => {
    const src = readFileSync(SWEEP_ROUTE, 'utf-8');
    assert.match(
      src,
      /\.upsert\([\s\S]*?onConflict:\s*['"]order_id['"][\s\S]*?ignoreDuplicates:\s*true/,
      'sweep 必須仍以 onConflict:order_id + ignoreDuplicates 保冪等',
    );
  });
});
