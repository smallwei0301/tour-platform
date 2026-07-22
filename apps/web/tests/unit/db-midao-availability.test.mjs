import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIDAO_PERIODS, resolveEffectiveDay, getWeeklyDefaultsDb, setWeeklyDefaultsDb,
  setDayOverrideDb, getMonthEffectiveDb, __resetMemMidaoAvailability,
} from '../../src/lib/db-midao-availability.mjs';

const G = 'guide-1';
test.beforeEach(() => __resetMemMidaoAvailability());

test('resolveEffectiveDay：覆寫 > 預設 > 關閉', () => {
  // 無預設無覆寫 → 全關
  assert.deepEqual(resolveEffectiveDay(null, []),
    { morning: false, afternoon: false, evening: false, custom: [] });
  // 預設開下午 → 下午開
  const d = { morning: false, afternoon: true, evening: false };
  assert.equal(resolveEffectiveDay(d, []).afternoon, true);
  // 覆寫關下午、開晚上 → 覆寫勝
  const eff = resolveEffectiveDay(d, [
    { period: 'afternoon', is_open: false }, { period: 'evening', is_open: true },
    { period: 'custom', is_open: true, custom_start: '10:00', custom_end: '12:00' },
  ]);
  assert.equal(eff.afternoon, false);
  assert.equal(eff.evening, true);
  assert.deepEqual(eff.custom, [{ start: '10:00', end: '12:00', isOpen: true }]);
});

test('週預設：整組寫入後讀回固定 7 筆', async () => {
  await setWeeklyDefaultsDb(G, [{ weekday: 6, morning: false, afternoon: true, evening: true }]);
  const rows = await getWeeklyDefaultsDb(G);
  assert.equal(rows.length, 7);
  assert.deepEqual(rows[6], { weekday: 6, morning: false, afternoon: true, evening: true });
  assert.deepEqual(rows[0], { weekday: 0, morning: false, afternoon: false, evening: false });
});

test('月生效展開：預設＋單日覆寫', async () => {
  // 2026-08-15 是週六（weekday 6）
  await setWeeklyDefaultsDb(G, [{ weekday: 6, morning: true, afternoon: true, evening: false }]);
  await setDayOverrideDb(G, '2026-08-15', { morning: false, evening: true });
  const month = await getMonthEffectiveDb(G, '2026-08');
  assert.equal(month.length, 31);
  const d15 = month.find((d) => d.date === '2026-08-15');
  assert.deepEqual({ m: d15.morning, a: d15.afternoon, e: d15.evening },
    { m: false, a: true, e: true }); // morning 覆寫關、afternoon 用預設、evening 覆寫開
  const d22 = month.find((d) => d.date === '2026-08-22'); // 另一個週六，純預設
  assert.deepEqual({ m: d22.morning, a: d22.afternoon, e: d22.evening },
    { m: true, a: true, e: false });
  // 越權隔離
  const other = await getMonthEffectiveDb('guide-2', '2026-08');
  assert.equal(other.every((d) => !d.morning && !d.afternoon && !d.evening), true);
});
