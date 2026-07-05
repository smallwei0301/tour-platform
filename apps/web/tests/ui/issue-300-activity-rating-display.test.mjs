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

// AC1: ActivitiesContent.tsx listing card
// 更新（#收藏星數）：列表卡改用與詳情頁同一真實來源 resolveActivityReviewStats，
// 顯示聚合後的 score（真實評論 + 社群口碑語錄），保留一位小數。
test('AC1: ActivitiesContent listing card formats rating score with toFixed(1) via shared stats helper', async () => {
  const src = await readSource('app/[locale]/activities/ActivityCard.tsx');
  assert.match(src, /resolveActivityReviewStats/, 'Should use shared resolveActivityReviewStats (single source with detail page)');
  assert.match(src, /\.score\.toFixed\(1\)/, 'Should format aggregated score with toFixed(1)');
});

test('AC1: ActivitiesContent listing card shows reviewCount', async () => {
  const src = await readSource('app/[locale]/activities/ActivityCard.tsx');
  assert.match(src, /reviewCount/, 'Should render reviewCount');
});

test('AC1: ActivitiesContent listing card shows 尚無評價 for null rating', async () => {
  const src = await readSource('app/[locale]/activities/ActivityCard.tsx');
  assert.match(src, /尚無評價/, 'Should show 尚無評價 fallback when rating is null');
});

test('AC1: ActivitiesContent listing card has data-testid="activity-card-rating"', async () => {
  const src = await readSource('app/[locale]/activities/ActivityCard.tsx');
  assert.match(src, /data-testid="activity-card-rating"/, 'Should have activity-card-rating testid');
});

// AC2: detail page
test('AC2: detail page uses activity ratingAvg (not guide?.ratingAvg) for headline', async () => {
  const src = await readSource('app/[locale]/activities/[region]/[slug]/page.tsx');
  // activityData is a cast of activity with ratingAvg; both patterns are valid
  assert.match(src, /activityData\.ratingAvg|activity\.ratingAvg/, 'Should use activity-sourced ratingAvg for headline rating');
});

test('AC2: detail page uses activity reviewCount', async () => {
  const src = await readSource('app/[locale]/activities/[region]/[slug]/page.tsx');
  assert.match(src, /activityData\.reviewCount|activity\.reviewCount/, 'Should use activity reviewCount');
});

test('AC2: detail page has data-testid="activity-detail-rating"', async () => {
  const src = await readSource('app/[locale]/activities/[region]/[slug]/page.tsx');
  assert.match(src, /data-testid="activity-detail-rating"/, 'Should have activity-detail-rating testid');
});

test('AC2: detail page activity-detail-rating block references activityData.ratingAvg', async () => {
  const src = await readSource('app/[locale]/activities/[region]/[slug]/page.tsx');
  // The activity-detail-rating block must reference activity-sourced ratingAvg
  assert.match(src, /activity-detail-rating[\s\S]{0,400}activityData\.ratingAvg/, 'activity-detail-rating block must reference activityData.ratingAvg');
});

// AC5: admin edit form
test('AC5: admin edit page has ratingAvg input', async () => {
  const src = await readSource('app/admin/activities/[id]/edit/page.tsx');
  assert.match(src, /ratingAvg/, 'Admin form should have ratingAvg state/input');
});

test('AC5: admin edit page ratingAvg flows into PUT body', async () => {
  const src = await readSource('app/admin/activities/[id]/edit/page.tsx');
  // The JSON.stringify body in handleSave should include ratingAvg
  assert.match(src, /JSON\.stringify\(\{[\s\S]*ratingAvg[\s\S]*\}\)/, 'PUT body should include ratingAvg');
});

// 評論整合：評論數改為「口碑語錄＋已核准評論」自動對齊，移除手動輸入欄位
test('AC5: admin edit page 不再有手動評論數輸入（改自動對齊）', async () => {
  const src = await readSource('app/admin/activities/[id]/edit/page.tsx');
  assert.doesNotMatch(src, /setReviewCount/, '不應再有手動 reviewCount 狀態/輸入');
  assert.match(src, /自動對齊/, '應顯示評論數自動對齊的說明');
});

test('AC5: admin edit page 社群口碑語錄可編輯人名/星數/內容', async () => {
  // #1615 拆檔：口碑語錄編輯 UI 移至 SocialProofQuotesEditor 元件（state 仍在頁面層），
  // 合併兩檔原始碼做等價斷言（斷言意圖不變）。
  const src = (await readSource('app/admin/activities/[id]/edit/page.tsx')) +
    (await readSource('src/components/admin/activity-form/SocialProofQuotesEditor.tsx'));
  assert.match(src, /SocialProofQuoteRow/, '應使用結構化口碑語錄型別');
  assert.match(src, /updateQuote\(/, '應有逐則編輯 helper');
  assert.match(src, /評論星數/, '應有星數選擇器');
});
