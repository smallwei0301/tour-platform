/**
 * Source-contract：鎖定 guide / admin 行程審核 route 的 auth、CSRF、ownership wiring。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = join(__dirname, '../../app');
const read = (p) => readFileSync(join(app, p), 'utf8');

test('guide/activities：list/create 都驗 session，create 驗 CSRF + 強制歸屬', () => {
  const src = read('api/guide/activities/route.ts');
  assert.match(src, /verifyGuideSession/);
  assert.match(src, /validateCsrf/, 'POST 建立需 CSRF');
  assert.match(src, /createGuideActivityDb\(session\.guideId/, '建立必須帶登入 guideId 歸屬');
  assert.match(src, /listGuideActivitiesDb\(session\.guideId\)/, '列表只查自己的');
});

test('guide/activities/[id]：GET/PUT 驗 session，PUT 驗 CSRF、ownership 失敗回 404', () => {
  const src = read('api/guide/activities/[id]/route.ts');
  assert.match(src, /verifyGuideSession/);
  assert.match(src, /validateCsrf/);
  assert.match(src, /getGuideActivityByIdDb\(id, session\.guideId\)/, 'GET 需帶 guideId 做 ownership');
  assert.match(src, /saveActivityPendingChangesDb\(id, session\.guideId/, 'PUT 需帶 guideId');
  assert.match(src, /ACTIVITY_WRONG_GUIDE[\s\S]*404|404/, 'ownership 失敗回 404');
  assert.match(src, /buildFaqPatch/, 'FAQ 驗證需與 admin 一致');
});

test('guide/activities/[id]/submit：驗 session + CSRF + ownership 失敗 404', () => {
  const src = read('api/guide/activities/[id]/submit/route.ts');
  assert.match(src, /verifyGuideSession/);
  assert.match(src, /validateCsrf/);
  assert.match(src, /submitActivityForReviewDb\(id, session\.guideId\)/);
  assert.match(src, /NOTHING_TO_SUBMIT/);
});

test('guide upload-image：驗 session + CSRF + assertActivityBelongsToGuide', () => {
  const src = read('api/guide/activities/[id]/upload-image/route.ts');
  assert.match(src, /verifyGuideSession/);
  assert.match(src, /validateCsrf/);
  assert.match(src, /assertActivityBelongsToGuide/, '上傳前必須驗歸屬');
});

test('admin review route：approve/reject 驗證 + NOT_PENDING_REVIEW 409 + 核准刷新 ISR', () => {
  const src = read('api/admin/activities/[id]/review/route.ts');
  assert.match(src, /resolveActivityReviewDb/);
  assert.match(src, /approve.*reject|reject.*approve/);
  assert.match(src, /NOT_PENDING_REVIEW/);
  assert.match(src, /revalidateActivityPaths/, '核准套用後需刷新前台 ISR');
});

test('admin upload-image 與 guide 共用同一份上傳 helper（不重複實作）', () => {
  const adminSrc = read('api/admin/activities/[id]/upload-image/route.ts');
  const guideSrc = read('api/guide/activities/[id]/upload-image/route.ts');
  assert.match(adminSrc, /uploadActivityImage/);
  assert.match(guideSrc, /uploadActivityImage/);
});
