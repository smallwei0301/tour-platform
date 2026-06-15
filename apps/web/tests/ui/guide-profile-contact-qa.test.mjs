/**
 * 「詢問導遊」inline 訊息 — 認識導遊頁（/guides/[slug]）。
 *
 * 需求：按下 sidebar「詢問導遊」先判斷旅客是否登入；已登入即就地展開和行程 QA
 * 一樣的輸入框與送出功能。訊息不綁定任何行程，重用 activity_qa（activity_id 帶
 * sentinel `guide:<guideId>`），流進導遊後台同一個收件匣，後台卡片改顯示「導遊頁面」。
 *
 * 本測試鎖定 wiring（source-contract）：
 *  1. 導遊頁渲染 GuideContactQASection（client component），不再是死按鈕／靜態 Link。
 *  2. 元件以 sentinel activity_id POST /api/qa。
 *  3. /api/guide/qa 一併查 sentinel；/api/guide/qa/[id] 處理 sentinel 擁有權。
 *  4. 導遊後台對 sentinel 顯示「導遊頁面」而非行程 ID。
 *  5. 行程詳情頁的「詢問導遊」仍是錨定 #section-qa 的連結（既有機制不退化）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf8');

const guidePageSrc = read('../../app/guides/[slug]/page.tsx');
const componentSrc = read('../../src/components/guide/GuideContactQASection.tsx');
const guideQaRouteSrc = read('../../app/api/guide/qa/route.ts');
const guideQaIdRouteSrc = read('../../app/api/guide/qa/[id]/route.ts');
const dashboardSrc = read('../../app/guide/dashboard/page.tsx');
const activityPageSrc = read('../../app/activities/[region]/[slug]/page.tsx');

test('導遊頁不再有死的「傳訊息給導遊」按鈕', () => {
  assert.ok(
    !/<button[^>]*>\s*傳訊息給導遊/.test(guidePageSrc),
    '不應再有死的 <button>傳訊息給導遊',
  );
});

test('導遊頁渲染 GuideContactQASection（帶 guideId / guideName）', () => {
  assert.match(guidePageSrc, /import\s*\{\s*GuideContactQASection\s*\}/, '應 import GuideContactQASection');
  assert.match(
    guidePageSrc,
    /<GuideContactQASection[^>]*guideId=\{guide\.id\}[^>]*guideName=\{guide\.displayName\}/,
    'sidebar 應渲染 GuideContactQASection 並帶 guide.id / guide.displayName',
  );
  // 不再把「詢問導遊」做成導向行程的靜態 Link
  assert.ok(
    !/contactGuideHref/.test(guidePageSrc),
    '不應再用 contactGuideHref 靜態導向',
  );
});

test('元件先判斷登入再展開輸入框，未登入顯示登入提示', () => {
  assert.match(componentSrc, /supabase\.auth\.getUser\(\)/, '應檢查登入狀態');
  assert.match(componentSrc, /aria-expanded=\{open\}/, '按鈕應有展開狀態');
  assert.match(componentSrc, /guide-qa-login-prompt/, '未登入應有登入提示');
  assert.match(componentSrc, /<textarea/, '登入後應展開輸入框');
});

test('元件以 sentinel activity_id POST /api/qa', () => {
  assert.match(componentSrc, /buildGuideContactActivityId/, '應用 helper 組 sentinel activity_id');
  assert.match(
    componentSrc,
    /fetch\('\/api\/qa',\s*\{[\s\S]*method:\s*'POST'/,
    '應 POST /api/qa（重用行程 QA pipeline）',
  );
  assert.match(componentSrc, /activityId,\s*question:/, 'body 應帶 activityId + question');
});

test('/api/guide/qa 一併查 sentinel（導遊無行程也收得到導遊頁訊息）', () => {
  assert.match(guideQaRouteSrc, /buildGuideContactActivityId/, '應 import/用 sentinel helper');
  assert.match(
    guideQaRouteSrc,
    /queryActivityIds\s*=\s*\[\s*\.\.\.activityIds,\s*guideContactActivityId\s*\]/,
    '查詢 id 清單應含 sentinel',
  );
  assert.ok(
    !/if \(activityIds\.length === 0\) \{\s*return Response\.json\(ok\(\{ data: \[\] \}\)\);\s*\}\s*\n\s*\/\/ Fetch Q&A/.test(guideQaRouteSrc),
    'activityIds 為空時不應提早 return（否則收不到導遊頁訊息）',
  );
});

test('/api/guide/qa/[id] 以 sentinel 內嵌 guideId 判定擁有權', () => {
  assert.match(guideQaIdRouteSrc, /parseGuideContactGuideId/, '應用 helper 解析 sentinel guideId');
  assert.match(
    guideQaIdRouteSrc,
    /contactGuideId !== session\.guideId/,
    '導遊頁訊息應比對 session.guideId 判定擁有權',
  );
});

test('導遊後台對 sentinel 顯示「導遊頁面」而非行程 ID', () => {
  assert.match(dashboardSrc, /isGuideContactActivityId/, '應用 helper 辨識 sentinel');
  assert.match(dashboardSrc, /導遊頁面/, 'sentinel 應顯示「導遊頁面」');
});

test('行程詳情頁「詢問導遊」仍是錨定 #section-qa 的連結（不退化）', () => {
  assert.match(
    activityPageSrc,
    /<a[^>]*href="#section-qa"[\s\S]*?詢問導遊/,
    '行程詳情頁應維持 <a href="#section-qa"> 錨點連結',
  );
});
