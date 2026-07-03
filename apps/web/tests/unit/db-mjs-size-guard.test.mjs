/**
 * #1570 db.mjs strangler 硬規則 — CI 行數天花板 guard。
 *
 * db.mjs 曾從 4,527 反向增長到 7,155 行（健檢 v2 A1）。本 guard 把當前行數設為
 * 「只能降、不能升」的天花板：新資料存取函式一律進領域檔（db-*.mjs），
 * 每次抽出後把 CEILING 下修到新值。
 *
 * 若你因修 P0 bug 必須在既有 db.mjs 函式內加行而超標 —— 那是唯一該調高 CEILING 的理由，
 * 且應在 PR 說明；預設請優先「抽出領域檔」而非放寬天花板。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_MJS = resolve(__dirname, '../../src/lib/db.mjs');

// 天花板：2026-07-03 首批抽出 KPI 領域檔（db-kpi.mjs）後為 6,986 行。只能降不能升。
const CEILING = 6986;

test('db.mjs 行數不得超過天花板（strangler 硬規則：只能降）', () => {
  const lines = readFileSync(DB_MJS, 'utf8').split('\n').length;
  assert.ok(
    lines <= CEILING,
    `db.mjs 現有 ${lines} 行 > 天花板 ${CEILING}。新資料存取請開領域檔（db-*.mjs），` +
      `不要塞進 db.mjs 單體。詳見 #1570／CLAUDE.md strangler 準則。`
  );
});

test('抽出後應下修天花板（提醒：若已明顯低於天花板，請把 CEILING 調到新值以持續收斂）', () => {
  const lines = readFileSync(DB_MJS, 'utf8').split('\n').length;
  // 容許 200 行緩衝；若低於天花板超過緩衝，代表有抽出但沒同步下修 CEILING。
  assert.ok(
    lines > CEILING - 200,
    `db.mjs 已降到 ${lines} 行（天花板 ${CEILING}）。請把本檔 CEILING 下修到 ${lines} 以鎖住成果。`
  );
});
