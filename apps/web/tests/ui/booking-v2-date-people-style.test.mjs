import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// ──────────────────────────────────────────────────────────────────
// Booking V2 預約日期 / 人數欄位樣式 + stepper 鎖定測試
//
// V2 之前用未定義的 className="tp-input" 結果吃到 native 樣式,跟
// Legacy BookingInnerLegacy() 的 inline style(padding 10px 12px /
// border 1px solid var(--tp-border) / borderRadius 10)不一致。
// 同時人數欄沒有 +/- stepper,mobile 難按。
//
// 本測試守住:
//   1. V2 step=1 區塊已不再用 className="tp-input"(僅允許 Legacy
//      區塊仍可參考,但目前 Legacy 也沒在用,直接禁全檔即可)
//   2. 人數 stepper 的兩顆 aria-label 按鈕都在
//   3. 日期 input 使用了 Legacy 同款的 border / borderRadius 樣式
// ──────────────────────────────────────────────────────────────────

const pagePath = new URL('../../app/booking/[activityId]/page.tsx', import.meta.url);
const zhCatalogPath = new URL('../../messages/zh-Hant.json', import.meta.url);

test('V2 booking page no longer uses undefined className="tp-input"', async () => {
  const src = await readFile(pagePath, 'utf8');
  assert.ok(
    !/className=["']tp-input["']/.test(src),
    'className="tp-input" should not appear in booking page — class is undefined in globals.css and breaks visual parity with Legacy. Use inline style matching BookingInnerLegacy() instead.',
  );
});

test('V2 booking page has +/- stepper buttons with aria-labels', async () => {
  const src = await readFile(pagePath, 'utf8');
  // #multilingual: stepper aria-label 文案移到 bookingFlow.decreaseParticipants / increaseParticipants；
  // 頁面用 aria-label={m.<key>} 引用。內容類斷言改讀繁中 catalog。
  const zh = JSON.parse(await readFile(zhCatalogPath, 'utf8'));
  assert.equal(zh.bookingFlow.decreaseParticipants, '減少人數');
  assert.equal(zh.bookingFlow.increaseParticipants, '增加人數');
  assert.match(src, /aria-label=\{m\.decreaseParticipants\}/, 'Expected aria-label={m.decreaseParticipants} (− stepper)');
  assert.match(src, /aria-label=\{m\.increaseParticipants\}/, 'Expected aria-label={m.increaseParticipants} (+ stepper)');
});

test('V2 booking date input uses Legacy-aligned border + radius', async () => {
  const src = await readFile(pagePath, 'utf8');
  // The date <input> in V2 should carry Legacy's inline style tokens.
  // We assert the file contains the exact style fragment we standardised on.
  assert.match(
    src,
    /border:\s*'1px solid var\(--tp-border\)'/,
    'Expected at least one occurrence of Legacy-style border token',
  );
  assert.match(
    src,
    /borderRadius:\s*10/,
    'Expected at least one borderRadius: 10 occurrence (Legacy style)',
  );
});

// ── Criterion 1 assertion gate: V2 date-capacity picker option label (#1083) ──
//
// PRs #1076/#1080/#1082 replaced the V2 date-capacity picker from a native
// <input type="date"> and per-date buttons to a native <select> whose options
// carry the '（剩餘 N）' remaining-capacity label, and removed the legacy
// '改用舊版預約流程' button and the duplicate top no-slot warning.
//
// This test locks those invariants so any future regression is caught at CI.

test('V2 date-capacity picker is a <select> identified by data-testid and options carry （剩餘 N） label', async () => {
  const src = await readFile(pagePath, 'utf8');
  // 1. The V2 date-capacity picker must be a native <select> with the canonical data-testid.
  assert.match(
    src,
    /data-testid="booking-v2-date-capacity-picker"/,
    'V2 date-capacity control must have data-testid="booking-v2-date-capacity-picker" on the <select>',
  );
  // 2. Option labels for available slots must use '（剩餘 N）' format (not the Legacy '（剩 N 位）' short form).
  // #multilingual: option label 文案移到 bookingFlow.dateAvailableOption（「（剩餘 {n}）」）；
  // 頁面用 m.dateAvailableOption.replace(...) 引用，內容類斷言改讀繁中 catalog。
  const zh = JSON.parse(await readFile(zhCatalogPath, 'utf8'));
  assert.match(
    zh.bookingFlow.dateAvailableOption,
    /（剩餘 \{n\}）/,
    'bookingFlow.dateAvailableOption must use（剩餘 N）format — the Legacy short form（剩 N 位）must not leak into V2 picker options',
  );
  assert.match(
    src,
    /m\.dateAvailableOption\.replace\('\{date\}', entry\.date\)\.replace\('\{n\}', String\(entry\.capacityLeft\)\)/,
    'V2 picker must reference m.dateAvailableOption with entry.date / entry.capacityLeft interpolation',
  );
  // 3. The removed '改用舊版預約流程' legacy-fallback button must be absent.
  assert.doesNotMatch(
    src,
    /改用舊版預約流程/,
    'V2 booking page must NOT contain "改用舊版預約流程" button — legacy fallback toggle was removed',
  );
  // 4. The duplicate top no-slot warning pattern that was removed in #1082 must be absent.
  assert.doesNotMatch(
    src,
    /setV2Error\(selectedDateEntry\?\.messageZh/,
    'Removed duplicate top-level setV2Error(selectedDateEntry?.messageZh...) warning must not reappear — slot-level errors are now rendered inline',
  );
});
