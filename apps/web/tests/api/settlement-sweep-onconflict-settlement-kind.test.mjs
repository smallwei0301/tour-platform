/**
 * settlement-sweep 2026-07-05 production 500（PGRST201 修好後暴露的第二個 bug）—
 * upsert onConflict 目標與 payout_items 冪等鍵不一致。
 *
 * 背景：#449（migration 20260513_issue449_payout_items_reversal.sql）把 payout_items
 * 的冪等鍵從單欄 `UNIQUE(order_id)` 演進為 `UNIQUE INDEX (order_id, settlement_kind)`
 * 並 DROP 掉舊的 `payout_items_order_unique`，以支援同一 order 的
 * settlement（正值）＋ reversal（負值紅沖）各一列。
 *
 * 但 settlement/sweep 與 db.mjs recordSettlementDb 的 upsert 仍沿用過期的
 * `onConflict: 'order_id'`。#1365 把 sweep 排上 cron 後首次真正執行到 upsert，
 * Postgres 因「找不到對應 order_id 單欄的 unique/exclusion constraint」回
 * 「there is no unique or exclusion constraint matching the ON CONFLICT specification」
 * → 整個 sweep 500。
 *
 * 正解：onConflict 對齊現存 index `(order_id, settlement_kind)`，且 sweep 寫入的
 * 正結算列必須顯式帶 settlement_kind='settlement'（不依賴 DB default，讓 index
 * inference 與紅沖列不互相 ON CONFLICT 誤傷）。
 *
 * production 的 payout_items_order_kind_unique index 已存在（#449＋#622 migration
 * 已 apply），故本修法純程式碼、不需動 schema。source-contract 鎖定防回退。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('settlement sweep upsert onConflict 必須對齊 (order_id, settlement_kind) 複合冪等鍵', () => {
  const routeSrc = read('app/api/internal/settlement/sweep/route.ts');

  it('sweep route upsert 用 onConflict: order_id,settlement_kind（非單欄 order_id）', () => {
    assert.match(
      routeSrc,
      /onConflict:\s*'order_id,\s*settlement_kind'/,
      'sweep 的 payout_items upsert 必須用複合鍵 order_id,settlement_kind（對應 #449 後的 payout_items_order_kind_unique index）',
    );
    assert.ok(
      !/onConflict:\s*'order_id'\s*,/.test(routeSrc),
      "不得殘留過期的單欄 onConflict: 'order_id'（對應的 unique 已被 #449 DROP，會 500）",
    );
  });

  it('sweep route 寫入的正結算列顯式帶 settlement_kind: settlement', () => {
    assert.match(
      routeSrc,
      /settlement_kind:\s*'settlement'/,
      'sweep 寫入 payout_items 的列必須顯式帶 settlement_kind=settlement，才能正確走複合鍵 index inference 而不與 reversal 列衝突',
    );
  });

  it('db.mjs recordSettlementDb upsert 同樣對齊複合鍵（避免未來 caller 踩同一雷）', () => {
    const dbSrc = read('src/lib/db.mjs');
    const fnStart = dbSrc.indexOf('export async function recordSettlementDb');
    assert.ok(fnStart !== -1, 'recordSettlementDb 必須存在');
    const fnEnd = dbSrc.indexOf('\nexport ', fnStart + 1);
    const fnBody = dbSrc.slice(fnStart, fnEnd === -1 ? undefined : fnEnd);
    assert.match(
      fnBody,
      /onConflict:\s*'order_id,\s*settlement_kind'/,
      'recordSettlementDb 的 payout_items upsert 也必須用複合鍵 order_id,settlement_kind',
    );
    assert.ok(
      !/onConflict:\s*'order_id'\s*,/.test(fnBody),
      "recordSettlementDb 不得殘留過期的單欄 onConflict: 'order_id'",
    );
  });
});
