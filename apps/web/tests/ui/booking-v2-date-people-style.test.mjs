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

test('V2 booking page no longer uses undefined className="tp-input"', async () => {
  const src = await readFile(pagePath, 'utf8');
  assert.ok(
    !/className=["']tp-input["']/.test(src),
    'className="tp-input" should not appear in booking page — class is undefined in globals.css and breaks visual parity with Legacy. Use inline style matching BookingInnerLegacy() instead.',
  );
});

test('V2 booking page has +/- stepper buttons with aria-labels', async () => {
  const src = await readFile(pagePath, 'utf8');
  assert.match(src, /aria-label="減少人數"/, 'Expected "減少人數" aria-label button (− stepper)');
  assert.match(src, /aria-label="增加人數"/, 'Expected "增加人數" aria-label button (+ stepper)');
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
