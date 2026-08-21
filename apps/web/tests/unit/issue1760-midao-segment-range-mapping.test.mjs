/**
 * Issue #1760 Stage 2 — U-1 segment ↔ canonical range mapping（純函式契約）。
 * Owner 不可變決議：morning=09:00–12:00、afternoon=13:00–17:00、evening=18:00–21:00。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIDAO_SEGMENTS,
  MIDAO_SEGMENT_RANGES,
  segmentsToCanonicalRanges,
  canonicalRangesToSegments,
  normalizeCanonicalRanges,
  assertNoOverlap,
  buildDayAvailabilityProjection,
} from '../../src/lib/midao/midao-calendar-canonical.ts';

test('U-1 段別對映固定為 owner 決議的 HH:MM 區間', () => {
  assert.deepEqual(MIDAO_SEGMENTS, ['morning', 'afternoon', 'evening']);
  assert.deepEqual(MIDAO_SEGMENT_RANGES, {
    morning: { startTimeLocal: '09:00', endTimeLocal: '12:00' },
    afternoon: { startTimeLocal: '13:00', endTimeLocal: '17:00' },
    evening: { startTimeLocal: '18:00', endTimeLocal: '21:00' },
  });
});

test('segmentsToCanonicalRanges：三格全開 → 三段依序、不重疊', () => {
  const ranges = segmentsToCanonicalRanges({ morning: true, afternoon: true, evening: true });
  assert.deepEqual(ranges, [
    { startTimeLocal: '09:00', endTimeLocal: '12:00' },
    { startTimeLocal: '13:00', endTimeLocal: '17:00' },
    { startTimeLocal: '18:00', endTimeLocal: '21:00' },
  ]);
});

test('segmentsToCanonicalRanges：全關 → 空陣列（empty = closed）', () => {
  assert.deepEqual(segmentsToCanonicalRanges({ morning: false, afternoon: false, evening: false }), []);
  assert.deepEqual(segmentsToCanonicalRanges({}), []);
  assert.deepEqual(segmentsToCanonicalRanges(null), []);
});

test('segmentsToCanonicalRanges：自訂時段一併納入並排序', () => {
  const ranges = segmentsToCanonicalRanges(
    { morning: true },
    [{ startTimeLocal: '07:00', endTimeLocal: '08:00' }],
  );
  assert.deepEqual(ranges, [
    { startTimeLocal: '07:00', endTimeLocal: '08:00' },
    { startTimeLocal: '09:00', endTimeLocal: '12:00' },
  ]);
});

test('normalizeCanonicalRanges：相鄰區間合併（09:00-12:00 + 12:00-13:00）', () => {
  assert.deepEqual(
    normalizeCanonicalRanges([
      { startTimeLocal: '12:00', endTimeLocal: '13:00' },
      { startTimeLocal: '09:00', endTimeLocal: '12:00' },
    ]),
    [{ startTimeLocal: '09:00', endTimeLocal: '13:00' }],
  );
});

test('normalizeCanonicalRanges：非相鄰不合併', () => {
  assert.deepEqual(
    normalizeCanonicalRanges([
      { startTimeLocal: '09:00', endTimeLocal: '12:00' },
      { startTimeLocal: '13:00', endTimeLocal: '17:00' },
    ]),
    [
      { startTimeLocal: '09:00', endTimeLocal: '12:00' },
      { startTimeLocal: '13:00', endTimeLocal: '17:00' },
    ],
  );
});

test('assertNoOverlap：重疊區間必須被拒絕（INVALID_RANGES）', () => {
  assert.throws(
    () => assertNoOverlap([
      { startTimeLocal: '09:00', endTimeLocal: '12:00' },
      { startTimeLocal: '11:00', endTimeLocal: '13:00' },
    ]),
    /INVALID_RANGES/,
  );
});

test('assertNoOverlap：格式錯誤或起訖顛倒必須被拒絕', () => {
  assert.throws(() => assertNoOverlap([{ startTimeLocal: '9:00', endTimeLocal: '12:00' }]), /INVALID_RANGES/);
  assert.throws(() => assertNoOverlap([{ startTimeLocal: '12:00', endTimeLocal: '09:00' }]), /INVALID_RANGES/);
  assert.throws(() => assertNoOverlap([{ startTimeLocal: '12:00', endTimeLocal: '12:00' }]), /INVALID_RANGES/);
  assert.throws(() => assertNoOverlap([{ startTimeLocal: '24:00', endTimeLocal: '25:00' }]), /INVALID_RANGES/);
});

test('canonicalRangesToSegments：canonical 區間還原成 U-1 段別＋自訂', () => {
  assert.deepEqual(
    canonicalRangesToSegments([
      { startTimeLocal: '09:00', endTimeLocal: '12:00' },
      { startTimeLocal: '18:00', endTimeLocal: '21:00' },
      { startTimeLocal: '07:00', endTimeLocal: '08:00' },
    ]),
    {
      morning: true,
      afternoon: false,
      evening: true,
      custom: [{ startTimeLocal: '07:00', endTimeLocal: '08:00' }],
    },
  );
});

test('canonicalRangesToSegments：空 = 全關且無自訂', () => {
  assert.deepEqual(canonicalRangesToSegments([]), {
    morning: false, afternoon: false, evening: false, custom: [],
  });
});

test('round-trip：segments → ranges → segments 具決定性', () => {
  for (const segments of [
    { morning: true, afternoon: false, evening: false },
    { morning: false, afternoon: true, evening: true },
    { morning: true, afternoon: true, evening: true },
    { morning: false, afternoon: false, evening: false },
  ]) {
    const back = canonicalRangesToSegments(segmentsToCanonicalRanges(segments));
    assert.deepEqual(
      { morning: back.morning, afternoon: back.afternoon, evening: back.evening },
      segments,
    );
    assert.deepEqual(back.custom, []);
  }
});

test('buildDayAvailabilityProjection：帶出 ranges/segments/revision/isClosed/timezone', () => {
  const day = buildDayAvailabilityProjection({
    date: '2026-09-05',
    ranges: [{ startTimeLocal: '13:00', endTimeLocal: '17:00' }],
    revision: 7,
    isClosed: false,
    timezone: 'Asia/Taipei',
  });
  assert.equal(day.date, '2026-09-05');
  assert.equal(day.revision, 7);
  assert.equal(day.isClosed, false);
  assert.equal(day.timezone, 'Asia/Taipei');
  assert.deepEqual(day.ranges, [{ startTimeLocal: '13:00', endTimeLocal: '17:00' }]);
  assert.equal(day.availability.afternoon, true);
  assert.equal(day.availability.morning, false);
  assert.deepEqual(day.availability.custom, []);
});

test('buildDayAvailabilityProjection：closed 日 ranges 為空且 isClosed=true', () => {
  const day = buildDayAvailabilityProjection({
    date: '2026-09-06',
    ranges: [],
    revision: 2,
    isClosed: true,
    timezone: 'Asia/Taipei',
  });
  assert.equal(day.isClosed, true);
  assert.deepEqual(day.ranges, []);
  assert.deepEqual(day.availability, { morning: false, afternoon: false, evening: false, custom: [] });
});

test('buildDayAvailabilityProjection：未設定的日子 revision=0、isClosed=false、空 ranges', () => {
  const day = buildDayAvailabilityProjection({ date: '2026-09-07', timezone: 'Asia/Taipei' });
  assert.equal(day.revision, 0);
  assert.equal(day.isClosed, false);
  assert.deepEqual(day.ranges, []);
});
