/**
 * Source-contract：鎖定導遊「季節供應」(activity_plan_seasons) 即時管理的 gateway + route wiring。
 * 季節供應即時生效（不送審），但仍需 ownership / CSRF / 驗證 / audit。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = readFileSync(join(__dirname, '../../src/lib/db.mjs'), 'utf8');
const app = join(__dirname, '../../app');
const read = (p) => readFileSync(join(app, p), 'utf8');

function fnBody(name) {
  const start = db.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} should exist`);
  const next = db.indexOf('\nexport async function ', start + 1);
  return db.slice(start, next > 0 ? next : undefined);
}

test('is_year_round 已移出送審白名單（改即時管理）', () => {
  const wl = readFileSync(join(__dirname, '../../src/lib/guide-editable-plan-fields.mjs'), 'utf8');
  assert.doesNotMatch(wl, /'is_year_round'/, 'is_year_round 不應在送審白名單');
});

test('season gateway：全部先過 assertPlanEditable（ownership）+ 寫 audit', () => {
  for (const fn of ['listGuidePlanSeasonsDb', 'setGuidePlanYearRoundDb', 'createGuidePlanSeasonDb',
    'updateGuidePlanSeasonDb', 'deleteGuidePlanSeasonDb']) {
    assert.match(fnBody(fn), /assertPlanEditable/, `${fn} 需做 ownership 檢查`);
  }
  assert.match(fnBody('setGuidePlanYearRoundDb'), /plan_year_round_set/);
  assert.match(fnBody('createGuidePlanSeasonDb'), /plan_season_create/);
  assert.match(fnBody('updateGuidePlanSeasonDb'), /plan_season_update/);
  assert.match(fnBody('deleteGuidePlanSeasonDb'), /plan_season_delete/);
});

test('season gateway：create/update 用驗證器，delete 走 soft-delete，season 須屬該方案', () => {
  assert.match(fnBody('createGuidePlanSeasonDb'), /validateCreateActivityPlanSeasonPayload/);
  assert.match(fnBody('updateGuidePlanSeasonDb'), /validateUpdateActivityPlanSeasonPayload/);
  assert.match(fnBody('updateGuidePlanSeasonDb'), /activity_plan_id !== planId[\s\S]*SEASON_NOT_FOUND/);
  assert.match(fnBody('deleteGuidePlanSeasonDb'), /is_active: false/);
});

test('season collection route：GET/POST/PUT 驗 session，寫操作驗 CSRF', () => {
  const src = read('api/guide/activities/[id]/plans/[planId]/seasons/route.ts');
  assert.match(src, /verifyGuideSession/);
  assert.match(src, /validateCsrf/);
  assert.match(src, /listGuidePlanSeasonsDb\(planId, session\.guideId, id\)/);
  assert.match(src, /createGuidePlanSeasonDb\(planId, session\.guideId, body, id\)/);
  assert.match(src, /setGuidePlanYearRoundDb\(planId, session\.guideId, body\.isYearRound, id\)/);
});

test('season item route：PUT/DELETE 驗 session + CSRF + ownership 404', () => {
  const src = read('api/guide/activities/[id]/plans/[planId]/seasons/[seasonId]/route.ts');
  assert.match(src, /verifyGuideSession/);
  assert.match(src, /validateCsrf/);
  assert.match(src, /updateGuidePlanSeasonDb\(planId, seasonId, session\.guideId, body, id\)/);
  assert.match(src, /deleteGuidePlanSeasonDb\(planId, seasonId, session\.guideId, id\)/);
  assert.match(src, /SEASON_NOT_FOUND[\s\S]*404|404/);
});
