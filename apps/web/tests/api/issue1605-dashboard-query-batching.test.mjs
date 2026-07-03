/**
 * issue1605 — guide dashboard 查詢 batching 防回歸（源碼契約）
 * 背景：/api/guide/dashboard 原本約 25 個序列 DB round-trip（含 6 個月趨勢
 * 迴圈每月 2 支查詢），重構為 3 個序列階段（階段內 Promise.all 平行）。
 * 本測試鎖住重構後的形狀，防止趨勢查詢退化回迴圈內逐月 await。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROUTE_PATH = resolve(__dirname, '../../app/api/guide/dashboard/route.ts');
const routeSrc = readFileSync(ROUTE_PATH, 'utf8');

/** 從 marker 起以大括號配對擷取完整區塊（含 marker 那行到對應的閉括號） */
function extractBlock(src, marker) {
  const start = src.indexOf(marker);
  assert.ok(start > -1, `route.ts 找不到 ${marker}`);
  const braceStart = src.indexOf('{', start);
  assert.ok(braceStart > -1, `${marker} 之後找不到 {`);
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  assert.fail(`${marker} 區塊大括號不平衡`);
}

test('issue1605: 6 個月趨勢月鍵迴圈內不得有 await 或 DB 查詢', () => {
  const loop = extractBlock(routeSrc, 'for (let i = 5; i >= 0; i--)');
  assert.ok(!/\bawait\b/.test(loop), '趨勢月鍵迴圈退化回迴圈內 await（逐月查詢）');
  assert.ok(!/\.from\(/.test(loop), '趨勢月鍵迴圈內不得直接發 DB 查詢');
});

test('issue1605: 查詢分階段平行 — route 至少有 2 處 Promise.all', () => {
  const matches = routeSrc.match(/Promise\.all\(/g) || [];
  assert.ok(matches.length >= 2, `Expected >=2 Promise.all — found ${matches.length}`);
});

test('issue1605: orders 表查詢次數上限 4（count / recent / 趨勢區間 / refund_pending）', () => {
  const matches = routeSrc.match(/\.from\('orders'\)/g) || [];
  assert.ok(matches.length <= 4, `Expected <=4 from('orders') — found ${matches.length}（趨勢查詢應為單一區間，勿逐月拆查）`);
});

test('issue1605: 趨勢為單一區間查詢（.gte created_at trendStart）', () => {
  assert.match(routeSrc, /\.gte\('created_at', trendStart/, '缺少涵蓋 6 個月的單一區間查詢下界 trendStart');
});

test('issue1605: refund_pending 查詢必須有 limit（防撈全表）', () => {
  assert.match(
    routeSrc,
    /eq\('status', 'refund_pending'\)[\s\S]{0,160}\.limit\(/,
    'refund_pending 訂單查詢缺 .limit()'
  );
});
