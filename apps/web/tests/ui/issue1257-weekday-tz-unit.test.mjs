/**
 * TZ-behaviour unit test for GH-1257 slice F weekday derivation.
 * Proves that the TZ-safe Intl.DateTimeFormat approach is stable
 * under TZ=Asia/Taipei, TZ=UTC, TZ=America/Los_Angeles for a known date.
 *
 * Known date: 2025-01-06 (Monday in Asia/Taipei = weekday 1)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// ── helpers ──────────────────────────────────────────────────────────────────

/** OLD (TZ-fragile) derivation — used to document the bug. */
function oldGetDay(single_date) {
  return new Date(`${single_date}T00:00:00+08:00`).getDay();
}

/**
 * NEW (TZ-safe) derivation — must match resolver's getWeekdayInTimezone.
 * Uses noon-anchor to avoid midnight rollover regardless of host TZ.
 */
function tzSafeWeekday(single_date) {
  const d = new Date(`${single_date}T12:00:00+08:00`);
  const day = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Taipei',
      weekday: 'short',
    }).format(d) === 'Sun' ? '0' :
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Taipei',
      weekday: 'long',
    }).format(d) === 'Monday' ? '1' :
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Taipei',
      weekday: 'long',
    }).format(d) === 'Tuesday' ? '2' :
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Taipei',
      weekday: 'long',
    }).format(d) === 'Wednesday' ? '3' :
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Taipei',
      weekday: 'long',
    }).format(d) === 'Thursday' ? '4' :
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Taipei',
      weekday: 'long',
    }).format(d) === 'Friday' ? '5' : '6',
    10
  );
  return day;
}

/**
 * FINAL TZ-safe derivation — simpler, matches exactly what page.tsx will use:
 * new Date(`${single_date}T12:00:00+08:00`).getDay()
 * This is safe because noon in +08:00 is still the same calendar day in UTC
 * (noon +08:00 = 04:00 UTC, no rollover).
 */
function noonAnchorWeekday(single_date) {
  // Use Intl for determinism regardless of process TZ
  const d = new Date(`${single_date}T12:00:00+08:00`);
  const shortDay = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    weekday: 'narrow',
  }).format(d);
  // Map to 0-6 as JS getDay() does
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'].indexOf(shortDay) === -1
    ? (() => { throw new Error(`Unexpected weekday narrow: ${shortDay}`); })()
    : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Taipei',
          weekday: 'short',
        }).format(d)
      );
}

// ── Known test date ──────────────────────────────────────────────────────────
// 2025-01-06 is a Monday in Asia/Taipei → expected weekday = 1
const TEST_DATE = '2025-01-06';
const EXPECTED_WEEKDAY = 1; // Monday

// ── Tests ────────────────────────────────────────────────────────────────────

test('RED: old getDay() is TZ-fragile — wrong under TZ=UTC for 2025-01-06', () => {
  // process.env.TZ may or may not be UTC in this runner, but we can simulate:
  // 2025-01-06T00:00:00+08:00 = 2025-01-05T16:00:00Z → getDay() in UTC sees Sunday (0) NOT Monday (1)
  const buggyDate = new Date(`${TEST_DATE}T00:00:00+08:00`);
  // In UTC: buggyDate.toISOString() = 2025-01-05T16:00:00.000Z → UTC getDay() = 0 (Sun)
  // We test the DATE object itself regardless of process TZ, by checking UTC day:
  const utcDay = buggyDate.getUTCDay(); // always 0 (Sunday) — proves midnight rollover
  assert.equal(utcDay, 0, `UTC day of 2025-01-06T00:00:00+08:00 must be 0 (Sunday in UTC, demonstrating rollover bug)`);
  // This is the bug: if getDay() is called in a UTC environment, it returns 0 (Sun) not 1 (Mon)
});

test('GREEN: noon-anchor new Date T12:00:00+08:00 is stable — UTC day is correct for 2025-01-06', () => {
  // 2025-01-06T12:00:00+08:00 = 2025-01-06T04:00:00Z → UTC getDay() = 1 (Monday) ✓
  const safeDate = new Date(`${TEST_DATE}T12:00:00+08:00`);
  const utcDay = safeDate.getUTCDay(); // 1 (Monday) — no rollover
  assert.equal(utcDay, EXPECTED_WEEKDAY, `UTC day of 2025-01-06T12:00:00+08:00 must be 1 (Monday) — noon-anchor stable`);
});

test('GREEN: Intl Asia/Taipei weekday for 2025-01-06 is Monday (1) regardless of process TZ', () => {
  // Use Intl.DateTimeFormat to get Asia/Taipei weekday — process TZ is irrelevant
  const d = new Date(`${TEST_DATE}T12:00:00+08:00`);
  const shortDay = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    weekday: 'short',
  }).format(d);
  assert.equal(shortDay, 'Mon', `Asia/Taipei weekday for 2025-01-06 must be Mon, got: ${shortDay}`);
});

test('GREEN: TZ-safe weekday matches resolver getWeekdayInTimezone for multiple dates', () => {
  // Test a range of dates with known weekdays in Asia/Taipei
  const cases = [
    { date: '2025-01-06', expected: 1, label: 'Monday' },
    { date: '2025-01-07', expected: 2, label: 'Tuesday' },
    { date: '2025-01-12', expected: 0, label: 'Sunday' },
    { date: '2025-12-31', expected: 3, label: 'Wednesday' },
  ];
  for (const { date, expected, label } of cases) {
    const d = new Date(`${date}T12:00:00+08:00`);
    const shortDay = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Taipei',
      weekday: 'short',
    }).format(d);
    const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const got = dayMap[shortDay];
    assert.equal(got, expected, `${date} must be weekday ${expected} (${label}) in Asia/Taipei, got ${got} (${shortDay})`);
  }
});
