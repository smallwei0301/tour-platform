import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');

const GUIDE_ROUTE = path.join(WEB_ROOT, 'app/api/guide/activities-with-plans/route.ts');
const ACTIVITIES_ROUTE = path.join(WEB_ROOT, 'app/api/activities/route.ts');
const DB_LIB = path.join(WEB_ROOT, 'src/lib/db.mjs');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

describe('Issue #502 query contract', () => {
  it('guide activities-with-plans route must use status-based activity filtering only', () => {
    const src = read(GUIDE_ROUTE);
    assert.ok(!src.includes('activities.is_active'), 'must not reference activities.is_active');
    assert.match(src, /\.in\('activities\.status',\s*\['active',\s*'published'\]\)/, 'must filter activities.status in active/published');
  });

  it('public activities route still delegates to listPublishedActivitiesDb', () => {
    const src = read(ACTIVITIES_ROUTE);
    assert.match(src, /listPublishedActivitiesDb\(\{\s*region,\s*category,\s*q\s*\}\)/);
  });

  it('listPublishedActivitiesDb must avoid hard-binding embed constraint name activities_guide_id_fkey', () => {
    const src = read(DB_LIB);
    const start = src.indexOf('export async function listPublishedActivitiesDb(filters = {}) {');
    const end = src.indexOf('async function getFixtureActivityBySlug', start);
    assert.notEqual(start, -1, 'listPublishedActivitiesDb must exist');
    assert.notEqual(end, -1, 'next function boundary must exist');
    const fnBody = src.slice(start, end);
    assert.ok(!fnBody.includes('guide_profiles!activities_guide_id_fkey('), 'must not use hard-coded activities_guide_id_fkey embed in list query');
    assert.match(fnBody, /\.from\('guide_profiles'\)[\s\S]*\.in\('id',\s*guideIds\)/, 'must load guide profiles by guide_ids in a separate query');
  });

  // 更新（#收藏星數）：列表卡需與「詳情頁真實星數/評價數」一致 —— 改用行程自身的
  // 真實評論（activity_reviews）+ 社群口碑語錄聚合（resolveActivityReviewStats），
  // 不再沿用導遊 guide_profiles 的 rating_avg/review_count 當作行程評分。
  it('listPublishedActivitiesDb aggregates activity-level reviews (not guide ratings) for the card', () => {
    const src = read(DB_LIB);
    const start = src.indexOf('export async function listPublishedActivitiesDb(filters = {}) {');
    const end = src.indexOf('async function getFixtureActivityBySlug', start);
    assert.notEqual(start, -1, 'listPublishedActivitiesDb must exist');
    assert.notEqual(end, -1, 'next function boundary must exist');
    const fnBody = src.slice(start, end);

    // guide_profiles 查詢仍保留（用於停權導遊隱藏 + 顯示導遊名片），不可移除。
    assert.match(fnBody, /\.from\('guide_profiles'\)[\s\S]*verification_status/, 'guide profile query must remain (for suspend hiding)');

    // 行程評分改由 activity_reviews（approved）聚合，並帶 socialProofQuotes 給前台統一計算。
    assert.match(fnBody, /\.from\('activity_reviews'\)[\s\S]*\.eq\('status',\s*'approved'\)/, 'must aggregate approved activity_reviews');
    assert.match(fnBody, /reviews:\s*actReviews/, 'card item must carry per-activity reviews');
    assert.match(fnBody, /socialProofQuotes:/, 'card item must carry socialProofQuotes (single source of truth with detail page)');

    // 不再把導遊評分當行程評分（避免 5.0 (0則) 假數據）。
    assert.ok(!fnBody.includes('ratingAvg: guide?.rating_avg'), 'ratingAvg must NOT map from guide_profiles.rating_avg anymore');
    assert.ok(!fnBody.includes('reviewCount: guide?.review_count'), 'reviewCount must NOT map from guide_profiles.review_count anymore');
  });
});
