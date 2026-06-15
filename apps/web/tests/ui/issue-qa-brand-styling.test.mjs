/**
 * Source-contract tests: 行程頁面「旅客問答」(Q&A) 必須沿用站內 UI 配色／字體，
 * 與「常見問題」(FAQ) 一致 —— 改用品牌 CSS 變數（深綠卡片＋黃銅／米色文字），
 * 不得殘留淺色 hardcode（white/灰底＋深灰字），否則在深色主題上會出現
 * 截圖中那種「白底黑字、與站內配色不符」的問答框。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

const QA_COMPONENT = 'src/components/activity/ActivityQASection.tsx';
const GLOBALS_CSS = 'app/globals.css';

test('QA 卡片改用品牌 class（kkd-qa-item），與 FAQ 卡片同樣式', async () => {
  const src = await readSource(QA_COMPONENT);
  assert.match(src, /className="kkd-qa-item"/, '問答卡片必須使用 kkd-qa-item class');
  assert.match(src, /className="kkd-qa-q"/, '問題列必須使用 kkd-qa-q class');
  assert.match(src, /className="kkd-qa-a"/, '回答列必須使用 kkd-qa-a class');
});

test('QA 表單元件改用品牌 class', async () => {
  const src = await readSource(QA_COMPONENT);
  for (const cls of ['kkd-qa-form', 'kkd-qa-textarea', 'kkd-qa-submit', 'kkd-qa-login']) {
    assert.match(src, new RegExp(`className="${cls}"`), `必須使用 ${cls} class`);
  }
});

test('QA 元件不得殘留淺色 hardcode（白／淺灰底與深灰字）', async () => {
  const src = await readSource(QA_COMPONENT);
  // 截圖問題來源：白底卡片 #f9fafb / 邊框 #e5e7eb / 深灰字 #111827 #374151 等
  const forbidden = ['#f9fafb', '#e5e7eb', '#111827', '#374151', '#d1d5db', '#6b7280', '#10b981', '#ef4444', "'#fff'", '"#fff"'];
  for (const hex of forbidden) {
    assert.ok(!src.includes(hex), `不應再出現淺色 hardcode ${hex}，請改用 var(--tp-*) 或品牌 class`);
  }
});

test('globals.css 為 QA 定義使用品牌變數的樣式（與 FAQ 同色系）', async () => {
  const css = await readSource(GLOBALS_CSS);
  assert.match(css, /\.kkd-qa-item\s*\{[^}]*var\(--tp-card-bg\)/s, 'kkd-qa-item 背景必須用 --tp-card-bg');
  assert.match(css, /\.kkd-qa-item\s*\{[^}]*var\(--tp-border\)/s, 'kkd-qa-item 邊框必須用 --tp-border');
  assert.match(css, /\.kkd-qa-q\s*\{[^}]*var\(--tp-text\)/s, 'kkd-qa-q 文字必須用 --tp-text');
  assert.match(css, /\.kkd-qa-a\s*\{[^}]*var\(--tp-muted\)/s, 'kkd-qa-a 文字必須用 --tp-muted');
  assert.match(css, /\.kkd-qa-textarea\s*\{[^}]*var\(--tp-text\)/s, 'textarea 文字必須用 --tp-text');
});
