/**
 * Source-contract：鎖定 guide / admin 方案審核 route 的 auth、CSRF、ownership wiring（Phase 2）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = join(__dirname, '../../app');
const read = (p) => readFileSync(join(app, p), 'utf8');

test('guide plans：list/create 驗 session，create 驗 CSRF + 帶 guideId 歸屬', () => {
  const src = read('api/guide/activities/[id]/plans/route.ts');
  assert.match(src, /verifyGuideSession/);
  assert.match(src, /validateCsrf/, 'POST 建立需 CSRF');
  assert.match(src, /createGuidePlanDb\(id, session\.guideId/, '建立帶行程 id + 登入 guideId');
  assert.match(src, /listGuidePlansDb\(id, session\.guideId\)/, '列表只查自己的');
  assert.match(src, /data === null[\s\S]*404/, '非擁有者回 404');
});

test('guide plans/[planId]：GET/PUT 驗 session，PUT 驗 CSRF，ownership 失敗回 404', () => {
  const src = read('api/guide/activities/[id]/plans/[planId]/route.ts');
  assert.match(src, /verifyGuideSession/);
  assert.match(src, /validateCsrf/);
  assert.match(src, /getGuidePlanByIdDb\(planId, session\.guideId, id\)/, 'GET 帶 guideId + 行程 id 做 ownership');
  assert.match(src, /savePlanPendingChangesDb\(planId, session\.guideId, body, id\)/, 'PUT 帶 guideId');
  assert.match(src, /PLAN_NOT_FOUND[\s\S]*404|404/, 'ownership 失敗回 404');
});

test('guide plans submit：驗 session + CSRF，NOTHING_TO_SUBMIT 回 400', () => {
  const src = read('api/guide/activities/[id]/plans/[planId]/submit/route.ts');
  assert.match(src, /verifyGuideSession/);
  assert.match(src, /validateCsrf/);
  assert.match(src, /submitPlanForReviewDb\(planId, session\.guideId, id\)/);
  assert.match(src, /NOTHING_TO_SUBMIT[\s\S]*400/, '無待審內容回 400');
});

test('admin plan-reviews：list 走 gateway', () => {
  const src = read('api/admin/plan-reviews/route.ts');
  assert.match(src, /listPendingPlanReviewsDb/);
});

test('admin plan-reviews/[planId]：approve/reject 校驗 + 核准刷新 ISR + NOT_PENDING_REVIEW 409', () => {
  const src = read('api/admin/plan-reviews/[planId]/route.ts');
  assert.match(src, /resolvePlanReviewDb\(planId, \{ action/);
  assert.match(src, /\['approve', 'reject'\]\.includes\(action\)/, '校驗 action');
  assert.match(src, /revalidateActivityPaths/, '核准刷新前台 ISR');
  assert.match(src, /NOT_PENDING_REVIEW[\s\S]*409/, '重複審核回 409');
});
