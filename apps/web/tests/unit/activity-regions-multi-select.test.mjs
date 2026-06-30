import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAdditionalRegions,
  activityRegionDbValues,
  activityMatchesRegion,
} from '../../src/lib/activity-regions.mjs';

// 行程地點：全台縣市 + 複選 的純函式行為（使用者需求）。

test('normalizeAdditionalRegions：短名／slug／全名一律正規化成 DB 規範值', () => {
  assert.deepEqual(
    normalizeAdditionalRegions(['高雄', 'taipei', '花蓮縣']),
    ['高雄市', '台北市', '花蓮縣'],
  );
});

test('normalizeAdditionalRegions：去重、過濾空值', () => {
  assert.deepEqual(
    normalizeAdditionalRegions(['台北市', 'taipei', '', '  ', '台北市']),
    ['台北市'],
  );
});

test('normalizeAdditionalRegions：排除與主要地區相同者（含別名）', () => {
  assert.deepEqual(
    normalizeAdditionalRegions(['高雄', '台北市', '台中'], 'kaohsiung'),
    ['台北市', '台中市'],
  );
});

test('normalizeAdditionalRegions：非陣列輸入回傳空陣列', () => {
  assert.deepEqual(normalizeAdditionalRegions(undefined), []);
  assert.deepEqual(normalizeAdditionalRegions(null, '高雄市'), []);
  assert.deepEqual(normalizeAdditionalRegions('高雄市'), []);
});

test('activityRegionDbValues：主要地區 + 附加地區，正規化去重', () => {
  assert.deepEqual(
    activityRegionDbValues({ region: '高雄', regions: ['台北市', 'kaohsiung', '台中'] }),
    ['高雄市', '台北市', '台中市'],
  );
});

test('activityMatchesRegion：主要地區命中（兩端正規化）', () => {
  assert.equal(activityMatchesRegion({ region: '高雄市', regions: [] }, '高雄'), true);
  assert.equal(activityMatchesRegion({ region: '高雄市', regions: [] }, 'kaohsiung'), true);
});

test('activityMatchesRegion：附加地區命中', () => {
  const activity = { region: '高雄市', regions: ['台北市', '台中市'] };
  assert.equal(activityMatchesRegion(activity, '台北'), true);
  assert.equal(activityMatchesRegion(activity, 'taichung'), true);
});

test('activityMatchesRegion：都不命中時為 false', () => {
  assert.equal(
    activityMatchesRegion({ region: '高雄市', regions: ['台北市'] }, '花蓮縣'),
    false,
  );
});

test('activityMatchesRegion：空/未指定地區視為不篩選（命中）', () => {
  assert.equal(activityMatchesRegion({ region: '高雄市', regions: [] }, ''), true);
  assert.equal(activityMatchesRegion({ region: '高雄市', regions: [] }, undefined), true);
});
