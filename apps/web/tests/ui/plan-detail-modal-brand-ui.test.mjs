/**
 * 行程頁「方案詳情」Modal 與「查看更多方案」按鈕 — 品牌一致性 source-contract
 *
 * 背景：原本 PlanDetailModal 是白底 + 綠色（#16a34a）分頁 + 彩色 emoji，與整站
 * 深色品牌（山墨綠 / 古紙米黃 / 黃銅 #b08d3e）不符；DatePlanSection 的
 * 「查看更多方案」按鈕用亮藍 #2563eb，與品牌色系衝突。
 *
 * 真實瀏覽器煙霧測試（legacy DEFAULT_PLANS 模式）已確認 modal 改為深色面板、
 * 標題/價格為黃金色、active 分頁底線為黃銅、亮點圖示改為 SVG 線條（無 emoji）。
 * 此 source-contract 鎖定上述修正，避免回歸。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const MODAL = 'src/components/activity/PlanDetailModal.tsx';
const SECTION = 'src/components/activity/DatePlanSection.tsx';

test('PlanDetailModal 不再使用白底面板與綠色分頁，改為深色品牌面板', async () => {
  const src = await readFile(path.join(ROOT, MODAL), 'utf8');
  // 不得再有白底面板（原本 background: '#fff'）
  assert.ok(!/background:\s*'#fff'/.test(src), 'modal 面板不應再是白底 #fff');
  // 不得再用原本綠色 active 色 #16a34a 當分頁色
  assert.ok(!src.includes('#16a34a'), 'active 分頁不應再用綠色 #16a34a');
  // active 分頁底線應為黃銅 #b08d3e
  assert.ok(src.includes('#b08d3e'), 'active 分頁底線應採黃銅 #b08d3e');
  // 標題/價格採品牌金色 #ded7ab
  assert.ok(src.includes('#ded7ab'), '標題與價格應採品牌金色 #ded7ab');
});

test('PlanDetailModal 亮點圖示改為 SVG 線條，移除突兀的彩色 emoji', async () => {
  const src = await readFile(path.join(ROOT, MODAL), 'utf8');
  for (const emoji of ['🌐', '🕐', '📅', '✅', '🔄']) {
    assert.ok(!src.includes(emoji), `亮點區不應再含彩色 emoji ${emoji}`);
  }
  // 改用內嵌 SVG 線條圖示
  assert.match(src, /<svg[^>]*stroke="currentColor"/, '亮點圖示應改為 stroke=currentColor 的 SVG');
});

test('DatePlanSection「查看更多方案」按鈕改用品牌 pill 樣式，移除亮藍色', async () => {
  const src = await readFile(path.join(ROOT, SECTION), 'utf8');
  // 不得再用亮藍 #2563eb
  assert.ok(!src.includes('#2563eb'), '「查看更多方案」不應再用亮藍 #2563eb');
  // 應採與「查看更多日期」一致的品牌 pill class
  const block = src.slice(src.indexOf('查看更多方案') - 600, src.indexOf('查看更多方案') + 200);
  assert.match(block, /className="kkd-more-dates-btn"/, '「查看更多方案」應採 .kkd-more-dates-btn 品牌 pill 樣式');
});
