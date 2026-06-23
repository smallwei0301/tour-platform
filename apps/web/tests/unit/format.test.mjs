/**
 * #multilingual Phase 0 — 統一 formatter（src/lib/format.ts）單元測試。
 *
 * 金額固定 NT$/TWD、無小數；日期固定 Asia/Taipei、不因執行機時區漂移。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatPriceTwd,
  formatDateTaipei,
  formatTimeTaipei,
  formatDateTimeTaipei,
} from '../../src/lib/format.ts';

test('formatPriceTwd 千分位、四捨五入到整數', () => {
  assert.equal(formatPriceTwd(1234.6), 'NT$1,235');
  assert.equal(formatPriceTwd(1000), 'NT$1,000');
  assert.equal(formatPriceTwd(0), 'NT$0');
  assert.equal(formatPriceTwd(1234567), 'NT$1,234,567');
});

test('formatPriceTwd 對非有限值回 NT$0（防呆）', () => {
  assert.equal(formatPriceTwd(Number.NaN), 'NT$0');
  assert.equal(formatPriceTwd(Number.POSITIVE_INFINITY), 'NT$0');
});

test('formatDateTaipei 用 Asia/Taipei，跨 UTC 日界不漂移', () => {
  // 2026-06-23T15:30:00Z = 台北 2026-06-23 23:30 → 仍是 23 號
  const d = '2026-06-23T15:30:00Z';
  assert.match(formatDateTaipei(d, 'en'), /June 23, 2026/);
  // 2026-06-23T16:30:00Z = 台北 2026-06-24 00:30 → 進到 24 號
  assert.match(formatDateTaipei('2026-06-23T16:30:00Z', 'en'), /June 24, 2026/);
});

test('formatTimeTaipei 24 小時制、Asia/Taipei', () => {
  // 台北 = UTC+8；16:30Z → 00:30
  assert.equal(formatTimeTaipei('2026-06-23T16:30:00Z', 'en'), '00:30');
  assert.equal(formatTimeTaipei('2026-06-23T05:00:00Z', 'en'), '13:00');
});

test('formatDateTimeTaipei 組合日期與時間', () => {
  const out = formatDateTimeTaipei('2026-06-23T05:00:00Z', 'en');
  assert.match(out, /June 23, 2026 13:00/);
});

test('預設 locale 為繁中（年/月/日含中文字）', () => {
  const out = formatDateTaipei('2026-06-23T05:00:00Z');
  assert.match(out, /2026/);
  assert.match(out, /年|月|日/);
});
