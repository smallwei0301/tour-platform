import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthGrid } from '../../src/lib/midao-calendar-grid.mjs';

function fakeMonth(prefix, n) {
  return Array.from({ length: n }, (_, i) => ({ date: `${prefix}-${String(i + 1).padStart(2, '0')}` }));
}

test('2026-08：8/1 是週六 → 首週前五格 null，共 6 週', () => {
  const grid = buildMonthGrid(fakeMonth('2026-08', 31));
  assert.equal(grid.length, 6);
  assert.deepEqual(grid[0].slice(0, 5), [null, null, null, null, null]);
  assert.equal(grid[0][5].date, '2026-08-01'); // 週六欄（Monday-first index 5）
  assert.equal(grid[0][6].date, '2026-08-02'); // 週日
  assert.equal(grid[5].filter(Boolean).length, 1); // 8/31 週一獨佔末週
  assert.equal(grid[5][0].date, '2026-08-31');
});

test('每週恰 7 格且日期連續不重複', () => {
  const grid = buildMonthGrid(fakeMonth('2026-09', 30));
  assert.ok(grid.every((w) => w.length === 7));
  const dates = grid.flat().filter(Boolean).map((d) => d.date);
  assert.equal(new Set(dates).size, 30);
});
