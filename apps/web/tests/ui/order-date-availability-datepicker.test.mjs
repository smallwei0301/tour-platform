import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// 對應使用者回報（owner 拍板 2026-06-15）：
// 訂單日期選擇器中，不可預約的未來日期一律呈現「額滿」，不再用「—」占位。
test('DatePicker: 不可預約的未來日期顯示「額滿」而非「—」', async () => {
  const src = await readFile(path.join(ROOT, 'src/components/activity/DatePicker.tsx'), 'utf8');

  // 不再渲染「—」無場次占位（tp-date-pill-na 整個移除）
  assert.doesNotMatch(
    src,
    /tp-date-pill-na/,
    '無場次占位（tp-date-pill-na）應已移除，不可預約日期統一以「額滿」呈現'
  );
  assert.doesNotMatch(
    src,
    /<span className="tp-date-pill-na">—<\/span>/,
    '日期 pill 不應再渲染「—」占位'
  );

  // pill：disabled 來自「不可預約」，且 disabled 時渲染「額滿」徽章
  assert.match(
    src,
    /const disabled = !p\.available;/,
    'pill 的 disabled 應等於「不可預約」（!available），涵蓋無場次與額滿兩種情況'
  );
  assert.match(
    src,
    /\{disabled && <span className="tp-date-pill-full">額滿<\/span>\}/,
    '任何不可預約（disabled）的日期 pill 都應顯示「額滿」'
  );

  // 月曆：未來不可預約日期顯示「額滿」，過去日期維持「不可預約」
  assert.match(
    src,
    /const showFull = !cell\.available && !cell\.isPast;/,
    '月曆 cell 的「額滿」條件應為：不可預約且非過去日期'
  );
  assert.match(
    src,
    /\{showFull && \(\s*<span className="kkd-cal-day-full">額滿<\/span>\s*\)\}/,
    '月曆未來不可預約日期應顯示「額滿」徽章'
  );
});

// 對應 globals.css：tp-date-pill-na 樣式應一併移除，避免遺留死樣式。
test('globals.css: 移除未使用的 tp-date-pill-na 樣式', async () => {
  const css = await readFile(path.join(ROOT, 'app/globals.css'), 'utf8');
  assert.doesNotMatch(css, /\.tp-date-pill-na/, 'tp-date-pill-na 樣式已無對應元素，應移除');
});
