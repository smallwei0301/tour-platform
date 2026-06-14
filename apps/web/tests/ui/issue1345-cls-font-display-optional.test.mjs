/**
 * Issue #1345 — CJK 字型 swap-shift CLS + 字型下載拖慢手機載入。
 *
 * 背景：`Noto_Sans_TC` 原本以 `display:'swap'` 載入，CJK 大字型 swap 進來時
 * 跳動每一行 line-height，CLS 0.76–1.43。#1345 一度改 `display:'optional'`
 * 壓住 swap-shift，但實測（slow-4G applied throttling）發現 optional 只是
 * 「不 swap / 不阻塞 render」，**字型仍會背景下載 ~2MB** 與 LCP 圖搶頻寬，
 * FCP 3.8s / LCP 4.4s。
 *
 * 最終策略（owner 拍板 2026-06-14）：
 *   1. 內文（body）改用系統中文字（PingFang TC／微軟正黑／Noto Sans CJK），
 *      不再引用 Noto Sans TC webfont —— 整組 @font-face 不再產生，手機端
 *      省 ~1.2MB 下載，且因為內文「永遠」用系統字、零 swap，CLS 目標反而
 *      比 optional 更穩固。系統字本來就是 optional 首訪實際看到的字。
 *   2. 品牌標題襯線 Noto Serif TC 維持載入但改 `display:'optional'`：首訪用
 *      系統襯線（不阻塞、無 swap-shift），回訪用快取的品牌字。
 *   3. Inter（拉丁）保留 `display:'swap'`（next/font 已 metric-match Latin fallback）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');

async function readSrc(rel) {
  return readFile(path.join(WEB_ROOT, rel), 'utf8');
}

test('內文不再引用 Noto Sans TC webfont（改系統字，零下載、零 swap-shift）', async () => {
  const layout = await readSrc('app/layout.tsx');
  assert.doesNotMatch(
    layout,
    /Noto_Sans_TC\s*\(/,
    'app/layout.tsx 不應再以 next/font 載入 Noto_Sans_TC —— 內文改用系統中文字避免 ~1.2MB CJK 下載與 swap-shift（#1345）',
  );

  const css = await readSrc('app/globals.css');
  // 內文系統字堆疊抽成 --tp-sans 變數（body 與 landing .lp-root 共用）。
  const sansDef = (css.match(/--tp-sans:\s*([^;]+);/) || [])[1] || '';
  assert.ok(sansDef, 'globals.css 應定義 --tp-sans 系統字堆疊');
  // 系統字（system-ui / -apple-system / PingFang / 微軟正黑）必須排在
  // 任何 'Noto Sans TC' 之前，確保不觸發 webfont 下載。
  assert.match(sansDef, /system-ui|-apple-system|PingFang|JhengHei/i,
    '--tp-sans 必須以系統中文字為主');
  const idxSystem = sansDef.search(/system-ui|-apple-system|PingFang|JhengHei/i);
  const idxNoto = sansDef.search(/Noto Sans/i);
  if (idxNoto >= 0) {
    assert.ok(idxSystem < idxNoto,
      "'Noto Sans TC/CJK' 若保留只能當本機字型 fallback，必須排在系統字之後");
  }

  // body 內文必須實際套用系統字（直接列出系統字，或透過 --tp-sans 變數）。
  const bodyBlock = css.match(/\bbody\s*\{([\s\S]*?)\}/);
  assert.ok(bodyBlock, 'globals.css 應有 body { ... } 區塊');
  const fontFamily = (bodyBlock[1].match(/font-family:\s*([^;]+);/) || [])[1] || '';
  assert.match(fontFamily, /--tp-sans|system-ui|PingFang|JhengHei/i,
    '內文 font-family 必須套用系統字（var(--tp-sans) 或直接系統字）');
});

test('品牌標題襯線 Noto_Serif_TC 用 display:optional（首訪不阻塞、無 swap-shift）', async () => {
  const src = await readSrc('app/layout.tsx');
  const match = src.match(/Noto_Serif_TC\(\s*\{([\s\S]*?)\}\)/);
  assert.ok(match, 'expected a Noto_Serif_TC({...}) configuration block in app/layout.tsx');
  assert.match(
    match[1],
    /display:\s*['"]optional['"]/,
    'Noto_Serif_TC 必須用 display: "optional"，首訪用系統襯線避免 CJK swap-shift CLS（#1345）',
  );
});

test('Inter (Latin font) 保留 display: swap (next/font 對拉丁字體已 metric-match fallback)', async () => {
  const src = await readSrc('app/layout.tsx');
  const match = src.match(/Inter\(\s*\{([\s\S]*?)\}\)/);
  assert.ok(match, 'expected an Inter({...}) configuration block');
  assert.match(
    match[1],
    /display:\s*['"]swap['"]/,
    'Inter keeps display: "swap" — next/font auto metric-matches Latin fallbacks so swap does not shift layout',
  );
});
