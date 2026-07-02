import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 方案卡片響應式版型（source-contract）：
// 鎖定 DatePlanSection 的行為 —— 全部方案都 render 進 DOM（不再 slice(0,2)），
// 手機收合由 CSS 控制（.kkd-plans-list.show-all），切換鈕包在 .kkd-plans-more-btn-wrap，
// 且 globals.css 有非手機多欄 grid 規則。搭配 e2e/issue-itinerary-plans-grid.spec.ts
// 對真實編譯 CSS 做版型量測。

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const componentPath = path.resolve(__dirname, '../../src/components/activity/DatePlanSection.tsx');
const cssPath = path.resolve(__dirname, '../../app/globals.css');

test('DatePlanSection 全部方案都 render（不再 slice(0,2)）', () => {
  const src = readFileSync(componentPath, 'utf8');
  assert.match(src, /PLANS\.map\(/, '應直接 map 全部 PLANS');
  assert.doesNotMatch(src, /PLANS\.slice\(0,\s*2\)/, '不應再用 slice(0,2) 硬砍只顯示 2 個');
});

test('DatePlanSection 依 showAllPlans 切換 .show-all class（手機收合由 CSS 控制）', () => {
  const src = readFileSync(componentPath, 'utf8');
  assert.match(
    src,
    /kkd-plans-list\$\{showAllPlans \? ' show-all' : ''\}/,
    '.kkd-plans-list 需依 showAllPlans 加上 show-all',
  );
});

test('DatePlanSection 切換鈕包在 .kkd-plans-more-btn-wrap（供非手機隱藏）', () => {
  const src = readFileSync(componentPath, 'utf8');
  assert.match(src, /className="kkd-plans-more-btn-wrap"/, '切換鈕容器需有 kkd-plans-more-btn-wrap');
});

test('globals.css：非手機多欄 grid + 手機收合 + footer 直排 + 隱藏切換鈕', () => {
  const css = readFileSync(cssPath, 'utf8');
  // 非手機多欄並排
  assert.match(
    css,
    /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(\s*260px,\s*1fr\s*\)\)/,
    '需有 auto-fill minmax 多欄 grid',
  );
  // 手機收合：第 3 張以後隱藏（非 show-all）
  assert.match(
    css,
    /\.kkd-plans-list:not\(\.show-all\)\s*>\s*\.kkd-plan-card:nth-child\(n\+3\)\s*\{\s*display:\s*none/,
    '手機收合需隱藏第 3 張以後',
  );
  // 非手機隱藏切換鈕
  assert.match(css, /\.kkd-plans-more-btn-wrap\s*\{\s*display:\s*none/, '非手機需隱藏切換鈕');
});
