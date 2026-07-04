/**
 * Issue #1597 — `.mjs` 核心檔 @ts-check 漸進納管（第一批）source-contract。
 *
 * 第一批：小而關鍵、已有完整測試的 4 檔納入 tsc --noEmit（頂部 @ts-check）。
 * db-* 領域檔（db-auto-complete/db-kpi/db-redeem/db-guide-delete）error 量較大，
 * 列第二批逐步納管（見 #1597 追蹤）。本測試鎖住第一批不倒退。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const BATCH1 = [
  'src/lib/refund-transition.mjs',
  'src/lib/audit-log.mjs',
  'src/lib/constant-time.mjs',
  'src/lib/voucher-token.mjs',
];

test('T1597.1 — 第一批 4 檔頂部帶 // @ts-check', () => {
  for (const rel of BATCH1) {
    const firstLine = readFileSync(path.join(ROOT, rel), 'utf8').split('\n')[0].trim();
    assert.equal(firstLine, '// @ts-check', `${rel} 首行應為 // @ts-check`);
  }
});
